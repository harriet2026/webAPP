'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type BatchAction = 'observe_on' | 'observe_off' | 'threshold';

export function SpoofingBatchDialog({ open, onOpenChange, count, onApply }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  onApply: (action: BatchAction, value?: number) => void;
}) {
  const tsd = useTranslations('spoofingDetection');
  const tc = useTranslations('common');
  const [action, setAction] = useState<BatchAction>('observe_on');
  const [threshold, setThreshold] = useState(80);

  const options: { value: BatchAction; label: string }[] = [
    { value: 'observe_on', label: tsd('batch.observeOn') },
    { value: 'observe_off', label: tsd('batch.observeOff') },
    { value: 'threshold', label: tsd('batch.setThreshold') },
  ];

  const canApply = action !== 'threshold' || (threshold >= 0 && threshold <= 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tsd('batch.title')}</DialogTitle>
          <DialogDescription>{tsd('batch.selected', { n: count })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setAction(o.value)}
              className={cn('flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                action === o.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent')}
            >
              <span className={cn('inline-block h-2 w-2 rounded-full', action === o.value ? 'bg-primary' : 'bg-muted-foreground/40')} />
              {o.label}
            </button>
          ))}
          {action === 'threshold' ? (
            <div className="flex items-center gap-2 pt-1">
              <span className="text-sm text-muted-foreground">{tsd('batch.thresholdValue')}</span>
              <Input type="number" min={0} max={100} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))} className="h-8 w-24" />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button disabled={!canApply} onClick={() => onApply(action, action === 'threshold' ? threshold : undefined)}>
            {tsd('batch.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
