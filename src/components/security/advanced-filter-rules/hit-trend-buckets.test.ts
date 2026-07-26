import { describe, expect, it } from 'vitest';
import { fillHitTrendBuckets } from './hit-trend-buckets';

// Fixed "now" so bucket alignment is deterministic in tests.
const NOW = new Date('2026-07-12T14:37:00.000Z');

describe('fillHitTrendBuckets', () => {
  it('24h: produces exactly 24 hourly buckets ending at the current UTC hour', () => {
    const out = fillHitTrendBuckets([], '24h', NOW);
    expect(out).toHaveLength(24);
    expect(out[out.length - 1].bucket).toBe('2026-07-12T14:00:00.000Z');
    expect(out[0].bucket).toBe('2026-07-11T15:00:00.000Z'); // 23 hours before the last bucket
    for (const p of out) expect(p.count).toBe(0);
  });

  it('7d: produces exactly 7 daily buckets ending at the current UTC day', () => {
    const out = fillHitTrendBuckets([], '7d', NOW);
    expect(out).toHaveLength(7);
    expect(out[out.length - 1].bucket).toBe('2026-07-12T00:00:00.000Z');
    expect(out[0].bucket).toBe('2026-07-06T00:00:00.000Z');
  });

  it('30d: produces exactly 30 daily buckets ending at the current UTC day', () => {
    const out = fillHitTrendBuckets([], '30d', NOW);
    expect(out).toHaveLength(30);
    expect(out[out.length - 1].bucket).toBe('2026-07-12T00:00:00.000Z');
  });

  it('folds a sparse point (Go RFC3339, no fractional seconds) into its matching bucket', () => {
    const out = fillHitTrendBuckets([{ bucket: '2026-07-12T09:00:00Z', count: 5 }], '24h', NOW);
    const match = out.find((p) => p.bucket === '2026-07-12T09:00:00.000Z');
    expect(match?.count).toBe(5);
    // every other bucket stays at 0
    expect(out.filter((p) => p.count > 0)).toHaveLength(1);
  });

  it('sums multiple sparse points that land on the same bucket', () => {
    const out = fillHitTrendBuckets(
      [
        { bucket: '2026-07-12T00:00:00Z', count: 2 },
        { bucket: '2026-07-12T00:00:00Z', count: 3 },
      ],
      '7d',
      NOW,
    );
    const match = out.find((p) => p.bucket === '2026-07-12T00:00:00.000Z');
    expect(match?.count).toBe(5);
  });

  it('silently drops a point older than the visible window', () => {
    const out = fillHitTrendBuckets([{ bucket: '2020-01-01T00:00:00Z', count: 9 }], '24h', NOW);
    expect(out.every((p) => p.count === 0)).toBe(true);
  });
});
