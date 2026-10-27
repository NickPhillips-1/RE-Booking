import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as a heading and the description', () => {
    render(<PageHeader title="Bookings" description="Upcoming appointments." />);

    expect(screen.getByRole('heading', { level: 1, name: 'Bookings' })).toHaveClass('page-title');
    expect(screen.getByText('Upcoming appointments.')).toHaveClass('page-description');
  });

  it('renders optional actions', () => {
    render(<PageHeader title="Bookings" actions={<button type="button">New booking</button>} />);

    expect(screen.getByRole('button', { name: 'New booking' }).parentElement).toHaveClass(
      'page-header-actions',
    );
  });

  it('omits the description and actions when they are absent', () => {
    const { container } = render(<PageHeader title="Bookings" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Bookings' })).toBeInTheDocument();
    expect(container.querySelector('.page-description')).toBeNull();
    expect(container.querySelector('.page-header-actions')).toBeNull();
  });
});
