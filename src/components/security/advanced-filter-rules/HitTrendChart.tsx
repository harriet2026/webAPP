'use client';

import { useTranslations } from 'next-intl';
import type { HitTrendPoint, RuleRange } from '@/lib/api/advanced-rules';
import { fillHitTrendBuckets } from './hit-trend-buckets';

// HitTrendChart.tsx — layer-5-test-analysis.html "命中趋势图" (占位框 in the
// demo, D-12). Pure SVG/CSS bar chart per the dataviz skill's minimal-chrome
// bar-chart guidance: no recharts, a single semantic color (brand primary)
// for non-empty buckets, near-invisible bars for empty ones, at most a
// handful of x-axis labels (first/mid/last), y-axis reduced to just the max
// value, responsive via viewBox, and a `role="img"`/`aria-label` summary for
// accessibility since the per-bar detail is sighted-hover-only (<title>).

interface Props {
  points: HitTrendPoint[]; // sparse, as returned by GET .../hit-trend
  range: RuleRange;
}

const VIEW_W = 300;
const VIEW_H = 90;
const TOP_PAD = 6;
const BOTTOM_PAD = 4;
const BAR_GAP_RATIO = 0.25;

function formatBucketLabel(iso: string, range: RuleRange): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (range === '24h') {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
}

export function HitTrendChart({ points, range }: Props) {
  const t = useTranslations('advancedRulesFeature.testAnalysis');
  const buckets = fillHitTrendBuckets(points, range);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const n = buckets.length;
  const slotW = VIEW_W / n;
  const barW = slotW * (1 - BAR_GAP_RATIO);
  const usableH = VIEW_H - TOP_PAD - BOTTOM_PAD;

  const tickIdx = new Set([0, Math.floor((n - 1) / 2), n - 1]);

  return (
    <div className="w-full" data-testid="hit-trend-chart">
      <div className="mb-1 flex justify-end text-[10px] text-muted-foreground" data-testid="hit-trend-max-label">
        {t('trendChartMaxLabel', { max })}
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label={t('trendChartAriaLabel', { max })}
      >
        {buckets.map((b, i) => {
          const h = max > 0 ? (b.count / max) * usableH : 0;
          const x = i * slotW + (slotW - barW) / 2;
          const y = VIEW_H - BOTTOM_PAD - h;
          return (
            <rect
              key={b.bucket}
              x={x}
              y={b.count > 0 ? y : VIEW_H - BOTTOM_PAD - 1}
              width={barW}
              height={b.count > 0 ? Math.max(h, 1.5) : 1}
              rx={0.75}
              fill={b.count > 0 ? 'var(--color-primary)' : 'var(--color-muted)'}
            >
              <title>{`${formatBucketLabel(b.bucket, range)}: ${b.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground" data-testid="hit-trend-axis">
        {buckets.map((b, i) =>
          tickIdx.has(i) ? <span key={b.bucket}>{formatBucketLabel(b.bucket, range)}</span> : null,
        )}
      </div>
    </div>
  );
}
