import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const statusBannerVariants = cva(
  'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium',
  {
    variants: {
      tone: {
        danger:
          'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40',
        warning:
          'border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-900 dark:bg-orange-950/40',
        success:
          'border-green-200 bg-green-50 text-green-600 dark:border-green-900 dark:bg-green-950/40',
        neutral:
          'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export type StatusBannerTone = NonNullable<VariantProps<typeof statusBannerVariants>['tone']>;

interface StatusBannerProps
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof statusBannerVariants> {
  icon: LucideIcon;
  children: React.ReactNode;
  iconClassName?: string;
}

/**
 * Page-level status summary aligned to the demo dashboard.
 *
 * Keep geometry here so dashboards and list pages do not drift into their own
 * alert heights, radii, or shadows.
 */
export function StatusBanner({
  tone,
  icon: Icon,
  children,
  className,
  iconClassName,
  role = 'status',
  ...props
}: StatusBannerProps) {
  return (
    <div
      role={role}
      data-slot="status-banner"
      className={cn(statusBannerVariants({ tone }), className)}
      {...props}
    >
      <Icon aria-hidden="true" className={cn('size-5 shrink-0', iconClassName)} />
      <span className="text-pretty">{children}</span>
    </div>
  );
}
