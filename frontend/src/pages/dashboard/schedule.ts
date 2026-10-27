import type { AgentBooking } from '../../api';
import { dateIn, shiftDate } from '../../time';

export type ScheduleFilter = 'upcoming' | 'all' | 'cancelled';
export type ScheduleView = 'list' | 'calendar';
export type ScheduleBooking = {
  booking_id: number;
  status: 'confirmed' | 'cancelled';
  slot_start: string;
  slot_end: string;
};
export type DayGroup<T extends ScheduleBooking = AgentBooking> = { day: string; bookings: T[] };
export type NextUp = { bookingId: number; inProgress: boolean };

export function parseFilter(value: string | null): ScheduleFilter {
  return value === 'all' || value === 'cancelled' ? value : 'upcoming';
}

export function parseView(value: string | null): ScheduleView {
  return value === 'list' ? value : 'calendar';
}

export function matchesFilter(
  booking: ScheduleBooking,
  filter: ScheduleFilter,
  now: number,
): boolean {
  if (filter === 'cancelled') return booking.status === 'cancelled';
  if (filter === 'upcoming') {
    return booking.status === 'confirmed' && Date.parse(booking.slot_end) > now;
  }
  return true;
}

export function countByFilter(
  bookings: ScheduleBooking[],
  now: number,
): Record<ScheduleFilter, number> {
  return {
    upcoming: bookings.filter((booking) => matchesFilter(booking, 'upcoming', now)).length,
    all: bookings.length,
    cancelled: bookings.filter((booking) => booking.status === 'cancelled').length,
  };
}

function compareDays(a: string, b: string, today: string): number {
  const aPast = a < today;
  const bPast = b < today;
  if (aPast !== bPast) return aPast ? 1 : -1;
  return aPast ? b.localeCompare(a) : a.localeCompare(b);
}

const STATUS_ORDER: Record<ScheduleBooking['status'], number> = { confirmed: 0, cancelled: 1 };

function compareBookings(a: ScheduleBooking, b: ScheduleBooking): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    Date.parse(a.slot_start) - Date.parse(b.slot_start)
  );
}

export function groupByDay<T extends ScheduleBooking>(
  bookings: T[],
  zone: string,
  today: string,
): DayGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const booking of bookings) {
    const day = dateIn(booking.slot_start, zone);
    byDay.set(day, [...(byDay.get(day) ?? []), booking]);
  }
  return [...byDay]
    .sort(([a], [b]) => compareDays(a, b, today))
    .map(([day, rows]) => ({ day, bookings: rows.sort(compareBookings) }));
}

export function findNextUp(bookings: ScheduleBooking[], now: number): NextUp | null {
  let next: { bookingId: number; start: number } | null = null;
  for (const booking of bookings) {
    if (booking.status !== 'confirmed' || Date.parse(booking.slot_end) <= now) continue;
    const start = Date.parse(booking.slot_start);
    if (!next || start < next.start) next = { bookingId: booking.booking_id, start };
  }
  return next && { bookingId: next.bookingId, inProgress: next.start <= now };
}

export function relativeDay(day: string, today: string): string | null {
  if (day === today) return 'Today';
  if (day === shiftDate(today, { days: 1 })) return 'Tomorrow';
  return null;
}

export function appointmentCount(count: number): string {
  return `${count} ${count === 1 ? 'appointment' : 'appointments'}`;
}
