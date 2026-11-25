import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { isValidSignature } from './whatsapp.routes.js';
import { handleIncomingMessage } from './whatsapp.service.js';

// The webhook only verifies, parses and dispatches; message handling is tested in whatsapp.service.test.ts.
vi.mock('./whatsapp.service.js', () => ({ handleIncomingMessage: vi.fn() }));

// Values set in vitest.config.ts.
const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

const sign = (body: string, secret = APP_SECRET) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

const textMessage = (id: string) => ({
  id,
  from: '595981000001',
  type: 'text',
  text: { body: 'hola' },
});

let app: FastifyInstance;

beforeEach(() => {
  app = buildApp();
});

afterEach(async () => {
  await app.close();
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

describe('GET /webhook (verification)', () => {
  const verify = (query: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/webhook', query });

  it('echoes the challenge when Meta sends the right token', async () => {
    const response = await verify({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': '123',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('123');
  });

  it.each([
    ['a wrong token', { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong' }],
    ['an empty token', { 'hub.mode': 'subscribe', 'hub.verify_token': '' }],
    ['a wrong mode', { 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY_TOKEN }],
  ])('rejects %s', async (_case, query) => {
    const response = await verify({ ...query, 'hub.challenge': '123' });

    expect(response.statusCode).toBe(403);
  });
});

describe('POST /webhook (events)', () => {
  const postWebhook = (body: string, signature = sign(body)) =>
    app.inject({
      method: 'POST',
      url: '/webhook',
      payload: body,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    });

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

  it('verifies the signature over the raw bytes, not re-serialized JSON', async () => {
    // Spacing and key order that JSON.stringify would not reproduce.
    const body = '{ "entry" : [ { "changes": [ { "value": { "messages": [] } } ] } ] }';

    expect((await postWebhook(body)).statusCode).toBe(200);
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

  it('rejects payloads larger than 1 MiB', async () => {
    const body = JSON.stringify({ padding: 'x'.repeat(1_048_576) });

    expect((await postWebhook(body)).statusCode).toBe(413);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });
});

describe('GET /', () => {
  it('answers a health check', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('cita-bot running');
  });
});
