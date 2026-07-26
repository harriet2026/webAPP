'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { useEscapeList } from './hooks/useSecurityOverview';
import type { Direction } from '@/lib/api/security-overview';

interface Props {
  startDate: string;
  endDate: string;
  direction: Direction;
  scopeTenantId: number | null;
}

const PAGE_SIZE = 20;

export function EscapesAlert({ startDate, endDate, direction, scopeTenantId }: Props) {
  const t = useTranslations('securityOverview.escape');
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useEscapeList({ startDate, endDate, direction, page, pageSize: PAGE_SIZE }, scopeTenantId);

  if (isLoading) return null;
  const total = data?.total ?? 0;
  if (total <= 0) return null;
  const items = data?.items ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="text-sm text-amber-800 dark:text-amber-300">{t('warning', { count: total })}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          {t('viewDetails')}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPage(1); }}>
        <SheetContent className="flex w-[640px] flex-col p-0 sm:max-w-[640px]">
          <SheetHeader className="shrink-0 border-b border-border px-6 py-4">
            <SheetTitle>{t('drawerTitle')}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            {items.map((it) => (
              <div key={it.id} className="rounded-lg border border-border/60 p-3 text-sm">
                <div className="font-medium truncate" title={it.subject}>{it.subject || '—'}</div>
                <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                  <span>{t('col.sender')}</span><span className="truncate">{it.sender}</span>
                  <span>{t('col.recipients')}</span><span className="truncate">{(it.recipients ?? []).join(', ')}</span>
                  <span>{t('col.recalledAt')}</span><span>{it.recalled_at}</span>
                  <span>{t('col.reason')}</span><span className="truncate">{it.recall_reason || '—'}</span>
                </div>
              </div>
            ))}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t('prev')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t('pageOf', { page, total: Math.ceil(total / PAGE_SIZE) })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
