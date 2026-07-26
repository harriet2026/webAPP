import * as React from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SmartSummaryBadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function SmartSummaryBadge({ children, className }: SmartSummaryBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-1.5 text-sm text-amber-800',
        className,
      )}
    >
      <Zap className="h-3.5 w-3.5 shrink-0 text-warning" />
      <span>{children}</span>
    </div>
  );
}
