import { createServer } from 'node:http';
import { calendarName } from './modules/bookings/booking.service.js';
import {
  handleWebhookEvent,
  handleWebhookVerification,
  WEBHOOK_PATH,
} from './modules/whatsapp/whatsapp.routes.js';
import { env } from './shared/config/env.js';

const REQUIRED_WHATSAPP_SETTINGS = {
  WHATSAPP_TOKEN: env.whatsapp.token,
  WHATSAPP_PHONE_NUMBER_ID: env.whatsapp.phoneNumberId,
  WHATSAPP_VERIFY_TOKEN: env.whatsapp.verifyToken,
};
for (const [name, value] of Object.entries(REQUIRED_WHATSAPP_SETTINGS)) {
  if (!value) console.warn(`⚠ Missing ${name} in .env`);
}
if (!env.whatsapp.appSecret) {
  console.warn(
    '⚠ WHATSAPP_APP_SECRET is not set: webhook signatures are NOT verified (required in production)',
  );
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (url.pathname === WEBHOOK_PATH && request.method === 'GET') {
    handleWebhookVerification(url, response);
    return;
  }
  if (url.pathname === WEBHOOK_PATH && request.method === 'POST') {
    handleWebhookEvent(request, response);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('cita-bot running');
}).listen(env.port, () => {
  console.log(`✅ cita-bot listening on port ${String(env.port)} · calendar: ${calendarName}`);
});
