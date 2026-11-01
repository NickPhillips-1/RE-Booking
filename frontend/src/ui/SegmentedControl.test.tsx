import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const options = [
  { value: 'upcoming', label: 'Upcoming', count: 3 },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled', count: 0 },
];

describe('SegmentedControl', () => {
  it('sets aria-pressed from the current value', () => {
    const { rerender } = render(
      <SegmentedControl label="Meetings" options={options} value="upcoming" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Upcoming/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Past' })).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <SegmentedControl label="Meetings" options={options} value="past" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Upcoming/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Past' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders a count when provided and omits it when undefined', () => {
    render(
      <SegmentedControl label="Meetings" options={options} value="upcoming" onChange={vi.fn()} />,
    );
    const upcoming = screen.getByRole('button', { name: /Upcoming/ });
    const past = screen.getByRole('button', { name: 'Past' });
    const cancelled = screen.getByRole('button', { name: /Cancelled/ });
    expect(within(upcoming).getByText('3')).toBeInTheDocument();
    expect(past.querySelector('.segmented-count')).toBeNull();
    expect(within(cancelled).getByText('0')).toBeInTheDocument();
  });

  it('calls onChange with the option value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl label="Meetings" options={options} value="upcoming" onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Past' }));
    expect(onChange).toHaveBeenCalledWith('past');
  });

  it('adds is-compact when compact is set', () => {
    const { rerender } = render(
      <SegmentedControl label="Meetings" options={options} value="upcoming" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('group', { name: 'Meetings' })).not.toHaveClass('is-compact');

    rerender(
      <SegmentedControl
        label="Meetings"
        options={options}
        value="upcoming"
        onChange={vi.fn()}
        compact
      />,
    );
    expect(screen.getByRole('group', { name: 'Meetings' })).toHaveClass('is-compact');
  });
});
