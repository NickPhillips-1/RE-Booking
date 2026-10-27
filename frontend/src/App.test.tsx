import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';
import App from './App';
import { getToken, setToken } from './auth';
import { agentSession, bookingPage, clientSession } from './test/fixtures';
import { sessionToken } from './test/session';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App routes', () => {
  beforeEach(() => {
    vi.spyOn(api, 'bookingPage').mockResolvedValue(bookingPage);
    vi.spyOn(api, 'availableDates').mockResolvedValue([]);
    vi.spyOn(api, 'availableSlots').mockResolvedValue([]);
    vi.spyOn(api, 'agentSession').mockResolvedValue(agentSession);
    vi.spyOn(api, 'agentListBookings').mockResolvedValue([]);
    vi.spyOn(api, 'clientSession').mockResolvedValue(clientSession);
    vi.spyOn(api, 'clientListBookings').mockResolvedValue([]);
    vi.spyOn(api, 'listBookingPages').mockResolvedValue([]);
  });

  it.each([
    ['/', 'Realtor log in'],
    ['/dashboard', 'Realtor log in'],
    ['/dashboard/hours', 'Realtor log in'],
    ['/dashboard/meetings', 'Realtor log in'],
    ['/client', 'Client log in'],
    ['/client/book', 'Client log in'],
    ['/guest', 'Client log in'],
  ])('%s sends an anonymous visitor to %s', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('shows a way back from an unknown address', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('sends a client from the dashboard back to appointments', async () => {
    setToken(sessionToken('client'));
    renderAt('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Appointments' })).toBeInTheDocument();
    expect(api.agentSession).not.toHaveBeenCalled();
  });

  it('sends a realtor from the client pages back to the dashboard', async () => {
    setToken(sessionToken('agent'));
    renderAt('/client');
    expect(await screen.findByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(api.clientSession).not.toHaveBeenCalled();
  });

  it('shows a public booking page without a session', async () => {
    renderAt('/book/jane');
    expect(await screen.findByRole('heading', { name: 'Jane Rivera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consultation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login?as=client',
    );
  });

  it('opens the dashboard for a realtor and logs out', async () => {
    const user = userEvent.setup();
    setToken(sessionToken('agent'));
    renderAt('/dashboard');
    expect(await screen.findByRole('link', { name: 'Jane Rivera Homes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hours' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meetings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Jane Rivera/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Realtor log in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  it('opens appointments for a client', async () => {
    setToken(sessionToken('client'));
    renderAt('/client');
    expect(await screen.findByRole('heading', { name: 'Appointments' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Client' })).getByRole('link', {
        name: 'Book',
      }),
    ).toHaveAttribute('href', '/client/book');
    expect(screen.getByRole('button', { name: /Alex Chen/ })).toBeInTheDocument();
    expect(await screen.findByText('No upcoming appointments.')).toBeInTheDocument();
  });

  it('asks a client to log out when the session cannot be confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(api.clientSession).mockRejectedValue(new ApiError(500, 'error', 'nope'));
    setToken(sessionToken('client'));
    renderAt('/client');
    expect(await screen.findByText('Could not confirm who is logged in.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Log out' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Client log in' })).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });
});
