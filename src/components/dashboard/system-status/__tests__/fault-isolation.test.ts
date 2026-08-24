import { describe, expect, it, vi, beforeEach } from 'vitest';

// GT-12005 / GT-12008: the dashboard fetched every source in one Promise.all, so
// a single rejected call took the whole query down and every field fell back to
// 0 / [] / null — "统计卡片数据全为0" and "待办面板为空". Pending-report is
// now part of the core homepage summary; auxiliary platform-only sources still
// exercise the 403 fault-isolation path.

vi.mock('@/lib/api/statistics', () => ({
  getDashboardSummary: vi.fn(),
  getTypeStatistics: vi.fn(),
}));
vi.mock('@/lib/api/system-status-summary', () => ({ fetchSystemStatusSummary: vi.fn() }));
vi.mock('@/lib/api/ops-top', () => ({ fetchOpsTop: vi.fn() }));
vi.mock('@/lib/api/monitoring', () => ({ fetchNodes: vi.fn(), fetchAlerts: vi.fn() }));
vi.mock('@/lib/api/phishing-detection', () => ({ getDetectionStats: vi.fn() }));
vi.mock('@/lib/api/spoofing-detection', () => ({ getSpoofingStats: vi.fn() }));
vi.mock('@/lib/api/threat-retro', () => ({ getThreatRetroStats: vi.fn() }));

import {
  buildAgentAlerts,
  fetchSystemStatusAgentStats,
  fetchSystemStatusData,
  mergeAgentAlerts,
  resolveRangeDates,
} from '../hooks';
import { ApiError } from '@/lib/api/client';
import { getTypeStatistics } from '@/lib/api/statistics';
import { fetchSystemStatusSummary } from '@/lib/api/system-status-summary';
import { fetchOpsTop } from '@/lib/api/ops-top';
import { getDetectionStats } from '@/lib/api/phishing-detection';
import { getSpoofingStats } from '@/lib/api/spoofing-detection';
import { getThreatRetroStats } from '@/lib/api/threat-retro';

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function args() {
  return {
    range: '7d' as const,
    dates: resolveRangeDates('7d', new Date('2026-07-10T12:00:00')),
    apiRequest: vi.fn() as never,
    isPlatform: false,
  };
}

describe('dashboard fault isolation (GT-12005 / GT-12008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The CORE source succeeds — all existing KPI/trend/disposal fields remain available.
    mock(fetchSystemStatusSummary).mockResolvedValue({
      current: { mail_volume: 82, threats: 12, block_rate: 14.6 },
      previous: { mail_volume: 41, threats: 6, block_rate: 10 },
      threat_trend: [],
      pending_disposal: 5,
      pending_report: 7,
      generated_at: '2026-07-10T00:00:00Z',
    });
    mock(getTypeStatistics).mockResolvedValue({ series: [] });
    mock(fetchOpsTop).mockResolvedValue({ dimension: 'sender', total: 0, trendLabels: [], rows: [] });
  });

  it('requests hourly overview buckets for today and daily buckets for longer ranges', async () => {
    await fetchSystemStatusData({
      ...args(),
      range: 'today',
      dates: resolveRangeDates('today', new Date('2026-07-10T12:00:00')),
    });
    expect(mock(fetchSystemStatusSummary)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ startDate: '2026-07-10', endDate: '2026-07-10', interval: 'hour' }),
      expect.anything(),
    );

    vi.clearAllMocks();
    mock(fetchSystemStatusSummary).mockResolvedValue({
      current: { mail_volume: 82, threats: 12, block_rate: 14.6 },
      previous: { mail_volume: 41, threats: 6, block_rate: 10 },
      threat_trend: [],
      pending_disposal: 0,
      pending_report: 0,
      generated_at: '2026-07-10T00:00:00Z',
    });
    mock(fetchOpsTop).mockResolvedValue({ dimension: 'sender', total: 0, trendLabels: [], rows: [] });

    await fetchSystemStatusData(args());
    expect(mock(fetchSystemStatusSummary)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ interval: 'day' }),
      expect.anything(),
    );
  });

  it('reads both pending backlogs from the core summary', async () => {
    const data = await fetchSystemStatusData(args());

    expect(data.inbound).toBe(82);
    expect(data.threats).toBe(12);
    expect(data.blockRate).toBe(14.6);
    expect(data.pendingIsolated).toBe(5);
    expect(data.pendingReport).toBe(7);
    expect(data.pending).toBe(12);
  });

  it('the whole fetch no longer rejects when auxiliary sources are FORBIDDEN', async () => {
    mock(fetchOpsTop).mockRejectedValue(new ApiError(403, 'forbidden'));

    await expect(fetchSystemStatusData(args())).resolves.toBeTruthy();
  });

  // Review finding — the defect my own design introduced. optionalSource used to
  // swallow EVERY rejection, so a 500 on /monitor/alerts or another auxiliary query
  // degraded to "[] / total 0" with isError still false: HealthBanner rendered the
  // green 系统运行正常 while real alerts were hidden, and the 待办面板 said 无待办事项
  // while quarantined mail was actually queued. Silently-wrong beats an honest
  // error banner only in the 403 case (the source genuinely isn't for this viewer).
  // My earlier tests encoded the WRONG design: they asserted "any auxiliary failure
  // is swallowed", so they could never have caught this.
  it('a 500 on an auxiliary source must NOT be swallowed — the dashboard must not lie', async () => {
    mock(fetchOpsTop).mockRejectedValue(new ApiError(500, 'db down'));

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });

  it('a network error (non-ApiError) on an auxiliary source must NOT be swallowed', async () => {
    mock(fetchOpsTop).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });

  it('a 401/404 is not a 403 — it must surface, not degrade', async () => {
    mock(fetchOpsTop).mockRejectedValue(new ApiError(404, 'not found'));

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });

  it('surfaces pending-disposal and pending-report todo items from the core summary', async () => {
    const data = await fetchSystemStatusData(args());

    expect(data.alerts.length).toBeGreaterThan(0);
    expect(data.alerts.some((a) => a.kind === 'pending_disposal')).toBe(true);
    expect(data.alerts.some((a) => a.kind === 'pending_report')).toBe(true);
  });

  it('a CORE source failing still fails hard (the error banner must be honest)', async () => {
    mock(fetchSystemStatusSummary).mockReset();
    mock(fetchSystemStatusSummary).mockRejectedValue(new Error('db down'));

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });

  it('does not probe any agent endpoint when the current scope has no agent capability', async () => {
    const agents = await fetchSystemStatusAgentStats(args().apiRequest, {
      phishing: false,
      spoofing: false,
      'threat-retro': false,
    });

    expect(mock(getDetectionStats)).not.toHaveBeenCalled();
    expect(mock(getSpoofingStats)).not.toHaveBeenCalled();
    expect(mock(getThreatRetroStats)).not.toHaveBeenCalled();
    expect(agents).toBeNull();
  });

  it('requests only individually authorized agent stats', async () => {
    mock(getDetectionStats).mockResolvedValue({ today_detected: 9, pending_review: 2 });

    const agents = await fetchSystemStatusAgentStats(args().apiRequest, {
      phishing: true,
      spoofing: false,
      'threat-retro': false,
    });

    expect(mock(getDetectionStats)).toHaveBeenCalledOnce();
    expect(mock(getSpoofingStats)).not.toHaveBeenCalled();
    expect(mock(getThreatRetroStats)).not.toHaveBeenCalled();
    expect(agents).toEqual({
      phishing: { todayDetected: 9, pendingReview: 2 },
      spoofing: null,
      threatRetro: null,
    });
    expect(buildAgentAlerts(agents)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agent-phishing-pending', count: 2 }),
    ]));
  });

  it('keeps agent pending items before the platform license/rule-library tail', () => {
    const merged = mergeAgentAlerts(
      [
        { id: 'node', level: 'danger', scope: 'platform', kind: 'node_offline', href: '/nodes' },
        { id: 'license-expiry', level: 'warning', scope: 'platform', kind: 'license_expiry', href: '' },
        { id: 'rule-lib', level: 'info', scope: 'platform', kind: 'rule_lib', href: '' },
      ],
      {
        phishing: { todayDetected: 9, pendingReview: 2 },
        spoofing: null,
        threatRetro: null,
      },
    );

    expect(merged.map((alert) => alert.id)).toEqual([
      'node',
      'agent-phishing-pending',
      'license-expiry',
      'rule-lib',
    ]);
  });

  it('a raced 403 degrades only that agent and preserves other authorized data', async () => {
    mock(getDetectionStats).mockResolvedValue({ today_detected: 7, pending_review: 1 });
    mock(getSpoofingStats).mockRejectedValue(new ApiError(403, 'capability revoked'));

    const agents = await fetchSystemStatusAgentStats(args().apiRequest, {
      phishing: true,
      spoofing: true,
      'threat-retro': false,
    });

    expect(agents?.phishing).toEqual({ todayDetected: 7, pendingReview: 1 });
    expect(agents?.spoofing).toBeNull();
    expect(agents?.threatRetro).toBeNull();
  });

  it('a 500 from an authorized agent remains a real dashboard failure', async () => {
    mock(getSpoofingStats).mockRejectedValue(new ApiError(500, 'db down'));

    await expect(fetchSystemStatusAgentStats(args().apiRequest, {
      phishing: false,
      spoofing: true,
      'threat-retro': false,
    })).rejects.toThrow();
  });
});
