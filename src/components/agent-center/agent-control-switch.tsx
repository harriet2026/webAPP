'use client';

import { Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface AgentControlSwitchProps {
  checked: boolean;
  disabled: boolean;
  pending?: boolean;
  enabledLabel: string;
  disabledLabel: string;
  ariaLabel: string;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

export function AgentControlSwitch({
  checked,
  disabled,
  pending,
  enabledLabel,
  disabledLabel,
  ariaLabel,
  onCheckedChange,
  className,
}: AgentControlSwitchProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      <span className={cn('text-sm', checked ? 'text-primary' : 'text-muted-foreground')}>
        {checked ? enabledLabel : disabledLabel}
      </span>
      <Switch
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled || pending}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
