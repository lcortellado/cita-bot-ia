import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  handleWebhookEvent,
  handleWebhookVerification,
  isValidSignature,
} from './whatsapp.routes.js';
import { handleIncomingMessage } from './whatsapp.service.js';

// The webhook only parses and dispatches; message handling is tested in whatsapp.service.test.ts.
vi.mock('./whatsapp.service.js', () => ({ handleIncomingMessage: vi.fn() }));

// Values set in vitest.config.ts.
const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

const sign = (body: string, secret = APP_SECRET) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

/** Minimal ServerResponse that records what the handler sends. */
function createResponse() {
  let markFinished = (): void => undefined;
  const finished = new Promise<void>((resolve) => {
    markFinished = resolve;
  });
  const response = {
    statusCode: 0,
    body: '',
    finished,
    writeHead(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    end(body: unknown = '') {
      response.body = String(body);
      markFinished();
      return response;
    },
  };
  return response;
}

const asServerResponse = (response: ReturnType<typeof createResponse>) =>
  response as unknown as ServerResponse;

function createRequest(body: string, headers: Record<string, string> = {}): IncomingMessage {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    headers,
  }) as unknown as IncomingMessage;
}

const textMessage = (id: string) => ({
  id,
  from: '595981000001',
  type: 'text',
  text: { body: 'hola' },
});

describe('isValidSignature', () => {
  const body = '{"entry":[]}';

  it('accepts a body signed with the app secret', () => {
    expect(isValidSignature(Buffer.from(body), sign(body))).toBe(true);
  });

  it.each([
    ['a missing signature', undefined],
    ['a signature from another secret', sign(body, 'other-secret')],
    ['a malformed signature', 'sha256=123'],
  ])('rejects %s', (_case, signature) => {
    expect(isValidSignature(Buffer.from(body), signature)).toBe(false);
  });

  it('rejects a body modified after signing', () => {
    expect(isValidSignature(Buffer.from('{"entry":[1]}'), sign(body))).toBe(false);
  });
});

describe('handleWebhookVerification', () => {
  const verify = (query: string) => {
    const response = createResponse();
    handleWebhookVerification(
      new URL(`http://localhost/webhook?${query}`),
      asServerResponse(response),
    );
    return response;
  };

  it('echoes the challenge when Meta sends the right token', () => {
    const response = verify(
      `hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=123`,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('123');
  });

  it.each([
    ['a wrong token', 'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123'],
    ['an empty token', 'hub.mode=subscribe&hub.verify_token=&hub.challenge=123'],
    ['a wrong mode', `hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=123`],
  ])('rejects %s', (_case, query) => {
    expect(verify(query).statusCode).toBe(403);
  });
});

describe('handleWebhookEvent', () => {
  async function postWebhook(body: string, signature = sign(body)) {
    const response = createResponse();
    handleWebhookEvent(
      createRequest(body, { 'x-hub-signature-256': signature }),
      asServerResponse(response),
    );
    await response.finished;
    return response;
  }

  it('answers 200 and dispatches every message in the payload', async () => {
    const body = JSON.stringify({
      entry: [
        { changes: [{ value: { messages: [textMessage('m1'), textMessage('m2')] } }] },
        { changes: [{ value: { messages: [textMessage('m3')] } }] },
      ],
    });

    const response = await postWebhook(body);

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(handleIncomingMessage).mock.calls.map(([message]) => message.id)).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('answers 401 and dispatches nothing when the signature is invalid', async () => {
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [textMessage('m1')] } }] }],
    });

    const response = await postWebhook(body, sign(body, 'other-secret'));

    expect(response.statusCode).toBe(401);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it('ignores status updates and invalid JSON after answering 200', async () => {
    const statusOnly = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'm1', status: 'read' }] } }] }],
    });

    expect((await postWebhook(statusOnly)).statusCode).toBe(200);
    expect((await postWebhook('{not json')).statusCode).toBe(200);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });
});
