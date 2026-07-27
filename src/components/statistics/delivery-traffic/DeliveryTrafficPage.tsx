'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { AlertCircle, ArrowUpFromLine, Clock3, RefreshCw } from 'lucide-react';
import {
  timeRangeToDates,
  defaultCustomRange,
  type CustomRange,
} from '@/components/statistics/security-overview/date-range';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
import { Button } from '@/components/ui/button';
import { FilterBar } from './FilterBar';
import { KpiCards } from './KpiCards';
import { TrendChart } from './TrendChart';
import { SideChart } from './SideChart';
import { LatencyChart } from './LatencyChart';
import { QueueTrendChart } from './QueueTrendChart';
import { QueueHealthCard } from './QueueHealthCard';
import { DetailTable } from './DetailTable';
import { BottomActions } from './BottomActions';
import { useDeliveryTraffic } from './hooks/useDeliveryTraffic';
import type { Direction, TimeRange } from '@/lib/api/delivery-traffic';
import { inclusiveCalendarDayCount } from './date-range';

export { PageSkeleton } from './PageSkeleton';

export function DeliveryTrafficPage() {
  const t = useTranslations('deliveryTraffic');

  const [direction, setDirection] = useState<Direction>('all');
  const [queryDirection, setQueryDirection] = useState<Direction>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [customRange, setCustomRange] = useState<CustomRange>(() => defaultCustomRange());
  // This selector is a report filter, not the global platform/tenant viewer
  // switch. Keeping it local prevents platform-view cleanup from immediately
  // resetting the user's choice (GT-12457).
  const [scopeTenantId, setScopeTenantId] = useState<number | null>(null);
  const {
    resolvedScopeTenant: queryTenantId,
    scopeActive,
    scopeResolved,
  } = useSecurityScope(scopeTenantId);

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryDirection(direction), 300);
    return () => window.clearTimeout(timer);
  }, [direction]);

  const { startDate, endDate } = useMemo(
    () => timeRangeToDates(timeRange, customRange),
    [timeRange, customRange],
  );
  const dateError = useMemo(() => {
    if (!startDate || !endDate) return t('timeRange.required');
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const today = new Date(`${format(new Date(), 'yyyy-MM-dd')}T00:00:00`);
    if (end < start) return t('timeRange.invalidOrder');
    if (end > today) return t('timeRange.noFuture');
    const inclusiveDays = inclusiveCalendarDayCount(startDate, endDate);
    if (inclusiveDays != null && inclusiveDays > 90) return t('timeRange.over90Days');
    return '';
  }, [startDate, endDate, t]);

  const { data, isLoading, isFetching, isError, refetch } = useDeliveryTraffic({
    startDate,
    endDate,
    direction: queryDirection,
    tenantId: queryTenantId,
    enabled: scopeResolved && !dateError,
  });
  const transitioning = direction !== queryDirection;
  const showLoading = isLoading || isFetching || transitioning;
  // A failed refresh must not leave stale statistics looking current.
  const visibleData = transitioning || isError ? undefined : data;
  const dataLagSeconds = visibleData?.data_lag_seconds ?? 0;

  return (
    <PageShell
      className="min-h-full space-y-0 bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]"
      data-testid="delivery-traffic-page"
    >
      <PageHeader
        icon={ArrowUpFromLine}
        title={t('title')}
        description={t('subtitle')}
      />

      <div className="space-y-6">
        <FilterBar
          direction={direction}
          onDirectionChange={setDirection}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          showTenant={scopeActive}
          tenantId={scopeTenantId}
          onTenantChange={setScopeTenantId}
        />

        {dataLagSeconds > 3600 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300" role="status">
            <Clock3 className="h-4 w-4" />
            {t('dataLagHours', { hours: Math.max(1, Math.floor(dataLagSeconds / 3600)) })}
          </div>
        )}
        {isError && !showLoading && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {t('loadFailed')}
            </span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" />
              {t('retry')}
            </Button>
          </div>
        )}

        <KpiCards data={visibleData?.kpi} direction={direction} isLoading={showLoading} />

        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3" data-testid="delivery-main-analysis">
          <div className="min-w-0 lg:col-span-2">
            <TrendChart
              trend={visibleData?.trend}
              direction={direction}
              isLoading={showLoading}
            />
          </div>
          <SideChart
            distribution={visibleData?.distribution}
            direction={direction}
            isLoading={showLoading}
          />
        </div>

        {direction === 'send' && (
          <div className="grid gap-6 lg:grid-cols-2" data-testid="delivery-send-extended">
            <LatencyChart latency={visibleData?.latency} direction={direction} isLoading={showLoading} />
            <QueueTrendChart points={visibleData?.queue_trend} isLoading={showLoading} />
          </div>
        )}

        {direction === 'internal' && (
          <div className="grid gap-6" data-testid="delivery-internal-extended">
            <LatencyChart latency={visibleData?.latency} direction={direction} isLoading={showLoading} />
          </div>
        )}

        <QueueHealthCard
          queueHealth={visibleData?.queue_health}
          direction={direction}
          isLoading={showLoading}
        />

        <DetailTable
          data={visibleData?.detail_table}
          direction={direction}
          isLoading={showLoading}
        />

        <BottomActions
          startDate={startDate}
          endDate={endDate}
          direction={direction}
          tenantId={queryTenantId}
          disabled={Boolean(dateError)}
        />
      </div>
    </PageShell>
  );
}
