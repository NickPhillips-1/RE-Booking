import { useEffect, useRef, type ReactNode } from 'react';

type SheetProps = {
  open: boolean;
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, labelledBy, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressStartedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      onClose={onClose}
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressStartedOnBackdrop.current && event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      <div className="sheet-panel">{children}</div>
    </dialog>
  );
}
