import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';

function renderMenu(name = 'Jane Rivera') {
  const onLogOut = vi.fn();
  render(<AccountMenu name={name} email="jane@example.com" role="Realtor" onLogOut={onLogOut} />);
  return onLogOut;
}

describe('AccountMenu', () => {
  it('shows initials and the role, then logs out', async () => {
    const user = userEvent.setup();
    const onLogOut = renderMenu();
    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(screen.getByText('Logged in as realtor')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Jane Rivera/ }));
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();

    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(onLogOut).toHaveBeenCalledOnce();
  });

  it('uses the first letter of a single name', () => {
    renderMenu('Élodie');
    expect(screen.getByText('É')).toBeInTheDocument();
  });

  it('moves through the menu from the keyboard and closes on escape', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Jane Rivera/ });
    trigger.focus();
    await user.keyboard('{ArrowUp}');
    const item = screen.getByRole('menuitem', { name: 'Log out' });
    expect(item).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(item).toHaveFocus();
    await user.keyboard('{Home}');
    expect(item).toHaveFocus();
    await user.keyboard('{End}');
    expect(item).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when the pointer goes outside or the menu is tabbed away', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole('button', { name: /Jane Rivera/ });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
