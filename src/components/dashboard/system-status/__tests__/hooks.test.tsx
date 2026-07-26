import { describe, expect, it } from 'vitest';
import { computeDelta, resolveRangeDates } from '../hooks';

describe('computeDelta', () => {
  it('computes positive percentage change', () => {
    expect(computeDelta(110, 100)).toBe(10);
  });

  it('computes negative percentage change', () => {
    expect(computeDelta(90, 100)).toBe(-10);
  });

  it('returns 0 when prev is 0 (avoid divide-by-zero)', () => {
    expect(computeDelta(5, 0)).toBe(0);
  });

  it('returns 0 when both cur and prev are 0', () => {
    expect(computeDelta(0, 0)).toBe(0);
  });

  // Finding 5: the threat KPI 环比 is computed the same way as inbound —
  // computeDelta(kpi.blocked current, kpi.blocked previous). These cases pin the
  // math the system-status hook uses for `threatsDelta`.
  it('computes threats delta from blocked counts (up)', () => {
    expect(computeDelta(246, 200)).toBe(23);
  });

  it('computes threats delta from blocked counts (down)', () => {
    expect(computeDelta(150, 200)).toBe(-25);
  });

  it('threats delta is 0 when previous blocked is 0', () => {
    expect(computeDelta(50, 0)).toBe(0);
  });
});

describe('resolveRangeDates', () => {
  const now = new Date('2026-07-03T12:00:00');

  it('today uses hour interval and a single-day range', () => {
    const r = resolveRangeDates('today', now);
    expect(r.interval).toBe('hour');
    expect(r.startDate).toBe('2026-07-03');
    expect(r.endDate).toBe('2026-07-03');
    expect(r.prevStart).toBe('2026-07-02');
    expect(r.prevEnd).toBe('2026-07-02');
  });

  it('7d uses day interval and a 7-day previous period immediately before', () => {
    const r = resolveRangeDates('7d', now);
    expect(r.interval).toBe('day');
    expect(r.startDate).toBe('2026-06-27');
    expect(r.endDate).toBe('2026-07-03');
    expect(r.prevStart).toBe('2026-06-20');
    expect(r.prevEnd).toBe('2026-06-26');
  });

  it('30d uses day interval and a 30-day previous period immediately before', () => {
    const r = resolveRangeDates('30d', now);
    expect(r.interval).toBe('day');
    expect(r.startDate).toBe('2026-06-04');
    expect(r.endDate).toBe('2026-07-03');
    expect(r.prevStart).toBe('2026-05-05');
    expect(r.prevEnd).toBe('2026-06-03');
  });
});
