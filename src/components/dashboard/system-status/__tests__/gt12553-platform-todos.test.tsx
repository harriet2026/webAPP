import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// GT-12553: 平台"待办与告警"从 /system/health-summary 派生
// 许可证到期(a4, warning) 与 规则库状态(a5, info/无链接) 两项；
// 接口未上线(404)时两项整体缺席且不报错。

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
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key;
    return t;
  },
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({
  useSecurityScope: () => ({ effectiveViewer: 'platform', resolvedScopeTenant: null }),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));
vi.mock('../agent-overview', () => ({ useAgentRowVisibility: () => ({ phishing: true, spoofing: true, 'threat-retro': true }) }));

import { fetchSystemStatusData, resolveRangeDates } from '../hooks';
import { TodoAlerts } from '../todo-alerts';
import { ApiError } from '@/lib/api/client';
import { getTypeStatistics } from '@/lib/api/statistics';
import { fetchSystemStatusSummary } from '@/lib/api/system-status-summary';
import { fetchOpsTop } from '@/lib/api/ops-top';
import { fetchNodes, fetchAlerts } from '@/lib/api/monitoring';

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

function baseMocks() {
  mock(fetchSystemStatusSummary).mockResolvedValue({
    current: { mail_volume: 82, threats: 12, block_rate: 14.6 },
    previous: { mail_volume: 41, threats: 6, block_rate: 10 },
    threat_trend: [],
    pending_disposal: 0,
    pending_report: 0,
    generated_at: '2026-07-10T00:00:00Z',
  });
  mock(getTypeStatistics).mockResolvedValue({ series: [] });
  mock(fetchOpsTop).mockResolvedValue({ dimension: 'sender', total: 0, trendLabels: [], rows: [] });
  mock(fetchNodes).mockResolvedValue({ items: [{ id: 'n1', last_seen_unix: 1, online: true }] });
  mock(fetchAlerts).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 0 });
}

function platformArgs(apiRequest: unknown) {
  return {
    range: '7d' as const,
    dates: resolveRangeDates('7d', new Date('2026-07-10T12:00:00')),
    apiRequest: apiRequest as never,
    isPlatform: true,
  };
}

describe('GT-12553 platform license / rule-lib todos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    baseMocks();
  });

  it('derives the two tail todos from health-summary', async () => {
    const apiRequest = vi.fn(async (path: string) => {
      if (path === '/system/health-summary') {
        return { license_days: 7, rule_version: '202604021122', rule_latest: true, av_vendor: 'ClamAV', av_expire: '2026-07-01' };
      }
      return undefined;
    });
    const data = await fetchSystemStatusData(platformArgs(apiRequest));
    const tail = data.alerts.slice(-2);
    expect(tail.map((a) => a.kind)).toEqual(['license_expiry', 'rule_lib']);
    const [license, rule] = tail;
    expect(license.level).toBe('warning'); // demo a4: 7 天后到期为 warning
    expect(license.days).toBe(7);
    expect(license.href).toBe('');
    expect(rule.level).toBe('info'); // demo a5: 最新版为 info、无链接
    expect(rule.ruleLatest).toBe(true);
    expect(rule.ruleVersion).toBe('202604021122');
    expect(rule.href).toBe('');
  });

  it('marks a stale rule library as warning', async () => {
    const apiRequest = vi.fn(async (path: string) =>
      path === '/system/health-summary'
        ? { license_days: 100, rule_version: 'v1', rule_latest: false, av_vendor: null, av_expire: null }
        : undefined,
    );
    const data = await fetchSystemStatusData(platformArgs(apiRequest));
    const rule = data.alerts.find((a) => a.kind === 'rule_lib');
    expect(rule?.level).toBe('warning');
    const license = data.alerts.find((a) => a.kind === 'license_expiry');
    expect(license?.level).toBe('info'); // 100 天 > 30 天
  });

  it('omits both todos without failing when the endpoint is 404 (GT-12346 未上线)', async () => {
    const apiRequest = vi.fn(async (path: string) => {
      if (path === '/system/health-summary') throw new ApiError(404, 'not found');
      return undefined;
    });
    const data = await fetchSystemStatusData(platformArgs(apiRequest));
    expect(data.alerts.some((a) => a.kind === 'license_expiry' || a.kind === 'rule_lib')).toBe(false);
  });

  it('renders the two items with texts and without chevron links', () => {
    render(
      <TodoAlerts
        isLoading={false}
        alerts={[
          { id: 'license-expiry', level: 'warning', scope: 'platform', kind: 'license_expiry', href: '', days: 7 },
          { id: 'rule-lib', level: 'info', scope: 'platform', kind: 'rule_lib', href: '', ruleVersion: '202604021122', ruleLatest: true },
        ]}
      />,
    );
    expect(screen.getByTestId('system-status-todo-item-license-expiry').textContent).toContain('itemLicenseExpiry:{"n":7}');
    expect(screen.getByTestId('system-status-todo-item-license-expiry').textContent).toContain('licenseRenewHint');
    const ruleItem = screen.getByTestId('system-status-todo-item-rule-lib');
    expect(ruleItem.textContent).toContain('itemRuleLibLatest');
    expect(ruleItem.textContent).toContain('202604021122');
    expect(ruleItem.querySelector('a')).toBeNull();
  });
});
