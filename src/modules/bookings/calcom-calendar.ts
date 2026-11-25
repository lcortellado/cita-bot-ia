// Cal.com API v2 calendar, used when CAL_API_KEY and CAL_EVENT_TYPE_ID are set.
import { env } from '../../shared/config/env.js';
import { formatLocalTime, getUtcOffset } from '../../shared/time/dates.js';
import type { CalendarProvider } from './booking.service.js';

const CALCOM_API_URL = 'https://api.cal.com/v2';
const SLOTS_API_VERSION = '2024-09-04';
const BOOKINGS_API_VERSION = '2026-02-25';
const REQUEST_TIMEOUT_MS = 15_000;

interface CalcomResponse<T> {
  data?: T;
  error?: unknown;
}

interface CalcomSlot {
  start: string;
}

interface CalcomBooking {
  uid?: string;
  id?: number;
}

async function requestCalcom<T>(
  path: string,
  apiVersion: string,
  operation: string,
  init: RequestInit = {},
): Promise<CalcomResponse<T>> {
  const response = await fetch(`${CALCOM_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.calcom.apiKey}`,
      'cal-api-version': apiVersion,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await response.json()) as CalcomResponse<T>;
  if (!response.ok) {
    throw new Error(
      `Cal.com ${operation} ${String(response.status)}: ${JSON.stringify(body.error ?? body)}`,
    );
  }
  return body;
}

export const calcomCalendar: CalendarProvider = {
  name: 'Cal.com',

  async getAvailableSlots(date, timezone) {
    const utcOffset = getUtcOffset(date, timezone);
    // Cal.com expects the range start and end in UTC.
    const query = new URLSearchParams({
      eventTypeId: env.calcom.eventTypeId,
      start: new Date(`${date}T00:00:00${utcOffset}`).toISOString(),
      end: new Date(`${date}T23:59:59${utcOffset}`).toISOString(),
      timeZone: timezone,
    });
    const { data } = await requestCalcom<Record<string, CalcomSlot[]>>(
      `/slots?${query.toString()}`,
      SLOTS_API_VERSION,
      'slots',
    );
    return Object.values(data ?? {})
      .flat()
      .map((slot) => formatLocalTime(slot.start, timezone));
  },

  async createBooking({ date, time, customerName, service, customerPhone, timezone }) {
    // Cal.com expects the start in UTC.
    const start = new Date(`${date}T${time}:00${getUtcOffset(date, timezone)}`).toISOString();
    const body = {
      start,
      eventTypeId: Number(env.calcom.eventTypeId),
      attendee: {
        name: customerName,
        // WhatsApp has no email: in Cal.com make the phone required and the email optional.
        ...(env.calcom.defaultEmail ? { email: env.calcom.defaultEmail } : {}),
        timeZone: timezone,
        phoneNumber: `+${customerPhone.replace(/\D/g, '')}`,
        language: 'es',
      },
      bookingFieldsResponses: { notes: `${service} · agendado por WhatsApp` },
    };
    const { data } = await requestCalcom<CalcomBooking>(
      '/bookings',
      BOOKINGS_API_VERSION,
      'booking',
      { method: 'POST', body: JSON.stringify(body) },
    );
    return { id: data?.uid ?? data?.id };
  },
};
