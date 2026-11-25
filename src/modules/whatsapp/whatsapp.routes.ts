import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginCallback } from 'fastify';
import { env } from '../../shared/config/env.js';
import { handleIncomingMessage } from './whatsapp.service.js';
import type { WhatsAppMessage } from './whatsapp.service.js';

export const WEBHOOK_PATH = '/webhook';

interface VerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

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

function dispatchMessages(rawBody: Buffer): void {
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
}

export const whatsappRoutes: FastifyPluginCallback = (app, _options, done) => {
  // The HMAC signature is computed over the raw bytes, so JSON is parsed only after verifying it.
  // Scoped to this plugin: other routes keep Fastify's default JSON parser.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, parsed) => {
    parsed(null, body);
  });

  // Meta verifies the webhook once, with a GET request.
  app.get<{ Querystring: VerificationQuery }>(WEBHOOK_PATH, (request, reply) => {
    const query = request.query;
    const isVerified =
      query['hub.mode'] === 'subscribe' &&
      env.whatsapp.verifyToken !== '' &&
      query['hub.verify_token'] === env.whatsapp.verifyToken;
    void reply.type('text/plain; charset=utf-8');
    return isVerified
      ? reply.code(200).send(query['hub.challenge'] ?? '')
      : reply.code(403).send('invalid verify token');
  });

  // Every new message arrives in a POST request.
  app.post<{ Body: Buffer | undefined }>(WEBHOOK_PATH, (request, reply) => {
    const rawBody = request.body ?? Buffer.alloc(0);
    const signature = request.headers['x-hub-signature-256'];
    if (!isValidSignature(rawBody, typeof signature === 'string' ? signature : undefined)) {
      return reply.code(401).send();
    }
    // Reply right away: Meta retries the delivery when the webhook is slow.
    void reply.code(200).send();
    dispatchMessages(rawBody);
    return reply;
  });

  done();
};
