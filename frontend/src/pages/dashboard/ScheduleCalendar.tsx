import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { AgentBooking } from '../../api';
import {
  addMonths,
  BOOKING_HORIZON_DAYS,
  compareMonths,
  formatCalendarDay,
  formatMonth,
  monthCells,
  monthOf,
  monthRange,
  shiftDate,
  weekdayOf,
  WEEKDAY_NAMES,
  type YearMonth,
} from '../../time';
import { EmptyState } from '../../ui/EmptyState';
import { BookingList, DayHeader } from './BookingList';
import { appointmentCount, groupByDay, type NextUp } from './schedule';

type ScheduleCalendarProps = {
  bookings: AgentBooking[];
  zone: string;
  today: string;
  now: number;
  nextUp: NextUp | null;
  onOpen: (booking: AgentBooking, opener: HTMLElement) => void;
};

function weeksOf(month: YearMonth): (string | null)[][] {
  const cells = monthCells(month);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

function dayForKey(key: string, day: string): string | null {
  switch (key) {
    case 'ArrowLeft':
      return shiftDate(day, { days: -1 });
    case 'ArrowRight':
      return shiftDate(day, { days: 1 });
    case 'ArrowUp':
      return shiftDate(day, { days: -7 });
    case 'ArrowDown':
      return shiftDate(day, { days: 7 });
    case 'Home':
      return shiftDate(day, { days: -weekdayOf(day) });
    case 'End':
      return shiftDate(day, { days: 6 - weekdayOf(day) });
    case 'PageUp':
      return shiftDate(day, { months: -1 });
    case 'PageDown':
      return shiftDate(day, { months: 1 });
    default:
      return null;
  }
}

export function ScheduleCalendar({
  bookings,
  zone,
  today,
  now,
  nextUp,
  onOpen,
}: ScheduleCalendarProps) {
  const byDay = new Map(
    groupByDay(bookings, zone, today).map((group) => [group.day, group.bookings]),
  );
  const bookedDays = [...byDay.keys()].sort();
  const lastDay = [...bookedDays, shiftDate(today, { days: BOOKING_HORIZON_DAYS })].sort().at(-1)!;
  const clamp = (day: string) => (day < today ? today : day > lastDay ? lastDay : day);

  const [chosenDay, setChosenDay] = useState(
    () => bookedDays.find((booked) => booked >= today) ?? today,
  );
  const day = clamp(chosenDay);
  const month = monthOf(day);
  const firstMonth = monthOf(today);
  const canPrevious = compareMonths(month, firstMonth) > 0;
  const canNext = compareMonths(month, monthOf(lastDay)) < 0;

  const gridRef = useRef<HTMLTableElement>(null);
  const focusDay = useRef(false);
  const monthLabelId = useId();
  const agendaLabelId = useId();

  useEffect(() => {
    if (!focusDay.current) return;
    focusDay.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
  }, [day]);

  function choose(next: string, focus = false) {
    const target = clamp(next);
    focusDay.current = focus && target !== day;
    setChosenDay(target);
  }

  function showMonth(target: YearMonth) {
    if (compareMonths(target, firstMonth) === 0) return choose(today);
    const { from, to } = monthRange(target);
    choose(bookedDays.find((booked) => booked >= from && booked <= to) ?? from);
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const target = dayForKey(event.key, day);
    if (target === null) return;
    event.preventDefault();
    choose(target, true);
  }

  const dayBookings = byDay.get(day) ?? [];

  return (
    <div className="calendar-layout">
      <div className="calendar">
        <div className="calendar-header">
          <h2 className="calendar-title" id={monthLabelId} aria-live="polite">
            {formatMonth(month)}
          </h2>
          <div className="calendar-nav">
            <button type="button" className="button small" onClick={() => choose(today)}>
              Today
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Previous month"
              aria-disabled={!canPrevious}
              onClick={() => canPrevious && showMonth(addMonths(month, -1))}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              aria-disabled={!canNext}
              onClick={() => canNext && showMonth(addMonths(month, 1))}
            >
              <ChevronRight />
            </button>
          </div>
        </div>

        <table
          ref={gridRef}
          className="calendar-grid"
          role="grid"
          aria-labelledby={monthLabelId}
          onKeyDown={onGridKeyDown}
        >
          <thead>
            <tr>
              {WEEKDAY_NAMES.map((name) => (
                <th key={name} scope="col" abbr={name}>
                  {name.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeksOf(month).map((week, row) => (
              <tr key={row}>
                {week.map((cell, column) => (
                  <td key={column}>
                    {cell !== null && (
                      <CalendarDay
                        day={cell}
                        count={byDay.get(cell)?.length ?? 0}
                        selected={cell === day}
                        isToday={cell === today}
                        disabled={cell < today || cell > lastDay}
                        onSelect={() => choose(cell)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="calendar-agenda" aria-labelledby={agendaLabelId}>
        <DayHeader id={agendaLabelId} day={day} today={today} count={dayBookings.length} />
        {dayBookings.length > 0 ? (
          <BookingList
            bookings={dayBookings}
            zone={zone}
            now={now}
            nextUp={nextUp}
            onOpen={onOpen}
          />
        ) : (
          <EmptyState compact title={`Nothing scheduled for ${formatCalendarDay(day)}.`} />
        )}
      </section>
    </div>
  );
}

type CalendarDayProps = {
  day: string;
  count: number;
  selected: boolean;
  isToday: boolean;
  disabled: boolean;
  onSelect: () => void;
};

function CalendarDay({ day, count, selected, isToday, disabled, onSelect }: CalendarDayProps) {
  return (
    <button
      type="button"
      className="calendar-day"
      data-day={day}
      tabIndex={selected ? 0 : -1}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      aria-label={
        count > 0 ? `${formatCalendarDay(day)}, ${appointmentCount(count)}` : formatCalendarDay(day)
      }
      disabled={disabled}
      onClick={onSelect}
    >
      {Number(day.slice(8))}
      {count > 0 && (
        <span className="calendar-dots" aria-hidden="true">
          {Array.from({ length: Math.min(count, 3) }, (_, index) => (
            <span key={index} className="calendar-dot" />
          ))}
        </span>
      )}
    </button>
  );
}
