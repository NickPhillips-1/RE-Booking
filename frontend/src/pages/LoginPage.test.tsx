import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import { getToken, setToken } from '../auth';
import { sessionToken } from '../test/session';
import LoginPage from './LoginPage';

function renderLogin(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<h1>Dashboard home</h1>} />
        <Route path="/client" element={<h1>Client home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function signIn(email = 'jane@example.com', password = 'secret') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  return user;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'login').mockRejectedValue(new ApiError(401, 'invalid_login', 'no'));
    vi.spyOn(api, 'clientLogin').mockRejectedValue(new ApiError(401, 'invalid_login', 'no'));
  });

  it('starts as a realtor and can switch to a client', async () => {
    const user = userEvent.setup();
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Realtor log in' })).toBeInTheDocument();
    expect(screen.getByText('Hours, meetings, and the schedule.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Client' }));
    expect(screen.getByRole('heading', { name: 'Client log in' })).toBeInTheDocument();
    expect(
      screen.getByText('See and cancel appointments you book while logged in.'),
    ).toBeInTheDocument();
  });

  it('opens the client form from the client link', () => {
    renderLogin('/login?as=client');
    expect(screen.getByRole('heading', { name: 'Client log in' })).toBeInTheDocument();
  });

  it('says when the email or password is wrong and clears that when the account changes', async () => {
    renderLogin();
    const user = await signIn();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Email or password is wrong.')).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith('jane@example.com', 'secret');

    await user.click(screen.getByRole('button', { name: 'Client' }));
    expect(screen.queryByText('Email or password is wrong.')).not.toBeInTheDocument();
  });

  it('explains a rate limit and a network failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.login)
      .mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'slow down'))
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'));
    renderLogin();
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret');

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByText('Too many attempts. Wait a few minutes and try again.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(
      await screen.findByText('Could not reach the server. Check your connection.'),
    ).toBeInTheDocument();
  });

  it('stores a realtor session and opens the dashboard', async () => {
    const token = sessionToken('agent');
    vi.mocked(api.login).mockResolvedValue({ token, expires_at: '2026-10-27T03:00:00Z' });
    renderLogin();
    const user = await signIn();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard home' })).toBeInTheDocument();
    expect(getToken()).toBe(token);
  });

  it('stores a client session and opens appointments', async () => {
    const token = sessionToken('client');
    vi.mocked(api.clientLogin).mockResolvedValue({ token, expires_at: '2026-10-27T03:00:00Z' });
    renderLogin('/login?as=client');
    const user = await signIn('client@example.com', 'secret');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Client home' })).toBeInTheDocument();
    expect(api.clientLogin).toHaveBeenCalledWith('client@example.com', 'secret');
    expect(getToken()).toBe(token);
  });

  it('disables the button while the request is in flight', async () => {
    const pending = deferred<{ token: string; expires_at: string }>();
    vi.mocked(api.login).mockReturnValue(pending.promise);
    renderLogin();
    const user = await signIn();
    const submitted = user.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled());
    await act(async () => {
      pending.resolve({ token: sessionToken('agent'), expires_at: '2026-10-27T03:00:00Z' });
    });
    await submitted;
    expect(await screen.findByRole('heading', { name: 'Dashboard home' })).toBeInTheDocument();
  });

  it('skips the form when that role is already logged in', () => {
    setToken(sessionToken('agent'));
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Dashboard home' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    setToken(sessionToken('client'));
    renderLogin('/login');
    expect(screen.getByRole('heading', { name: 'Client home' })).toBeInTheDocument();
  });
});
