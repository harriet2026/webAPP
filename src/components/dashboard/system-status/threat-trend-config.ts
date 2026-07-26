// System-status 威胁态势趋势 (threat-posture trend) series config.
//
// Aligns the dashboard trend card to the demo prototype's "威胁态势趋势"
// (design/origin/demo/components/security-ops/security-ops-dashboard.tsx
// THREAT_SERIES): five stacked threat classes, most-severe first. Multiple
// buckets render as stacked areas; one bucket renders as a stacked bar. The
// series keys match the backend `security-overview` `trend.threat_type` point
// keys (getSecurityOverview().trend.threat_type — TrendSeriesPoint carries a
// count per threat-type key). NOTE: the backend threat_type taxonomy has no
// `spoofing` bucket (normal/spam/suspicious/high_risk_spam/phishing/virus/
// malicious/invalid); the 仿冒 series is demo-only and is supplied by the mock
// fixture in Mock mode — in real mode that key is simply absent (renders 0).
//
// Colors are the domain threat palette (DESIGN.md `colors.threat-*`), same
// convention as email-type-config.ts. phishing/spoofing/spam map to exact
// DESIGN tokens (threat-phishing / threat-high / threat-medium); virus and
// malicious-link use the demo prototype's domain threat hues (dark-red virus,
// cyan malicious-link) which have no dedicated DESIGN token.
import type { TrendSeriesPoint } from '@/lib/api/security-overview';

/** i18n label key under `systemStatus.trend.series.*`. */
export interface ThreatSeriesDef {
  /** key in the security-overview threat_type trend point + i18n label key. */
  key: string;
  /** hex color (domain threat palette). */
  color: string;
}

// Stacked display order: most-severe (bottom of stack) first, matching the
// demo's THREAT_SERIES order.
export const THREAT_TREND_SERIES: ThreatSeriesDef[] = [
  { key: 'phishing', color: '#EF4444' }, // threat-phishing (red-500)
  { key: 'spoofing', color: '#F97316' }, // threat-high (orange-500)
  { key: 'spam', color: '#EAB308' }, // threat-medium (yellow-500)
  { key: 'virus', color: '#991B1B' }, // demo dark-red virus (no DESIGN token)
  { key: 'malicious', color: '#06B6D4' }, // demo cyan malicious-link (no DESIGN token)
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
    grid: { left: 35, right: 0, top: 24, bottom: 0, containLabel: true },
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
