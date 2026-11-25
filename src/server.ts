import { buildApp } from './app.js';
import { calendarName } from './modules/bookings/booking.service.js';
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
    '⚠ WHATSAPP_APP_SECRET is not set: webhook signatures are NOT verified (only allowed outside production)',
  );
}

const app = buildApp();
try {
  // 0.0.0.0: reachable from outside the machine (Meta, tunnels, containers), like the previous server.
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`✅ cita-bot listening on port ${String(env.port)} · calendar: ${calendarName}`);
} catch (error) {
  console.error('Failed to start the server', error);
  process.exit(1);
}
