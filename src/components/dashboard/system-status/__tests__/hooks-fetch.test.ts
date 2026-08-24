import { beforeEach, describe, expect, it, vi } from 'vitest';

// 首页只发一个聚合请求；后端从当前窗口推导紧邻的上一等长周期，避免两套
// 统计接口各自解释日期/时刻而产生 KPI 口径漂移。
vi.mock('@/lib/api/system-status-summary', () => ({
  fetchSystemStatusSummary: vi.fn(async () => ({
    current: { mail_volume: 1, threats: 1, block_rate: 0 },
    previous: { mail_volume: 1, threats: 1, block_rate: 0 },
    threat_trend: [],
    pending_disposal: 0,
    pending_report: 0,
    generated_at: '2026-07-03T00:00:00Z',
  })),
}));
vi.mock('@/lib/api/ops-top', () => ({
  fetchOpsTop: vi.fn(async () => ({ dimension: 'sender', total: 0, trendLabels: [], rows: [] })),
}));
import { fetchSystemStatusSummary } from '@/lib/api/system-status-summary';
import { fetchSystemStatusData, resolveRangeDates } from '../hooks';

const apiRequest = vi.fn(async () => ({})) as never;

interface WindowParams {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
}

/** First argument of the i-th recorded call, with the index/optional-arg
 *  narrowing `noUncheckedIndexedAccess` demands. */
function windowAt(calls: WindowParams[][], i: number): WindowParams {
  const call = calls[i];
  if (!call) throw new Error(`expected a call #${i}`);
  const params = call[0];
  if (!params) throw new Error(`call #${i} carried no params`);
  return params;
}

async function run(range: 'today' | '24h' | '7d') {
  const dates = resolveRangeDates(range, new Date('2026-07-03T12:34:56'));
  await fetchSystemStatusData({
    range: range as never,
    dates,
    apiRequest,
    isPlatform: false,
  });
  return dates;
}

describe('fetchSystemStatusData window parity', () => {
  beforeEach(() => {
    vi.mocked(fetchSystemStatusSummary).mockClear();
  });

  it('24h sends one exact clock-bounded summary window', async () => {
    await run('24h');

    const calls = vi.mocked(fetchSystemStatusSummary).mock.calls as WindowParams[][];
    expect(calls).toHaveLength(1);
    expect(windowAt(calls, 0)).toEqual(expect.objectContaining({
      startDate: '2026-07-02',
      startTime: '12:34:56',
      endDate: '2026-07-03',
      endTime: '12:34:56',
    }));
  });

  it('today / 7d send one date-aligned request without clocks', async () => {
    for (const range of ['today', '7d'] as const) {
      vi.mocked(fetchSystemStatusSummary).mockClear();
      await run(range);
      const calls = vi.mocked(fetchSystemStatusSummary).mock.calls as WindowParams[][];
      expect(calls).toHaveLength(1);
      expect(windowAt(calls, 0).startTime).toBeUndefined();
      expect(windowAt(calls, 0).endTime).toBeUndefined();
    }
  });
});
