import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type ClientBooking } from '../api';
import { detectZone } from '../time';
import ClientPage from './ClientPage';

const upcoming: ClientBooking = {
  booking_id: 1,
  meeting_type_name: 'Consultation',
  duration_minutes: 30,
  location: 'video',
  slot_start: '2026-10-27T15:00:00.000Z',
  slot_end: '2026-10-27T15:30:00.000Z',
  intake_note: '12 Oak Street',
  status: 'confirmed',
  agent_name: 'Jane Rivera',
  brand_name: 'Jane Rivera Homes',
  slug: 'jane',
};

const ended: ClientBooking = {
  ...upcoming,
  booking_id: 2,
  slot_start: '2026-10-26T12:00:00.000Z',
  slot_end: '2026-10-26T12:30:00.000Z',
  intake_note: null,
  brand_name: 'Past Street Realty',
  agent_name: 'Sam Lee',
  slug: 'sam',
};

const cancelled: ClientBooking = {
  ...upcoming,
  booking_id: 3,
  status: 'cancelled',
  slot_start: '2026-10-28T16:00:00.000Z',
  slot_end: '2026-10-28T16:30:00.000Z',
  intake_note: null,
  brand_name: 'Harbour Homes',
  slug: 'harbour',
};

function renderClient(path = '/client') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/client" element={<ClientPage />} />
        <Route path="/client/book" element={<h1>Book a demo</h1>} />
        <Route path="/client/book/:slug" element={<h1>Realtor page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ClientPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T15:00:00.000Z'));
    vi.spyOn(api, 'clientListBookings').mockResolvedValue([upcoming, ended, cancelled]);
    vi.spyOn(api, 'clientCancelBooking').mockResolvedValue({ status: 'cancelled' });
  });

  it('lists upcoming appointments and filters the rest', async () => {
    const user = userEvent.setup();
    renderClient();

    expect(await screen.findByRole('heading', { name: /Tomorrow/ })).toBeInTheDocument();
    expect(
      screen.getByText(
        `Appointments you book while logged in show up here. Times in ${detectZone()}.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Upcoming/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /^Cancelled/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Jane Rivera Homes/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Past Street Realty/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(screen.getByRole('button', { name: /Past Street Realty/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Harbour Homes/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Today/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Cancelled/ }));
    expect(screen.getByRole('button', { name: /Harbour Homes/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jane Rivera Homes/ })).not.toBeInTheDocument();
  });

  it('marks the appointment that is happening now', async () => {
    vi.mocked(api.clientListBookings).mockResolvedValue([
      {
        ...upcoming,
        slot_start: '2026-10-26T14:30:00.000Z',
        slot_end: '2026-10-26T15:30:00.000Z',
      },
    ]);
    renderClient();
    const row = await screen.findByRole('button', { name: /Jane Rivera Homes/ });
    expect(row).toHaveTextContent('Now');
    expect(screen.getByRole('heading', { name: /Today/ })).toBeInTheDocument();
  });

  it('points at the other filters when upcoming is empty but other appointments exist', async () => {
    const user = userEvent.setup();
    vi.mocked(api.clientListBookings).mockResolvedValue([ended]);
    renderClient();

    expect(await screen.findByText('No upcoming appointments.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getByRole('button', { name: /Past Street Realty/ })).toBeInTheDocument();
  });

  it('offers a way to book when there are no appointments', async () => {
    vi.mocked(api.clientListBookings).mockResolvedValue([]);
    renderClient('/client?filter=all');
    expect(await screen.findByText('No appointments yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book' })).toHaveAttribute('href', '/client/book');
  });

  it('explains an empty cancelled list', async () => {
    vi.mocked(api.clientListBookings).mockResolvedValue([upcoming]);
    renderClient('/client?filter=cancelled');
    expect(await screen.findByText('No cancelled appointments.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Book' })).not.toBeInTheDocument();
  });

  it('cancels from the panel and returns focus when the panel closes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderClient();

    const row = await screen.findByRole('button', { name: /Jane Rivera Homes/ });
    await user.click(row);
    const dialog = await screen.findByRole('dialog', { name: 'Jane Rivera Homes' });
    expect(within(dialog).getByText('12 Oak Street')).toBeInTheDocument();
    expect(within(dialog).getByText('Jane Rivera')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book again' })).toHaveAttribute(
      'href',
      '/client/book/jane',
    );

    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(api.clientCancelBooking).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Jane Rivera Homes'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Consultation'));
    expect(api.clientCancelBooking).toHaveBeenCalledWith(1);
    expect(await screen.findByText('This appointment is cancelled.')).toBeInTheDocument();
    expect(screen.getByText('Appointment cancelled.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    const empty = await screen.findByText('No upcoming appointments.');
    expect(empty.closest('.schedule-results')).toHaveFocus();
  });

  it('keeps the panel open when cancelling fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.clientCancelBooking).mockRejectedValue(
      new ApiError(400, 'invalid_input', 'Already cancelled.'),
    );
    renderClient();
    await user.click(await screen.findByRole('button', { name: /Jane Rivera Homes/ }));
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already cancelled.');
    expect(screen.getByRole('button', { name: 'Cancel appointment' })).toBeInTheDocument();
  });

  it('keeps the list visible while a refresh fails, then loads again', async () => {
    const user = userEvent.setup();
    const pending = deferred<ClientBooking[]>();
    vi.mocked(api.clientListBookings)
      .mockReset()
      .mockResolvedValueOnce([upcoming])
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
      .mockResolvedValueOnce([upcoming]);
    renderClient();
    expect(await screen.findByRole('button', { name: /Jane Rivera Homes/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: /Jane Rivera Homes/ })).toBeInTheDocument();

    await act(async () => {
      pending.resolve([upcoming]);
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t refresh appointments.');
    expect(screen.getByRole('button', { name: /Jane Rivera Homes/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('lets the client try again after the first load fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.clientListBookings)
      .mockReset()
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
      .mockResolvedValueOnce([upcoming]);
    renderClient();
    expect(await screen.findByText('Couldn’t load appointments.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Jane Rivera Homes/ })).toBeInTheDocument();
  });

  it('opens the realtor page from a cancelled appointment', async () => {
    const user = userEvent.setup();
    renderClient('/client?filter=cancelled');
    await user.click(await screen.findByRole('button', { name: /Harbour Homes/ }));
    expect(await screen.findByText('Not given')).toBeInTheDocument();
    expect(screen.getByText('This appointment is cancelled.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel appointment' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Book again' }));
    expect(await screen.findByRole('heading', { name: 'Realtor page' })).toBeInTheDocument();
  });
});
