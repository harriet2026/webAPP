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

  // 核心回归：「24 小时」必须真的是 24 小时，且当前/上一周期不重叠。
  // 改动前这一档只发日期（startDate=昨天, endDate=今天），后端展开成
  // [昨天00:00, 明天00:00) 共 48 小时，上一周期 [前天00:00, 今天00:00) 与之
  // 在「昨天」整天上完全重叠，环比失真。
  describe('24h', () => {
    // 取一个非整点、非零点的 now，确保断言不会被"恰好对齐自然日"蒙混过关。
    const t = new Date('2026-07-03T12:34:56');

    // 复刻后端 /statistics/delivery-traffic 的窗口展开规则（半开区间）：
    //   无时刻 -> [start_date 00:00, end_date+1天 00:00)
    //   有时刻 -> [start_date start_time, end_date end_time)
    // 用它来断言，才是在断言"实际查询到的时间窗"，而不是只断言前端字段本身。
    // 改动前这一档不发时刻，effEnd 会把 endDate 整天算进来 -> 48 小时 + 与上一
    // 周期在整天上重叠，下面两个用例必然失败。
    const effStart = (date: string, clock?: string) => new Date(`${date}T${clock ?? '00:00:00'}`);
    const effEnd = (date: string, clock?: string) => {
      if (clock) return new Date(`${date}T${clock}`);
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d;
    };

    it('sends clock parameters so the window is exactly 24h', () => {
      const r = resolveRangeDates('24h', t);
      expect(r.interval).toBe('hour');
      expect(r.startTime).toBe('12:34:56');
      expect(r.endTime).toBe('12:34:56');
      expect(r.startDate).toBe('2026-07-02');
      expect(r.endDate).toBe('2026-07-03');

      const span = effEnd(r.endDate, r.endTime).getTime() - effStart(r.startDate, r.startTime).getTime();
      expect(span).toBe(24 * 60 * 60 * 1000);
    });

    it('previous period is also exactly 24h and does not overlap the current one', () => {
      const r = resolveRangeDates('24h', t);
      const curStart = effStart(r.startDate, r.startTime);
      const curEnd = effEnd(r.endDate, r.endTime);
      const prevStart = effStart(r.prevStart, r.prevStartTime);
      const prevEnd = effEnd(r.prevEnd, r.prevEndTime);

      expect(prevEnd.getTime() - prevStart.getTime()).toBe(24 * 60 * 60 * 1000);
      // 半开区间首尾相接：上一周期的结束 == 当前周期的开始。
      expect(prevEnd.getTime()).toBe(curStart.getTime());
      // 不重叠。
      expect(prevStart < curEnd && curStart < prevEnd).toBe(false);
    });

    it('previous period covers 24h-48h ago', () => {
      const r = resolveRangeDates('24h', t);
      expect(r.prevStart).toBe('2026-07-01');
      expect(r.prevStartTime).toBe('12:34:56');
      expect(r.prevEnd).toBe('2026-07-02');
      expect(r.prevEndTime).toBe('12:34:56');
    });
  });

  // 日历日对齐的三档语义正确，必须保持不带时刻（否则会把自然日窗口切碎）。
  it('today / 7d / 30d send no clock parameters', () => {
    for (const range of ['today', '7d', '30d'] as const) {
      const r = resolveRangeDates(range, now);
      expect(r.startTime).toBeUndefined();
      expect(r.endTime).toBeUndefined();
      expect(r.prevStartTime).toBeUndefined();
      expect(r.prevEndTime).toBeUndefined();
    }
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
