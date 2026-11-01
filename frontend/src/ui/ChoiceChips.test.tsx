import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceChips } from './ChoiceChips';

const options = [
  { value: 'phone', label: 'Phone' },
  { value: 'video', label: 'Video' },
];

describe('ChoiceChips', () => {
  it('sets aria-pressed from the selected value', () => {
    const { rerender } = render(
      <ChoiceChips label="How to meet" options={options} selected="phone" onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <ChoiceChips label="How to meet" options={options} selected={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Phone' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Video' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSelect with the chip value', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChoiceChips label="How to meet" options={options} selected={null} onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { name: 'Video' }));
    expect(onSelect).toHaveBeenCalledWith('video');
  });
});
