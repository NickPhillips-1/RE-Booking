import type { ReactNode } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  count?: number;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Below 640px, options with an icon show only the icon; the label stays for screen readers.
  compact?: boolean;
};

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  compact = false,
}: SegmentedControlProps<T>) {
  return (
    <div className={compact ? 'segmented is-compact' : 'segmented'} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented-option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span className={option.icon ? 'segmented-label' : undefined}>{option.label}</span>
          {option.count !== undefined && <span className="segmented-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
