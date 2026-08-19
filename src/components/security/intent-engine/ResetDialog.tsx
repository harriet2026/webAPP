'use client';

import { useTranslations } from 'next-intl';
import type { IntentDirection } from '@/types/intent-engine';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  direction: IntentDirection;
  onConfirm: () => void;
}

export function ResetDialog({ open, onOpenChange, direction, onConfirm }: ResetDialogProps) {
  const t = useTranslations('intentEngine.resetDialog');
  const tDir = useTranslations('intentEngine');

  // 描述行用短方向名（接收/外发/域内），模板自带「方向」字，与 demo 的【接收】方向一致
  const dirShort = tDir(`dirShort.${direction}` as 'tabReceive');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { dir: dirShort })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tDir('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
