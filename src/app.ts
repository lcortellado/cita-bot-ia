import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes.js';

// WhatsApp webhook payloads are a few KB; anything bigger is rejected with 413.
const BODY_LIMIT_BYTES = 1_048_576;

/** Builds the HTTP app without listening, so tests can use `app.inject()`. */
export function buildApp(): FastifyInstance {
  const app = Fastify({ bodyLimit: BODY_LIMIT_BYTES });

  app.get('/', () => 'cita-bot running');
  void app.register(whatsappRoutes);

  return app;
}
