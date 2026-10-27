import { DateTime } from 'luxon';
import type { MeetingLocation } from './api';

const COMMON_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const LOCATION_LABELS: Record<MeetingLocation, string> = {
  in_person: 'In person',
  video: 'Video call',
  phone: 'Phone call',
};

export function isValidZone(zone: string): boolean {
  return DateTime.now().setZone(zone).isValid;
}

export function detectZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidZone(zone) ? zone : 'UTC';
}

export function zoneChoices(...first: string[]): string[] {
  return [...new Set([...first, ...COMMON_ZONES])];
}

export type YearMonth = { year: number; month: number };

export const BOOKING_HORIZON_DAYS = 60;

export function todayIn(zone: string, plusDays = 0): string {
  return DateTime.now().setZone(zone).plus({ days: plusDays }).toFormat('yyyy-MM-dd');
}

export function monthOf(isoDate: string): YearMonth {
  const [year, month] = isoDate.split('-').map(Number);
  return { year, month };
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

export function monthCells({ year, month }: YearMonth): (string | null)[] {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= lastDay; day++) cells.push(`${year}-${pad(month)}-${pad(day)}`);
  return cells;
}

export function formatMonth({ year, month }: YearMonth): string {
  return DateTime.fromObject({ year, month, day: 1 }).toFormat('LLLL yyyy');
}

export function formatCalendarDay(isoDate: string): string {
  return DateTime.fromISO(isoDate).toFormat('cccc, LLLL d');
}

export function formatTime(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone }).toFormat('h:mm a');
}

export function dateIn(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone }).toFormat('yyyy-MM-dd');
}

export function shiftDate(isoDate: string, by: { days?: number; months?: number }): string {
  return DateTime.fromISO(isoDate).plus(by).toFormat('yyyy-MM-dd');
}

export function weekdayOf(isoDate: string): number {
  return DateTime.fromISO(isoDate).weekday % 7;
}

export function formatWallTime(hhmm: string): string {
  const [hour, minute] = hhmm.split(':').map(Number);
  return DateTime.fromObject({ hour: hour % 24, minute }).toFormat('h:mm a');
}

export function parseWallTime(value: string): string | null {
  const text = value
    .trim()
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/a\.?\s*m\.?/i, 'AM')
    .replace(/p\.?\s*m\.?/i, 'PM')
    .replace(/(\d)\.(\d{2})\b/, '$1:$2')
    .toUpperCase();
  const match = /^(\d{1,2})(?::(\d{1,2}))?\s*(AM|PM)?$/.exec(text);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
