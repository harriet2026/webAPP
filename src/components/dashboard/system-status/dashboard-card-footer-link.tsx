import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Link } from '@/i18n/navigation';

interface DashboardCardFooterLinkProps {
  href: string;
  children: ReactNode;
  testId: string;
}

/** Reused low-emphasis entry link for system-status card footers. */
export function DashboardCardFooterLink({
  href,
  children,
  testId,
}: DashboardCardFooterLinkProps) {
  return (
    <InteractiveSurface asChild variant="text">
      <Link
        href={href}
        className="flex items-center gap-1 text-xs text-muted-foreground"
        data-testid={testId}
      >
        {children}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </InteractiveSurface>
  );
}
