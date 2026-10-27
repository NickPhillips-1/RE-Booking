import { describe, expect, it } from 'vitest';
import {
  appointmentCount,
  countByFilter,
  findNextUp,
  groupByDay,
  matchesFilter,
  parseFilter,
  parseView,
  relativeDay,
  type ScheduleBooking,
} from './schedule';

const now = Date.parse('2026-10-26T16:00:00.000Z');

function booking(
  overrides: Partial<ScheduleBooking> & Pick<ScheduleBooking, 'booking_id'>,
): ScheduleBooking {
  return {
    status: 'confirmed',
    slot_start: '2026-10-26T15:00:00.000Z',
    slot_end: '2026-10-26T16:00:00.000Z',
    ...overrides,
  };
}

describe('schedule query', () => {
  it('defaults the filter to upcoming and the view to the calendar', () => {
    expect(parseFilter(null)).toBe('upcoming');
    expect(parseFilter('')).toBe('upcoming');
    expect(parseFilter('nope')).toBe('upcoming');
    expect(parseFilter('all')).toBe('all');
    expect(parseFilter('cancelled')).toBe('cancelled');
    expect(parseView(null)).toBe('calendar');
    expect(parseView('grid')).toBe('calendar');
    expect(parseView('list')).toBe('list');
  });

  it('counts upcoming, cancelled, and every returned appointment', () => {
    const endingNow = booking({ booking_id: 1 });
    const stillGoing = booking({
      booking_id: 2,
      slot_start: '2026-10-26T15:30:00.000Z',
      slot_end: '2026-10-26T16:00:01.000Z',
    });
    const cancelled = booking({
      booking_id: 3,
      status: 'cancelled',
      slot_end: '2026-10-26T18:00:00.000Z',
    });

    expect(matchesFilter(endingNow, 'upcoming', now)).toBe(false);
    expect(matchesFilter(stillGoing, 'upcoming', now)).toBe(true);
    expect(matchesFilter(cancelled, 'upcoming', now)).toBe(false);
    expect(matchesFilter(cancelled, 'cancelled', now)).toBe(true);
    expect(matchesFilter(endingNow, 'cancelled', now)).toBe(false);
    expect(matchesFilter(cancelled, 'all', now)).toBe(true);
    expect(countByFilter([endingNow, stillGoing, cancelled], now)).toEqual({
      upcoming: 1,
      all: 3,
      cancelled: 1,
    });
  });
});

describe('schedule order', () => {
  it('puts today and later first, then recent past days, confirmed before cancelled', () => {
    const groups = groupByDay(
      [
        booking({
          booking_id: 1,
          slot_start: '2026-10-24T15:00:00.000Z',
          slot_end: '2026-10-24T16:00:00.000Z',
        }),
        booking({
          booking_id: 2,
          slot_start: '2026-10-27T15:00:00.000Z',
          slot_end: '2026-10-27T16:00:00.000Z',
        }),
        booking({
          booking_id: 3,
          slot_start: '2026-10-25T15:00:00.000Z',
          slot_end: '2026-10-25T16:00:00.000Z',
        }),
        booking({
          booking_id: 4,
          status: 'cancelled',
          slot_start: '2026-10-26T18:00:00.000Z',
          slot_end: '2026-10-26T19:00:00.000Z',
        }),
        booking({
          booking_id: 5,
          slot_start: '2026-10-26T14:00:00.000Z',
          slot_end: '2026-10-26T15:00:00.000Z',
        }),
      ],
      'UTC',
      '2026-10-26',
    );

    expect(groups.map((group) => group.day)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-25',
      '2026-10-24',
    ]);
    expect(groups[0]?.bookings.map((row) => row.booking_id)).toEqual([5, 4]);
  });

  it('groups a slot by the day it falls on in the given zone', () => {
    const late = booking({
      booking_id: 1,
      slot_start: '2026-10-27T03:30:00.000Z',
      slot_end: '2026-10-27T04:00:00.000Z',
    });
    expect(groupByDay([late], 'America/New_York', '2026-10-26').map((group) => group.day)).toEqual([
      '2026-10-26',
    ]);
    expect(groupByDay([late], 'UTC', '2026-10-26').map((group) => group.day)).toEqual([
      '2026-10-27',
    ]);
    expect(groupByDay([], 'UTC', '2026-10-26')).toEqual([]);
  });

  it('finds the appointment in progress, otherwise the next one to start', () => {
    const endingNow = booking({ booking_id: 1 });
    const inProgress = booking({
      booking_id: 2,
      slot_start: '2026-10-26T15:30:00.000Z',
      slot_end: '2026-10-26T16:30:00.000Z',
    });
    const later = booking({
      booking_id: 3,
      slot_start: '2026-10-26T18:00:00.000Z',
      slot_end: '2026-10-26T18:30:00.000Z',
    });
    const cancelled = booking({ booking_id: 4, status: 'cancelled' });

    expect(findNextUp([later, inProgress, endingNow, cancelled], now)).toEqual({
      bookingId: 2,
      inProgress: true,
    });
    expect(findNextUp([later], now)).toEqual({ bookingId: 3, inProgress: false });
    expect(findNextUp([endingNow, cancelled], now)).toBeNull();
    expect(findNextUp([], now)).toBeNull();
  });

  it('labels today, tomorrow, and the appointment count', () => {
    expect(relativeDay('2026-10-26', '2026-10-26')).toBe('Today');
    expect(relativeDay('2026-10-27', '2026-10-26')).toBe('Tomorrow');
    expect(relativeDay('2027-01-01', '2026-12-31')).toBe('Tomorrow');
    expect(relativeDay('2026-10-28', '2026-10-26')).toBeNull();
    expect(appointmentCount(0)).toBe('0 appointments');
    expect(appointmentCount(1)).toBe('1 appointment');
    expect(appointmentCount(2)).toBe('2 appointments');
  });
});
