import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api';
import { agentSession } from '../../test/fixtures';
import HoursPage from './HoursPage';

function renderHours() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Outlet context={agentSession} />}>
          <Route index element={<HoursPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('HoursPage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'agentListWeeklyHours').mockResolvedValue([
      { weekday: 1, start_local: '09:00', end_local: '17:00' },
    ]);
  });

  it('shows the week and the empty-page note when every day is closed', async () => {
    vi.mocked(api.agentListWeeklyHours).mockResolvedValue([]);
    renderHours();
    expect(
      await screen.findByText('The public page stays empty until hours are set.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The weekly times visitors can book. Times in America/New_York.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Closed')).toHaveLength(7);
  });

  it('rejects a bad time, then saves a range that starts before it ends', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'agentReplaceWeeklyHours').mockResolvedValue([
      { weekday: 1, start_local: '09:00', end_local: '17:00' },
    ]);
    renderHours();
    expect(await screen.findByText('9:00 AM\u20135:00 PM')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    const start = screen.getByLabelText('Start');
    await user.clear(start);
    await user.type(start, 'noon');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a time like 9:00 AM.')).toBeInTheDocument();

    await user.clear(start);
    await user.type(start, '6:00 PM');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Start before end.')).toBeInTheDocument();

    await user.clear(start);
    await user.type(start, '9:00 AM');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.agentReplaceWeeklyHours).toHaveBeenCalledWith([
      { weekday: 1, start_local: '09:00', end_local: '17:00' },
    ]);
    expect(await screen.findByText('9:00 AM\u20135:00 PM')).toBeInTheDocument();
  });

  it('marks a day closed', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'agentReplaceWeeklyHours').mockResolvedValue([]);
    renderHours();
    await screen.findByText('9:00 AM\u20135:00 PM');
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    await user.click(screen.getByRole('checkbox', { name: 'Closed' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.agentReplaceWeeklyHours).toHaveBeenCalledWith([]);
    expect(
      await screen.findByText('The public page stays empty until hours are set.'),
    ).toBeInTheDocument();
  });

  it('keeps the editor open when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'agentReplaceWeeklyHours').mockRejectedValue(
      new ApiError(400, 'invalid_input', 'That range overlaps another day.'),
    );
    renderHours();
    await screen.findByText('9:00 AM\u20135:00 PM');
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('That range overlaps another day.')).toBeInTheDocument();
    expect(screen.getByLabelText('Start')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('shows an error when hours cannot be loaded', async () => {
    vi.mocked(api.agentListWeeklyHours).mockRejectedValue(new ApiError(0, 'network', 'offline'));
    renderHours();
    expect(
      await screen.findByText('Could not reach the server. Check your connection.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
