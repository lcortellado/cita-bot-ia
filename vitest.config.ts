import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Fixed environment so tests never depend on the local .env (no Cal.com: demo calendar).
    env: {
      NODE_ENV: 'test',
      TIMEZONE: 'America/Asuncion',
      OPENROUTER_API_KEY: 'sk-or-test',
      OPENROUTER_MODEL: '',
      WHATSAPP_TOKEN: 'test-whatsapp-token',
      WHATSAPP_PHONE_NUMBER_ID: 'test-phone-number-id',
      WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
      WHATSAPP_APP_SECRET: 'test-app-secret',
      WHATSAPP_GRAPH_VERSION: '',
      CAL_API_KEY: '',
      CAL_EVENT_TYPE_ID: '',
      CAL_DEFAULT_EMAIL: '',
    },
    // Tests stub fetch and fake the clock: always restore them between tests.
    unstubGlobals: true,
    restoreMocks: true,
  },
});
