'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmailHtmlView } from '@/components/email/email-html-view';
import { useApiRequest } from '@/lib/api/client';
import { previewThreatRetroNotification } from '@/lib/api/threat-retro';

export function NotificationPreviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('threatRetroStrategy.disposition');
  const { apiRequest } = useApiRequest();
  const [kind, setKind] = useState<'immediate' | 'digest'>('immediate');
  const preview = useQuery({
    queryKey: ['threat-retro-notification-preview', kind],
    queryFn: () => previewThreatRetroNotification(kind, apiRequest),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        data-testid="notification-preview-dialog"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{t('preview')}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <Select value={kind} onValueChange={(value) => setKind(value as 'immediate' | 'digest')}>
            <SelectTrigger className="w-72">
              <SelectValue>{kind === 'immediate' ? t('previewImmediate') : t('previewDigest')}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">{t('previewImmediate')}</SelectItem>
              <SelectItem value="digest">{t('previewDigest')}</SelectItem>
            </SelectContent>
          </Select>
          <div className="rounded-md border">
            <div
              data-testid="notification-preview-subject"
              className="border-b px-4 py-3 text-sm font-medium"
            >
              {preview.data?.subject ?? '...'}
            </div>
            <div className="p-4">
              {preview.data ? <EmailHtmlView htmlBody={preview.data.html} /> : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
