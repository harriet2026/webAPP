'use client';

import { usePointerHover } from '@/hooks/use-pointer-hover';
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
        <SegmentedControlOption
          key={opt.value}
          selected={value === opt.value}
          pad={pad}
          testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
          onSelect={() => onChange(opt.value)}
        >
          {opt.label}
        </SegmentedControlOption>
      ))}
    </div>
  );
}

// 单个分段选项（柔和交互反馈规格 §6.6/§7.2）：hover 由 pointer 驱动、只作用于未选中项，
// 选中态（primary fill）不被 hover 覆盖；reduced-motion 直接到位。
function SegmentedControlOption({
  selected,
  pad,
  testid,
  onSelect,
  children,
}: {
  selected: boolean;
  pad: string;
  testid?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const { pointerHoverProps } = usePointerHover<HTMLButtonElement>({ disabled: selected });
  return (
    <button
      type="button"
      data-testid={testid}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'relative text-sm font-medium first:rounded-l-md last:rounded-r-md border-r border-border last:border-r-0',
        'transition-[background-color,color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        pad,
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-body data-[hovered=true]:bg-muted active:bg-muted',
      )}
      {...pointerHoverProps}
    >
      {children}
    </button>
  );
}
