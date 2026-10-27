import type { ReactNode } from 'react';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({ title, description, icon, action, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'empty-state is-compact' : 'empty-state'}>
      {icon && <span className="empty-state-icon">{icon}</span>}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
