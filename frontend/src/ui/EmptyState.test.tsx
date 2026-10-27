import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    const { container } = render(
      <EmptyState title="Nothing scheduled" description="New bookings will show up here." />,
    );

    expect(screen.getByText('Nothing scheduled')).toHaveClass('empty-state-title');
    expect(screen.getByText('New bookings will show up here.')).toHaveClass(
      'empty-state-description',
    );
    expect(container.firstElementChild).toHaveClass('empty-state');
    expect(container.firstElementChild).not.toHaveClass('is-compact');
  });

  it('renders an optional icon and action', () => {
    render(
      <EmptyState
        title="Nothing scheduled"
        icon={<span>Calendar</span>}
        action={<button type="button">Add booking</button>}
      />,
    );

    expect(screen.getByText('Calendar').parentElement).toHaveClass('empty-state-icon');
    expect(screen.getByRole('button', { name: 'Add booking' }).parentElement).toHaveClass(
      'empty-state-action',
    );
  });

  it('omits the description, icon, and action when they are absent', () => {
    const { container } = render(<EmptyState title="Nothing scheduled" />);

    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
    expect(container.querySelector('.empty-state-description')).toBeNull();
    expect(container.querySelector('.empty-state-icon')).toBeNull();
    expect(container.querySelector('.empty-state-action')).toBeNull();
  });

  it('adds the compact class', () => {
    const { container } = render(<EmptyState title="Nothing scheduled" compact />);

    expect(container.firstElementChild).toHaveClass('empty-state', 'is-compact');
  });
});
