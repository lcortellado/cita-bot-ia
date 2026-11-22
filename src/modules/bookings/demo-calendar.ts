// In-memory demo calendar, used when CAL_API_KEY is not set (to try the agent without a Cal.com account).
import { parseIsoDay } from '../../shared/time/dates.js';
import type { CalendarProvider } from './booking.service.js';

const DEMO_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:30', '18:00'];
const SUNDAY = 0;
const MONDAY = 1;

const bookedSlots = new Set<string>();

export const demoCalendar: CalendarProvider = {
  name: 'demo (no Cal.com)',

  getAvailableSlots(date) {
    const { year, month, day } = parseIsoDay(date);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    // Closed on Sunday and Monday, like the sample business profile.
    if (weekday === SUNDAY || weekday === MONDAY) return Promise.resolve([]);
    // Pseudo-random gaps so each day looks different.
    const freeSlots = DEMO_SLOTS.filter(
      (slot, index) => (day + index) % 3 !== 0 && !bookedSlots.has(`${date} ${slot}`),
    );
    return Promise.resolve(freeSlots);
  },

  createBooking({ date, time }) {
    bookedSlots.add(`${date} ${time}`);
    return Promise.resolve({ id: `demo-${date}-${time}` });
  },
};
