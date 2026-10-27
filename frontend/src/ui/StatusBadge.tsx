const STATUS_LABELS = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  cancelled: 'Cancelled',
};

export type BadgeStatus = keyof typeof STATUS_LABELS;

export function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span className="badge" data-status={status}>
      <span className="badge-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
