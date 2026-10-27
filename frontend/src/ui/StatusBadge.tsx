const STATUS_LABELS = {
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export type BadgeStatus = keyof typeof STATUS_LABELS;

export function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span className="badge" data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}
