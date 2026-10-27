import { CalendarCheck, CalendarX2, CircleAlert, Inbox, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, errorMessage, useLoad, writeErrorMessage, type ClientBooking } from '../api';
import { dateIn, detectZone, formatCalendarDay, formatTime } from '../time';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { AppointmentRow, DayHeader } from './dashboard/BookingList';
import {
  countByFilter,
  findNextUp,
  groupByDay,
  matchesFilter,
  parseFilter,
  type DayGroup,
  type NextUp,
  type ScheduleFilter,
} from './dashboard/schedule';
import { ClientBookingPanel } from './ClientBookingPanel';

const FILTERS: { value: ScheduleFilter; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
  { value: 'cancelled', label: 'Cancelled' },
];

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export default function ClientPage() {
  const zone = detectZone();
  const now = useNow();
  const today = dateIn(new Date(now).toISOString(), zone);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get('filter'));

  const [version, setVersion] = useState(0);
  const bookings = useLoad(`client-bookings|${version}`, () => api.clientListBookings());
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
  const all = (bookings.latest ?? []).map((booking) =>
    cancelledIds.has(booking.booking_id) ? { ...booking, status: 'cancelled' as const } : booking,
  );
  const visible = all.filter((booking) => matchesFilter(booking, filter, now));
  const counts = countByFilter(all, now);
  const nextUp = findNextUp(all, now);
  const selected = all.find((booking) => booking.booking_id === selectedId) ?? null;

  function setFilter(value: ScheduleFilter) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === 'upcoming') next.delete('filter');
        else next.set('filter', value);
        return next;
      },
      { replace: true },
    );
  }

  function reload() {
    setVersion((current) => current + 1);
  }

  function open(booking: ClientBooking, opener: HTMLElement) {
    openerRef.current = opener;
    setCancelError(null);
    setNotice(null);
    setSelectedId(booking.booking_id);
  }

  function handleClosed() {
    setSelectedId(null);
    setCancelError(null);
    setNotice(null);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) opener.focus();
    else resultsRef.current?.focus();
  }

  async function cancel(booking: ClientBooking) {
    const day = formatCalendarDay(dateIn(booking.slot_start, zone));
    const when = formatTime(booking.slot_start, zone);
    if (
      !window.confirm(
        `Cancel your ${booking.meeting_type_name} with ${booking.brand_name} on ${day} at ${when}?`,
      )
    ) {
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await api.clientCancelBooking(booking.booking_id);
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
      <title>Appointments</title>
      <PageHeader
        title="Appointments"
        description={`Appointments you book while logged in show up here. Times in ${zone}.`}
      />

      <div className="schedule-toolbar">
        <SegmentedControl
          label="Show appointments"
          options={filterOptions}
          value={filter}
          onChange={setFilter}
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
            <AppointmentSkeleton />
          )
        ) : visible.length === 0 ? (
          <ClientEmpty
            filter={filter}
            hasOthers={all.length > 0}
            onShowAll={() => setFilter('all')}
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
          <ClientBookingPanel
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
  group: DayGroup<ClientBooking>;
  zone: string;
  today: string;
  now: number;
  nextUp: NextUp | null;
  onOpen: (booking: ClientBooking, opener: HTMLElement) => void;
};

function DaySection({ group, zone, today, now, nextUp, onOpen }: DaySectionProps) {
  const id = useId();
  return (
    <section className="day-group" aria-labelledby={id}>
      <DayHeader id={id} day={group.day} today={today} count={group.bookings.length} />
      <ul className="booking-list">
        {group.bookings.map((booking) => (
          <li key={booking.booking_id}>
            <AppointmentRow
              booking={booking}
              name={booking.brand_name}
              zone={zone}
              ended={Date.parse(booking.slot_end) <= now}
              marker={nextUp?.bookingId === booking.booking_id && nextUp.inProgress ? 'Now' : null}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

type ClientEmptyProps = {
  filter: ScheduleFilter;
  hasOthers: boolean;
  onShowAll: () => void;
};

function ClientEmpty({ filter, hasOthers, onShowAll }: ClientEmptyProps) {
  if (filter === 'cancelled') {
    return (
      <EmptyState
        icon={<CalendarX2 />}
        title="No cancelled appointments."
        description="Appointments you cancel will show up here."
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
      description="Book a demo with a realtor and it will show up here."
      action={
        <Link className="button primary" to="/client/book">
          Book
        </Link>
      }
    />
  );
}

function AppointmentSkeleton() {
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
