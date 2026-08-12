'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';
import { ServerPagination } from '@/components/shared/server-pagination';
import { Button } from '@/components/ui/button';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import {
  getDetectionStats,
  getDetectionLogs,
  blockDetection,
  exemptDetection,
} from '@/lib/api/phishing-detection';
import { KpiCards } from '@/components/phishing-detection/kpi-cards';
import {
  DetectionLogFilters,
  type DetectionFilterState,
  type TimeRangeKey,
} from '@/components/phishing-detection/detection-log-filters';
import { DetectionLogTable } from '@/components/phishing-detection/detection-log-table';
import { DetectionDetailSheet } from '@/components/phishing-detection/detection-detail-sheet';
import { BlockDialog } from '@/components/phishing-detection/block-dialog';
import { ExemptDialog } from '@/components/phishing-detection/exempt-dialog';
import type { DetectionLogItem, Disposition, DetectionMode, RecallStatus, RiskLevel } from '@/types/phishing-detection';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const PAGE_SIZE = 20;
const LIVE_DISPOSITIONS = ['pending', 'processing', 'manual_hold'];

function toRFC3339(d: Date): string {
  return d.toISOString();
}

function computeRange(rangeKey: TimeRangeKey, customStart: string, customEnd: string): { start?: string; end?: string } {
  const now = new Date();
  if (rangeKey === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start: toRFC3339(start), end: toRFC3339(now) };
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

const DEFAULT_FILTERS: DetectionFilterState = {
  keyword: '',
  disposition: [],
  detection_mode: [],
  recall_status: [],
  risk_level: [],
  mail_status: [],
  rangeKey: 'today',
  start: '',
  end: '',
};

function isLiveDisposition(disposition: string): boolean {
  return LIVE_DISPOSITIONS.includes(disposition);
}

function isLiveStateError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const code = (err.body?.error as { code?: string } | undefined)?.code;
  return code === 'live_state_unsupported';
}

export function PhishingOverviewPage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const tpd = useTranslations('phishingDetection');
  const { apiRequest } = useApiRequest();
  const { isAdmin } = useTenant();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<DetectionFilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [exemptId, setExemptId] = useState<string | null>(null);

  const range = useMemo(
    () => computeRange(filters.rangeKey, filters.start, filters.end),
    [filters.rangeKey, filters.start, filters.end],
  );

  const filtersForApi = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      keyword: filters.keyword.trim() || undefined,
      disposition: filters.disposition.length > 0 ? (filters.disposition as Disposition[]) : undefined,
      detection_mode: filters.detection_mode.length > 0 ? (filters.detection_mode as DetectionMode[]) : undefined,
      recall_status: filters.recall_status.length > 0 ? (filters.recall_status as RecallStatus[]) : undefined,
      risk_level: filters.risk_level.length > 0 ? (filters.risk_level as RiskLevel[]) : undefined,
      // 检测日志接口目前没有独立的邮件生命周期状态查询参数，该维度目前只在
      // Mock 模式下由 mockPhishingLogMatchesQuery 按派生规则精确过滤；真实
      // 后端接口会忽略未识别的 mail_status 参数，此时该筛选不生效。
      mail_status: filters.mail_status.length > 0 ? filters.mail_status : undefined,
      start: range.start,
      end: range.end,
    }),
    [filters, page, range],
  );

  const statsQuery = useQuery({
    queryKey: ['phish-stats', range],
    queryFn: () => getDetectionStats({ start: range.start, end: range.end }, apiRequest),
  });

  const logsQuery = useQuery({
    queryKey: ['phish-logs', filtersForApi],
    queryFn: () => getDetectionLogs(filtersForApi, apiRequest),
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['phish-logs'] });
    queryClient.invalidateQueries({ queryKey: ['phish-stats'] });
  }, [queryClient]);

  const blockMutation = useMutation({
    mutationFn: (id: string) => blockDetection(id, apiRequest),
    onSuccess: (data) => {
      toast.success(data.status === 'already_blocked' ? tpd('block.alreadyBlocked') : tpd('block.success'));
      setBlockId(null);
      invalidateAll();
    },
    onError: (error) => {
      if (isLiveStateError(error)) {
        toast.error(tpd('block.liveStateError'));
        return;
      }
      toast.error(apiErrorMessage(error, tpd('block.error')));
    },
  });

  const exemptMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => exemptDetection(id, reason, apiRequest),
    onSuccess: () => {
      toast.success(tpd('exempt.success'));
      setExemptId(null);
      invalidateAll();
    },
    onError: (error) => {
      if (isLiveStateError(error)) {
        toast.error(tpd('block.liveStateError'));
        return;
      }
      toast.error(apiErrorMessage(error, tpd('exempt.error')));
    },
  });

  const handleFiltersChange = useCallback((next: DetectionFilterState) => {
    setFilters(next);
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const openDetail = useCallback((id: string) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const handleDetailOpenChange = useCallback((open: boolean) => {
    setDetailOpen(open);
    if (!open) setDetailId(null);
  }, []);

  const applyKpiFilter = useCallback((key: 'disposition' | 'recall_status', value: string[]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const handleConfirmBlock = useCallback(() => {
    if (blockId) blockMutation.mutate(blockId);
  }, [blockId, blockMutation]);

  const handleExemptSubmit = useCallback((reason: string) => {
    if (exemptId) exemptMutation.mutate({ id: exemptId, reason });
  }, [exemptId, exemptMutation]);

  const handleRowBlock = useCallback((item: DetectionLogItem) => {
    if (isLiveDisposition(item.disposition)) {
      toast.error(tpd('block.liveStateError'));
      return;
    }
    setBlockId(item.sideline_id);
  }, [tpd]);

  const handleRowExempt = useCallback((item: DetectionLogItem) => {
    if (isLiveDisposition(item.disposition)) {
      toast.error(tpd('block.liveStateError'));
      return;
    }
    setExemptId(item.sideline_id);
  }, [tpd]);

  const handleDetailBlock = useCallback((id: string) => {
    setBlockId(id);
  }, []);

  const handleDetailExempt = useCallback((id: string) => {
    setExemptId(id);
  }, []);

  return (
    <PageShell className="space-y-4">
      <KpiCards
        stats={statsQuery.data}
        isLoading={statsQuery.isLoading}
        onQuarantinedClick={() => applyKpiFilter('disposition', ['quarantine'])}
        onPendingReviewClick={() => applyKpiFilter('disposition', ['audit'])}
        onRecalledClick={() => applyKpiFilter('recall_status', ['recalled'])}
        onRecallSuccessClick={() => applyKpiFilter('recall_status', ['recalled'])}
      />

      <PageSurface className="rounded-lg p-4 shadow-none">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">{tpd('table.logTitle')}</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => { statsQuery.refetch(); logsQuery.refetch(); }}
            disabled={statsQuery.isFetching || logsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${statsQuery.isFetching || logsQuery.isFetching ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>
        <PageFilters className="mb-3 rounded-lg p-3 shadow-none">
          <DetectionLogFilters value={filters} onChange={handleFiltersChange} onReset={handleReset} />
        </PageFilters>
        <DetectionLogTable
          data={logsQuery.data?.items ?? []}
          isLoading={logsQuery.isLoading}
          truncated={logsQuery.data?.items?.some((item) => item.result_truncated) ?? false}
          isAdmin={isAdmin}
          isLiveState={isLiveDisposition}
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
      </PageSurface>

      <DetectionDetailSheet
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
        detailId={detailId}
        isAdmin={isAdmin}
        isLiveState={isLiveDisposition}
        onBlock={handleDetailBlock}
        onExempt={handleDetailExempt}
      />

      <BlockDialog
        open={!!blockId}
        onOpenChange={(open) => !open && setBlockId(null)}
        onConfirm={handleConfirmBlock}
      />

      <ExemptDialog
        open={!!exemptId}
        onOpenChange={(open) => !open && setExemptId(null)}
        onSubmit={handleExemptSubmit}
        isLoading={exemptMutation.isPending}
      />
    </PageShell>
  );
}
