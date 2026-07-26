import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  className?: string;
  'data-testid'?: string;
}

const variantStyles: Record<StatusVariant, string> = {
  success: 'border-emerald-200/80 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'border-amber-200/80 bg-amber-500/10 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300',
  error: 'border-rose-200/80 bg-rose-500/10 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300',
  info: 'border-sky-200/80 bg-sky-500/10 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-300',
  default: 'border-border/70 bg-muted/40 text-foreground/80',
};

export function StatusBadge({ status, variant = 'default', className, ...rest }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      data-testid={rest['data-testid']}
      className={cn(
        'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.02em] shadow-none',
        variantStyles[variant],
        className,
      )}
    >
      {status}
    </Badge>
  );
}
