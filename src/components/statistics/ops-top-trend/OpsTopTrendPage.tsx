'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { FilterBar } from './FilterBar';
import { DimensionTabs } from './DimensionTabs';
import { TopTable } from './TopTable';
import { ExpandedPanel } from './ExpandedPanel';
import { BottomActions } from './BottomActions';
import { PageSkeleton } from './PageSkeleton';
import { useOpsTop } from './hooks/useOpsTop';
import { computeIsPlatformScope, effectiveDimension } from './scope';
import { DIMENSION_CONFIG, DRILL_DOWN_CONFIG, type DimensionType, type DrillSubDimType } from './columns';
import type {
  OpsDirection,
  OpsTimeRange,
  OpsTopCount,
  OpsTopRow,
} from '@/lib/api/ops-top';

export { PageSkeleton };

export default function OpsTopTrendPage() {
  const t = useTranslations('opsTopTrend');
  const { isSystemAdmin, selectedTenantId } = useAuth();
  const isPlatformScope = computeIsPlatformScope(isSystemAdmin, selectedTenantId);

  const [requestedDimension, setRequestedDimension] = useState<DimensionType>('connection');
  // Derived, not effect-corrected: a tenant-scoped viewer must never get as far
  // as issuing the 403-bound `dimension=connection` request (spec §5.2).
  const dimension = effectiveDimension(requestedDimension, isPlatformScope);
  const [direction, setDirection] = useState<OpsDirection>('all');
  const [timeRange, setTimeRange] = useState<OpsTimeRange>('7d');
  const [topCount, setTopCount] = useState<OpsTopCount>('10');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [subDim, setSubDim] = useState<DrillSubDimType>(
    DRILL_DOWN_CONFIG.connection.subDims[0],
  );
  const [isAnimating, setIsAnimating] = useState(false);

  const { data, isLoading, isError, refetch } = useOpsTop({
    dimension,
    direction,
    timeRange,
    top: topCount,
  });

  const handleDimensionChange = (dim: DimensionType) => {
    setRequestedDimension(dim);
    setExpandedKey(null);
    setSubDim(DRILL_DOWN_CONFIG[dim].subDims[0]);
  };

  const handleToggleRow = (key: string) => {
    if (isAnimating) return;
    if (expandedKey === key) {
      setIsAnimating(true);
      setExpandedKey(null);
      window.setTimeout(() => setIsAnimating(false), 250);
      return;
    }
    setIsAnimating(true);
    setExpandedKey(key);
    if (!DRILL_DOWN_CONFIG[dimension].subDims.includes(subDim)) {
      setSubDim(DRILL_DOWN_CONFIG[dimension].subDims[0]);
    }
    window.setTimeout(() => setIsAnimating(false), 300);
  };

  const handleCollapse = () => {
    setIsAnimating(true);
    setExpandedKey(null);
    window.setTimeout(() => setIsAnimating(false), 250);
  };

  const trendLabels = data?.trendLabels;

  const expandedContent = useCallback(
    (row: OpsTopRow): ReactNode => (
      <ExpandedPanel
        dimension={dimension}
        row={row}
        direction={direction}
        timeRange={timeRange}
        subDim={subDim}
        onSubDimChange={setSubDim}
        onCollapse={handleCollapse}
        trendLabels={trendLabels}
      />
    ),
    [dimension, direction, timeRange, subDim, trendLabels],
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const params = { dimension, direction, timeRange, top: topCount };
  const DimensionIcon = DIMENSION_CONFIG[dimension].icon;

  return (
    <>
      <div className="block md:hidden">
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 text-center dark:border-yellow-900 dark:bg-yellow-900/20">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            {t('useWideScreen')}
          </p>
        </div>
      </div>

      <div
        className="-m-8 hidden min-h-[calc(100vh-3.5rem)] p-8 md:block"
        style={{ backgroundColor: 'color-mix(in oklab, var(--card) 50%, var(--muted))' }}
      >
        <PageShell className="relative -top-px ml-4 space-y-0">
          <PageHeader
            title={(
              <span className="flex items-center gap-2 font-medium tracking-normal">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span>{t('title')}</span>
              </span>
            )}
            description={<span className="text-sm leading-5">{t('subtitle')}</span>}
            className="mx-0 mt-0 mb-0 px-6 py-4"
          />

          <div className="space-y-6 p-6">
            <FilterBar
              dimension={dimension}
              direction={direction}
              onDirectionChange={setDirection}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
              topCount={topCount}
              onTopCountChange={setTopCount}
            />

            <DimensionTabs
              dimension={dimension}
              onSelect={handleDimensionChange}
              isPlatformScope={isPlatformScope}
            />

            {isLoading ? (
              <PageSkeleton />
            ) : isError ? (
              <PageSkeleton isError onRetry={() => refetch()} />
            ) : (
              <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-card py-6 shadow-sm">
                <div className="px-6 pb-2">
                  <div className="flex items-center gap-2 text-base font-semibold leading-none">
                    <DimensionIcon className="h-4 w-4" />
                    <span>{t(DIMENSION_CONFIG[dimension].labelKey)} TOP {topCount}</span>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {t('clickRowToExpand')}
                    </span>
                  </div>
                </div>
                <div className="px-6">
                  <TopTable
                    dimension={dimension}
                    rows={rows}
                    total={total}
                    expandedKey={expandedKey}
                    onToggleRow={handleToggleRow}
                    expandedContent={expandedContent}
                  />
                </div>
              </div>
            )}

            <BottomActions params={params} />
          </div>
        </PageShell>
      </div>
    </>
  );
}
