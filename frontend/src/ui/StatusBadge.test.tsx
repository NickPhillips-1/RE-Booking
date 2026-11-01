import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders Confirmed with data-status confirmed', () => {
    render(<StatusBadge status="confirmed" />);
    expect(screen.getByText('Confirmed')).toHaveAttribute('data-status', 'confirmed');
  });

  it('renders Cancelled', () => {
    render(<StatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelled')).toHaveAttribute('data-status', 'cancelled');
  });
});
