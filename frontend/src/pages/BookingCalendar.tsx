import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import {
  formatCalendarDay,
  formatMonth,
  monthCells,
  todayIn,
  WEEKDAY_NAMES,
  type YearMonth,
} from '../time';

type BookingCalendarProps = {
  month: YearMonth;
  zone: string;
  available: Set<string> | undefined;
  selected: string | null;
  canPrevious: boolean;
  canNext: boolean;
  onSelect: (isoDate: string) => void;
  onPrevious: () => void;
  onNext: () => void;
};

function weeksOf(month: YearMonth): (string | null)[][] {
  const cells = monthCells(month);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

export function BookingCalendar({
  month,
  zone,
  available,
  selected,
  canPrevious,
  canNext,
  onSelect,
  onPrevious,
  onNext,
}: BookingCalendarProps) {
  const monthLabelId = useId();
  const today = todayIn(zone);

  return (
    <div className="calendar" aria-busy={available === undefined}>
      <div className="calendar-header">
        <h2 className="calendar-title" id={monthLabelId} aria-live="polite">
          {formatMonth(month)}
        </h2>
        <div className="calendar-nav">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous month"
            aria-disabled={!canPrevious}
            onClick={() => canPrevious && onPrevious()}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next month"
            aria-disabled={!canNext}
            onClick={() => canNext && onNext()}
          >
            <ChevronRight />
          </button>
        </div>
      </div>

      <table className="calendar-grid" role="grid" aria-labelledby={monthLabelId}>
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
                    <button
                      type="button"
                      className="calendar-day"
                      aria-label={formatCalendarDay(cell)}
                      aria-pressed={cell === selected}
                      aria-current={cell === today ? 'date' : undefined}
                      disabled={!available?.has(cell)}
                      onClick={() => onSelect(cell)}
                    >
                      {Number(cell.slice(8))}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
