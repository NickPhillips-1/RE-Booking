import { ChevronRight, MapPin, Phone, Users, Video } from 'lucide-react';
import type { AgentBooking, MeetingLocation } from '../../api';
import { formatCalendarDay, formatTime, LOCATION_LABELS } from '../../time';
import { StatusBadge } from '../../ui/StatusBadge';
import { appointmentCount, relativeDay, type NextUp } from './schedule';

export type AppointmentFields = {
  booking_id: number;
  meeting_type_name: string;
  duration_minutes: number;
  location: MeetingLocation;
  slot_start: string;
  slot_end: string;
  intake_note: string | null;
  status: 'confirmed' | 'cancelled';
};

type DayHeaderProps = {
  id: string;
  day: string;
  today: string;
  count: number;
};

export function DayHeader({ id, day, today, count }: DayHeaderProps) {
  const relative = relativeDay(day, today);
  return (
    <div className="day-group-header">
      <h2 className="day-group-title" id={id}>
        {relative && (
          <span>
            {relative}
            <span className="visually-hidden">,</span>
          </span>
        )}
        <span className={relative ? 'day-group-date' : undefined}>{formatCalendarDay(day)}</span>
      </h2>
      {count > 0 && <span className="day-group-count">{appointmentCount(count)}</span>}
    </div>
  );
}

type BookingListProps = {
  bookings: AgentBooking[];
  zone: string;
  now: number;
  nextUp: NextUp | null;
  onOpen: (booking: AgentBooking, opener: HTMLElement) => void;
};

export function BookingList({ bookings, zone, now, nextUp, onOpen }: BookingListProps) {
  return (
    <ul className="booking-list">
      {bookings.map((booking) => (
        <li key={booking.booking_id}>
          <BookingRow
            booking={booking}
            zone={zone}
            ended={Date.parse(booking.slot_end) <= now}
            marker={
              nextUp?.bookingId === booking.booking_id ? (nextUp.inProgress ? 'Now' : 'Next') : null
            }
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  );
}

export function LocationIcon({ location }: { location: MeetingLocation }) {
  if (location === 'video') return <Video />;
  if (location === 'phone') return <Phone />;
  return <Users />;
}

type BookingRowProps = {
  booking: AgentBooking;
  zone: string;
  ended: boolean;
  marker: string | null;
  onOpen: (booking: AgentBooking, opener: HTMLElement) => void;
};

function BookingRow({ booking, zone, ended, marker, onOpen }: BookingRowProps) {
  return (
    <AppointmentRow
      booking={booking}
      name={booking.guest_name}
      zone={zone}
      ended={ended}
      marker={marker}
      onOpen={onOpen}
    />
  );
}

type AppointmentRowProps<T extends AppointmentFields> = {
  booking: T;
  name: string;
  zone: string;
  ended: boolean;
  marker: string | null;
  onOpen: (booking: T, opener: HTMLElement) => void;
};

export function AppointmentRow<T extends AppointmentFields>({
  booking,
  name,
  zone,
  ended,
  marker,
  onOpen,
}: AppointmentRowProps<T>) {
  const cancelled = booking.status === 'cancelled';
  return (
    <button
      type="button"
      className="booking-row"
      data-cancelled={cancelled || undefined}
      data-ended={(ended && !cancelled) || undefined}
      aria-haspopup="dialog"
      onClick={(event) => onOpen(booking, event.currentTarget)}
    >
      <span className="booking-time">
        <span className="booking-start">{formatTime(booking.slot_start, zone)}</span>
        <span className="booking-end">
          <span className="visually-hidden"> to </span>
          {formatTime(booking.slot_end, zone)}
        </span>
        {marker && <span className="booking-marker">{marker}</span>}
      </span>

      <span className="booking-guest">
        <span className="booking-name">{name}</span>
        <span className="booking-detail">
          <MapPin />
          <span className="booking-detail-text">{booking.intake_note || 'No property listed'}</span>
        </span>
      </span>

      <span className="booking-meeting">
        <span className="booking-type">{booking.meeting_type_name}</span>
        <span className="booking-detail">
          <LocationIcon location={booking.location} />
          <span className="booking-detail-text">
            {LOCATION_LABELS[booking.location]} · {booking.duration_minutes} min
          </span>
        </span>
      </span>

      <span className="booking-status">
        <StatusBadge status={booking.status} />
      </span>
      <ChevronRight className="booking-chevron" />
    </button>
  );
}
