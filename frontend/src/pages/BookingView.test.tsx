import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import { setToken } from '../auth';
import { agentSession, bookingPage, clientSession, receipt } from '../test/fixtures';
import { sessionToken } from '../test/session';
import { detectZone, formatTime } from '../time';
import { BookingView } from './BookingView';

const slot = '2026-10-27T15:00:00.000Z';

function HashProbe() {
  const location = useLocation();
  return (
    <p>
      {location.pathname}
      {location.hash}
    </p>
  );
}

function renderPublic() {
  return render(
    <MemoryRouter initialEntries={['/book/jane']}>
      <Routes>
        <Route path="/book/:slug" element={<BookingView slug="jane" variant="public" />} />
        <Route path="/book/:slug/confirmed" element={<HashProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function chooseTime(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Tuesday, October 27' })).toBeEnabled(),
  );
  await user.click(screen.getByRole('button', { name: 'Tuesday, October 27' }));
  await user.click(await screen.findByRole('button', { name: formatTime(slot, detectZone()) }));
}

describe('BookingView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T15:00:00.000Z'));
    vi.spyOn(api, 'bookingPage').mockResolvedValue(bookingPage);
    vi.spyOn(api, 'availableDates').mockImplementation(async ({ from_date }) =>
      from_date.startsWith('2026-10') ? ['2026-10-27'] : [],
    );
    vi.spyOn(api, 'availableSlots').mockResolvedValue([
      { slot_start: slot, slot_end: '2026-10-27T15:30:00.000Z' },
    ]);
    vi.spyOn(api, 'createBooking').mockResolvedValue({ ...receipt, cancel_token: 'cancel-token' });
  });

  it('shows the meeting and moves between months', async () => {
    const user = userEvent.setup();
    renderPublic();
    expect(await screen.findByRole('heading', { name: 'Jane Rivera' })).toBeInTheDocument();
    expect(screen.getByText('Realtor · Jane Rivera Homes')).toBeInTheDocument();
    expect(screen.getByText('30 min · Video call')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Showing' }));
    expect(screen.getByText('60 min · In person · 15 min free after')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
  });

  it('asks for a name, email, phone, and time before booking', async () => {
    const user = userEvent.setup();
    renderPublic();
    await screen.findByRole('heading', { name: 'Jane Rivera' });
    await user.click(screen.getByRole('button', { name: 'Book' }));
    expect(screen.getByText('Pick a time.')).toBeInTheDocument();
    expect(screen.getByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email.')).toBeInTheDocument();
    expect(screen.getByText('Enter a phone number.')).toBeInTheDocument();

    await chooseTime(user);
    await user.type(screen.getByLabelText('Name'), 'Alex Chen');
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Phone'), '555-0100');
    await user.click(screen.getByRole('button', { name: 'Book' }));
    expect(screen.getByText('Enter a valid email.')).toBeInTheDocument();
    expect(screen.queryByText('Enter your name.')).not.toBeInTheDocument();
    expect(api.createBooking).not.toHaveBeenCalled();
  });

  it('books the selected showing and property', async () => {
    const user = userEvent.setup();
    renderPublic();
    await screen.findByRole('heading', { name: 'Jane Rivera' });
    await user.click(screen.getByRole('button', { name: 'Showing' }));
    await chooseTime(user);
    await user.type(screen.getByLabelText('Name'), 'Alex Chen');
    await user.type(screen.getByLabelText('Email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Phone'), '555-0100');
    await user.selectOptions(screen.getByLabelText('Which property?'), '12 Oak Street');
    await user.click(screen.getByRole('button', { name: 'Book' }));

    const hash = new URLSearchParams({ token: 'cancel-token', tz: detectZone() }).toString();
    expect(await screen.findByText(`/book/jane/confirmed#${hash}`)).toBeInTheDocument();
    expect(api.createBooking).toHaveBeenCalledWith({
      slug: 'jane',
      meeting_type_id: 2,
      slot_start: slot,
      client_name: 'Alex Chen',
      client_email: 'alex@example.com',
      client_phone: '555-0100',
      intake_note: '12 Oak Street',
    });
  });

  it('says when that time was just taken', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createBooking).mockRejectedValue(new ApiError(409, 'slot_taken', 'gone'));
    renderPublic();
    await screen.findByRole('heading', { name: 'Jane Rivera' });
    await chooseTime(user);
    await user.type(screen.getByLabelText('Name'), 'Alex Chen');
    await user.type(screen.getByLabelText('Email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Phone'), '555-0100');
    await user.click(screen.getByRole('button', { name: 'Book' }));
    expect(await screen.findByText('That time was just taken.')).toBeInTheDocument();
  });

  it('says when the realtor has no open times', async () => {
    vi.mocked(api.bookingPage).mockResolvedValue({ ...bookingPage, has_hours: false });
    renderPublic();
    expect(await screen.findByText('No open times yet.')).toBeInTheDocument();
  });

  it('says when the address does not match a page', async () => {
    vi.mocked(api.bookingPage).mockResolvedValue(null);
    renderPublic();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('There is no booking page at this address.')).toBeInTheDocument();
  });

  it('says when the page cannot be loaded', async () => {
    vi.mocked(api.bookingPage).mockRejectedValue(new ApiError(0, 'network', 'offline'));
    renderPublic();
    expect(await screen.findByText('Couldn’t load this page.')).toBeInTheDocument();
    expect(
      screen.getByText('Could not reach the server. Check your connection.'),
    ).toBeInTheDocument();
  });

  it('fills the form from a client account and returns to appointments', async () => {
    const user = userEvent.setup();
    setToken(sessionToken('client'));
    vi.spyOn(api, 'clientSession').mockResolvedValue(clientSession);
    render(
      <MemoryRouter initialEntries={['/client/book/jane']}>
        <Routes>
          <Route path="/client/book/:slug" element={<BookingView slug="jane" variant="client" />} />
          <Route path="/client" element={<h1>Client home</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('Name, email, and phone come from your client account.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Alex Chen');
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    await chooseTime(user);
    await user.click(screen.getByRole('button', { name: 'Book' }));
    expect(await screen.findByRole('heading', { name: 'Client home' })).toBeInTheDocument();
    expect(api.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        client_name: 'Alex Chen',
        client_email: 'client@example.com',
        client_phone: '555-0100',
        intake_note: null,
      }),
    );
  });

  it('lets a realtor book on their own page as a client', async () => {
    setToken(sessionToken('agent'));
    vi.spyOn(api, 'agentSession').mockResolvedValue(agentSession);
    renderPublic();
    expect(
      await screen.findByText(
        'Realtor · Jane Rivera Homes. This is the page clients use to book an appointment with you.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open your dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('button', { name: 'Book as client' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This books an appointment as a client. It does not change your realtor login.',
      ),
    ).toBeInTheDocument();
  });
});
