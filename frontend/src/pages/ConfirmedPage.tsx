import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { api, ApiError, errorMessage, useLoad, type Receipt } from '../api';
import { dateIn, detectZone, formatCalendarDay, formatTime, isValidZone, LOCATION_LABELS } from '../time';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SoloShell } from '../ui/SoloShell';
import { useViewer } from '../viewer';

export default function ConfirmedPage() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('token') ?? '';
  const requestedZone = params.get('tz');
  const zone = requestedZone && isValidZone(requestedZone) ? requestedZone : detectZone();
  const passed = (location.state as { receipt?: Receipt } | null)?.receipt;

  const loaded = useLoad(token ? `receipt|${token}` : null, () => api.bookingByToken(token));
  const viewer = useViewer();
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const receipt = loaded.data ?? passed;
  const brand = receipt
    ? { name: receipt.brand_name, to: `/book/${receipt.slug}` }
    : { name: 'Book', to: `/book/${slug}` };

  async function cancel() {
    if (!receipt) return;
    const day = formatCalendarDay(dateIn(receipt.slot_start, zone));
    const when = formatTime(receipt.slot_start, zone);
    if (
      !window.confirm(
        `Cancel your ${receipt.meeting_type_name} with ${receipt.brand_name} on ${day} at ${when}?`,
      )
    ) {
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await api.cancelBooking(token);
      setCancelled(true);
    } catch (error) {
      setCancelError(errorMessage(error, 'Could not cancel. Try again.'));
    } finally {
      setCancelling(false);
    }
  }

  if (!token || (loaded.error instanceof ApiError && loaded.error.code === 'not_found')) {
    return (
      <SoloShell brand={brand}>
        <title>Booking not found</title>
        <PageHeader title="Booking not found" description="This link does not match a booking." />
        <div>
          <Link className="button" to={`/book/${slug}`}>
            Book a time
          </Link>
        </div>
      </SoloShell>
    );
  }
  if (!receipt) {
    return (
      <SoloShell brand={null}>
        <title>Booked</title>
        {loaded.error !== undefined ? (
          <EmptyState title="Couldn’t load this booking." description={errorMessage(loaded.error)} />
        ) : (
          <p className="quiet" role="status">
            Loading…
          </p>
        )}
      </SoloShell>
    );
  }

  const isCancelled = cancelled || receipt.status === 'cancelled';

  return (
    <SoloShell brand={brand}>
      <title>{isCancelled ? 'Cancelled' : 'Booked'}</title>
      <PageHeader
        title={isCancelled ? 'Cancelled' : 'Booked'}
        description={
          isCancelled
            ? 'This booking is cancelled.'
            : viewer.kind === 'guest-account'
              ? 'This appointment is on your guest account.'
              : 'Keep this page’s link. It is how you cancel.'
        }
        actions={
          viewer.kind === 'guest-account' ? (
            <Link className="button" to="/guest">
              Your appointments
            </Link>
          ) : undefined
        }
      />

      <div className="receipt">
        <div className="receipt-body">
          <dl className="properties">
            <div>
              <dt>Meeting</dt>
              <dd>
                {receipt.meeting_type_name} · {receipt.duration_minutes} min ·{' '}
                {LOCATION_LABELS[receipt.location]}
              </dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {formatCalendarDay(dateIn(receipt.slot_start, zone))} ·{' '}
                {formatTime(receipt.slot_start, zone)} – {formatTime(receipt.slot_end, zone)}
              </dd>
            </div>
            <div>
              <dt>Time zone</dt>
              <dd>{zone}</dd>
            </div>
            <div>
              <dt>Guest</dt>
              <dd>{receipt.guest_name}</dd>
            </div>
            <div>
              <dt>Property</dt>
              <dd>{receipt.intake_note || <span className="quiet">Not given</span>}</dd>
            </div>
          </dl>
        </div>
        <div className="receipt-footer">
          {isCancelled ? (
            <Link className="button" to={`/book/${receipt.slug}`}>
              Book another time
            </Link>
          ) : (
            <button
              type="button"
              className="button danger"
              aria-disabled={cancelling}
              onClick={() => {
                if (!cancelling) void cancel();
              }}
            >
              {cancelling ? 'Cancelling…' : 'Cancel appointment'}
            </button>
          )}
          {cancelError && (
            <p className="error" role="alert">
              {cancelError}
            </p>
          )}
        </div>
      </div>
    </SoloShell>
  );
}
