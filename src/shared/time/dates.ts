// Dates are resolved by code, never by the model.
// Messages returned here are read by the model, so they stay in Spanish like the prompt.

const DAY_MS = 86_400_000;
const LOCALE = 'es-PY';
const DATE_TABLE_DAYS = 21;
export const BOOKING_WINDOW_DAYS = 60;

export interface IsoDayParts {
  year: number;
  month: number;
  day: number;
}

/** Splits an already validated `YYYY-MM-DD` string into numbers. */
export function parseIsoDay(isoDay: string): IsoDayParts {
  const [year = NaN, month = NaN, day = NaN] = isoDay.split('-').map(Number);
  return { year, month, day };
}

/** `YYYY-MM-DD` of the given instant in the given timezone. */
export function toIsoDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDate(date: Date, timezone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: timezone, ...options }).format(date);
}

/** Table injected in the prompt so the model maps "mañana", "el jueves" etc. to YYYY-MM-DD. */
export function buildDateTable(timezone: string, days = DATE_TABLE_DAYS): string {
  const lines: string[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(Date.now() + offset * DAY_MS);
    const label = formatDate(date, timezone, { weekday: 'long', day: '2-digit', month: '2-digit' });
    const suffix = offset === 0 ? ' (hoy)' : offset === 1 ? ' (mañana)' : '';
    lines.push(`${toIsoDay(date, timezone)} = ${label}${suffix}`);
  }
  return lines.join('\n');
}

/** Returns an error message for the model, or null when the date can be booked. */
export function validateBookingDate(isoDay: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
    return 'Fecha en formato inválido. Usa AAAA-MM-DD de la tabla de fechas.';
  }
  const { year, month, day } = parseIsoDay(isoDay);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate) return `La fecha ${isoDay} no existe en el calendario.`;
  if (isoDay < toIsoDay(new Date(), timezone)) return `La fecha ${isoDay} ya pasó.`;
  const lastBookableDay = toIsoDay(new Date(Date.now() + BOOKING_WINDOW_DAYS * DAY_MS), timezone);
  if (isoDay > lastBookableDay) {
    return `Solo agendamos hasta ${String(BOOKING_WINDOW_DAYS)} días adelante.`;
  }
  return null;
}

/** UTC offset of the timezone on that day, e.g. "-03:00" (no date library needed). */
export function getUtcOffset(isoDay: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${isoDay}T12:00:00Z`));
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value.replace('GMT', '') ?? '';
  return offset === '' ? '+00:00' : offset;
}

/** `HH:MM` (24h) of an ISO instant in the given timezone. */
export function formatLocalTime(isoDateTime: string, timezone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(isoDateTime));
}
