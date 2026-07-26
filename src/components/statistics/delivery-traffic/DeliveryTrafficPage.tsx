'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { PageShell } from '@/components/shared/page-shell';
import { AlertCircle, ArrowUpFromLine, Clock3 } from 'lucide-react';
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

function timeRangeToDates(timeRange: TimeRange, customStart: string, customEnd: string): { startDate: string; endDate: string } {
  const now = new Date();

  switch (timeRange) {
    case 'today':
      return {
        startDate: format(startOfDay(now), 'yyyy-MM-dd'),
        endDate: format(endOfDay(now), 'yyyy-MM-dd'),
      };
    case '7d':
      return {
        startDate: format(subDays(now, 6), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
    case '30d':
      return {
        startDate: format(subDays(now, 29), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
    case 'this_month':
      return {
        startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
    case 'last_month': {
      const last = subMonths(now, 1);
      return {
        startDate: format(startOfMonth(last), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(last), 'yyyy-MM-dd'),
      };
    }
    case 'custom':
      return { startDate: customStart, endDate: customEnd };
    default:
      return {
        startDate: format(subDays(now, 6), 'yyyy-MM-dd'),
        endDate: format(now, 'yyyy-MM-dd'),
      };
  }
}

export function DeliveryTrafficPage() {
  const t = useTranslations('deliveryTraffic');
  const { can } = useAuth();
  const { selectedTenantId, effectiveTenantId, setSelectedTenant } = useTenant();
  const { scopeActive } = useSecurityScope(selectedTenantId);

  const [direction, setDirection] = useState<Direction>('all');
  const [queryDirection, setQueryDirection] = useState<Direction>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const defaultStart = format(subDays(new Date(), 6), 'yyyy-MM-dd');
  const defaultEnd = format(new Date(), 'yyyy-MM-dd');
  const [customStart, setCustomStart] = useState(defaultStart);
  const [customEnd, setCustomEnd] = useState(defaultEnd);

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryDirection(direction), 300);
    return () => window.clearTimeout(timer);
  }, [direction]);

  const { startDate, endDate } = useMemo(
    () => timeRangeToDates(timeRange, customStart, customEnd),
    [timeRange, customStart, customEnd],
  );
  const dateError = useMemo(() => {
    if (!startDate || !endDate) return t('timeRange.required');
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const today = new Date(`${format(new Date(), 'yyyy-MM-dd')}T00:00:00`);
    if (end < start) return t('timeRange.invalidOrder');
    if (end > today) return t('timeRange.noFuture');
    if ((end.getTime() - start.getTime()) / 86_400_000 > 90) return t('timeRange.over90Days');
    return '';
  }, [startDate, endDate, t]);

  const { data, isLoading, isFetching, isError } = useDeliveryTraffic({
    startDate,
    endDate,
    direction: queryDirection,
    tenantId: effectiveTenantId ?? null,
    enabled: !dateError,
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
      <header className="border-b border-gray-200 bg-card px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <ArrowUpFromLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h1 className="text-xl font-medium text-foreground">{t('title')}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <div className="space-y-6 p-6">
        <FilterBar
          direction={direction}
          onDirectionChange={setDirection}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          showTenant={scopeActive}
          tenantId={selectedTenantId}
          onTenantChange={setSelectedTenant}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          dateError={dateError}
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
