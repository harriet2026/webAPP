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
import { getDetectionLogs, getDetectionStats } from '@/lib/api/phishing-detection';
import { DetectionDetailSheet } from './detection-detail-sheet';
import { DetectionLogFilters, type DetectionFilterState, type TimeRangeKey } from './detection-log-filters';
import { DetectionLogTable } from './detection-log-table';
import { KpiCards } from './kpi-cards';
import { phishingQueryKeys } from './phishing-query-keys';

const PAGE_SIZE = 20;
const DEFAULT_FILTERS: DetectionFilterState = { keyword: '', disposition: [], detection_mode: [], recall_status: [], risk_level: [], mail_status: [], rangeKey: 'today', start: '', end: '' };

function computeRange(range: TimeRangeKey, customStart: string, customEnd: string) {
  const now = new Date();
  if (range === 'today') { const start = new Date(now); start.setHours(0, 0, 0, 0); return { start: start.toISOString(), end: now.toISOString() }; }
  if (range === '7d' || range === '30d') { const start = new Date(now); start.setDate(start.getDate() - (range === '7d' ? 7 : 30)); return { start: start.toISOString(), end: now.toISOString() }; }
  return { start: customStart ? new Date(customStart).toISOString() : undefined, end: customEnd ? new Date(customEnd).toISOString() : undefined };
}

export function PhishingOverviewPage({ hitRate }: { hitRate?: number | null }) {
  const t = useTranslations();
  const tp = useTranslations('phishingDetection');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const range = useMemo(() => computeRange(filters.rangeKey, filters.start, filters.end), [filters.end, filters.rangeKey, filters.start]);
  const apiFilters = useMemo(() => ({
    page, page_size: PAGE_SIZE, keyword: filters.keyword.trim() || undefined,
    disposition: filters.disposition.length ? filters.disposition : undefined,
    detection_mode: filters.detection_mode.length ? filters.detection_mode : undefined,
    recall_status: filters.recall_status.length ? filters.recall_status : undefined,
    risk_level: filters.risk_level.length ? filters.risk_level : undefined,
    mail_status: filters.mail_status.length ? filters.mail_status : undefined,
    ...range,
  }), [filters, page, range]);
  const statsQuery = useQuery({ queryKey: phishingQueryKeys.stats(effectiveTenantId, range), queryFn: () => getDetectionStats(range, apiRequest) });
  const logsQuery = useQuery({ queryKey: phishingQueryKeys.logs(effectiveTenantId, apiFilters), queryFn: () => getDetectionLogs(apiFilters, apiRequest) });
  const changeFilters = useCallback((next: DetectionFilterState) => { setFilters(next); setPage(1); }, []);
  const applyFilterPatch = useCallback((patch: Partial<DetectionFilterState>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); }, []);
  return <PageShell className="space-y-6">
    <KpiCards stats={statsQuery.data} hitRate={hitRate} isLoading={statsQuery.isLoading} onQuarantinedClick={() => applyFilterPatch({ disposition: ['quarantine'] })} onPendingReviewClick={() => applyFilterPatch({ disposition: ['audit'] })} onRecalledClick={() => applyFilterPatch({ recall_status: ['recalled'] })} onRecallSuccessClick={() => applyFilterPatch({ recall_status: ['recalled'] })} />
    <PageSurface className="rounded-xl border-border p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-semibold">{tp('table.logTitle')}</h3><Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { statsQuery.refetch(); logsQuery.refetch(); }} disabled={statsQuery.isFetching || logsQuery.isFetching}><RefreshCw className={statsQuery.isFetching || logsQuery.isFetching ? 'size-4 animate-spin' : 'size-4'} />{t('common.refresh')}</Button></div>
      <PageFilters className="mb-4 rounded-xl border-border p-4 shadow-none"><DetectionLogFilters value={filters} onChange={changeFilters} onReset={() => changeFilters(DEFAULT_FILTERS)} /></PageFilters>
      <DetectionLogTable data={logsQuery.data?.items ?? []} isLoading={logsQuery.isLoading} truncated={logsQuery.data?.items.some((item) => item.result_truncated)} onOpenDetail={setDetailId} />
      <div className="mt-4"><ServerPagination page={page} pageSize={PAGE_SIZE} total={logsQuery.data?.total ?? 0} onPageChange={setPage} /></div>
    </PageSurface>
    <DetectionDetailSheet open={detailId !== null} onOpenChange={(open) => { if (!open) setDetailId(null); }} detailId={detailId} />
  </PageShell>;
}
