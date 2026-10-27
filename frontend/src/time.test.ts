import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMonths,
  BOOKING_HORIZON_DAYS,
  compareMonths,
  dateIn,
  detectZone,
  formatCalendarDay,
  formatMonth,
  formatTime,
  formatWallTime,
  isValidZone,
  monthCells,
  monthOf,
  monthRange,
  parseWallTime,
  shiftDate,
  todayIn,
  weekdayOf,
  zoneChoices,
} from './time';

describe('zones', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a real zone and rejects a made-up one', () => {
    expect(isValidZone('America/New_York')).toBe(true);
    expect(isValidZone('Not/AZone')).toBe(false);
    expect(isValidZone('')).toBe(false);
  });

  it('uses the runtime zone when that zone is real', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'America/Chicago',
    });
    expect(detectZone()).toBe('America/Chicago');
  });

  it('falls back to UTC when the runtime zone is not real', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'Not/AZone',
    });
    expect(detectZone()).toBe('UTC');
  });

  it('lists preferred zones once, ahead of the common list', () => {
    const zones = zoneChoices('America/New_York', 'Europe/London');
    expect(zones.slice(0, 2)).toEqual(['America/New_York', 'Europe/London']);
    expect(zones.filter((zone) => zone === 'America/New_York')).toHaveLength(1);
    expect(zones).toContain('America/Chicago');
    expect(zones).toContain('Pacific/Honolulu');
  });
});

describe('calendar dates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names today in the visitor zone, including the booking horizon', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T03:00:00.000Z'));
    expect(BOOKING_HORIZON_DAYS).toBe(60);
    expect(todayIn('America/New_York')).toBe('2026-10-26');
    expect(todayIn('UTC')).toBe('2026-10-27');
    expect(todayIn('America/New_York', 60)).toBe('2026-12-25');
  });

  it('steps months across the year boundary', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 1 }, 12)).toEqual({ year: 2027, month: 1 });
    expect(compareMonths({ year: 2026, month: 10 }, { year: 2026, month: 10 })).toBe(0);
    expect(compareMonths({ year: 2026, month: 11 }, { year: 2026, month: 10 })).toBeGreaterThan(0);
  });

  it('builds a Sunday-first month and its inclusive range', () => {
    const october = monthCells({ year: 2026, month: 10 });
    expect(october.slice(0, 4)).toEqual([null, null, null, null]);
    expect(october[4]).toBe('2026-10-01');
    expect(october.at(-1)).toBe('2026-10-31');
    expect(october).toHaveLength(35);
    expect(monthRange({ year: 2026, month: 10 })).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });

    const february = monthCells({ year: 2026, month: 2 });
    expect(february[0]).toBe('2026-02-01');
    expect(february).toHaveLength(28);
    expect(monthRange({ year: 2026, month: 2 })).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(monthRange({ year: 2024, month: 2 })).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });

  it('shifts dates and reads the weekday with Sunday as 0', () => {
    expect(monthOf('2026-10-26')).toEqual({ year: 2026, month: 10 });
    expect(shiftDate('2026-10-26', { days: 1 })).toBe('2026-10-27');
    expect(shiftDate('2026-12-31', { days: 1 })).toBe('2027-01-01');
    expect(shiftDate('2026-01-31', { months: 1 })).toBe('2026-02-28');
    expect(weekdayOf('2026-10-25')).toBe(0);
    expect(weekdayOf('2026-10-26')).toBe(1);
    expect(weekdayOf('2026-10-31')).toBe(6);
  });

  it('formats the month, the day, and a zoned time', () => {
    expect(formatMonth({ year: 2026, month: 10 })).toBe('October 2026');
    expect(formatCalendarDay('2026-10-26')).toBe('Monday, October 26');
    expect(formatTime('2026-10-26T15:00:00.000Z', 'America/New_York')).toBe('11:00 AM');
    expect(formatTime('2026-10-26T15:00:00.000Z', 'UTC')).toBe('3:00 PM');
    expect(dateIn('2026-10-27T03:00:00.000Z', 'America/New_York')).toBe('2026-10-26');
    expect(dateIn('2026-10-27T03:00:00.000Z', 'UTC')).toBe('2026-10-27');
  });
});

describe('wall times', () => {
  it.each([
    ['09:00', '9:00 AM'],
    ['00:00', '12:00 AM'],
    ['12:00', '12:00 PM'],
    ['17:05', '5:05 PM'],
  ])('formats %s as %s', (value, label) => {
    expect(formatWallTime(value)).toBe(label);
  });

  it.each([
    ['5:00 PM', '17:00'],
    ['5pm', '17:00'],
    ['5 PM', '17:00'],
    ['5:00 p.m.', '17:00'],
    ['5.00 PM', '17:00'],
    ['5:00\u202fPM', '17:00'],
    ['  9:00 am  ', '09:00'],
    ['17:00', '17:00'],
    ['12:00 AM', '00:00'],
    ['12:00 PM', '12:00'],
    ['12:30 PM', '12:30'],
    ['1:05 AM', '01:05'],
    ['9:5', '09:05'],
    ['7', '07:00'],
    ['0:00', '00:00'],
    ['23:59', '23:59'],
  ])('parses %s as %s', (value, expected) => {
    expect(parseWallTime(value)).toBe(expected);
  });

  it.each(['', 'noon', '24:00', '13:00 PM', '9:60', '0 PM', '17:00:00'])('rejects %s', (value) => {
    expect(parseWallTime(value)).toBeNull();
  });
});
