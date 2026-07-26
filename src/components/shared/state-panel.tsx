import * as React from 'react';

import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface StatePanelProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function StatePanel({ title, description, className, icon }: StatePanelProps) {
  return (
    <div className={cn('flex min-h-[260px] items-center justify-center rounded-[28px] border border-border/70 bg-card/96 p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)]', className)}>
      <div className="text-center">
        {icon ? <div className="mb-4 flex justify-center">{icon}</div> : null}
        {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export function LoadingPanel({ label, className }: { label?: React.ReactNode; className?: string }) {
  return (
    <StatePanel
      className={className}
      icon={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
      description={label}
    />
  );
}

export function AccessDeniedPanel({ description }: { description: React.ReactNode }) {
  return <StatePanel title="403" description={description} />;
}
