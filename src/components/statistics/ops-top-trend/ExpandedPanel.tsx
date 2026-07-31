'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ChevronUp, FileText, RefreshCw, Search, TrendingUp } from 'lucide-react';
import {
  DIMENSION_CONFIG,
  DRILL_DOWN_CONFIG,
  SUB_DIM_LABELS,
  type DimensionType,
  type DrillSubDimType,
} from './columns';
import { useOpsTopDrilldown } from './hooks/useOpsTopDrilldown';
import type {
  OpsDirection,
  OpsTimeRange,
  OpsTopRow,
} from '@/lib/api/ops-top';

interface ExpandedPanelProps {
  dimension: DimensionType;
  row: OpsTopRow;
  direction: OpsDirection;
  timeRange: OpsTimeRange;
  subDim: DrillSubDimType;
  onSubDimChange: (sub: DrillSubDimType) => void;
  onCollapse?: () => void;
  trendLabels?: string[];
}

function deriveDayLabels(): string[] {
  const today = new Date();
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return days;
}

const FALLBACK_LABELS = deriveDayLabels();

export function ExpandedPanel({
  dimension,
  row,
  direction,
  timeRange,
  subDim,
  onSubDimChange,
  onCollapse,
  trendLabels,
}: ExpandedPanelProps) {
  const t = useTranslations('opsTopTrend');
  const config = DIMENSION_CONFIG[dimension];
  const drillConfig = DRILL_DOWN_CONFIG[dimension];
  const color = config.color;
  const yAxisLabel = t(config.yAxisLabel as Parameters<typeof t>[0]);
  const itemName = String(row.name ?? '');
  const displayName = itemName;

  const dayLabels = trendLabels ?? FALLBACK_LABELS;

  const trendData = useMemo(() => {
    const src = row.trend && row.trend.length > 0 ? row.trend.slice(0, 7) : [];
    if (src.length === 0) return [] as number[];
    while (src.length < 7) src.push(src[src.length - 1] ?? 0);
    return src;
  }, [row.trend]);

  const trendOption = useMemo(() => {
    if (trendData.length === 0) return null;
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 48, right: 16, top: 16, bottom: 32 },
      xAxis: {
        type: 'category' as const,
        data: dayLabels,
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        name: yAxisLabel,
        nameTextStyle: { fontSize: 11, color: '#6b7280' },
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: 'line',
          data: trendData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.12 },
        },
      ],
    };
  }, [trendData, dayLabels, yAxisLabel, color]);

  const drilldown = useOpsTopDrilldown({
    dimension,
    subDim,
    key: row.key,
    account: dimension === 'auth' ? row.name : undefined,
    direction,
    timeRange,
    enabled: true,
  });

  const drillItems = useMemo(
    () => drilldown.data?.items ?? [],
    [drilldown.data?.items],
  );

  // Threat-distribution sub-dims return raw kind enums (phishing, high_risk_spam,
  // …) which have i18n keys; other sub-dims return free text (emails, subjects,
  // failure reasons) shown verbatim.
  const isThreatDistrib =
    subDim === 'threatTypeDistrib' || subDim === 'attackTypeDistrib';
  const drillLabel = (name: string) =>
    isThreatDistrib ? t(name as Parameters<typeof t>[0]) : name;

  const drillOption = useMemo(() => {
    if (drillItems.length === 0) return null;
    // Store full names in y-axis data; axisLabel.formatter truncates for display only.
    // ECharts tooltip then receives the full name via {b} (category name).
    const drillFullNames = drillItems.map((d) => drillLabel(d.name));
    return {
      tooltip: {
        // 'item' trigger: {b} is the y-axis category value (full name),
        // {c} is the data value. This is more reliable than 'axis' where
        // {b} is the series name instead of the category.
        trigger: 'item' as const,
        formatter: (params: { name: string; value: number }) =>
          `${params.name}<br/><strong>${params.value.toLocaleString()}</strong>`,
      },
      grid: { left: 100, right: 24, top: 8, bottom: 32 },
      xAxis: { type: 'value' as const, axisLabel: { fontSize: 10 } },
      yAxis: {
        type: 'category' as const,
        // Full names in data so tooltip params.name gets the untruncated string.
        data: drillFullNames,
        axisLabel: {
          fontSize: 10,
          // Visually truncate axis labels for readability; tooltip shows full value.
          formatter: (val: string) =>
            val.length > 14 ? `${val.slice(0, 14)}\u2026` : val,
        },
      },
      series: [
        {
          type: 'bar',
          data: drillItems.map((d, i) => ({
            value: d.value,
            itemStyle: {
              color: '#722ED1',
              opacity: Math.max(0.2, 0.8 - i * 0.1),
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 18,
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillItems, isThreatDistrib, t]);

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        backgroundColor: '#F8FAFC',
        borderLeft: `3px solid ${color}`,
        borderTop: '1px solid #E8ECF0',
      }}
    >
      <div className="flex justify-end px-4 pt-2">
        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          {t('collapsePanel')}
          <ChevronUp className="h-3 w-3" />
        </button>
      </div>
      <div className="flex h-[380px] flex-col gap-4 px-4 pb-4 xl:flex-row">
        <div className="flex h-full min-h-0 w-full flex-col xl:w-[60%]">
          <h3 className="mb-2 flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
            <TrendingUp className="h-4 w-4 shrink-0" style={{ color }} />
            <span
              className="truncate"
              title={t('trendAnalysisTitle', { item: displayName })}
            >
              {t('trendAnalysisTitle', { item: displayName })}
            </span>
          </h3>
          <div className="min-h-0 flex-1 rounded-lg bg-background p-3 shadow-sm">
            {trendOption ? (
              <ReactECharts notMerge option={trendOption} style={{ height: 280 }} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Search className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">{t('noTrendData')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex h-full min-h-0 w-full flex-col xl:w-[40%]">
          <h3 className="mb-2 flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 shrink-0 text-purple-600" />
            <span
              className="truncate"
              title={t('drillTitleGeneric', {
                item: displayName,
                dim: t(config.labelKey as Parameters<typeof t>[0]),
              })}
            >
              {t('drillTitleGeneric', {
                item: displayName,
                dim: t(config.labelKey as Parameters<typeof t>[0]),
              })}
            </span>
            {/* Parent row counts sessions; sub-dims count messages (spec §8.3).
                Calling this out at the drilldown title avoids the silent
                unit-mismatch surprise. */}
            {dimension === 'connection' ? (
              <span
                className="shrink-0 text-xs font-normal text-muted-foreground"
                title={t('connDrilldownUnitTip')}
              >
                <AlertCircle className="inline h-3 w-3 align-text-bottom" />
              </span>
            ) : null}
          </h3>
          <div className="mb-2 flex flex-wrap gap-1">
            {drillConfig.subDims.map((sd) => (
              <button
                key={sd}
                type="button"
                onClick={() => onSubDimChange(sd)}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  subDim === sd
                    ? 'bg-purple-600 text-white'
                    : 'border border-border/70 bg-background text-muted-foreground hover:bg-purple-50'
                }`}
              >
                {t(SUB_DIM_LABELS[sd] as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-background p-3 shadow-sm">
            {drilldown.isLoading ? (
              <Skeleton className="h-[260px] w-full rounded-lg" />
            ) : drilldown.isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 opacity-40 text-destructive" />
                <p className="text-sm">{t('drilldownError')}</p>
                <button
                  type="button"
                  onClick={() => drilldown.refetch()}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs border border-border/70 hover:bg-muted transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t('retry')}
                </button>
              </div>
            ) : drillOption ? (
              <ReactECharts
                notMerge
                option={drillOption}
                style={{ height: Math.max(drillItems.length * 32, 160) }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <Search className="mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">{t(drillConfig.emptyKey as Parameters<typeof t>[0])}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
