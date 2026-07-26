import * as React from 'react';

import { cn } from '@/lib/utils';

type PageFiltersProps = React.HTMLAttributes<HTMLElement>;

export function PageFilters({ children, className, ...props }: PageFiltersProps) {
  return (
    <section
      {...props}
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-sm',
        className,
      )}
    >
      {children}
    </section>
  );
}
