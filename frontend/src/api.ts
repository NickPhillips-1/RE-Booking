import { useEffect, useState } from 'react';
import { getToken, sessionRole, setToken } from './auth';

declare global {
  interface Window {
    __APP_CONFIG__?: { apiUrl?: string };
  }
}

// Docker serves /config.js with the runtime API_URL. Vercel and Vite use the build-time value.
const API_URL = (
  window.__APP_CONFIG__?.apiUrl ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000'
).replace(/\/+$/, '');

export type MeetingLocation = 'in_person' | 'video' | 'phone';

export type MeetingType = {
  meeting_type_id: number;
  name: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  location: MeetingLocation;
};

export type AgentMeetingType = MeetingType & { active: boolean };

export type BookingPage = {
  slug: string;
  brand_name: string;
  agent_name: string;
  timezone: string;
  has_hours: boolean;
  properties: string[];
  meeting_types: MeetingType[];
};

export type BookingPageLink = {
  slug: string;
  brand_name: string;
  agent_name: string;
};

export type Slot = { slot_start: string; slot_end: string };

export type Receipt = {
  status: 'confirmed' | 'cancelled';
  slot_start: string;
  slot_end: string;
  meeting_type_name: string;
  duration_minutes: number;
  location: MeetingLocation;
  brand_name: string;
  agent_timezone: string;
  client_name: string;
  intake_note: string | null;
  slug: string;
};

export type AgentSession = {
  agent_id: number;
  name: string;
  email: string;
  slug: string;
  timezone: string;
  brand_name: string;
};

export type ClientSession = {
  client_id: number;
  name: string;
  email: string;
  phone: string;
};

export type ClientBooking = {
  booking_id: number;
  meeting_type_name: string;
  duration_minutes: number;
  location: MeetingLocation;
  slot_start: string;
  slot_end: string;
  intake_note: string | null;
  status: 'confirmed' | 'cancelled';
  agent_name: string;
  brand_name: string;
  slug: string;
};

export type AgentBooking = {
  booking_id: number;
  meeting_type_id: number;
  meeting_type_name: string;
  duration_minutes: number;
  location: MeetingLocation;
  slot_start: string;
  slot_end: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  intake_note: string | null;
  status: 'confirmed' | 'cancelled';
};

export type WeeklyHour = { weekday: number; start_local: string; end_local: string };

export type MeetingTypeInput = Omit<AgentMeetingType, 'meeting_type_id'> & {
  meeting_type_id: number | null;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string | null;

  constructor(status: number, code: string, message: string, hint: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

export const RATE_LIMITED_MESSAGE = 'Too many attempts. Wait a few minutes and try again.';

export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (error instanceof ApiError) {
    if (error.code === 'rate_limited') return RATE_LIMITED_MESSAGE;
    if (error.code === 'network') return 'Could not reach the server. Check your connection.';
  }
  return fallback;
}

export function writeErrorMessage(error: unknown): string {
  return error instanceof ApiError && ['invalid_input', 'not_found'].includes(error.code)
    ? error.message
    : errorMessage(error);
}

type CallAuth = 'none' | 'agent' | 'client' | 'client-optional';

function bearer(auth: CallAuth): string | null {
  if (auth === 'none') return null;
  const token = getToken();
  const role = token ? sessionRole(token) : null;
  if (auth === 'agent' && role === 'agent') return token;
  if ((auth === 'client' || auth === 'client-optional') && role === 'client') return token;
  return null;
}

async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
  auth: CallAuth = 'none',
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const token = bearer(auth);
  if ((auth === 'agent' || auth === 'client') && !token) {
    throw new ApiError(401, 'session_expired', 'Log in again.');
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach the server.');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body ?? {}) as { code?: string; message?: string; hint?: string | null };
    if (token && response.status === 401) setToken(null);
    throw new ApiError(
      response.status,
      error.code ?? 'error',
      error.message ?? 'Request failed.',
      error.hint ?? null,
    );
  }
  return body as T;
}

export const api = {
  listBookingPages: () => rpc<BookingPageLink[]>('list_booking_pages', {}, 'client'),
  bookingPage: (slug: string) => rpc<BookingPage | null>('booking_page', { slug }),
  availableDates: (args: {
    slug: string;
    meeting_type_id: number;
    from_date: string;
    to_date: string;
    visitor_timezone: string;
  }) => rpc<string[]>('available_dates', args),
  availableSlots: (args: {
    slug: string;
    meeting_type_id: number;
    on_date: string;
    visitor_timezone: string;
  }) => rpc<Slot[]>('available_slots', args),
  createBooking: (args: {
    slug: string;
    meeting_type_id: number;
    slot_start: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    intake_note: string | null;
  }) => rpc<Receipt & { cancel_token: string }>('create_booking', args, 'client-optional'),
  bookingByToken: (token: string) => rpc<Receipt>('booking_by_token', { token }),
  cancelBooking: (token: string) => rpc<{ status: 'cancelled' }>('cancel_booking', { token }),
  login: (email: string, password: string) =>
    rpc<{ token: string; expires_at: string }>('login', { email, password }),
  clientLogin: (email: string, password: string) =>
    rpc<{ token: string; expires_at: string }>('client_login', { email, password }),

  agentSession: () => rpc<AgentSession>('agent_session', {}, 'agent'),
  agentListBookings: () => rpc<AgentBooking[]>('agent_list_bookings', {}, 'agent'),
  agentCancelBooking: (bookingId: number) =>
    rpc<{ status: 'cancelled' }>('agent_cancel_booking', { booking_id: bookingId }, 'agent'),
  agentListWeeklyHours: () => rpc<WeeklyHour[]>('agent_list_weekly_hours', {}, 'agent'),
  agentReplaceWeeklyHours: (hours: WeeklyHour[]) =>
    rpc<WeeklyHour[]>('agent_replace_weekly_hours', { hours }, 'agent'),
  agentListMeetingTypes: () => rpc<AgentMeetingType[]>('agent_list_meeting_types', {}, 'agent'),
  agentUpsertMeetingType: (input: MeetingTypeInput) =>
    rpc<AgentMeetingType>('agent_upsert_meeting_type', input, 'agent'),

  clientSession: () => rpc<ClientSession>('client_session', {}, 'client'),
  clientListBookings: () => rpc<ClientBooking[]>('client_list_bookings', {}, 'client'),
  clientCancelBooking: (bookingId: number) =>
    rpc<{ status: 'cancelled' }>('client_cancel_booking', { booking_id: bookingId }, 'client'),
};

type Loaded<T> = { key: string; data?: T; error?: unknown };

// Loads once per key. `data` belongs to the current key; `latest` is the last
// successful result for any key, for screens that should not blank while refreshing.
export function useLoad<T>(key: string | null, load: () => Promise<T>) {
  const [current, setCurrent] = useState<Loaded<T> | null>(null);
  const [latest, setLatest] = useState<T | undefined>(undefined);

  useEffect(() => {
    if (key === null) return;
    let ignore = false;
    load().then(
      (data) => {
        if (ignore) return;
        setCurrent({ key, data });
        setLatest(data);
      },
      (error: unknown) => {
        if (!ignore) setCurrent({ key, error });
      },
    );
    return () => {
      ignore = true;
    };
    // The key names the request; `load` is a new closure on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const settled = current !== null && current.key === key;
  return {
    data: settled ? current.data : undefined,
    error: settled ? current.error : undefined,
    latest,
  };
}
