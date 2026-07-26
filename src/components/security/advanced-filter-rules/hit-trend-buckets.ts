import type { HitTrendPoint, RuleRange } from '@/lib/api/advanced-rules';

// hit-trend-buckets.ts — pads the sparse hit-trend points GetUnifiedRuleHitTrend
// returns (internal/api/unified_rules_analytics.go: "Only buckets that
// actually have at least one hit are returned; the caller ... fills the
// zero-count buckets in between") into a complete, UTC-aligned bucket
// sequence for HitTrendChart: 24 hourly buckets for '24h', 7/30 daily
// buckets for '7d'/'30d'. Bucketing must mirror the backend's
// bucketStartUTC (hour/day truncation in UTC) so a sparse point's `bucket`
// timestamp lines up with exactly one generated slot.

const RANGE_BUCKET_COUNT: Record<RuleRange, number> = { '24h': 24, '7d': 7, '30d': 30 };
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function fillHitTrendBuckets(
  points: HitTrendPoint[],
  range: RuleRange,
  now: Date = new Date(),
): HitTrendPoint[] {
  const count = RANGE_BUCKET_COUNT[range];
  const byHour = range === '24h';
  const stepMs = byHour ? HOUR_MS : DAY_MS;
  const anchorMs = byHour
    ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())
    : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const countByBucketMs = new Map<number, number>();
  for (const p of points) {
    const t = new Date(p.bucket).getTime();
    if (Number.isFinite(t)) {
      countByBucketMs.set(t, (countByBucketMs.get(t) ?? 0) + p.count);
    }
  }

  const out: HitTrendPoint[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const bucketMs = anchorMs - i * stepMs;
    out.push({ bucket: new Date(bucketMs).toISOString(), count: countByBucketMs.get(bucketMs) ?? 0 });
  }
  return out;
}
