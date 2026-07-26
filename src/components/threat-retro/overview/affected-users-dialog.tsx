'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import { getRecipients, getRunAffectedRecipients } from '@/lib/api/threat-retro';
import type { ThreatRetroLeakMail } from '@/types/threat-retro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leak?: ThreatRetroLeakMail | null;
	runId?: string | null;
}

export function AffectedUsersDialog({ open, onOpenChange, leak, runId }: Props) {
  const t = useTranslations('threatRetro.affectedUsers');
  const { apiRequest } = useApiRequest();

  const { data, isLoading } = useQuery({
	queryKey: ['tr-recipients', leak?.mail_log_id ?? runId],
	queryFn: () => leak
	  ? getRecipients(leak.mail_log_id, apiRequest)
	  : getRunAffectedRecipients(runId!, apiRequest),
	enabled: open && (!!leak || !!runId),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[480px] flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {leak ? (
            <div className="mb-4 space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('subject')}:</span>{' '}
                <span className="font-medium">{leak.subject || '(—)'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('sender')}:</span>{' '}
                <span className="font-medium">{leak.sender}</span>
              </div>
            </div>
          ) : null}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
            </div>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {(data?.recipients ?? []).map((r) => (
                <li
                  key={r.address}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                >
                  <span className="font-mono text-xs">{r.address}</span>
                  <Badge
                    variant="outline"
                    className={
                      r.is_read === true
                        ? 'border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        : r.is_read === false
                          ? 'border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'border-border bg-muted text-muted-foreground'
                    }
                  >
                    {r.is_read === true
                      ? t('read')
                      : r.is_read === false
                        ? t('unread')
                        : t('readUnknown')}
                  </Badge>
                </li>
              ))}
              {!data || data.recipients.length === 0 ? (
                <li className="text-xs text-muted-foreground">{t('empty')}</li>
              ) : null}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
