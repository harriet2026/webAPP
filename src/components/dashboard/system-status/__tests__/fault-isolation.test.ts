import { describe, expect, it, vi, beforeEach } from 'vitest';

// GT-12005 / GT-12008: the dashboard fetched every source in one Promise.all, so
// a single rejected call took the whole query down and every field fell back to
// 0 / [] / null — "统计卡片数据全为0" and "待办面板为空". A tenant_admin hits this
// reliably: /inbound-audit is RequireSystemAdmin and 403s, while
// /statistics/dashboard and /statistics/security-overview return that tenant's
// real data (verified against the live stack: 200 / 200 / 403).

vi.mock('@/lib/api/statistics', () => ({
  getDashboardSummary: vi.fn(),
  getTypeStatistics: vi.fn(),
}));
vi.mock('@/lib/api/security-overview', () => ({ getSecurityOverview: vi.fn() }));
vi.mock('@/lib/api/ops-top', () => ({ fetchOpsTop: vi.fn() }));
vi.mock('@/lib/api/monitoring', () => ({ fetchNodes: vi.fn(), fetchAlerts: vi.fn() }));
vi.mock('@/components/email-disposal/lib/disposal-api', () => ({ getDisposalList: vi.fn() }));
vi.mock('@/lib/api/inbound-audit', () => ({ getInboundAuditItems: vi.fn() }));
vi.mock('@/lib/api/phishing-detection', () => ({ getDetectionStats: vi.fn() }));
vi.mock('@/lib/api/spoofing-detection', () => ({ getSpoofingStats: vi.fn() }));
vi.mock('@/lib/api/threat-retro', () => ({ getThreatRetroStats: vi.fn() }));

import { fetchSystemStatusData, resolveRangeDates } from '../hooks';
import { ApiError } from '@/lib/api/client';
import { getDashboardSummary, getTypeStatistics } from '@/lib/api/statistics';
import { getSecurityOverview } from '@/lib/api/security-overview';
import { fetchOpsTop } from '@/lib/api/ops-top';
import { getDisposalList } from '@/components/email-disposal/lib/disposal-api';
import { getInboundAuditItems } from '@/lib/api/inbound-audit';

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function args() {
  return {
    range: '7d' as const,
    dates: resolveRangeDates('7d', new Date('2026-07-10T12:00:00')),
    apiRequest: vi.fn() as never,
    isPlatform: false,
    aiEnabled: false,
  };
}

describe('dashboard fault isolation (GT-12005 / GT-12008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The two CORE sources succeed — the tenant's data really is available.
    mock(getDashboardSummary)
      .mockResolvedValueOnce({ metrics: { total_emails: 82 } })
      .mockResolvedValueOnce({ metrics: { total_emails: 41 } });
    mock(getSecurityOverview)
      .mockResolvedValueOnce({ kpi: { blocked: 12, block_rate: 14.6 } })
      .mockResolvedValueOnce({ kpi: { blocked: 6, block_rate: 10 } });
    mock(getTypeStatistics).mockResolvedValue({ series: [] });
    mock(fetchOpsTop).mockResolvedValue({ dimension: 'sender', total: 0, trendLabels: [], rows: [] });
    mock(getDisposalList).mockResolvedValue({ items: [], page: 1, page_size: 1, total: 5 });
  });

  it('requests hourly overview buckets for today and daily buckets for longer ranges', async () => {
    mock(getInboundAuditItems).mockResolvedValue({ items: [], page: 1, page_size: 1, total: 0 });

    await fetchSystemStatusData({
      ...args(),
      range: 'today',
      dates: resolveRangeDates('today', new Date('2026-07-10T12:00:00')),
    });
    expect(mock(getSecurityOverview)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ startDate: '2026-07-10', endDate: '2026-07-10', interval: 'hour' }),
      expect.anything(),
    );
    expect(mock(getSecurityOverview)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ startDate: '2026-07-09', endDate: '2026-07-09', interval: 'hour' }),
      expect.anything(),
    );

    vi.clearAllMocks();
    mock(getDashboardSummary)
      .mockResolvedValueOnce({ metrics: { total_emails: 82 } })
      .mockResolvedValueOnce({ metrics: { total_emails: 41 } });
    mock(getSecurityOverview)
      .mockResolvedValueOnce({ kpi: { blocked: 12, block_rate: 14.6 }, trend: { threat_type: [] } })
      .mockResolvedValueOnce({ kpi: { blocked: 6, block_rate: 10 } });
    mock(fetchOpsTop).mockResolvedValue({ dimension: 'sender', total: 0, trendLabels: [], rows: [] });
    mock(getDisposalList).mockResolvedValue({ items: [], page: 1, page_size: 1, total: 0 });
    mock(getInboundAuditItems).mockResolvedValue({ items: [], page: 1, page_size: 1, total: 0 });

    await fetchSystemStatusData(args());
    expect(mock(getSecurityOverview)).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ interval: 'day' }),
      expect.anything(),
    );
  });

  it('a 403 on /inbound-audit no longer zeroes every KPI', async () => {
    // Exactly what a tenant_admin gets today.
    mock(getInboundAuditItems).mockRejectedValue(new ApiError(403, 'forbidden'));

    const data = await fetchSystemStatusData(args());

    // The KPIs sourced from the endpoints that DID succeed must survive.
    expect(data.inbound).toBe(82);
    expect(data.threats).toBe(12);
    expect(data.blockRate).toBe(14.6);
    expect(data.pendingIsolated).toBe(5);
    // Only the failing source degrades.
    expect(data.pendingReport).toBe(0);
  });

  it('the whole fetch no longer rejects when auxiliary sources are FORBIDDEN', async () => {
    mock(getInboundAuditItems).mockRejectedValue(new ApiError(403, 'forbidden'));
    mock(getDisposalList).mockRejectedValue(new ApiError(403, 'forbidden'));
    mock(fetchOpsTop).mockRejectedValue(new ApiError(403, 'forbidden'));

    await expect(fetchSystemStatusData(args())).resolves.toBeTruthy();
  });

  // Review finding — the defect my own design introduced. optionalSource used to
  // swallow EVERY rejection, so a 500 on /monitor/alerts or on the disposal query
  // degraded to "[] / total 0" with isError still false: HealthBanner rendered the
  // green 系统运行正常 while real alerts were hidden, and the 待办面板 said 无待办事项
  // while quarantined mail was actually queued. Silently-wrong beats an honest
  // error banner only in the 403 case (the source genuinely isn't for this viewer).
  // My earlier tests encoded the WRONG design: they asserted "any auxiliary failure
  // is swallowed", so they could never have caught this.
  it('a 500 on an auxiliary source must NOT be swallowed — the dashboard must not lie', async () => {
    mock(getDisposalList).mockRejectedValue(new ApiError(500, 'db down'));

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });

  it('a network error (non-ApiError) on an auxiliary source must NOT be swallowed', async () => {
    mock(fetchOpsTop).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });

  it('a 401/404 is not a 403 — it must surface, not degrade', async () => {
    mock(getInboundAuditItems).mockRejectedValue(new ApiError(404, 'not found'));

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });

  it('still surfaces the pending-disposal todo item when inbound-audit is forbidden', async () => {
    mock(getInboundAuditItems).mockRejectedValue(new ApiError(403, 'forbidden'));

    const data = await fetchSystemStatusData(args());

    // GT-12008: the 待办 panel read "当前无待办事项" because `alerts` was [].
    // With disposal returning 5 pending, the panel must not be empty.
    expect(data.alerts.length).toBeGreaterThan(0);
    expect(data.alerts.some((a) => a.kind === 'pending_disposal')).toBe(true);
  });

  it('a CORE source failing still fails hard (the error banner must be honest)', async () => {
    mock(getDashboardSummary).mockReset();
    mock(getDashboardSummary).mockRejectedValue(new Error('db down'));
    mock(getInboundAuditItems).mockResolvedValue({ items: [], page: 1, page_size: 1, total: 0 });

    await expect(fetchSystemStatusData(args())).rejects.toThrow();
  });
});
