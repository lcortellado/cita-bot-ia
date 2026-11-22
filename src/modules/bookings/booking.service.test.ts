import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarName, createBooking, getAvailableSlots } from './booking.service.js';

// Tests run without CAL_API_KEY (see vitest.config.ts), so the demo calendar is used.
// Each test uses its own phone number because offered slots are kept per phone.

const WEDNESDAY = '2026-11-25';
const MONDAY = '2026-11-30';
// Demo slots for the 25th (pseudo-random gaps depend on the day of the month).
const WEDNESDAY_SLOTS = ['09:00', '10:00', '14:00', '15:00', '18:00'];

const booking = (time: string) => ({
  date: WEDNESDAY,
  time,
  customerName: 'Ana',
  service: 'Brushing',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getAvailableSlots', () => {
  it('uses the demo calendar when Cal.com is not configured', () => {
    expect(calendarName).toBe('demo (no Cal.com)');
  });

  it('returns the free slots of an open day', async () => {
    expect(await getAvailableSlots('595900000001', WEDNESDAY)).toEqual({
      date: WEDNESDAY,
      slots: WEDNESDAY_SLOTS,
    });
  });

  it('returns no slots on a closed day', async () => {
    expect(await getAvailableSlots('595900000002', MONDAY)).toEqual({ date: MONDAY, slots: [] });
  });

  it('returns the date validation error without asking the calendar', async () => {
    expect(await getAvailableSlots('595900000003', '2026-11-20')).toEqual({
      error: 'La fecha 2026-11-20 ya pasó.',
    });
  });
});

describe('createBooking', () => {
  it('refuses a slot that was never offered to this customer', async () => {
    expect(await createBooking('595900000010', booking('09:00'))).toEqual({
      error: 'El horario 2026-11-25 09:00 no fue mostrado como libre. Llama a ver_horarios antes.',
    });
  });

  it('refuses a slot that was offered to another customer', async () => {
    await getAvailableSlots('595900000011', WEDNESDAY);

    expect(await createBooking('595900000012', booking('09:00'))).toHaveProperty('error');
  });

  it('books an offered slot and removes it from availability', async () => {
    await getAvailableSlots('595900000013', WEDNESDAY);

    expect(await createBooking('595900000013', booking('10:00'))).toEqual({
      date: WEDNESDAY,
      time: '10:00',
      id: 'demo-2026-11-25-10:00',
      isDuplicate: false,
    });
    const availability = await getAvailableSlots('595900000014', WEDNESDAY);
    expect(availability).not.toHaveProperty('error');
    expect('slots' in availability && availability.slots).not.toContain('10:00');
  });

  it('is idempotent: booking the same slot twice returns the first confirmation', async () => {
    await getAvailableSlots('595900000015', WEDNESDAY);
    await createBooking('595900000015', booking('14:00'));

    expect(await createBooking('595900000015', booking('14:00'))).toEqual({
      date: WEDNESDAY,
      time: '14:00',
      id: 'demo-2026-11-25-14:00',
      isDuplicate: true,
    });
  });

  it('validates the date before anything else', async () => {
    expect(
      await createBooking('595900000016', { ...booking('09:00'), date: '2026-02-31' }),
    ).toEqual({ error: 'La fecha 2026-02-31 no existe en el calendario.' });
  });
});
