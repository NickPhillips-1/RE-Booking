import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import { getToken, setToken } from '../auth';
import { agentSession, clientSession } from '../test/fixtures';
import { sessionToken } from '../test/session';
import { SoloShell } from './SoloShell';

function renderShell(brand: { name: string; to: string } | null = null) {
  return render(
    <MemoryRouter>
      <SoloShell brand={brand}>
        <h1>Page body</h1>
      </SoloShell>
    </MemoryRouter>,
  );
}

describe('SoloShell', () => {
  beforeEach(() => {
    vi.spyOn(api, 'agentSession').mockResolvedValue(agentSession);
    vi.spyOn(api, 'clientSession').mockResolvedValue(clientSession);
  });

  it('shows a brand skeleton when the brand is unknown', () => {
    const { container } = renderShell(null);
    expect(screen.queryByRole('link', { name: 'Jane Rivera Homes' })).not.toBeInTheDocument();
    expect(container.querySelector('a.shell-brand')).not.toBeInTheDocument();
    expect(container.querySelector('.skeleton-mark')).toBeInTheDocument();
    expect(container.querySelector('.skeleton-brand')).toBeInTheDocument();
  });

  it('links the brand and shows its mark', () => {
    renderShell({ name: 'Jane Rivera Homes', to: '/book/jane' });
    const brand = screen.getByRole('link', { name: 'Jane Rivera Homes' });
    expect(brand).toHaveAttribute('href', '/book/jane');
    expect(brand).toHaveTextContent('J');
    expect(brand.querySelector('.shell-brand-mark')).toHaveTextContent('J');
  });

  it('offers a client log in when there is no session', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login?as=client',
    );
    expect(api.agentSession).not.toHaveBeenCalled();
    expect(api.clientSession).not.toHaveBeenCalled();
  });

  it('hides the account control while the session is loading', () => {
    vi.mocked(api.clientSession).mockReturnValue(new Promise(() => {}));
    setToken(sessionToken('client'));
    renderShell();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alex Chen/ })).not.toBeInTheDocument();
  });

  it('shows the client account once the session resolves', async () => {
    setToken(sessionToken('client'));
    renderShell();
    expect(await screen.findByRole('button', { name: /Alex Chen/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(api.agentSession).not.toHaveBeenCalled();
  });

  it('shows the realtor account once the session resolves', async () => {
    setToken(sessionToken('agent'));
    renderShell();
    expect(await screen.findByRole('button', { name: /Jane Rivera/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(api.clientSession).not.toHaveBeenCalled();
  });

  it('offers log out when the realtor session cannot be confirmed', async () => {
    vi.mocked(api.agentSession).mockRejectedValue(new ApiError(500, 'error', 'nope'));
    setToken(sessionToken('agent'));
    renderShell();
    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Jane Rivera/ })).not.toBeInTheDocument();
    expect(api.clientSession).not.toHaveBeenCalled();
  });

  it('offers log out when the client session cannot be confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(api.clientSession).mockRejectedValue(new ApiError(500, 'error', 'nope'));
    setToken(sessionToken('client'));
    renderShell();

    expect(await screen.findByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alex Chen/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(getToken()).toBeNull();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login?as=client',
    );
  });

  it('moves focus to the page from skip to content', async () => {
    const user = userEvent.setup();
    renderShell();
    expect(screen.getByRole('heading', { name: 'Page body' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.getElementById('main')).toHaveFocus();
  });
});
