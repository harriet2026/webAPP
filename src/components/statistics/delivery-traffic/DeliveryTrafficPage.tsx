'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { PageShell, PageHeader } from '@/components/shared/page-shell';
import { AlertCircle, ArrowUpFromLine, Clock3 } from 'lucide-react';
import {
  timeRangeToDates,
  defaultCustomRange,
  type CustomRange,
} from '@/components/statistics/security-overview/date-range';
import { useAuth } from '@/contexts/auth-context';
import { useTenant } from '@/hooks/use-tenant';
import { useSecurityScope } from '@/components/statistics/security-overview/hooks/useSecurityScope';
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

export { PageSkeleton } from './PageSkeleton';

export function DeliveryTrafficPage() {
  const t = useTranslations('deliveryTraffic');
  const { can } = useAuth();
  const { selectedTenantId, effectiveTenantId, setSelectedTenant } = useTenant();
  const { scopeActive } = useSecurityScope(selectedTenantId);

  const [direction, setDirection] = useState<Direction>('all');
  const [queryDirection, setQueryDirection] = useState<Direction>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [customRange, setCustomRange] = useState<CustomRange>(defaultCustomRange);

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryDirection(direction), 300);
    return () => window.clearTimeout(timer);
  }, [direction]);

  const { startDate, endDate } = useMemo(
    () => timeRangeToDates(timeRange, customRange),
    [timeRange, customRange],
  );

  const { data, isLoading, isFetching, isError } = useDeliveryTraffic({
    startDate,
    endDate,
    direction: queryDirection,
    tenantId: effectiveTenantId ?? null,
  });
  const transitioning = direction !== queryDirection;
  const showLoading = isLoading || isFetching || transitioning;
  const visibleData = transitioning ? undefined : data;
  const canEdit = can('delivery-traffic-analysis', 'edit');
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
          tenantId={selectedTenantId}
          onTenantChange={setSelectedTenant}
        />

        {dataLagSeconds > 3600 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300" role="status">
            <Clock3 className="h-4 w-4" />
            {t('dataLagHours', { hours: Math.max(1, Math.floor(dataLagSeconds / 3600)) })}
          </div>
        )}
        {isError && !showLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4" />
            {t('loadFailed')}
          </div>
        )}

        <KpiCards data={visibleData?.kpi} direction={direction} isLoading={showLoading} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="delivery-main-analysis">
          <div className="lg:col-span-2">
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
          tenantId={effectiveTenantId ?? null}
          disabled={!canEdit}
        />
      </div>
    </PageShell>
  );
}
