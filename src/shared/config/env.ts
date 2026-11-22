import { z } from 'zod';

// Single access point to environment variables, validated at startup.
// An empty value in .env counts as "not set", so it falls back to the default.

const emptyToUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const text = (fallback = '') => z.preprocess(emptyToUndefined, z.string().trim().default(fallback));

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(['development', 'test', 'production']).default('development'),
    ),
    PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65_535).default(3000)),
    TIMEZONE: text('America/Asuncion').refine(isValidTimezone, 'must be a valid IANA timezone'),

    OPENROUTER_API_KEY: text(),
    OPENROUTER_MODEL: text('google/gemini-3.8-flash'),

    WHATSAPP_TOKEN: text(),
    WHATSAPP_PHONE_NUMBER_ID: text(),
    WHATSAPP_VERIFY_TOKEN: text(),
    WHATSAPP_APP_SECRET: text(),
    WHATSAPP_GRAPH_VERSION: text('v25.0'),

    CAL_API_KEY: text(),
    CAL_EVENT_TYPE_ID: text(),
    CAL_DEFAULT_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
  })
  .superRefine((values, context) => {
    if (values.NODE_ENV === 'production' && !values.WHATSAPP_APP_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['WHATSAPP_APP_SECRET'],
        message: 'is required in production (webhook signature verification)',
      });
    }
    if (values.CAL_API_KEY && !/^\d+$/.test(values.CAL_EVENT_TYPE_ID)) {
      context.addIssue({
        code: 'custom',
        path: ['CAL_EVENT_TYPE_ID'],
        message: 'must be a numeric event type id when CAL_API_KEY is set',
      });
    }
  })
  .transform((values) => ({
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    timezone: values.TIMEZONE,
    openRouter: {
      apiKey: values.OPENROUTER_API_KEY,
      model: values.OPENROUTER_MODEL,
    },
    whatsapp: {
      token: values.WHATSAPP_TOKEN,
      phoneNumberId: values.WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: values.WHATSAPP_VERIFY_TOKEN,
      appSecret: values.WHATSAPP_APP_SECRET,
      graphVersion: values.WHATSAPP_GRAPH_VERSION,
    },
    calcom: {
      apiKey: values.CAL_API_KEY,
      eventTypeId: values.CAL_EVENT_TYPE_ID,
      defaultEmail: values.CAL_DEFAULT_EMAIL ?? '',
    },
  }));

export type Env = z.output<typeof envSchema>;

/** Validates raw environment variables. Throws one error that lists every invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
