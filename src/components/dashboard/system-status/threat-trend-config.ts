// System-status 威胁态势趋势 series config. It uses the same 11-category
// `email_type` taxonomy as the security-overview trend so the dashboard and
// detail page describe the same posture. Multiple buckets render as stacked
// areas; one bucket renders as a stacked bar.
import type { TrendSeriesPoint } from '@/lib/api/security-overview';

/** i18n label key under `systemStatus.trend.series.*`. */
export interface ThreatSeriesDef {
  /** key in the security-overview email_type trend point + i18n label key. */
  key: string;
  /** hex color (domain threat palette). */
  color: string;
}

// Stacked display order: email_type dimension (11 classes), aligned to
// security-overview TrendChartCard email_type tab. Colors from
// constants.ts SERIES_COLORS.
export const THREAT_TREND_SERIES: ThreatSeriesDef[] = [
  { key: 'normal',             color: '#9CA3AF' },
  { key: 'subscription',       color: '#06B6D4' },
  { key: 'advertising',        color: '#8B5CF6' },
  { key: 'spam',               color: '#3B82F6' },
  { key: 'harmful',            color: '#F97316' },
  { key: 'suspicious',         color: '#EAB308' },
  { key: 'sensitive',          color: '#EC4899' },
  { key: 'spoofing',           color: '#F59E0B' },
  { key: 'phishing',           color: '#EF4444' },
  { key: 'virus',              color: '#7C3AED' },
  { key: 'account_compromised',color: '#B91C1C' },
];

function countAt(point: TrendSeriesPoint, key: string): number {
  const value = point[key];
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

/**
 * Hour-granularity API buckets use `YYYY-MM-DD HH:00:00`. The dashboard's
 * "today" view only needs the hour on its category axis/tooltip; daily
 * buckets remain unchanged for the 7d/30d views.
 */
export function formatThreatTrendBucket(value: string): string {
  const match = value.match(/[ T](\d{2}):(\d{2})(?::\d{2})?$/);
  return match ? `${match[1]}:${match[2]}` : value;
}

/**
 * Build the ECharts option for the dashboard threat trend.
 *
 * A line/area series needs at least two x-axis buckets to draw a segment.
 * A sparse day can contain only one non-zero hourly bucket, so using
 * `symbol: 'none'` there produces a completely blank plot even when the bucket
 * has non-zero counts. Render that single bucket as a stacked bar; ranges with
 * two or more buckets keep the existing stacked-area chart.
 */
export function buildThreatTrendOption(
  points: TrendSeriesPoint[],
  hidden: ReadonlySet<string>,
  seriesLabel: (key: string) => string,
) {
  if (points.length === 0) return null;

  const singleBucket = points.length === 1;
  const axisLabelInterval = points.length > 12 ? Math.ceil(points.length / 12) - 1 : 0;
  const visible = THREAT_TREND_SERIES.filter((series) => !hidden.has(series.key));
  const series = visible.map((item) => {
    const common = {
      name: seriesLabel(item.key),
      stack: 'total',
      itemStyle: { color: item.color },
      data: points.map((point) => countAt(point, item.key)),
    };

    if (singleBucket) {
      return {
        ...common,
        type: 'bar',
        barMaxWidth: 72,
        emphasis: { focus: 'series' },
      };
    }

    return {
      ...common,
      type: 'line',
      smooth: true,
      symbol: 'none',
      areaStyle: { opacity: 0.5, color: item.color },
      lineStyle: { width: 1, color: item.color },
    };
  });

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#FFFFFF',
      borderColor: '#E5E7EB',
      borderWidth: 1,
      borderRadius: 6,
      padding: 10,
      textStyle: { color: '#121212', fontSize: 12 },
      extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.1);',
    },
    // Recharts reserves a fixed 60px Y-axis gutter in the demo. With ECharts'
    // containLabel calculation, a 35px left inset produces the same plot
    // origin. The 24px top inset keeps the highest Y-axis label fully inside
    // the chart canvas instead of letting it protrude into the legend row.
    // GT-12570：right 不能为 0——折线/面积模式 boundaryGap=false 时最后一个
    // 类目标签以最右侧数据点为中心渲染，右半截会被画布裁掉（"横坐标最后
    // 时刻显示不全"）；containLabel 只扩展轴自身占位，不给越界的边缘标签
    // 留白。26px ≈ "HH:mm" 标签宽度的一半 + 2px 余量。
    grid: { left: 35, right: 26, top: 24, bottom: 0, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: singleBucket,
      data: points.map((point) => formatThreatTrendBucket(point.date)),
      axisLabel: { interval: axisLabelInterval, fontSize: 12, color: '#666666' },
      axisLine: { show: true, lineStyle: { color: '#666666' } },
      axisTick: { show: true, lineStyle: { color: '#666666' } },
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      splitLine: { show: true, lineStyle: { color: '#F0F0F0', type: 'dashed' } },
      axisLabel: { fontSize: 12, color: '#666666' },
      axisLine: { show: true, lineStyle: { color: '#666666' } },
      axisTick: { show: true, lineStyle: { color: '#666666' } },
    },
    series,
    media: [
      {
        query: { maxWidth: 560 },
        option: { xAxis: { axisLabel: { interval: Math.max(axisLabelInterval, 3) } } },
      },
      {
        query: { maxWidth: 400 },
        option: { xAxis: { axisLabel: { interval: Math.max(axisLabelInterval, 5) } } },
      },
    ],
  };
}
