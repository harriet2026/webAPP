'use client';

import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SEVERITY_CONFIG, STATUS_CONFIG } from './severity';
import type { AlertEvent } from '@/types/alerts';

interface Props {
  alert?: AlertEvent;
  open: boolean;
  loading?: boolean;
  error?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: number) => void;
  onProcess: (id: number) => void;
  onResolve: (id: number) => void;
}

export function AlertDetailDrawer({
  alert,
  open,
  loading = false,
  error = false,
  onOpenChange,
  onConfirm,
  onProcess,
  onResolve,
}: Props) {
  const t = useTranslations('alertCenter');
  const sev = alert ? SEVERITY_CONFIG[alert.severity] : undefined;
  const fields = alert ? [
    ['rule', alert.rule_name],
    ['source', alert.source],
    ['node', alert.node || '—'],
    ['metric', alert.metric_key],
    ['currentValue', String(alert.metric_value)],
    ['threshold', String(alert.threshold)],
    ['firstSeen', new Date(alert.first_seen_at).toLocaleString()],
    ['lastSeen', new Date(alert.last_seen_at).toLocaleString()],
    ['count', String(alert.count)],
    ['confirmedBy', alert.confirmed_by || '—'],
    ['resolvedBy', alert.resolved_by || '—'],
  ] as const : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" data-testid="alert-detail-drawer">
        <SheetHeader>
          <SheetTitle data-testid="alert-detail-title">{t('detail.title')}</SheetTitle>
          <SheetDescription>{alert?.message ?? (error ? t('loadFailed') : t('loading'))}</SheetDescription>
        </SheetHeader>
        {loading && <div className="py-10 text-center text-muted-foreground" data-testid="alert-detail-loading">{t('loading')}</div>}
        {error && <div className="py-10 text-center text-destructive" data-testid="alert-detail-error">{t('loadFailed')}</div>}
        {alert && sev && (
          <>
            <div className="mt-6 flex gap-2">
              <Badge className={sev.badge} data-testid="alert-detail-severity">{t(`severity.${sev.key}`)}</Badge>
              <Badge className={STATUS_CONFIG[alert.status]} data-testid="alert-detail-status">{t(`status.${alert.status}`)}</Badge>
            </div>
            <dl className="mt-6 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-3 text-sm">
              {fields.map(([key, value]) => (
                <div className="contents" key={key} data-testid={`alert-detail-${key}`}>
                  <dt className="text-muted-foreground">{t(`detail.${key}`)}</dt>
                  <dd className="break-all font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 flex flex-wrap gap-2" data-testid="alert-detail-actions">
              <Button
                variant="outline"
                disabled={alert.status !== 'unconfirmed'}
                onClick={() => onConfirm(alert.id)}
                data-testid="alert-detail-confirm"
              >
                {t('action.confirm')}
              </Button>
              <Button
                variant="outline"
                disabled={alert.status !== 'confirmed'}
                onClick={() => onProcess(alert.id)}
                data-testid="alert-detail-process"
              >
                {t('action.startProcess')}
              </Button>
              <Button
                disabled={alert.status === 'resolved'}
                onClick={() => onResolve(alert.id)}
                data-testid="alert-detail-resolve"
              >
                {t('action.resolve')}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
