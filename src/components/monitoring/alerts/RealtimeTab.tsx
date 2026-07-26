'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, MoreHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { EmptyState } from '../infrastructure/StateBanners';
import { SEVERITY_CONFIG, STATUS_CONFIG } from './severity';
import {
  useAlerts,
  useAlertDetail,
  useConfirmAlert,
  useProcessAlert,
  useResolveAlert,
  useBatchAlerts,
} from './hooks';
import { AlertDetailDrawer } from './AlertDetailDrawer';
import type { AlertEvent } from '@/types/alerts';

const DEBOUNCE_MS = 300;

export function RealtimeTab({ paused }: { paused: boolean }) {
  const t = useTranslations('alertCenter');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<number[]>([]);
  const searchParams = useSearchParams();
  const [detailId, setDetailId] = useState<number | undefined>(() => {
    const id = Number(searchParams.get('id'));
    return Number.isInteger(id) && id > 0 ? id : undefined;
  });

  // Debounce the search input so each keystroke doesn't fire a request (review
  // §二.6). Without this, fast typing + the polling queryKey produces a request
  // storm and old responses can race the newest one.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [q]);

  const { data, isLoading, isError, refetch } = useAlerts(
    { q: debouncedQ, severity, status, page: 1, page_size: 50 },
    { paused },
  );
  const detail = useAlertDetail(detailId);
  const confirm = useConfirmAlert();
  const process = useProcessAlert();
  const resolve = useResolveAlert();
  const batch = useBatchAlerts();
  const items = data?.items ?? [];

  const toggleAll = (checked: boolean) => setSelected(checked ? items.map((a) => a.id) : []);
  const toggleOne = (id: number, checked: boolean) =>
    setSelected((s) => (checked ? [...s, id] : s.filter((x) => x !== id)));

  const runBatch = async (action: 'confirm' | 'resolve') => {
    try {
      const r = await batch.mutateAsync({ action, ids: selected });
      setSelected([]);
      if (r.failed > 0) toast.warning(t('batch.partial', { ok: r.success, fail: r.failed }));
      else toast.success(t('batch.done', { ok: r.success }));
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? t('action.failed'));
    }
  };

  const rowAction = async (fn: (id: number) => Promise<unknown>, id: number) => {
    try {
      await fn(id);
      toast.success(t('action.success'));
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? t('action.failed'));
    }
  };

  return (
    <div className="space-y-4" data-testid="alert-realtime">
      <Card data-testid="alert-filter-card">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="relative w-full flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input className="pl-10" placeholder={t('searchPlaceholder')} value={q} onChange={(e) => { setQ(e.target.value); setSelected([]); }} data-testid="alert-search" />
          </div>
          <Select value={severity} onValueChange={(v) => { setSeverity(v ?? 'all'); setSelected([]); }}>
            <SelectTrigger className="w-full sm:w-32" data-testid="alert-severity-filter"><SelectValue placeholder={t('label.severity')} /></SelectTrigger>
            <SelectContent data-testid="alert-severity-options">
              <SelectItem value="all">{t('filter.all')}</SelectItem>
              <SelectItem value="p0">{t('severity.critical')}</SelectItem>
              <SelectItem value="p1">{t('severity.major')}</SelectItem>
              <SelectItem value="p2">{t('severity.minor')}</SelectItem>
              <SelectItem value="p3">{t('severity.warning')}</SelectItem>
              <SelectItem value="p4">{t('severity.info')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v ?? 'all'); setSelected([]); }}>
            <SelectTrigger className="w-full sm:w-32" data-testid="alert-status-filter"><SelectValue placeholder={t('label.status')} /></SelectTrigger>
            <SelectContent data-testid="alert-status-options">
              <SelectItem value="all">{t('filter.all')}</SelectItem>
              <SelectItem value="unconfirmed">{t('status.unconfirmed')}</SelectItem>
              <SelectItem value="confirmed">{t('status.confirmed')}</SelectItem>
              <SelectItem value="processing">{t('status.processing')}</SelectItem>
              <SelectItem value="resolved">{t('status.resolved')}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20" data-testid="batch-bar">
          <span className="text-sm">{t('selected', { count: selected.length })}</span>
          <Button size="sm" variant="outline" onClick={() => runBatch('confirm')} data-testid="alert-batch-confirm">{t('action.batchConfirm')}</Button>
          <Button size="sm" variant="outline" onClick={() => runBatch('resolve')} data-testid="alert-batch-resolve">{t('action.batchResolve')}</Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2" data-testid="alert-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/40 p-6 text-center" data-testid="alert-error">
          <p className="text-sm text-destructive">{t('loadFailed')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()} data-testid="alert-retry">
            {t('retry')}
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div data-testid="alert-empty"><EmptyState /></div>
      ) : (
        <Card data-testid="alert-table">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selected.length === items.length && items.length > 0}
                      indeterminate={selected.length > 0 && selected.length < items.length}
                      onCheckedChange={(c) => toggleAll(c === true)}
                      data-testid="alert-select-all"
                    />
                  </TableHead>
                  <TableHead>{t('label.time')}</TableHead>
                  <TableHead>{t('label.severity')}</TableHead>
                  <TableHead>{t('label.source')}</TableHead>
                  <TableHead>{t('label.message')}</TableHead>
                  <TableHead>{t('label.status')}</TableHead>
                  <TableHead>{t('label.count')}</TableHead>
                  <TableHead>{t('label.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a: AlertEvent) => {
                  const sev = SEVERITY_CONFIG[a.severity];
                  const tinted = a.status === 'unconfirmed' ? sev.bgTint : '';
                  return (
                    <TableRow key={a.id} className={tinted} data-testid={`alert-row-${a.id}`} data-status={a.status}>
                      <TableCell>
                        <Checkbox checked={selected.includes(a.id)} onCheckedChange={(c) => toggleOne(a.id, c === true)} data-testid={`alert-select-${a.id}`} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{new Date(a.last_seen_at).toLocaleTimeString([], { hour12: false })}</TableCell>
                      <TableCell><Badge className={sev.badge} data-testid={`alert-severity-${a.id}`}>{t(`severity.${sev.key}`)}</Badge></TableCell>
                      <TableCell>{a.source}</TableCell>
                      <TableCell className="font-medium">{a.message}</TableCell>
                      <TableCell><Badge className={STATUS_CONFIG[a.status]} data-testid={`alert-status-${a.id}`}>{t(`status.${a.status}`)}</Badge></TableCell>
                      <TableCell className="text-center">{a.count}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" data-testid={`alert-actions-${a.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        />
                          <DropdownMenuContent align="end" data-testid={`alert-action-menu-${a.id}`}>
                            <DropdownMenuItem onClick={() => setDetailId(a.id)} data-testid={`alert-view-${a.id}`}>{t('action.viewDetail')}</DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={a.status !== 'unconfirmed'}
                              onClick={() => rowAction(confirm.mutateAsync, a.id)}
                              data-testid={`alert-confirm-${a.id}`}
                            >
                              {t('action.confirm')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={a.status !== 'confirmed'}
                              onClick={() => rowAction(process.mutateAsync, a.id)}
                              data-testid={`alert-process-${a.id}`}
                            >
                              {t('action.startProcess')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={a.status === 'resolved'}
                              onClick={() => rowAction(resolve.mutateAsync, a.id)}
                              data-testid={`alert-resolve-${a.id}`}
                            >
                              {t('action.resolve')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <AlertDetailDrawer
        alert={detail.data ?? items.find((item) => item.id === detailId)}
        open={detailId !== undefined}
        loading={detail.isLoading && !items.some((item) => item.id === detailId)}
        error={detail.isError && !items.some((item) => item.id === detailId)}
        onOpenChange={(open) => { if (!open) setDetailId(undefined); }}
        onConfirm={(id) => rowAction(confirm.mutateAsync, id)}
        onProcess={(id) => rowAction(process.mutateAsync, id)}
        onResolve={(id) => rowAction(resolve.mutateAsync, id)}
      />
    </div>
  );
}
