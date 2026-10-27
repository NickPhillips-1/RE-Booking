import { CalendarCheck, CalendarX2, CircleAlert, Inbox, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  api,
  errorMessage,
  useLoad,
  writeErrorMessage,
  type BookingPageLink,
  type GuestBooking,
} from '../api';
import { logOut } from '../auth';
import { dateIn, detectZone, formatCalendarDay, formatTime } from '../time';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { SoloShell } from '../ui/SoloShell';
import { useViewer } from '../viewer';
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
import { GuestBookingPanel } from './GuestBookingPanel';

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

export default function GuestPage() {
  const viewer = useViewer();
  const zone = detectZone();
  const now = useNow();
  const today = dateIn(new Date(now).toISOString(), zone);
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get('filter'));

  const [version, setVersion] = useState(0);
  const bookings = useLoad(`guest-bookings|${version}`, () => api.guestListBookings());
  const pages = useLoad('booking-pages', () => api.listBookingPages());
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
  const fromBookings = new Map<string, string>();
  for (const booking of all) fromBookings.set(booking.slug, booking.brand_name);
  const listed = pages.data ?? pages.latest;
  const bookLinks: BookingPageLink[] =
    listed && listed.length > 0
      ? listed
      : [...fromBookings].map(([slug, brand_name]) => ({
          slug,
          brand_name,
          agent_name: brand_name,
        }));

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

  function open(booking: GuestBooking, opener: HTMLElement) {
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

  async function cancel(booking: GuestBooking) {
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
      await api.guestCancelBooking(booking.booking_id);
      setCancelledIds((current) => new Set(current).add(booking.booking_id));
      setNotice('Appointment cancelled.');
      reload();
    } catch (error) {
      setCancelError(writeErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  const brand = { name: 'Appointments', to: '/guest' };

  if (viewer.kind === 'unknown') {
    return (
      <SoloShell brand={brand}>
        <title>Appointments</title>
        <div className="shell-status" role="alert">
          <p className="error">Could not confirm who is logged in.</p>
          <button type="button" className="button small" onClick={logOut}>
            Log out
          </button>
        </div>
      </SoloShell>
    );
  }

  const filterOptions: SegmentedOption<ScheduleFilter>[] = FILTERS.map((option) => ({
    ...option,
    count: loaded ? counts[option.value] : undefined,
  }));

  return (
    <SoloShell brand={brand}>
      <title>Appointments</title>
      <PageHeader
        title="Appointments"
        description={`Appointments you book while logged in show up here. Times in ${zone}.`}
        actions={<BookActions pages={bookLinks} />}
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
          <GuestEmpty
            filter={filter}
            hasOthers={all.length > 0}
            pages={bookLinks}
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
          <GuestBookingPanel
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
    </SoloShell>
  );
}

type DaySectionProps = {
  group: DayGroup<GuestBooking>;
  zone: string;
  today: string;
  now: number;
  nextUp: NextUp | null;
  onOpen: (booking: GuestBooking, opener: HTMLElement) => void;
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
              marker={
                nextUp?.bookingId === booking.booking_id
                  ? nextUp.inProgress
                    ? 'Now'
                    : 'Next'
                  : null
              }
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function bookLabel(pages: BookingPageLink[], page: BookingPageLink): string {
  return pages.length === 1 ? `Book a demo with ${page.brand_name}` : `Book with ${page.brand_name}`;
}

function BookActions({ pages }: { pages: BookingPageLink[] }) {
  if (pages.length === 0) return null;
  return (
    <>
      {pages.map((page) => (
        <Link key={page.slug} className="button primary" to={`/book/${page.slug}`}>
          {bookLabel(pages, page)}
        </Link>
      ))}
    </>
  );
}

type GuestEmptyProps = {
  filter: ScheduleFilter;
  hasOthers: boolean;
  pages: BookingPageLink[];
  onShowAll: () => void;
};

function GuestEmpty({ filter, hasOthers, pages, onShowAll }: GuestEmptyProps) {
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
      action={<BookActions pages={pages} />}
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
