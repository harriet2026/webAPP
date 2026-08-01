'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { getThreatRetroStats, getRuns, recallLeakMails, getAgentState } from '@/lib/api/threat-retro';
import { KpiCards } from './kpi-cards';
import { RunFilters, DEFAULT_FILTERS, type RunFilterState, type TimeRangeKey } from './run-filters';
import { RunsTable } from './runs-table';
import { ManualScanDialog } from './manual-scan-dialog';
import type { RecallStatus, RiskLevel, RunStatus } from '@/types/threat-retro';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const PAGE_SIZE = 20;

function toRFC3339(d: Date): string {
  return d.toISOString();
}

function computeRange(
  rangeKey: TimeRangeKey,
  customStart: string,
  customEnd: string,
): { start?: string; end?: string } {
  const now = new Date();
  if (rangeKey === 'today') {
    // Omit explicit bounds so the backend applies the tenant's local-day window.
    return {};
  }
  if (rangeKey === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start: toRFC3339(start), end: toRFC3339(now) };
  }
  if (rangeKey === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { start: toRFC3339(start), end: toRFC3339(now) };
  }
  const result: { start?: string; end?: string } = {};
  if (customStart) result.start = new Date(customStart).toISOString();
  if (customEnd) result.end = new Date(customEnd).toISOString();
  return result;
}

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

// Map active KPI → extra query params sent on top of the user-chosen filters.
function kpiStatus(activeKpi: string | null, base: string[]): RunStatus[] | undefined {
  if (activeKpi === 'running') return ['pending', 'running'];
  return base.length ? (base as RunStatus[]) : undefined;
}
function kpiRecall(_activeKpi: string | null, base: string[]): RecallStatus[] | undefined {
  const merged = dedupe(base);
  return merged.length ? (merged as RecallStatus[]) : undefined;
}

interface OverviewTabProps {
  manualScanOpen: boolean;
  onManualScanOpenChange: (open: boolean) => void;
}

export function OverviewTab({ manualScanOpen, onManualScanOpenChange }: OverviewTabProps) {
  const t = useTranslations('threatRetro');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest } = useApiRequest();
  const { isAdmin } = useTenant();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<RunFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ runId: string; mailLogId: number }[]>([]);

  const range = useMemo(
    () => computeRange(filters.rangeKey, filters.start, filters.end),
    [filters.rangeKey, filters.start, filters.end],
  );
  const rangeValid = filters.rangeKey !== 'custom' || !filters.start || !filters.end || filters.start <= filters.end;

  const filtersForApi = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      keyword: filters.keyword.trim() || undefined,
      status: kpiStatus(activeKpi, filters.status),
      recall_status: kpiRecall(activeKpi, filters.recall_status),
      risk_level: filters.risk_level.length ? (filters.risk_level as RiskLevel[]) : undefined,
      start: activeKpi === 'running' || activeKpi === 'pending' ? undefined : range.start,
      end: activeKpi === 'running' || activeKpi === 'pending' ? undefined : range.end,
      time_preset:
        filters.rangeKey === 'today' && activeKpi !== 'running' && activeKpi !== 'pending'
          ? ('today' as const)
          : undefined,
      leak_disposition:
        activeKpi === 'pending'
          ? ('pending_recall' as const)
          : activeKpi === 'leaks' || activeKpi === 'rate'
            ? ('has_leaks' as const)
            : undefined,
      time_basis: activeKpi === 'recalled' || activeKpi === 'failed' ? 'recall_result' as const : undefined,
      recall_outcome: activeKpi === 'recalled' ? 'succeeded' as const : activeKpi === 'failed' ? 'failed' as const : undefined,
    }),
    [filters, page, range, activeKpi],
  );

  const statsQuery = useQuery({
    queryKey: ['tr-stats', range],
    queryFn: () => getThreatRetroStats(range, apiRequest),
    enabled: rangeValid,
  });
  const stateQuery = useQuery({ queryKey: ['tr-agent-state'], queryFn: () => getAgentState(apiRequest) });
  const runsQuery = useQuery({
    queryKey: ['tr-runs', filtersForApi],
    queryFn: () => getRuns(filtersForApi, apiRequest),
    enabled: rangeValid,
  });
	const visibleRuns = useMemo(() => runsQuery.data?.items ?? [], [runsQuery.data?.items]);
	const testRunIds = useMemo(
	  () => new Set(visibleRuns.filter((run) => run.is_test).map((run) => run.run_id)),
	  [visibleRuns],
	);
	const actionableSelected = selected.filter((item) => !testRunIds.has(item.runId));

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tr-runs'] });
    qc.invalidateQueries({ queryKey: ['tr-stats'] });
    qc.invalidateQueries({ queryKey: ['tr-run-detail'] });
  }, [qc]);

  const batchRecall = useMutation({
    mutationFn: () => {
      const byRun = new Map<string, number[]>();
	  actionableSelected.forEach((s) => {
        const arr = byRun.get(s.runId) ?? [];
        arr.push(s.mailLogId);
        byRun.set(s.runId, arr);
      });
      return Promise.all(
		Array.from(byRun, ([runId, ids]) =>
		  recallLeakMails(runId, { mail_log_ids: ids }, apiRequest),
        ),
      );
    },
    onSuccess: () => {
      toast.success(t('toast.recallSuccess'));
      setSelected([]);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t('toast.recallError'))),
  });

  const toggleKpi = (k: string) => {
    setActiveKpi((p) => (p === k ? null : k));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <KpiCards
        stats={statsQuery.data}
        isLoading={statsQuery.isLoading}
        activeKpi={activeKpi}
        onToggle={toggleKpi}
      />
	  <section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
		<div className="flex items-center justify-between border-b px-4 py-3">
		  <h3 className="font-medium">{t('table.title')}</h3>
		  <Button size="sm" className="gap-1.5" data-testid="manual-scan-entry" disabled={!isAdmin || !stateQuery.data?.enabled} onClick={() => onManualScanOpenChange(true)}><Zap className="h-3.5 w-3.5" />{t('manualScan.entry')}</Button>
		</div>
		<div className="border-b px-4 py-3">
		  <RunFilters
			value={filters}
			onChange={(v) => {
			  setFilters(v);
			  setPage(1);
			}}
			onReset={() => {
			  setFilters(DEFAULT_FILTERS);
			  setActiveKpi(null);
			  setPage(1);
			}}
		  />
		</div>
		<RunsTable
		data={visibleRuns}
        total={runsQuery.data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        isLoading={runsQuery.isLoading}
        isAdmin={isAdmin}
		selected={actionableSelected}
        onSelectedChange={setSelected}
        onBatchRecall={() => batchRecall.mutate()}
        batchPending={batchRecall.isPending}
        onMutated={invalidate}
		/>
	  </section>
      <ManualScanDialog
        open={manualScanOpen}
        onOpenChange={onManualScanOpenChange}
        onScanned={invalidate}
      />
    </div>
  );
}
