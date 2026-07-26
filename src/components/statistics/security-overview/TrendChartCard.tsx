'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SmartSummaryBadge } from '@/components/shared/smart-summary-badge';
import { NON_SERIES_KEYS, type TrendData, type ViewBy, type TrendSeriesPoint } from '@/lib/api/security-overview';
import { seriesColor } from './constants';

interface TrendChartCardProps {
  trend?: TrendData;
  trendPrevious?: TrendData | null;
  isLoading: boolean;
  viewBy: ViewBy;
  onViewByChange: (v: ViewBy) => void;
  hiddenSeries: Set<string>;
  onToggleSeries: (key: string) => void;
  onPointClick?: (p: { date: string; series: string }) => void;
}

/** User-visible trend perspectives defined by the current page contract. */
export const SECURITY_OVERVIEW_VIEW_OPTIONS: ViewBy[] = [
  'email_type',
  'action',
];

export function TrendChartCard({
  trend,
  trendPrevious,
  isLoading,
  viewBy,
  onViewByChange,
  hiddenSeries,
  onToggleSeries,
  onPointClick,
}: TrendChartCardProps) {
  const t = useTranslations('securityOverview');

  const seriesData = useMemo(() => trend?.[viewBy] ?? [], [trend, viewBy]);
  const keys = useMemo(() => {
    if (seriesData.length === 0) return [] as string[];
    // Exclude synthetic non-count keys: the delivery_result trend rows carry a
    // `success_rate` percentage that is NOT a stackable count and is not a valid
    // drill-down series (backend validates series ∈ AllDeliveryResults). Stacking
    // it distorts the area chart and clicking it would 400 the drill-down.
    return Object.keys(seriesData[0]).filter((k) => k !== 'date' && !NON_SERIES_KEYS.has(k));
  }, [seriesData]);

  function seriesLabel(key: string): string {
    const nsMap: Record<ViewBy, string> = {
      threat_type: 'threatTypes',
      action: 'actions',
      delivery_result: 'deliveryResults',
      email_type: 'emailTypes',
    };
    const ns = nsMap[viewBy];
    if (!ns) return key;
    const result = t(`${ns}.${key}` as Parameters<typeof t>[0]);
    // next-intl returns the key path for missing keys instead of throwing
    return result.includes('.') ? key : result;
  }

  const prevData = trendPrevious?.[viewBy] ?? [];

  const echartsOption = useMemo(() => {
    if (seriesData.length === 0) return null;
    // Show only MM-DD on the axis (avoid wide YYYY-MM-DD labels that overlap).
    const mmdd = (d: string) => (d.length >= 10 ? d.slice(5) : d);
    const dates = seriesData.map((p) => p.date);
    const visibleKeys = keys.filter((k) => !hiddenSeries.has(k));
    const sumVisible = (p: TrendSeriesPoint) =>
      visibleKeys.reduce((s, k) => s + (typeof p[k] === 'number' ? (p[k] as number) : 0), 0);

    const series: Record<string, unknown>[] = visibleKeys.map((key) => ({
      name: seriesLabel(key),
      type: 'line',
      stack: 'total',
      smooth: true,
      areaStyle: { opacity: 0.35, color: seriesColor(key) },
      lineStyle: { width: 2.5, color: seriesColor(key) },
      symbol: 'circle',
      symbolSize: 5,
      itemStyle: { color: seriesColor(key) },
      data: seriesData.map((p) => (typeof p[key] === 'number' ? p[key] : 0)),
    }));

    // Previous-period comparison overlay (when "compare" is enabled and data
    // is present): a dashed total line aligned by index to the current period.
    if (prevData.length > 0) {
      series.push({
        name: t('filter.comparePrevious'),
        type: 'line',
        smooth: true,
        symbol: 'none',
        z: 1,
        lineStyle: { width: 2, type: 'dashed', color: '#9ca3af' },
        itemStyle: { color: '#9ca3af' },
        data: prevData.map((p) => sumVisible(p)),
      });
    }

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } },
      },
      grid: { left: 0, right: 0, top: 12, bottom: 28, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLabel: { fontSize: 11, color: '#9ca3af', formatter: mmdd },
        axisLine: { lineStyle: { color: '#E4E4E4' } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E4E4', type: 'dashed' } },
        axisLabel: { fontSize: 11, color: '#9ca3af' },
      },
      series,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesData, keys, hiddenSeries, prevData]);

  const isolateSeries = (key: string) => {
    // If only this key is visible (all others hidden), show all
    const otherKeys = keys.filter((k) => k !== key);
    const allOthersHidden = otherKeys.every((k) => hiddenSeries.has(k));
    if (allOthersHidden && !hiddenSeries.has(key)) {
      // Reset: show all
      otherKeys.forEach((k) => onToggleSeries(k));
    } else {
      // Hide all except this key
      otherKeys.forEach((k) => { if (!hiddenSeries.has(k)) onToggleSeries(k); });
      if (hiddenSeries.has(key)) onToggleSeries(key);
    }
  };

  return (
    <Card className="col-span-full overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <div className="text-xs font-medium text-body">
            {t(`viewBy.${viewBy}` as Parameters<typeof t>[0])}
          </div>
          <CardTitle>{t('trendCardTitle')}</CardTitle>
          <SmartSummaryBadge className="mt-2">
            {t('trendPeakHint')}
          </SmartSummaryBadge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={viewBy} onValueChange={(v) => onViewByChange(v as ViewBy)}>
          <TabsList className="mb-4">
            {SECURITY_OVERVIEW_VIEW_OPTIONS.map((v) => (
              <TabsTrigger key={v} value={v}>
                {t(`viewBy.${v}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-[300px] w-full rounded-lg" />
          </div>
        ) : (
          <>
            {echartsOption ? (
              <ReactECharts
                option={echartsOption}
                style={{ height: 300, width: '100%' }}
                notMerge
                onEvents={{
                  click: (params: { componentType?: string; seriesName?: string; name?: string }) => {
                    if (onPointClick && params.componentType === 'series' && params.name) {
                      // ECharts names each series by its label (seriesLabel);
                      // reverse-resolve the key so the drill-down receives the
                      // raw series id the backend validates against.
                      const key = keys.find((k) => seriesLabel(k) === params.seriesName) ?? params.seriesName!;
                      onPointClick({ date: params.name, series: key });
                    }
                  },
                }}
              />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                {t('noData') as string}
              </div>
            )}

            {keys.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-3 border border-border rounded-xl bg-card px-4 py-3">
                {keys.map((k) => (
                  <button
                    key={k}
                    onClick={() => onToggleSeries(k)}
                    onDoubleClick={() => isolateSeries(k)}
                    className="flex items-center gap-1.5 text-xs transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: hiddenSeries.has(k)
                          ? 'var(--muted-foreground)'
                          : seriesColor(k),
                      }}
                    />
                    <span
                      className={
                        hiddenSeries.has(k)
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground'
                      }
                    >
                      {seriesLabel(k)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* GT-11982 / GT-11933: 正常邮件在威胁类型视图下默认隐藏
                （SecurityOverviewPage 的 hiddenSeries 初值就是 new Set(['normal'])），
                但页面从没解释过为什么 —— shipped 的 trendPeakHint 讲的是"单击/双击
                图例"的交互，答的不是"正常邮件为什么不见了"这个问题。补上原型要求的
                说明，只在威胁类型视图下出现（其他视图没有 normal 序列）。 */}
            {viewBy === 'email_type' && keys.length > 0 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {t('normalHiddenHint')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
