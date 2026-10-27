import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  errorMessage,
  RATE_LIMITED_MESSAGE,
  useLoad,
  writeErrorMessage,
} from './api';
import { getToken, setToken } from './auth';
import { sessionToken } from './test/session';

const bookingArgs = {
  slug: 'jane',
  meeting_type_id: 1,
  slot_start: '2026-10-27T15:00:00.000Z',
  client_name: 'Alex Chen',
  client_email: 'alex@example.com',
  client_phone: '555-0100',
  intake_note: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function stubFetch(handler: (name: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const name = String(input).split('/rpc/')[1] ?? '';
    return handler(name, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('error messages', () => {
  it('turns rate limits and network failures into visitor copy', () => {
    expect(errorMessage(new ApiError(429, 'rate_limited', 'slow down'))).toBe(RATE_LIMITED_MESSAGE);
    expect(errorMessage(new ApiError(0, 'network', 'offline'))).toBe(
      'Could not reach the server. Check your connection.',
    );
    expect(errorMessage(new ApiError(500, 'error', 'boom'), 'Custom.')).toBe('Custom.');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });

  it('shows the server message for bad input and a missing record', () => {
    expect(writeErrorMessage(new ApiError(400, 'invalid_input', 'Enter a real phone.'))).toBe(
      'Enter a real phone.',
    );
    expect(writeErrorMessage(new ApiError(404, 'not_found', 'Missing.'))).toBe('Missing.');
    expect(writeErrorMessage(new ApiError(429, 'rate_limited', 'slow down'))).toBe(
      RATE_LIMITED_MESSAGE,
    );
    expect(writeErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});

describe('rpc', () => {
  it('posts login details and does not send a session', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ token: 't', expires_at: '2026-10-27' }));
    await api.login('jane@example.com', 'secret');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3000/rpc/login');
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(headersOf(init).Authorization).toBeUndefined();
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'jane@example.com',
      password: 'secret',
    });
  });

  it('sends an agent token on a dashboard call', async () => {
    const token = sessionToken('agent');
    setToken(token);
    const fetchMock = stubFetch(() => jsonResponse({ agent_id: 1 }));
    await api.agentSession();
    const init = fetchMock.mock.calls[0]?.[1];
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:3000/rpc/agent_session');
    expect(headersOf(init).Authorization).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({});
  });

  it('refuses a dashboard or client call for the wrong session', async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    setToken(sessionToken('client'));
    await expect(api.agentSession()).rejects.toMatchObject({
      status: 401,
      code: 'session_expired',
      message: 'Log in again.',
    });
    setToken(sessionToken('agent'));
    await expect(api.clientSession()).rejects.toMatchObject({ code: 'session_expired' });
    setToken(null);
    await expect(api.clientListBookings()).rejects.toMatchObject({ code: 'session_expired' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches a client token when booking and ignores an agent token', async () => {
    const client = sessionToken('client');
    setToken(client);
    const fetchMock = stubFetch(() => jsonResponse({ cancel_token: 't' }));
    await api.createBooking(bookingArgs);
    expect(headersOf(fetchMock.mock.calls[0]?.[1]).Authorization).toBe(`Bearer ${client}`);

    setToken(sessionToken('agent'));
    await api.createBooking(bookingArgs);
    expect(headersOf(fetchMock.mock.calls[1]?.[1]).Authorization).toBeUndefined();

    setToken(null);
    await api.createBooking(bookingArgs);
    expect(headersOf(fetchMock.mock.calls[2]?.[1]).Authorization).toBeUndefined();
  });

  it('clears the session when the server rejects the token', async () => {
    setToken(sessionToken('agent'));
    stubFetch(() => jsonResponse({ code: 'invalid_token', message: 'Expired.' }, 401));
    await expect(api.agentSession()).rejects.toMatchObject({
      status: 401,
      code: 'invalid_token',
      message: 'Expired.',
    });
    expect(getToken()).toBeNull();
  });

  it('leaves a stored session alone when a public call is unauthorized', async () => {
    const token = sessionToken('agent');
    setToken(token);
    stubFetch(() => jsonResponse({ message: 'nope' }, 401));
    await expect(api.bookingPage('jane')).rejects.toMatchObject({ status: 401, code: 'error' });
    expect(getToken()).toBe(token);
  });

  it('keeps the server hint and falls back when the body is not json', async () => {
    stubFetch((name) =>
      name === 'booking_page'
        ? jsonResponse({ code: 'invalid_input', message: 'Bad phone.', hint: 'client_phone' }, 400)
        : new Response('nope', { status: 502 }),
    );
    await expect(api.bookingPage('jane')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_input',
      message: 'Bad phone.',
      hint: 'client_phone',
    });
    await expect(api.login('a@b.c', 'secret')).rejects.toMatchObject({
      status: 502,
      code: 'error',
      message: 'Request failed.',
      hint: null,
    });
  });

  it('reports a network failure and accepts a null page', async () => {
    const fetchMock = stubFetch(() => jsonResponse(null));
    await expect(api.bookingPage('missing')).resolves.toBeNull();

    fetchMock.mockRejectedValue(new TypeError('offline'));
    await expect(api.bookingPage('jane')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});

describe('useLoad', () => {
  it('does not load when the key is null', () => {
    const load = vi.fn();
    const { result } = renderHook(() => useLoad(null, load));
    expect(load).not.toHaveBeenCalled();
    expect(result.current).toEqual({ data: undefined, error: undefined, latest: undefined });
  });

  it('ignores a response from an older key', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useLoad(key, () => (key === 'a' ? first.promise : second.promise)),
      { initialProps: { key: 'a' } },
    );

    rerender({ key: 'b' });
    await act(async () => {
      first.resolve('stale');
      await first.promise;
    });
    expect(result.current.data).toBeUndefined();
    expect(result.current.latest).toBeUndefined();

    await act(async () => {
      second.resolve('fresh');
      await second.promise;
    });
    expect(result.current).toMatchObject({ data: 'fresh', latest: 'fresh' });
  });

  it('keeps the last success when a later load fails or the key is cleared', async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) =>
        useLoad(key, () =>
          key === 'b' ? Promise.reject(new Error('nope')) : Promise.resolve('first'),
        ),
      { initialProps: { key: 'a' as string | null } },
    );
    await waitFor(() => expect(result.current.data).toBe('first'));

    rerender({ key: 'b' });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toBeUndefined();
    expect(result.current.latest).toBe('first');

    rerender({ key: null });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(result.current.latest).toBe('first');
  });
});
