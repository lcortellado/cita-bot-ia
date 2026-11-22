import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '../../shared/config/env.js';
import { handleIncomingMessage } from './whatsapp.service.js';
import type { WhatsAppMessage } from './whatsapp.service.js';

export const WEBHOOK_PATH = '/webhook';

interface WebhookPayload {
  entry?: { changes?: { value?: { messages?: WhatsAppMessage[] } }[] }[];
}

// The webhook URL is public: verify that the request was signed by Meta.
export function isValidSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!env.whatsapp.appSecret) return true;
  const expected = Buffer.from(
    'sha256=' + createHmac('sha256', env.whatsapp.appSecret).update(rawBody).digest('hex'),
  );
  const received = Buffer.from(signatureHeader ?? '');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Meta verifies the webhook once, with a GET request.
export function handleWebhookVerification(url: URL, response: ServerResponse): void {
  const isVerified =
    url.searchParams.get('hub.mode') === 'subscribe' &&
    env.whatsapp.verifyToken !== '' &&
    url.searchParams.get('hub.verify_token') === env.whatsapp.verifyToken;
  response
    .writeHead(isVerified ? 200 : 403)
    .end(isVerified ? (url.searchParams.get('hub.challenge') ?? '') : 'invalid verify token');
}

// Every new message arrives in a POST request.
export function handleWebhookEvent(request: IncomingMessage, response: ServerResponse): void {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => {
    chunks.push(chunk);
  });
  request.on('end', () => {
    const rawBody = Buffer.concat(chunks);
    const signature = request.headers['x-hub-signature-256'];
    if (!isValidSignature(rawBody, typeof signature === 'string' ? signature : undefined)) {
      response.writeHead(401).end();
      return;
    }
    // Reply right away: Meta retries the delivery when the webhook is slow.
    response.writeHead(200).end();

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as WebhookPayload;
    } catch {
      return;
    }
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const message of change.value?.messages ?? []) void handleIncomingMessage(message);
      }
    }
    // change.value.statuses (sent, delivered, read) also arrive here and are ignored on purpose.
  });
}
