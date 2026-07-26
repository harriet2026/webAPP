'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ServerPagination } from '@/components/shared/server-pagination';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { useApiRequest, ApiError } from '@/lib/api/client';
import {
  getSpoofingStats, getSpoofingLogs, blockSpoofingDetection, exemptSpoofingDetection,
} from '@/lib/api/spoofing-detection';
import { useSpoofingAccess } from './spoofing-access';
import { SpoofingKpiCards } from './spoofing-kpi-cards';
import { SpoofingLogFilters, type SpoofFilterState, type SpoofTimeRangeKey } from './spoofing-log-filters';
import { SpoofingLogTable } from './spoofing-log-table';
import { SpoofingDetailSheet } from './spoofing-detail-sheet';
import { SpoofingExemptDialog } from './spoofing-exempt-dialog';
import type { SpoofingLogItem } from '@/types/spoofing-detection';
import { spoofingQueryKeys } from './spoofing-query-keys';

const PAGE_SIZE = 20;
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

function toRFC3339(d: Date) { return d.toISOString(); }

function computeRange(key: SpoofTimeRangeKey, s: string, e: string): { start?: string; end?: string } {
  const now = new Date();
  if (key === 'today') { const st = new Date(now); st.setHours(0, 0, 0, 0); return { start: toRFC3339(st), end: toRFC3339(now) }; }
  if (key === '7d') { const st = new Date(now); st.setDate(st.getDate() - 7); return { start: toRFC3339(st), end: toRFC3339(now) }; }
  if (key === '30d') { const st = new Date(now); st.setDate(st.getDate() - 30); return { start: toRFC3339(st), end: toRFC3339(now) }; }
  const r: { start?: string; end?: string } = {};
  if (s) r.start = new Date(s).toISOString();
  if (e) r.end = new Date(e).toISOString();
  return r;
}

// task: (inline fallback) rows are not actionable — backend rejects with 422
// not_actionable. Detect that and surface the localized fallback hint.
function isNotActionable(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 422) return false;
  const code = (err.body?.error as { code?: string } | undefined)?.code;
  return code === 'not_actionable';
}

const DEFAULT_FILTERS: SpoofFilterState = {
  keyword: '', disposition: [], spoof_method: [], category: [], rangeKey: 'today', start: '', end: '',
};

export function SpoofingOverviewPage() {
  const t = useTranslations();
  const tsd = useTranslations('spoofingDetection');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit } = useSpoofingAccess();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<SpoofFilterState>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<SpoofFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [exemptId, setExemptId] = useState<string | null>(null);

  const range = useMemo(() => computeRange(applied.rangeKey, applied.start, applied.end), [applied]);

  const filtersForApi = useMemo(() => ({
    page, page_size: PAGE_SIZE,
    keyword: applied.keyword.trim() || undefined,
    disposition: applied.disposition.length ? applied.disposition : undefined,
    spoof_method: applied.spoof_method.length ? applied.spoof_method : undefined,
    category: applied.category.length ? applied.category : undefined,
    // pending_review is a current-state queue KPI, not a time-window metric.
    start: applied.category.includes('pending_review') ? undefined : range.start,
    end: applied.category.includes('pending_review') ? undefined : range.end,
  }), [applied, page, range]);

  const statsQuery = useQuery({ queryKey: spoofingQueryKeys.stats(effectiveTenantId, range), queryFn: () => getSpoofingStats({ start: range.start, end: range.end }, apiRequest) });
  const logsQuery = useQuery({ queryKey: spoofingQueryKeys.logs(effectiveTenantId, filtersForApi), queryFn: () => getSpoofingLogs(filtersForApi, apiRequest) });

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: spoofingQueryKeys.logs(effectiveTenantId) });
    qc.invalidateQueries({ queryKey: spoofingQueryKeys.stats(effectiveTenantId) });
  }, [effectiveTenantId, qc]);

  const blockMutation = useMutation({
    mutationFn: (id: string) => blockSpoofingDetection(id, apiRequest),
    onSuccess: (data) => {
      toast.success(data.status === 'already_blocked' ? tsd('block.alreadyBlocked') : tsd('block.success'));
      setBlockId(null);
      invalidateAll();
    },
    onError: (error) => {
      if (isNotActionable(error)) {
        toast.error(tsd('block.notActionable'));
        return;
      }
      toast.error(error instanceof Error ? error.message : tsd('block.error'));
    },
  });

  const exemptMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => exemptSpoofingDetection(id, reason, apiRequest),
    onSuccess: () => {
      toast.success(tsd('exempt.success'));
      setExemptId(null);
      invalidateAll();
    },
    onError: (error) => {
      if (isNotActionable(error)) {
        toast.error(tsd('block.notActionable'));
        return;
      }
      toast.error(error instanceof Error ? error.message : tsd('exempt.error'));
    },
  });

  const doSearch = useCallback(() => {
    const r = computeRange(filters.rangeKey, filters.start, filters.end);
    // P3-2: also guard when only one side is set (derive the other from now).
    const startMs = r.start ? new Date(r.start).getTime() : null;
    const endMs = r.end ? new Date(r.end).getTime() : Date.now();
    if (startMs !== null && endMs - startMs > MAX_RANGE_MS) {
      // P3-1: spec §8 requires amber (warning) toast, not red (error).
      toast.warning(tsd('filters.rangeOver90'));
      return;
    }
    setApplied(filters);
    setPage(1);
  }, [filters, tsd]);

  const handleReset = useCallback(() => { setFilters(DEFAULT_FILTERS); setApplied(DEFAULT_FILTERS); setPage(1); }, []);

  const applyCategory = useCallback((category: string) => {
    const next = { ...DEFAULT_FILTERS, category: category === 'all' ? [] : [category], rangeKey: applied.rangeKey };
    setFilters(next); setApplied(next); setPage(1);
  }, [applied.rangeKey]);

  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const handleRowBlock = useCallback((item: SpoofingLogItem) => {
    if (!item.actionable) {
      toast.error(tsd('block.notActionable'));
      return;
    }
    setBlockId(item.id);
  }, [tsd]);

  const handleRowExempt = useCallback((item: SpoofingLogItem) => {
    if (!item.actionable) {
      toast.error(tsd('block.notActionable'));
      return;
    }
    setExemptId(item.id);
  }, [tsd]);

  const totalLogs = logsQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <SpoofingKpiCards stats={statsQuery.data} isLoading={statsQuery.isLoading} onCategoryClick={applyCategory} />

      <section>
        <h3 className="mb-3 text-sm font-medium text-foreground/80">{tsd('detectionLogs')}</h3>
        <div className="mb-3 rounded-lg border border-border bg-card p-4">
          <SpoofingLogFilters value={filters} onChange={setFilters} onReset={handleReset} onSearch={doSearch} />
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {tsd('table.totalPrefix')}
            <span className="font-medium text-foreground">{totalLogs}</span>
            {tsd('table.totalSuffix')}
          </span>
          {applied.category.length > 0 ? (
            <Badge variant="secondary" className="gap-1 font-normal">
              {tsd(`category.${applied.category[0]}`)}
              <button onClick={() => applyCategory('all')}><X className="h-3 w-3" /></button>
            </Badge>
          ) : null}
        </div>

        <SpoofingLogTable
          data={logsQuery.data?.items ?? []}
          isLoading={logsQuery.isLoading}
          canEdit={canEdit}
          onOpenDetail={openDetail}
          onBlock={handleRowBlock}
          onExempt={handleRowExempt}
        />
        <div className="mt-3">
          <ServerPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={logsQuery.data?.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      </section>

      <SpoofingDetailSheet
        open={detailOpen}
        onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetailId(null); }}
        detailId={detailId}
        canEdit={canEdit}
        onBlock={(id) => setBlockId(id)}
        onExempt={(id) => setExemptId(id)}
      />

      <ConfirmDialog
        open={!!blockId}
        onOpenChange={(o) => !o && setBlockId(null)}
        title={tsd('block.title')}
        description={tsd('block.description')}
        confirmText={tsd('block.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={() => { if (blockId) blockMutation.mutate(blockId); }}
        variant="destructive"
      />

      <SpoofingExemptDialog
        open={!!exemptId}
        onOpenChange={(o) => !o && setExemptId(null)}
        onSubmit={(reason) => { if (exemptId) exemptMutation.mutate({ id: exemptId, reason }); }}
        isLoading={exemptMutation.isPending}
      />
    </div>
  );
}
