'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SpoofNotificationPreviewResponse } from '@/types/spoofing-detection';

export function SpoofingNotificationPreviewDialog({
  open,
  onOpenChange,
  preview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: SpoofNotificationPreviewResponse | null;
}) {
  const t = useTranslations('spoofingDetection.notificationPreview');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="overflow-hidden rounded-lg border border-border text-sm">
            <div className="space-y-1 border-b border-border bg-muted/40 px-4 py-2">
              <div>
                <span className="text-muted-foreground">{t('to')}</span>
                <span className="break-all">{preview.to}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('subject')}</span>
                <span>{preview.subject}</span>
              </div>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-sm leading-6 text-foreground">{preview.text}</pre>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
