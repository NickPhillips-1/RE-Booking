import { LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { GuestBooking } from '../api';
import { dateIn, formatCalendarDay, formatTime, LOCATION_LABELS } from '../time';
import { StatusBadge } from '../ui/StatusBadge';
import { LocationIcon } from './dashboard/BookingList';

type GuestBookingPanelProps = {
  booking: GuestBooking;
  zone: string;
  titleId: string;
  cancelling: boolean;
  error: string | null;
  notice: string | null;
  onCancel: (booking: GuestBooking) => void;
  onClose: () => void;
};

export function GuestBookingPanel({
  booking,
  zone,
  titleId,
  cancelling,
  error,
  notice,
  onCancel,
  onClose,
}: GuestBookingPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const confirmed = booking.status === 'confirmed';

  useEffect(() => {
    if (!confirmed) closeRef.current?.focus();
  }, [confirmed]);

  return (
    <>
      <header className="panel-header">
        <div className="panel-header-row">
          <StatusBadge status={booking.status} />
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <h2 className="panel-title" id={titleId}>
          {booking.brand_name}
        </h2>
        <p className="panel-subtitle">
          {booking.meeting_type_name} · {booking.duration_minutes} min
        </p>
      </header>

      <div className="panel-body">
        <PanelSection title="When">
          <Property label="Date">{formatCalendarDay(dateIn(booking.slot_start, zone))}</Property>
          <Property label="Time">
            {formatTime(booking.slot_start, zone)} – {formatTime(booking.slot_end, zone)}
          </Property>
          <Property label="Time zone">{zone}</Property>
        </PanelSection>

        <PanelSection title="Where">
          <Property label="Property">
            {booking.intake_note || <span className="quiet">Not given</span>}
          </Property>
          <Property label="Meeting">
            <span className="property-with-icon">
              <LocationIcon location={booking.location} />
              {LOCATION_LABELS[booking.location]}
            </span>
          </Property>
        </PanelSection>

        <PanelSection title="Realtor">
          <Property label="Name">{booking.agent_name}</Property>
          <Property label="Book">
            <Link to={`/book/${booking.slug}`}>Book again</Link>
          </Property>
        </PanelSection>
      </div>

      <footer className="panel-footer">
        {confirmed ? (
          <button
            type="button"
            className="button danger"
            aria-disabled={cancelling}
            onClick={() => {
              if (!cancelling) onCancel(booking);
            }}
          >
            {cancelling && <LoaderCircle className="is-spinning" />}
            {cancelling ? 'Cancelling…' : 'Cancel appointment'}
          </button>
        ) : (
          <p className="panel-note">This appointment is cancelled.</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="visually-hidden" role="status">
          {notice}
        </p>
      </footer>
    </>
  );
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="panel-section" aria-labelledby={id}>
      <h3 className="panel-section-title" id={id}>
        {title}
      </h3>
      <dl className="properties">{children}</dl>
    </section>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
