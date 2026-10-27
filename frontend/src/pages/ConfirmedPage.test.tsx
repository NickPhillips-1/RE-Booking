import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import { setToken } from '../auth';
import { clientSession, receipt } from '../test/fixtures';
import { sessionToken } from '../test/session';
import ConfirmedPage from './ConfirmedPage';

function renderConfirmed(entry: { hash?: string; state?: unknown } = {}) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/book/jane/confirmed',
          hash: entry.hash ?? '',
          state: entry.state,
        },
      ]}
    >
      <Routes>
        <Route path="/book/:slug/confirmed" element={<ConfirmedPage />} />
        <Route path="/book/:slug" element={<h1>Booking page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConfirmedPage', () => {
  it('says the link does not match a booking when the token is missing', async () => {
    const load = vi.spyOn(api, 'bookingByToken');
    renderConfirmed();
    expect(await screen.findByRole('heading', { name: 'Booking not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book a time' })).toHaveAttribute('href', '/book/jane');
    expect(load).not.toHaveBeenCalled();
  });

  it('says the link does not match a booking when the token is unknown', async () => {
    vi.spyOn(api, 'bookingByToken').mockRejectedValue(new ApiError(404, 'not_found', 'missing'));
    renderConfirmed({ hash: '#token=missing&tz=UTC' });
    expect(await screen.findByRole('heading', { name: 'Booking not found' })).toBeInTheDocument();
  });

  it('shows the receipt and cancels after confirmation', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'bookingByToken').mockResolvedValue(receipt);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const cancel = vi.spyOn(api, 'cancelBooking').mockResolvedValue({ status: 'cancelled' });
    renderConfirmed({ hash: '#token=abc&tz=UTC', state: { receipt } });

    expect(await screen.findByRole('heading', { name: 'Booked' })).toBeInTheDocument();
    expect(screen.getByText('Consultation · 30 min · Video call')).toBeInTheDocument();
    expect(screen.getByText(/Tuesday, October 27 · 3:00\sPM – 3:30\sPM/)).toBeInTheDocument();
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
    expect(screen.getByText('12 Oak Street')).toBeInTheDocument();
    expect(screen.getByText('UTC')).toBeInTheDocument();
    expect(screen.getByText('Keep this page’s link. It is how you cancel.')).toBeInTheDocument();
    expect(api.bookingByToken).toHaveBeenCalledWith('abc');

    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Booked' })).toBeInTheDocument();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(confirm).toHaveBeenCalledWith(
      'Cancel your Consultation with Jane Rivera Homes on Tuesday, October 27 at 3:00 PM?',
    );
    expect(cancel).toHaveBeenCalledWith('abc');
    expect(await screen.findByRole('heading', { name: 'Cancelled' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book another time' })).toHaveAttribute(
      'href',
      '/book/jane',
    );
  });

  it('shows a client that the appointment is on their account', async () => {
    setToken(sessionToken('client'));
    vi.spyOn(api, 'bookingByToken').mockResolvedValue(receipt);
    vi.spyOn(api, 'clientSession').mockResolvedValue(clientSession);
    renderConfirmed({ hash: '#token=abc&tz=UTC', state: { receipt } });
    expect(
      await screen.findByText('This appointment is on your client account.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Your appointments' })).toHaveAttribute(
      'href',
      '/client',
    );
  });

  it('says when cancelling fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'bookingByToken').mockResolvedValue(receipt);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(api, 'cancelBooking').mockRejectedValue(new ApiError(500, 'error', 'nope'));
    renderConfirmed({ hash: '#token=abc&tz=UTC', state: { receipt } });
    await screen.findByRole('heading', { name: 'Booked' });
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not cancel. Try again.');
  });
});
