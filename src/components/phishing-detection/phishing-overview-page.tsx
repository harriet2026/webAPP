'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageFilters } from '@/components/shared/page-filters';
import { PageShell, PageSurface } from '@/components/shared/page-shell';
import { ServerPagination } from '@/components/shared/server-pagination';
import { Button } from '@/components/ui/button';
import { useApiRequest } from '@/lib/api/client';
import { getDetectionLogs } from '@/lib/api/phishing-detection';
import type { DetectionLogFilters as DetectionLogApiFilters } from '@/types/phishing-detection';
import { DetectionDetailSheet } from './detection-detail-sheet';
import { DetectionLogFilters, type DetectionFilterState, type TimeRangeKey } from './detection-log-filters';
import { DetectionLogTable } from './detection-log-table';
import { KpiCards } from './kpi-cards';
import { phishingQueryKeys } from './phishing-query-keys';
import { usePhishingStats } from './usePhishingStats';

const PAGE_SIZE = 20;
const DEFAULT_FILTERS: DetectionFilterState = { keyword: '', disposition: [], detection_mode: [], recall_status: [], risk_level: [], mail_status: [], rangeKey: 'today', start: '', end: '' };
// Card drilldowns retain their existing list filters while secondary totals are hidden.
const KPI_LOG_FILTERS = {
  detected: { range: 'today' },
  quarantined: { range: 'today', disposition: ['quarantine'] },
  review: { disposition: ['audit'] },
  recalled: { range: 'today', recall_status: ['recalled'] },
} satisfies Record<string, DetectionLogApiFilters>;

function computeRange(range: TimeRangeKey, customStart: string, customEnd: string) {
  const now = new Date();
  if (range === 'today') return { range: 'today' as const };
  if (range === '7d' || range === '30d') { const start = new Date(now); start.setDate(start.getDate() - (range === '7d' ? 7 : 30)); return { start: start.toISOString(), end: now.toISOString() }; }
  return { start: customStart ? new Date(customStart).toISOString() : undefined, end: customEnd ? new Date(customEnd).toISOString() : undefined };
}

export function PhishingOverviewPage({ statsRefreshManaged = false }: { statsRefreshManaged?: boolean }) {
  const t = useTranslations();
  const tp = useTranslations('phishingDetection');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterResetVersion, setFilterResetVersion] = useState(0);
  const [page, setPage] = useState(1);
  // Bumped by every explicit search: it re-anchors relative ranges to the
  // search time and forces a fresh log query for otherwise identical filters.
  const [searchSeq, setSearchSeq] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- searchSeq re-anchors relative ranges to "now"
  const range = useMemo(() => computeRange(filters.rangeKey, filters.start, filters.end), [filters.end, filters.rangeKey, filters.start, searchSeq]);
  const apiFilters = useMemo(() => ({
    page, page_size: PAGE_SIZE, keyword: filters.keyword.trim() || undefined,
    disposition: filters.disposition.length ? filters.disposition : undefined,
    detection_mode: filters.detection_mode.length ? filters.detection_mode : undefined,
    recall_status: filters.recall_status.length ? filters.recall_status : undefined,
    risk_level: filters.risk_level.length ? filters.risk_level : undefined,
    mail_status: filters.mail_status.length ? filters.mail_status : undefined,
    ...range,
  }), [filters, page, range]);
  const statsQuery = usePhishingStats(true, !statsRefreshManaged);
  const logsQuery = useQuery({ queryKey: phishingQueryKeys.logs(effectiveTenantId, { filters: apiFilters, search: searchSeq }), queryFn: () => getDetectionLogs(apiFilters, apiRequest), meta: { refreshOnPhishingBusinessDay: filters.rangeKey === 'today' } });
  const isRefreshing = statsQuery.isFetching || logsQuery.isFetching;
  const refresh = () => {
    statsQuery.refetch();
    logsQuery.refetch();
  };
  const changeFilters = useCallback((next: DetectionFilterState) => { setFilters(next); setPage(1); }, []);
  const searchLogs = useCallback((next: DetectionFilterState) => { setFilters(next); setPage(1); setSearchSeq((current) => current + 1); }, []);
  const resetFilters = useCallback(() => { setFilters(DEFAULT_FILTERS); setFilterResetVersion((current) => current + 1); setPage(1); }, []);
  const applyKpiFilter = useCallback((filter: DetectionLogApiFilters) => {
    setFilters({
      ...DEFAULT_FILTERS,
      rangeKey: filter.range === 'today' ? 'today' : 'custom',
      disposition: filter.disposition ?? [],
      recall_status: filter.recall_status ?? [],
    });
    setFilterResetVersion((current) => current + 1);
    setPage(1);
    setSearchSeq((current) => current + 1);
  }, []);
  return <PageShell className="space-y-6">
    <KpiCards stats={statsQuery.data} isLoading={statsQuery.isLoading} onDetectedClick={() => applyKpiFilter(KPI_LOG_FILTERS.detected)} onQuarantinedClick={() => applyKpiFilter(KPI_LOG_FILTERS.quarantined)} onPendingReviewClick={() => applyKpiFilter(KPI_LOG_FILTERS.review)} onRecalledClick={() => applyKpiFilter(KPI_LOG_FILTERS.recalled)} onRecallSuccessClick={() => applyKpiFilter(KPI_LOG_FILTERS.recalled)} />
    <PageSurface className="rounded-xl border-border p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-semibold">{tp('table.logTitle')}</h3><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refresh} disabled={isRefreshing}><RefreshCw className={isRefreshing ? 'size-4 animate-spin' : 'size-4'} />{t('common.refresh')}</Button></div>
      <PageFilters className="mb-4 rounded-xl border-border p-4 shadow-none"><DetectionLogFilters key={filterResetVersion} value={filters} onChange={changeFilters} onSearch={searchLogs} onReset={resetFilters} searching={logsQuery.isFetching} /></PageFilters>
      <DetectionLogTable data={logsQuery.data?.items ?? []} isLoading={logsQuery.isLoading} truncated={logsQuery.data?.items.some((item) => item.result_truncated)} onOpenDetail={setDetailId} />
      <div className="mt-4"><ServerPagination page={page} pageSize={PAGE_SIZE} total={logsQuery.data?.total ?? 0} onPageChange={setPage} /></div>
    </PageSurface>
    <DetectionDetailSheet open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }} detailId={detailId} />
  </PageShell>;
}
