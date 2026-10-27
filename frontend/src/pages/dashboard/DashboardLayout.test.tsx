import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api';
import { agentSession } from '../../test/fixtures';
import DashboardLayout from './DashboardLayout';

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<h1>Schedule body</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.spyOn(api, 'agentSession').mockResolvedValue(agentSession);
  });

  it('shows the brand and moves focus to the page', async () => {
    const user = userEvent.setup();
    renderDashboard();
    const brand = await screen.findByRole('link', { name: 'Jane Rivera Homes' });
    expect(brand).toHaveAttribute('href', '/dashboard');
    expect(brand).toHaveTextContent('J');
    expect(screen.getByRole('heading', { name: 'Schedule body' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hours' })).toHaveAttribute('href', '/dashboard/hours');

    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.getElementById('main')).toHaveFocus();
  });

  it('lets the realtor try again when the session cannot be loaded', async () => {
    const user = userEvent.setup();
    vi.mocked(api.agentSession)
      .mockReset()
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
      .mockResolvedValueOnce(agentSession);
    renderDashboard();
    expect(
      await screen.findByText('Could not reach the server. Check your connection.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Schedule body' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Schedule body' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jane Rivera Homes' })).toBeInTheDocument();
  });
});
