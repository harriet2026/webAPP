'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { emlUrl } from '@/lib/api/threat-retro';
import { getTenantHeader } from '@/lib/api/logs';
import { dispositionBadgeClass, threatTypeBadgeClass } from '../badge-styles';
import type { ThreatRetroLeakMail } from '@/types/threat-retro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leak?: ThreatRetroLeakMail | null;
}

export function EmlSheet({ open, onOpenChange, leak }: Props) {
  const t = useTranslations('threatRetro.eml');
	const emlQuery = useQuery({
	  queryKey: ['threat-retro-eml', leak?.mail_log_id],
	  enabled: open && !!leak,
	  queryFn: async ({ signal }) => {
		const response = await fetch(emlUrl(leak!.mail_log_id), {
		  credentials: 'include',
		  headers: { ...getTenantHeader() },
		  signal,
		});
		if (!response.ok) throw new Error(t('contentUnavailable'));
		return response.text();
	  },
	});

  async function downloadEml() {
    if (!leak) return;
    try {
      const resp = await fetch(emlUrl(leak.mail_log_id), {
        credentials: 'include',
        headers: { ...getTenantHeader() },
      });
      if (!resp.ok) throw new Error('download failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mail-${leak.mail_log_id}.eml`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
	  toast.error(t('contentUnavailable'));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[640px] flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!leak ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
                <Row label={t('sender')} value={leak.sender} />
                <Row label={t('subject')} value={leak.subject || '(—)'} />
                <Row label={t('messageUuid')} value={leak.message_uuid} mono />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge className={threatTypeBadgeClass(leak.threat_type)}>
                    {t(`threatType.${leak.threat_type}`)}
                  </Badge>
                  <Badge className={dispositionBadgeClass(leak.disposition)}>
                    {t(`disposition.${leak.disposition}`)}
                  </Badge>
                </div>
              </div>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold">{t('headers')}</h4>
                <div className="rounded-lg border bg-card p-3 text-xs">
                  <Row label={t('origDisposition')} value={leak.orig_disposition} />
                  <Row
                    label={t('origConfidence')}
                    value={
                      leak.orig_confidence
                        ? `${Math.round(leak.orig_confidence * 100)}%`
                        : '—'
                    }
                  />
                  <Row
                    label={t('recheckConfidence')}
                    value={`${Math.round((leak.recheck_confidence ?? 0) * 100)}%`}
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold">{t('rationale')}</h4>
                <p className="rounded-lg border bg-card p-3 text-sm whitespace-pre-wrap">
                  {leak.rationale || t('empty')}
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">{t('body')}</h4>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadEml}>
                    <Download className="h-3.5 w-3.5" /> {t('downloadEml')}
                  </Button>
                </div>
                <pre className="h-[420px] w-full overflow-auto rounded-lg border bg-white p-3 font-mono text-xs whitespace-pre-wrap">
				  {emlQuery.isLoading
					? t('loading')
					: emlQuery.isError
					  ? t('contentUnavailable')
					  : emlQuery.data || t('empty')}
                </pre>
              </section>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? 'flex-1 break-all font-mono' : 'flex-1 break-all'}>{value || '—'}</span>
    </div>
  );
}
