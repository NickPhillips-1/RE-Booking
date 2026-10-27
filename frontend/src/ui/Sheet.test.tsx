import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

function renderSheet(open: boolean, onClose = vi.fn()) {
  const view = render(
    <Sheet open={open} labelledBy="panel-title" onClose={onClose}>
      <h2 id="panel-title">Details</h2>
    </Sheet>,
  );
  return { ...view, onClose };
}

describe('Sheet', () => {
  it('opens a dialog and reports when it is closed', () => {
    const { rerender, onClose } = renderSheet(true);
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeInTheDocument();

    rerender(
      <Sheet open={false} labelledBy="panel-title" onClose={onClose}>
        <h2 id="panel-title">Details</h2>
      </Sheet>,
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from a press on the backdrop and ignores a press that starts inside', () => {
    const { onClose } = renderSheet(true);
    const dialog = screen.getByRole('dialog');

    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Details' }));
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(dialog);
    fireEvent.click(screen.getByRole('heading', { name: 'Details' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
