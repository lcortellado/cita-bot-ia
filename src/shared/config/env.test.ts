import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('applies defaults when variables are missing', () => {
    const env = parseEnv({});

    expect(env.nodeEnv).toBe('development');
    expect(env.port).toBe(3000);
    expect(env.timezone).toBe('America/Asuncion');
    expect(env.openRouter.model).toBe('google/gemini-3.8-flash');
    expect(env.whatsapp.graphVersion).toBe('v25.0');
    expect(env.whatsapp.appSecret).toBe('');
    expect(env.calcom.defaultEmail).toBe('');
  });

  it('treats empty values as not set', () => {
    const env = parseEnv({
      PORT: '',
      TIMEZONE: '',
      OPENROUTER_MODEL: '',
      WHATSAPP_GRAPH_VERSION: '',
    });

    expect(env.port).toBe(3000);
    expect(env.timezone).toBe('America/Asuncion');
    expect(env.openRouter.model).toBe('google/gemini-3.8-flash');
    expect(env.whatsapp.graphVersion).toBe('v25.0');
  });

  it('maps variables to the typed config', () => {
    const env = parseEnv({
      PORT: '8080',
      TIMEZONE: 'America/Sao_Paulo',
      OPENROUTER_API_KEY: ' sk-or-key ',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      CAL_API_KEY: 'cal-key',
      CAL_EVENT_TYPE_ID: '123',
      CAL_DEFAULT_EMAIL: 'owner@example.com',
    });

    expect(env.port).toBe(8080);
    expect(env.timezone).toBe('America/Sao_Paulo');
    expect(env.openRouter.apiKey).toBe('sk-or-key');
    expect(env.whatsapp.verifyToken).toBe('verify');
    expect(env.calcom).toEqual({
      apiKey: 'cal-key',
      eventTypeId: '123',
      defaultEmail: 'owner@example.com',
    });
  });

  it.each([['abc'], ['0'], ['70000'], ['3000.5']])('rejects PORT=%s', (port) => {
    expect(() => parseEnv({ PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown timezone', () => {
    expect(() => parseEnv({ TIMEZONE: 'Mars/Base' })).toThrow(/TIMEZONE/);
  });

  it('rejects an invalid CAL_DEFAULT_EMAIL', () => {
    expect(() => parseEnv({ CAL_DEFAULT_EMAIL: 'not-an-email' })).toThrow(/CAL_DEFAULT_EMAIL/);
  });

  it('requires a numeric CAL_EVENT_TYPE_ID when Cal.com is enabled', () => {
    expect(() => parseEnv({ CAL_API_KEY: 'cal-key' })).toThrow(/CAL_EVENT_TYPE_ID/);
    expect(() => parseEnv({ CAL_API_KEY: 'cal-key', CAL_EVENT_TYPE_ID: 'abc' })).toThrow(
      /CAL_EVENT_TYPE_ID/,
    );
  });

  it('requires WHATSAPP_APP_SECRET in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/WHATSAPP_APP_SECRET/);
    expect(parseEnv({ NODE_ENV: 'production', WHATSAPP_APP_SECRET: 'secret' }).nodeEnv).toBe(
      'production',
    );
  });

  it('reports every invalid variable at once', () => {
    expect(() => parseEnv({ PORT: 'abc', TIMEZONE: 'Mars/Base' })).toThrow(/PORT[\s\S]*TIMEZONE/);
  });
});
