'use client';

import { cn } from '@/lib/utils';

interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  testIdPrefix?: string;
}

// Hairline-bordered button group. Active segment = primary fill + primary
// foreground; inactive = card fill + body text. All colours route through
// design tokens so the blue↔green theme switch carries through (DESIGN.md
// §segmented-control).
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  testIdPrefix,
}: SegmentedControlProps<T>) {
  const pad = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-1.5';
  return (
    <div className={cn('flex items-center rounded-md border border-border', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'relative text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md border-r border-border last:border-r-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
            pad,
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-body hover:bg-muted',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
