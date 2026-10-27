import {
  CalendarCheck,
  CalendarDays,
  CalendarX2,
  CircleAlert,
  Inbox,
  List,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import {
  api,
  errorMessage,
  useLoad,
  writeErrorMessage,
  type AgentBooking,
  type AgentSession,
} from '../../api';
import { dateIn, formatCalendarDay, formatTime } from '../../time';
import { EmptyState } from '../../ui/EmptyState';
import { PageHeader } from '../../ui/PageHeader';
import { SegmentedControl, type SegmentedOption } from '../../ui/SegmentedControl';
import { Sheet } from '../../ui/Sheet';
import { BookingList, DayHeader } from './BookingList';
import { BookingPanel } from './BookingPanel';
import { ScheduleCalendar } from './ScheduleCalendar';
import {
  countByFilter,
  findNextUp,
  groupByDay,
  matchesFilter,
  parseFilter,
  parseView,
  type DayGroup,
  type NextUp,
  type ScheduleFilter,
  type ScheduleView,
} from './schedule';

const FILTERS: { value: ScheduleFilter; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
  { value: 'cancelled', label: 'Cancelled' },
];

const VIEWS: SegmentedOption<ScheduleView>[] = [
  { value: 'list', label: 'List', icon: <List /> },
  { value: 'calendar', label: 'Calendar', icon: <CalendarDays /> },
];

// Ticks once a minute so Upcoming, Now, and Today stay accurate while the page is open.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export default function SchedulePage() {
  const agent = useOutletContext<AgentSession>();
  const zone = agent.timezone;
  const now = useNow();
  const today = dateIn(new Date(now).toISOString(), zone);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get('filter'));
  const view = parseView(searchParams.get('view'));

  const [version, setVersion] = useState(0);
  // Visitors add and cancel bookings, so the list is fetched again after each cancel.
  const bookings = useLoad(`bookings|${version}`, () => api.agentListBookings());
  const [cancelledIds, setCancelledIds] = useState<ReadonlySet<number>>(() => new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const panelTitleId = useId();

  const loaded = bookings.latest !== undefined;
  const refreshing = loaded && bookings.data === undefined && bookings.error === undefined;
  // A cancel the server accepted shows at once instead of waiting for the refetch.
  const all = (bookings.latest ?? []).map((booking) =>
    cancelledIds.has(booking.booking_id) ? { ...booking, status: 'cancelled' as const } : booking,
  );
  const visible = all.filter((booking) => matchesFilter(booking, filter, now));
  const counts = countByFilter(all, now);
  const nextUp = findNextUp(all, now);
  const selected = all.find((booking) => booking.booking_id === selectedId) ?? null;

  function setParam(key: 'filter' | 'view', value: string, fallback: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  }

  function reload() {
    setVersion((current) => current + 1);
  }

  function open(booking: AgentBooking, opener: HTMLElement) {
    openerRef.current = opener;
    setCancelError(null);
    setNotice(null);
    setSelectedId(booking.booking_id);
  }

  // The row that opened the panel may be gone (a cancel can drop it from Upcoming).
  function handleClosed() {
    setSelectedId(null);
    setCancelError(null);
    setNotice(null);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
    else resultsRef.current?.focus();
  }

  async function cancel(booking: AgentBooking) {
    const day = formatCalendarDay(dateIn(booking.slot_start, zone));
    const when = formatTime(booking.slot_start, zone);
    if (!window.confirm(`Cancel ${booking.guest_name}’s booking on ${day} at ${when}?`)) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await api.agentCancelBooking(booking.booking_id);
      setCancelledIds((current) => new Set(current).add(booking.booking_id));
      setNotice('Appointment cancelled.');
      reload();
    } catch (error) {
      setCancelError(writeErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  const filterOptions: SegmentedOption<ScheduleFilter>[] = FILTERS.map((option) => ({
    ...option,
    count: loaded ? counts[option.value] : undefined,
  }));

  return (
    <>
      <title>Schedule</title>
      <PageHeader
        title="Schedule"
        description={`Appointments booked through your public page. Times in ${zone}.`}
      />

      <div className="schedule-toolbar">
        <SegmentedControl
          label="Show appointments"
          options={filterOptions}
          value={filter}
          onChange={(value) => setParam('filter', value, 'upcoming')}
        />
        <div className="schedule-toolbar-end">
          <button
            type="button"
            className="button icon-only"
            aria-label="Refresh"
            title="Refresh"
            aria-disabled={!loaded || refreshing}
            onClick={() => loaded && !refreshing && reload()}
          >
            <RefreshCw className={refreshing ? 'is-spinning' : undefined} />
          </button>
          <SegmentedControl
            label="View"
            options={VIEWS}
            value={view}
            onChange={(value) => setParam('view', value, 'calendar')}
            compact
          />
        </div>
      </div>

      {loaded && bookings.error !== undefined && (
        <div className="inline-alert" role="alert">
          <CircleAlert />
          <p>Couldn’t refresh appointments. {errorMessage(bookings.error)}</p>
          <button type="button" className="button small" onClick={reload}>
            Try again
          </button>
        </div>
      )}

      <div
        ref={resultsRef}
        className="schedule-results"
        tabIndex={-1}
        aria-busy={!loaded || refreshing}
      >
        {!loaded ? (
          bookings.error !== undefined ? (
            <div role="alert">
              <EmptyState
                icon={<CircleAlert />}
                title="Couldn’t load appointments."
                description={errorMessage(bookings.error)}
                action={
                  <button type="button" className="button" onClick={reload}>
                    Try again
                  </button>
                }
              />
            </div>
          ) : (
            <ScheduleSkeleton />
          )
        ) : view === 'calendar' ? (
          <ScheduleCalendar
            bookings={visible}
            zone={zone}
            today={today}
            now={now}
            nextUp={nextUp}
            onOpen={open}
          />
        ) : visible.length === 0 ? (
          <ScheduleEmpty
            filter={filter}
            hasOthers={all.length > 0}
            onShowAll={() => setParam('filter', 'all', 'upcoming')}
          />
        ) : (
          groupByDay(visible, zone, today).map((group) => (
            <DaySection
              key={group.day}
              group={group}
              zone={zone}
              today={today}
              now={now}
              nextUp={nextUp}
              onOpen={open}
            />
          ))
        )}
      </div>

      <Sheet open={selected !== null} labelledBy={panelTitleId} onClose={handleClosed}>
        {selected && (
          <BookingPanel
            booking={selected}
            zone={zone}
            titleId={panelTitleId}
            cancelling={cancelling}
            error={cancelError}
            notice={notice}
            onCancel={cancel}
            onClose={() => setSelectedId(null)}
          />
        )}
      </Sheet>
    </>
  );
}

type DaySectionProps = {
  group: DayGroup;
  zone: string;
  today: string;
  now: number;
  nextUp: NextUp | null;
  onOpen: (booking: AgentBooking, opener: HTMLElement) => void;
};

function DaySection({ group, zone, today, now, nextUp, onOpen }: DaySectionProps) {
  const id = useId();
  return (
    <section className="day-group" aria-labelledby={id}>
      <DayHeader id={id} day={group.day} today={today} count={group.bookings.length} />
      <BookingList
        bookings={group.bookings}
        zone={zone}
        now={now}
        nextUp={nextUp}
        onOpen={onOpen}
      />
    </section>
  );
}

type ScheduleEmptyProps = {
  filter: ScheduleFilter;
  hasOthers: boolean;
  onShowAll: () => void;
};

function ScheduleEmpty({ filter, hasOthers, onShowAll }: ScheduleEmptyProps) {
  if (filter === 'cancelled') {
    return (
      <EmptyState
        icon={<CalendarX2 />}
        title="No cancelled appointments."
        description="Appointments you or your guests cancel will show up here."
      />
    );
  }
  if (filter === 'upcoming' && hasOthers) {
    return (
      <EmptyState
        icon={<CalendarCheck />}
        title="No upcoming appointments."
        description="Appointments that already ended or were cancelled are under All."
        action={
          <button type="button" className="button" onClick={onShowAll}>
            Show all
          </button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={filter === 'all' ? <Inbox /> : <CalendarCheck />}
      title={filter === 'all' ? 'No appointments yet.' : 'No upcoming appointments.'}
      description="New bookings from your public page will show up here."
    />
  );
}

function ScheduleSkeleton() {
  return (
    <div className="day-group">
      <span className="visually-hidden">Loading appointments…</span>
      <span className="skeleton skeleton-heading" aria-hidden="true" />
      <div className="booking-list" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className="booking-skeleton-row">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}
