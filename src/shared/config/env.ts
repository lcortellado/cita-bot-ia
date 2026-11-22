// Single access point to environment variables. Schema validation (Zod) comes in a follow-up PR.
// `||` (not `??`) on purpose: an empty value in .env falls back to the default, like the original code.

const DEFAULT_PORT = 3000;

export const env = {
  port: Number(process.env.PORT || DEFAULT_PORT),
  timezone: process.env.TIMEZONE || 'America/Asuncion',
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    model: process.env.OPENROUTER_MODEL || 'google/gemini-3.8-flash',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v25.0',
  },
  calcom: {
    apiKey: process.env.CAL_API_KEY ?? '',
    eventTypeId: process.env.CAL_EVENT_TYPE_ID ?? '',
    defaultEmail: process.env.CAL_DEFAULT_EMAIL ?? '',
  },
} as const;
