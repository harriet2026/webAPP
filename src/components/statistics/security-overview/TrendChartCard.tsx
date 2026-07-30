'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NON_SERIES_KEYS, type TrendData, type ViewBy } from '@/lib/api/security-overview';
import { seriesColor, TREND_VIEW_BY_OPTIONS } from './constants';

interface TrendChartCardProps {
  trend?: TrendData;
  isLoading: boolean;
  isHourly?: boolean;
  viewBy: ViewBy;
  onViewByChange: (v: ViewBy) => void;
  hiddenSeries: Set<string>;
  onToggleSeries: (key: string) => void;
  onPointClick?: (p: { date: string; series: string }) => void;
}

/** User-visible trend perspectives defined by the current page contract. */
export const SECURITY_OVERVIEW_VIEW_OPTIONS: ViewBy[] = [
  ...TREND_VIEW_BY_OPTIONS,
];

export function TrendChartCard({
  trend,
  isLoading,
  isHourly = false,
  viewBy,
  onViewByChange,
  hiddenSeries,
  onToggleSeries,
  onPointClick,
}: TrendChartCardProps) {
  const t = useTranslations('securityOverview');
  // action view labels share the same enum as the email-disposal search filter.
  // Reading from emailDisposal.filters.actions keeps a single i18n source of
  // truth instead of duplicating entries under securityOverview.actions.
  const tDisposal = useTranslations('emailDisposal');

  const seriesData = useMemo(() => trend?.[viewBy] ?? [], [trend, viewBy]);
  const keys = useMemo(() => {
    if (seriesData.length === 0) return [] as string[];
    // Exclude synthetic non-count keys: the delivery_result trend rows carry a
    // `success_rate` percentage that is NOT a stackable count and is not a valid
    // drill-down series (backend validates series ∈ AllDeliveryResults). Stacking
    // it distorts the area chart and clicking it would 400 the drill-down.
    return Object.keys(seriesData[0]).filter((k) => {
      if (k === 'date' || NON_SERIES_KEYS.has(k)) return false;
      // mark_deliver 不在处置中心筛选枚举中，安全总览执行动作视图同步去掉。
      if (viewBy === 'action' && k === 'mark_deliver') return false;
      return true;
    });
  }, [seriesData]);

  function seriesLabel(key: string): string {
    // action view: delegate to emailDisposal.filters.actions — single source of
    // truth shared with the email-disposal search filter enum (EXECUTION_ACTIONS).
    if (viewBy === 'action') {
      const result = tDisposal(`filters.actions.${key}` as Parameters<typeof tDisposal>[0]);
      return result.includes('.') ? key : result;
    }
    const nsMap: Record<ViewBy, string> = {
      threat_type: 'threatTypes',
      action: 'actions', // fallback — should not be reached with the guard above
      threat_level: 'threatLevels',
      delivery_result: 'deliveryResults',
      email_type: 'emailTypes',
    };
    const ns = nsMap[viewBy];
    if (!ns) return key;
    const result = t(`${ns}.${key}` as Parameters<typeof t>[0]);
    // next-intl returns the key path for missing keys instead of throwing
    return result.includes('.') ? key : result;
  }

  const echartsOption = useMemo(() => {
    if (seriesData.length === 0) return null;
    // Hourly view ("today"): show HH:mm (e.g. "08:00").
    // Daily view: show MM-DD (e.g. "07-24").
    const dateFormatter = isHourly
      ? (d: string) => (d.length >= 16 ? d.slice(11, 16) : d)
      : (d: string) => (d.length >= 10 ? d.slice(5, 10) : d);
    const dates = seriesData.map((p) => p.date);
    const visibleKeys = keys.filter((k) => !hiddenSeries.has(k));

    // Single data point: render as bar so the chart isn't just a dot.
    const isSinglePoint = seriesData.length === 1;

    // "威胁态势趋势" (email_type) and "执行动作" (action) use plain line style (no stacking, no fill).
    const isLineView = viewBy === 'email_type' || viewBy === 'action';

    const series: Record<string, unknown>[] = visibleKeys.map((key) => {
      if (isLineView && !isSinglePoint) {
        return {
          name: seriesLabel(key),
          type: 'line',
          smooth: true,
          lineStyle: { width: 2, color: seriesColor(key) },
          symbol: 'circle',
          symbolSize: 5,
          showSymbol: seriesData.length <= 14,
          itemStyle: { color: seriesColor(key) },
          data: seriesData.map((p) => (typeof p[key] === 'number' ? p[key] : 0)),
        };
      }
      return {
        name: seriesLabel(key),
        type: isSinglePoint ? 'bar' : 'line',
        stack: 'total',
        smooth: true,
        areaStyle: { opacity: 0.5, color: seriesColor(key) },
        lineStyle: { width: 1, color: seriesColor(key) },
        symbol: 'none',
        itemStyle: { color: seriesColor(key) },
        data: seriesData.map((p) => (typeof p[key] === 'number' ? p[key] : 0)),
      };
    });

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        borderRadius: 8,
        textStyle: { color: '#333', fontSize: 12 },
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } },
      },
      grid: { left: 0, right: 0, top: 12, bottom: 28, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: dates,
        axisLabel: { fontSize: 11, color: '#666666', formatter: dateFormatter },
        axisLine: { show: true, lineStyle: { color: '#E4E4E4' } },
        axisTick: { show: true, lineStyle: { color: '#E4E4E4' } },
      },
      yAxis: {
        type: 'value',
        splitNumber: 4,
        splitLine: { lineStyle: { color: '#E4E4E4', type: 'dashed' } },
        axisLine: { show: true, lineStyle: { color: '#E4E4E4' } },
        axisTick: { show: true, lineStyle: { color: '#E4E4E4' } },
        axisLabel: { fontSize: 11, color: '#666666' },
      },
      series,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesData, keys, hiddenSeries, isHourly]);

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
                    type="button"
                    onClick={() => onToggleSeries(k)}
                    onDoubleClick={() => isolateSeries(k)}
                    className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
