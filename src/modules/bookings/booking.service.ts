import { env } from '../../shared/config/env.js';
import { validateBookingDate } from '../../shared/time/dates.js';
import { calcomCalendar } from './calcom-calendar.js';
import { demoCalendar } from './demo-calendar.js';

export interface BookingRequest {
  date: string;
  time: string;
  customerName: string;
  service: string;
  customerPhone: string;
  timezone: string;
}

export interface CalendarProvider {
  readonly name: string;
  getAvailableSlots(date: string, timezone: string): Promise<string[]>;
  createBooking(request: BookingRequest): Promise<{ id: string | number | undefined }>;
}

export interface NewBooking {
  date: string;
  time: string;
  customerName: string;
  service: string;
}

interface BookingConfirmation {
  date: string;
  time: string;
  id: string | number | undefined;
}

export type AvailabilityResult = { error: string } | { date: string; slots: string[] };
export type BookingResult = { error: string } | (BookingConfirmation & { isDuplicate: boolean });

const calendar: CalendarProvider = env.calcom.apiKey ? calcomCalendar : demoCalendar;
export const calendarName = calendar.name;

// A customer can only book a slot the calendar showed to THAT customer (phone -> "YYYY-MM-DD HH:MM").
const offeredSlotsByPhone = new Map<string, Set<string>>();
// Idempotency (phone + slot -> confirmation): booking the same slot twice never duplicates it.
const confirmedBookings = new Map<string, BookingConfirmation>();

export async function getAvailableSlots(
  customerPhone: string,
  date: string,
): Promise<AvailabilityResult> {
  const error = validateBookingDate(date, env.timezone);
  if (error) return { error };

  const slots = await calendar.getAvailableSlots(date, env.timezone);
  const offeredSlots = offeredSlotsByPhone.get(customerPhone) ?? new Set<string>();
  for (const slot of slots) offeredSlots.add(`${date} ${slot}`);
  offeredSlotsByPhone.set(customerPhone, offeredSlots);
  return { date, slots };
}

export async function createBooking(
  customerPhone: string,
  booking: NewBooking,
): Promise<BookingResult> {
  const error = validateBookingDate(booking.date, env.timezone);
  if (error) return { error };

  const slotKey = `${booking.date} ${booking.time}`;
  if (!offeredSlotsByPhone.get(customerPhone)?.has(slotKey)) {
    return {
      error: `El horario ${slotKey} no fue mostrado como libre. Llama a ver_horarios antes.`,
    };
  }

  const idempotencyKey = `${customerPhone}|${slotKey}`;
  const existingBooking = confirmedBookings.get(idempotencyKey);
  if (existingBooking) return { ...existingBooking, isDuplicate: true };

  const { id } = await calendar.createBooking({
    ...booking,
    customerPhone,
    timezone: env.timezone,
  });
  const confirmation = { date: booking.date, time: booking.time, id };
  confirmedBookings.set(idempotencyKey, confirmation);
  return { ...confirmation, isDuplicate: false };
}
