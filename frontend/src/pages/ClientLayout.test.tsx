import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import { getToken, setToken } from '../auth';
import { agentSession, clientSession } from '../test/fixtures';
import { sessionToken } from '../test/session';
import ClientLayout from './ClientLayout';

function renderClientLayout() {
  return render(
    <MemoryRouter initialEntries={['/client']}>
      <Routes>
        <Route path="/client" element={<ClientLayout />}>
          <Route index element={<h1>Appointments body</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ClientLayout', () => {
  beforeEach(() => {
    vi.spyOn(api, 'agentSession').mockResolvedValue(agentSession);
    vi.spyOn(api, 'clientSession').mockResolvedValue(clientSession);
    setToken(sessionToken('client'));
  });

  it('shows a brand skeleton while the session is loading', () => {
    vi.mocked(api.clientSession).mockReturnValue(new Promise(() => {}));
    const { container } = renderClientLayout();
    expect(container.querySelector('a.shell-brand')).not.toBeInTheDocument();
    expect(container.querySelector('.skeleton-mark')).toBeInTheDocument();
    expect(container.querySelector('.skeleton-brand')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Appointments body' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alex Chen/ })).not.toBeInTheDocument();
  });

  it('shows the brand and moves focus to the page', async () => {
    const user = userEvent.setup();
    renderClientLayout();

    const brand = await screen.findByRole('link', { name: 'Alex Chen’s Client Dashboard' });
    expect(brand).toHaveAttribute('href', '/client');
    expect(brand.querySelector('.shell-brand-mark')).toHaveTextContent('A');
    expect(screen.getByRole('heading', { name: 'Appointments body' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Client' });
    expect(within(nav).getByRole('link', { name: 'Appointments' })).toHaveAttribute(
      'href',
      '/client',
    );
    expect(within(nav).getByRole('link', { name: 'Book' })).toHaveAttribute('href', '/client/book');
    expect(screen.getByRole('button', { name: /Alex Chen/ })).toBeInTheDocument();
    expect(api.agentSession).not.toHaveBeenCalled();

    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.getElementById('main')).toHaveFocus();
  });

  it.each([
    ['header', 0],
    ['main', 1],
  ] as const)(
    'clears the token from the %s Log out button when the session cannot be confirmed',
    async (_place, index) => {
      const user = userEvent.setup();
      vi.mocked(api.clientSession).mockRejectedValue(new ApiError(500, 'error', 'nope'));
      const { container } = renderClientLayout();

      expect(await screen.findByText('Could not confirm who is logged in.')).toBeInTheDocument();
      const brand = screen.getByRole('link', { name: 'Client Dashboard' });
      expect(brand).toHaveAttribute('href', '/client');
      expect(brand.querySelector('.shell-brand-mark')).toHaveTextContent('C');
      expect(screen.queryByRole('heading', { name: 'Appointments body' })).not.toBeInTheDocument();
      const logOutButtons = screen.getAllByRole('button', { name: 'Log out' });
      expect(logOutButtons).toHaveLength(2);

      await user.click(logOutButtons[index]!);
      expect(screen.queryByText('Could not confirm who is logged in.')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Client Dashboard' })).not.toBeInTheDocument();
      expect(container.querySelector('.skeleton-mark')).toBeInTheDocument();
      expect(container.querySelector('.skeleton-brand')).toBeInTheDocument();
      expect(getToken()).toBeNull();
    },
  );
});
