'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { IntentDirection } from '@/types/intent-engine';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

const ALL_DIRECTIONS: IntentDirection[] = ['receive', 'send', 'internal'];

const DIR_KEYS: Record<IntentDirection, string> = {
  receive: 'tabReceive',
  send: 'tabSend',
  internal: 'tabInternal',
};

interface CopyDirectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: IntentDirection;
  onConfirm: (targets: IntentDirection[]) => void;
}

export function CopyDirectionDialog({ open, onOpenChange, source, onConfirm }: CopyDirectionDialogProps) {
  const t = useTranslations('intentEngine.copyDialog');
  const tDir = useTranslations('intentEngine');
  const [targets, setTargets] = useState<IntentDirection[]>([]);

  const otherDirections = ALL_DIRECTIONS.filter((d) => d !== source);
  const hasDowngrade = source === 'receive' && targets.some((d) => d !== 'receive');

  const toggleTarget = (dir: IntentDirection) => {
    setTargets((prev) =>
      prev.includes(dir) ? prev.filter((d) => d !== dir) : [...prev, dir]
    );
  };

  const handleConfirm = () => {
    if (targets.length > 0) {
      onConfirm(targets);
      setTargets([]);
      onOpenChange(false);
    }
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) setTargets([]);
    onOpenChange(val);
  };

  const dirLabel = (dir: IntentDirection) =>
    tDir(DIR_KEYS[dir] as 'tabReceive');
  // 描述行用短方向名（接收/外发/域内），模板自带「方向」字，避免渲染成「接收方向】方向」（demo 为【接收】方向）
  const dirShort = (dir: IntentDirection) => tDir(`dirShort.${dir}` as 'tabReceive');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { src: dirShort(source) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {otherDirections.map((dir) => (
            <label key={dir} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={targets.includes(dir)}
                onCheckedChange={() => toggleTarget(dir)}
              />
              <Label className="text-sm cursor-pointer">{dirLabel(dir)}</Label>
            </label>
          ))}
          {targets.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('noTarget')}</p>
          )}
        </div>
        {hasDowngrade && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t('downgradeNotice')}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {tDir('cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={targets.length === 0}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
