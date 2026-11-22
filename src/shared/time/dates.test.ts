import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDateTable,
  formatLocalTime,
  getUtcOffset,
  parseIsoDay,
  toIsoDay,
  validateBookingDate,
} from './dates.js';

const TIMEZONE = 'America/Asuncion';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Tuesday 2026-11-24, 12:00 in Asunción (UTC-03:00).
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toIsoDay', () => {
  it('uses the business timezone, not UTC', () => {
    // 02:30 UTC on the 25th is still 23:30 on the 24th in Asunción.
    expect(toIsoDay(new Date('2026-11-25T02:30:00Z'), TIMEZONE)).toBe('2026-11-24');
  });
});

describe('parseIsoDay', () => {
  it('splits a YYYY-MM-DD string into numbers', () => {
    expect(parseIsoDay('2026-11-24')).toEqual({ year: 2026, month: 11, day: 24 });
  });
});

describe('buildDateTable', () => {
  it('lists 21 days starting today, with today and tomorrow labeled', () => {
    const lines = buildDateTable(TIMEZONE).split('\n');

    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe('2026-11-24 = martes, 24/11 (hoy)');
    expect(lines[1]).toBe('2026-11-25 = miércoles, 25/11 (mañana)');
    expect(lines[20]).toMatch(/^2026-12-14 = /);
  });
});

describe('validateBookingDate', () => {
  it('accepts today and dates inside the booking window', () => {
    expect(validateBookingDate('2026-11-24', TIMEZONE)).toBeNull();
    expect(validateBookingDate('2027-01-23', TIMEZONE)).toBeNull();
  });

  it.each([[''], ['24/11/2026'], ['2026-1-5'], ['mañana']])('rejects the format "%s"', (date) => {
    expect(validateBookingDate(date, TIMEZONE)).toMatch(/formato inválido/);
  });

  it('rejects dates that do not exist', () => {
    expect(validateBookingDate('2027-02-30', TIMEZONE)).toBe(
      'La fecha 2027-02-30 no existe en el calendario.',
    );
  });

  it('rejects past dates', () => {
    expect(validateBookingDate('2026-11-23', TIMEZONE)).toBe('La fecha 2026-11-23 ya pasó.');
  });

  it('rejects dates beyond the 60-day booking window', () => {
    expect(validateBookingDate('2027-01-24', TIMEZONE)).toBe(
      'Solo agendamos hasta 60 días adelante.',
    );
  });
});

describe('getUtcOffset', () => {
  it('returns the offset of the timezone on that day', () => {
    expect(getUtcOffset('2026-11-24', TIMEZONE)).toBe('-03:00');
    expect(getUtcOffset('2026-11-24', 'UTC')).toBe('+00:00');
  });
});

describe('formatLocalTime', () => {
  it('formats an ISO instant as 24h local time', () => {
    expect(formatLocalTime('2026-11-24T12:00:00Z', TIMEZONE)).toBe('09:00');
    expect(formatLocalTime('2026-11-24T21:30:00Z', TIMEZONE)).toBe('18:30');
  });
});
