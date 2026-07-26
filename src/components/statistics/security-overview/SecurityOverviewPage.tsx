'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Shield } from 'lucide-react';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { FilterBar } from './FilterBar';
import { KpiCards } from './KpiCards';
import { TrendChartCard } from './TrendChartCard';
import { GeoDistributionCard } from './GeoDistributionCard';
import { TimeDistributionCard } from './TimeDistributionCard';
import { DetailTable } from './DetailTable';
import { BottomActions } from './BottomActions';
import { DrillDownCard } from './DrillDownCard';
import { EscapesAlert } from './EscapesAlert';
import { TenantScopeSelector } from './TenantScopeSelector';
import { useSecurityScope } from './hooks/useSecurityScope';
import { useSecurityOverview } from './hooks/useSecurityOverview';
import { timeRangeToDates, defaultCustomRange, type CustomRange } from './date-range';
import { getTenant } from '@/lib/api/tenants';
import type { Direction, TimeRange, ViewBy } from '@/lib/api/security-overview';

export function SecurityOverviewPage() {
  const t = useTranslations('securityOverview');

  const [direction, setDirection] = useState<Direction>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  // Only ever holds a VALIDATED range — FilterBar keeps the in-progress draft and
  // does not propagate until validateCustomRange passes, so the query below can
  // never fire with a half-typed or illegal interval.
  const [customRange, setCustomRange] = useState<CustomRange>(() => defaultCustomRange());
  const [comparePrevious, setComparePrevious] = useState(false);
  // PRD v3: the first tab is the unified 11-category mail taxonomy.  The
  // backend exposes that bucket as `email_type`; `threat_type` is the older
  // detection taxonomy and must not be presented as "邮件类型".
  const [viewBy, setViewBy] = useState<ViewBy>('email_type');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set(['normal']));
  const [isViewSwitching, setIsViewSwitching] = useState(false);
  const viewSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scopeTenantId, setScopeTenantId] = useState<number | null>(null);
  const [drillPoint, setDrillPoint] = useState<{ date: string; series: string } | null>(null);
  const { scopeActive } = useSecurityScope(scopeTenantId);

  const handleViewByChange = (v: ViewBy) => {
    if (v === viewBy) return;
    if (viewSwitchTimer.current) clearTimeout(viewSwitchTimer.current);
    setIsViewSwitching(true);
    setViewBy(v);
    setDrillPoint(null);
    setHiddenSeries(v === 'email_type' ? new Set(['normal']) : new Set());
    viewSwitchTimer.current = setTimeout(() => {
      setIsViewSwitching(false);
      viewSwitchTimer.current = null;
    }, 300);
  };

  useEffect(() => () => {
    if (viewSwitchTimer.current) clearTimeout(viewSwitchTimer.current);
  }, []);

  const handleDirectionChange = useCallback((v: Direction) => { setDirection(v); setDrillPoint(null); }, []);
  const handleTimeRangeChange = useCallback((v: TimeRange) => { setTimeRange(v); setDrillPoint(null); }, []);
  const handleCustomRangeChange = useCallback((v: CustomRange) => { setCustomRange(v); setDrillPoint(null); }, []);
  const handleScopeTenantChange = useCallback((v: number | null) => { setScopeTenantId(v); setDrillPoint(null); }, []);

  // spec §4.1: validate a selected tenant via GET /tenants/:id; on 404/suspended
  // fall back to all tenants. Independent of the active-only dropdown list.
  useEffect(() => {
    if (scopeTenantId === null) return;
    let alive = true;
    getTenant(scopeTenantId)
      .then((tn) => { if (alive && (tn.status !== 'active' || tn.expired === true)) handleScopeTenantChange(null); })
      .catch(() => { if (alive) handleScopeTenantChange(null); });
    return () => { alive = false; };
  }, [scopeTenantId, handleScopeTenantChange]);

  const { startDate, endDate } = useMemo(
    () => timeRangeToDates(timeRange, customRange),
    [timeRange, customRange],
  );

  // When the user selects "today", request hourly granularity so the trend
  // chart shows 0–23 h instead of a single daily data point.
  const interval = timeRange === 'today' ? 'hour' as const : undefined;

  const { data, isLoading } = useSecurityOverview({
    startDate,
    endDate,
    direction,
    comparePreviousPeriod: comparePrevious,
    scopeTenantId,
    interval,
  });

  const toggleSeries = (key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <PageShell
      className="min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]"
      data-testid="security-overview-page"
    >
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={Shield}
      />

      <FilterBar
        direction={direction}
        onDirectionChange={handleDirectionChange}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
        customRange={customRange}
        onCustomRangeChange={handleCustomRangeChange}
        comparePrevious={comparePrevious}
        onComparePreviousChange={setComparePrevious}
        leftSlot={scopeActive ? <TenantScopeSelector value={scopeTenantId} onChange={handleScopeTenantChange} /> : null}
      />

      <KpiCards data={data?.kpi} isLoading={isLoading} />

      <div className="grid gap-6 lg:grid-cols-2">
        <GeoDistributionCard
          startDate={startDate}
          endDate={endDate}
          direction={direction}
          scopeTenantId={scopeTenantId}
        />
        <TimeDistributionCard
          startDate={startDate}
          endDate={endDate}
          direction={direction}
          scopeTenantId={scopeTenantId}
        />
      </div>

      <TrendChartCard
        trend={data?.trend}
        trendPrevious={data?.trend_previous_period}
        isLoading={isLoading}
        isHourly={interval === 'hour'}
        viewBy={viewBy}
        onViewByChange={handleViewByChange}
        hiddenSeries={hiddenSeries}
        onToggleSeries={toggleSeries}
        onPointClick={(p) => setDrillPoint(p)}
      />

      {drillPoint && (
        <DrillDownCard
          point={drillPoint}
          viewBy={viewBy}
          direction={direction}
          scopeTenantId={scopeTenantId}
          onClose={() => setDrillPoint(null)}
        />
      )}

      <EscapesAlert
        startDate={startDate}
        endDate={endDate}
        direction={direction}
        scopeTenantId={scopeTenantId}
      />

      <DetailTable
        key={viewBy}
        data={data?.detail_table}
        isLoading={isLoading || isViewSwitching}
        viewBy={viewBy}
      />

      <BottomActions
        startDate={startDate}
        endDate={endDate}
        direction={direction}
        scopeTenantId={scopeTenantId}
      />
    </PageShell>
  );
}
