import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type AgentBooking } from '../../api';
import { agentBooking, agentSession } from '../../test/fixtures';
import SchedulePage from './SchedulePage';

const cancelledBooking: AgentBooking = {
  ...agentBooking,
  booking_id: 2,
  status: 'cancelled',
  slot_start: '2026-10-27T18:00:00.000Z',
  slot_end: '2026-10-27T18:30:00.000Z',
  client_name: 'Sam Lee',
  client_email: 'sam@example.com',
  intake_note: null,
};

function renderSchedule(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<Outlet context={agentSession} />}>
          <Route index element={<SchedulePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('SchedulePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T15:00:00.000Z'));
    vi.spyOn(api, 'agentListBookings').mockResolvedValue([agentBooking, cancelledBooking]);
  });

  it('opens on the next booked day and moves with the arrow keys', async () => {
    const user = userEvent.setup();
    renderSchedule();
    const booked = await screen.findByRole('button', {
      name: 'Tuesday, October 27, 1 appointment',
    });
    expect(booked).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Monday, October 26' })).toHaveAttribute(
      'aria-current',
      'date',
    );
    expect(screen.getByRole('button', { name: 'Sunday, October 25' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Alex Chen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sam Lee/ })).not.toBeInTheDocument();

    booked.focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Monday, October 26' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Nothing scheduled for Monday, October 26.')).toBeInTheDocument();
  });

  it('filters the list and cancels a confirmed appointment', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(api, 'agentCancelBooking').mockResolvedValue({ status: 'cancelled' });
    renderSchedule('/dashboard?view=list');

    expect(await screen.findByRole('heading', { name: /Tomorrow/ })).toBeInTheDocument();
    expect(screen.getByText('1 appointment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upcoming/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: /Sam Lee/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Alex Chen/ }));
    expect(await screen.findByRole('link', { name: 'alex@example.com' })).toHaveAttribute(
      'href',
      'mailto:alex@example.com',
    );

    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(api.agentCancelBooking).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Alex Chen'));
    expect(api.agentCancelBooking).toHaveBeenCalledWith(1);
    expect(await screen.findByText('This appointment is cancelled.')).toBeInTheDocument();
  });

  it('shows an empty calendar when nothing is booked', async () => {
    vi.mocked(api.agentListBookings).mockResolvedValue([]);
    renderSchedule();
    expect(
      await screen.findByText('Nothing scheduled for Monday, October 26.'),
    ).toBeInTheDocument();
  });

  it('lets the realtor try again after a failed load', async () => {
    const user = userEvent.setup();
    vi.mocked(api.agentListBookings)
      .mockReset()
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
      .mockResolvedValueOnce([agentBooking]);
    renderSchedule('/dashboard?view=list');
    expect(await screen.findByText('Couldn’t load appointments.')).toBeInTheDocument();
    expect(
      screen.getByText('Could not reach the server. Check your connection.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Alex Chen/ })).toBeInTheDocument();
  });
});
