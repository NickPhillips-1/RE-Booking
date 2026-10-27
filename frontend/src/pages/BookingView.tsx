import { CalendarX2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, ApiError, errorMessage, useLoad, type BookingPage, type MeetingType } from '../api';
import {
  addMonths,
  BOOKING_HORIZON_DAYS,
  compareMonths,
  detectZone,
  formatTime,
  LOCATION_LABELS,
  monthOf,
  monthRange,
  todayIn,
  zoneChoices,
  type YearMonth,
} from '../time';
import { ChoiceChips } from '../ui/ChoiceChips';
import { EmptyState } from '../ui/EmptyState';
import { Field, SelectField } from '../ui/Field';
import { PageHeader } from '../ui/PageHeader';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useViewer, type Viewer } from '../viewer';
import { BookingCalendar } from './BookingCalendar';

type Form = { name: string; email: string; phone: string; note: string };
type Errors = Partial<Record<keyof Form | 'slot' | 'form', string>>;

const FIELD_BY_HINT: Record<string, keyof Form> = {
  client_name: 'name',
  client_email: 'email',
  client_phone: 'phone',
  intake_note: 'note',
};

function describe(type: MeetingType): string {
  const parts = [`${type.duration_minutes} min`, LOCATION_LABELS[type.location]];
  if (type.buffer_before_minutes > 0) parts.push(`${type.buffer_before_minutes} min free before`);
  if (type.buffer_after_minutes > 0) parts.push(`${type.buffer_after_minutes} min free after`);
  return parts.join(' · ');
}

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email.';
  if (!form.phone.trim()) errors.phone = 'Enter a phone number.';
  return errors;
}

function headerActions(page: BookingPage, viewer: Viewer) {
  if (viewer.kind === 'realtor') {
    const ownPage = viewer.agent.slug === page.slug.trim().toLowerCase();
    return (
      <Link className="button" to="/dashboard">
        {ownPage ? 'Open your dashboard' : 'Open dashboard'}
      </Link>
    );
  }
  if (viewer.kind === 'client-account') {
    return (
      <Link className="button" to="/client">
        Your appointments
      </Link>
    );
  }
  return undefined;
}

function headerDescription(page: BookingPage, viewer: Viewer): string {
  const sameName = page.brand_name.trim() === page.agent_name.trim();
  const role = sameName ? 'Realtor' : `Realtor · ${page.brand_name}`;
  if (viewer.kind === 'realtor') {
    const ownPage = viewer.agent.slug === page.slug.trim().toLowerCase();
    return ownPage
      ? `${role}. This is the page clients use to book an appointment with you.`
      : `${role}. This is a client booking page.`;
  }
  return role;
}

type BookingViewProps = {
  slug: string;
  variant: 'public' | 'client';
  actions?: ReactNode;
};

export function BookingView({ slug, variant, actions }: BookingViewProps) {
  const navigate = useNavigate();
  const viewer = useViewer();

  const [zone, setZone] = useState(detectZone);
  const [chosenType, setChosenType] = useState<number | null>(null);
  const [month, setMonth] = useState<YearMonth>(() => monthOf(todayIn(detectZone())));
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ name: '', email: '', phone: '', note: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const page = useLoad(`page|${slug}`, () => api.bookingPage(slug));
  const types = page.data?.meeting_types ?? [];
  const type = types.find((t) => t.meeting_type_id === chosenType) ?? types[0];
  const typeId = type?.meeting_type_id ?? null;

  const dates = useLoad(
    typeId === null
      ? null
      : `dates|${slug}|${typeId}|${month.year}-${month.month}|${zone}|${refresh}`,
    () => {
      const { from, to } = monthRange(month);
      return api.availableDates({
        slug,
        meeting_type_id: typeId!,
        from_date: from,
        to_date: to,
        visitor_timezone: zone,
      });
    },
  );
  const slots = useLoad(
    typeId === null || day === null ? null : `slots|${slug}|${typeId}|${day}|${zone}|${refresh}`,
    () =>
      api.availableSlots({
        slug,
        meeting_type_id: typeId!,
        on_date: day!,
        visitor_timezone: zone,
      }),
  );

  const account = viewer.kind === 'client-account' ? viewer.client : null;
  const details: Form = account
    ? { ...form, name: account.name, email: account.email, phone: account.phone }
    : form;

  const thisMonth = monthOf(todayIn(zone));
  const lastMonth = monthOf(todayIn(zone, BOOKING_HORIZON_DAYS));
  const headerExtra = variant === 'client' ? actions : page.data ? headerActions(page.data, viewer) : undefined;

  function clearSelection() {
    setDay(null);
    setSlot(null);
    setErrors(({ slot: _slot, ...rest }) => rest);
  }

  function chooseType(value: string) {
    setChosenType(Number(value));
    clearSelection();
  }

  function chooseZone(next: string) {
    setZone(next);
    clearSelection();
  }

  function moveMonth(delta: number) {
    setMonth((current) => addMonths(current, delta));
    clearSelection();
  }

  function update(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typeId === null) return;
    const next = validate(details);
    if (!slot) next.slot = 'Pick a time.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const { cancel_token, ...receipt } = await api.createBooking({
        slug,
        meeting_type_id: typeId,
        slot_start: slot!,
        client_name: details.name,
        client_email: details.email,
        client_phone: details.phone,
        intake_note: details.note.trim() || null,
      });
      if (variant === 'client') {
        navigate('/client');
        return;
      }
      navigate(
        {
          pathname: `/book/${slug}/confirmed`,
          hash: new URLSearchParams({ token: cancel_token, tz: zone }).toString(),
        },
        { state: { receipt } },
      );
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && ['slot_taken', 'slot_not_available'].includes(error.code)) {
        setErrors({
          slot:
            error.code === 'slot_taken'
              ? 'That time was just taken.'
              : 'That time is no longer available.',
        });
        setSlot(null);
        setRefresh((n) => n + 1);
      } else if (error instanceof ApiError && error.hint && FIELD_BY_HINT[error.hint]) {
        setErrors({ [FIELD_BY_HINT[error.hint]]: error.message });
      } else if (error instanceof ApiError && error.code === 'session_expired') {
        setErrors({ form: 'Log in again.' });
      } else if (error instanceof ApiError && error.code === 'network') {
        setErrors({
          form: 'We could not confirm the booking. Check the open times before trying again.',
        });
        setSlot(null);
        setRefresh((n) => n + 1);
      } else {
        setErrors({ form: errorMessage(error) });
      }
    }
  }

  if (page.error) {
    return (
      <>
        <title>Book</title>
        <EmptyState title="Couldn’t load this page." description={errorMessage(page.error)} />
      </>
    );
  }
  if (page.data === undefined) {
    return (
      <>
        <title>Book</title>
        <p className="quiet" role="status">
          Loading…
        </p>
      </>
    );
  }
  if (page.data === null) {
    return (
      <>
        <title>Page not found</title>
        <PageHeader
          title="Page not found"
          description="There is no booking page at this address."
        />
      </>
    );
  }
  if (!page.data.has_hours || !type) {
    return (
      <>
        <title>{`Book with ${page.data.agent_name}`}</title>
        <PageHeader
          title={page.data.agent_name}
          description={headerDescription(page.data, viewer)}
          actions={headerExtra}
        />
        <EmptyState icon={<CalendarX2 />} title="No open times yet." />
      </>
    );
  }

  return (
    <>
      <title>{`Book with ${page.data.agent_name}`}</title>
      <PageHeader
        title={page.data.agent_name}
        description={headerDescription(page.data, viewer)}
        actions={headerExtra}
      />

      <section className="booking-section booking-meetings" aria-labelledby="meeting-label">
        <h2 className="label" id="meeting-label">
          Meeting
        </h2>
        <SegmentedControl
          label="Meeting type"
          options={types.map((item) => ({
            value: String(item.meeting_type_id),
            label: item.name,
          }))}
          value={String(type.meeting_type_id)}
          onChange={chooseType}
        />
        <p className="quiet">{describe(type)}</p>
      </section>

      <div className="booking-flow">
        <div className="calendar-layout">
          <BookingCalendar
            month={month}
            zone={zone}
            available={dates.data ? new Set(dates.data) : undefined}
            selected={day}
            canPrevious={compareMonths(month, thisMonth) > 0}
            canNext={compareMonths(month, lastMonth) < 0}
            onSelect={(isoDate) => {
              setDay(isoDate);
              setSlot(null);
            }}
            onPrevious={() => moveMonth(-1)}
            onNext={() => moveMonth(1)}
          />

          <div className="booking-details">
            {dates.error !== undefined && (
              <p className="error" role="alert">
                {errorMessage(dates.error)}
              </p>
            )}

            <section className="booking-section" aria-labelledby="time-label">
              <h2 className="label" id="time-label">
                Time
              </h2>
              <p className="zone-line">
                <span>Times in</span>
                <select
                  className="select"
                  aria-label="Time zone"
                  value={zone}
                  onChange={(event) => chooseZone(event.target.value)}
                >
                  {zoneChoices(zone, page.data.timezone).map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </p>
              {day === null ? (
                <p className="quiet">Pick a day to see open times.</p>
              ) : slots.error !== undefined ? (
                <p className="error">{errorMessage(slots.error)}</p>
              ) : slots.data === undefined ? (
                <p className="quiet">Loading times…</p>
              ) : slots.data.length === 0 ? (
                <p>No open times on this day.</p>
              ) : (
                <ChoiceChips
                  label="Open times"
                  options={slots.data.map((item) => ({
                    value: item.slot_start,
                    label: formatTime(item.slot_start, zone),
                  }))}
                  selected={slot}
                  onSelect={(value) => {
                    setSlot(value);
                    setErrors(({ slot: _slot, ...rest }) => rest);
                  }}
                />
              )}
              {errors.slot && <p className="error">{errors.slot}</p>}
            </section>

            <form
              className="booking-section"
              onSubmit={submit}
              noValidate
              aria-labelledby="details-label"
            >
              <div className="stack">
                <h2 className="label" id="details-label">
                  {viewer.kind === 'realtor' ? 'Client details' : 'Your details'}
                </h2>
                {viewer.kind === 'realtor' && (
                  <p className="quiet">
                    This books an appointment as a client. It does not change your realtor login.
                  </p>
                )}
                {account && (
                  <p className="quiet">Name, email, and phone come from your client account.</p>
                )}
              </div>
              <div className="booking-fields">
                <Field
                  id="client-name"
                  label="Name"
                  autoComplete="name"
                  readOnly={account !== null}
                  value={details.name}
                  error={errors.name}
                  onChange={(event) => update('name', event.target.value)}
                />
                <Field
                  id="client-email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  readOnly={account !== null}
                  value={details.email}
                  error={errors.email}
                  onChange={(event) => update('email', event.target.value)}
                />
                <Field
                  id="client-phone"
                  label="Phone"
                  type="tel"
                  autoComplete="tel"
                  readOnly={account !== null}
                  value={details.phone}
                  error={errors.phone}
                  onChange={(event) => update('phone', event.target.value)}
                />
                {page.data.properties.length > 0 && (
                  <SelectField
                    id="client-note"
                    label="Which property?"
                    value={form.note}
                    error={errors.note}
                    onChange={(event) => update('note', event.target.value)}
                  >
                    <option value="">Select a property</option>
                    {page.data.properties.map((address) => (
                      <option key={address} value={address}>
                        {address}
                      </option>
                    ))}
                  </SelectField>
                )}
              </div>
              <div>
                <button className="button primary" type="submit" disabled={submitting}>
                  {submitting ? 'Booking…' : viewer.kind === 'realtor' ? 'Book as client' : 'Book'}
                </button>
              </div>
              {errors.form && <p className="error">{errors.form}</p>}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
