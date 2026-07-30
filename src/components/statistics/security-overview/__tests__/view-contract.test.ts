import { describe, expect, it } from 'vitest';
import { SECURITY_OVERVIEW_VIEW_OPTIONS } from '../TrendChartCard';
import {
  mockSecurityDrill,
  mockSecurityEscapes,
  mockSecurityGeo,
  mockSecurityOverviewFor,
  mockSecurityCsv,
  mockSecurityTime,
} from '@/lib/mock/fixtures';
import { blockRateTier, geoBlockRateTier } from '../constants';

describe('security overview view contract', () => {
  it('exposes exactly the two user-facing trend perspectives', () => {
    expect(SECURITY_OVERVIEW_VIEW_OPTIONS).toEqual([
      'email_type',
      'action',
    ]);
  });

  it('provides a complete deterministic mock data loop', () => {
    const overview = mockSecurityOverviewFor('2026-07-16', '2026-07-22', true);
    expect(overview.trend.email_type).toHaveLength(7);
    expect(Object.keys(overview.trend.email_type?.[0] ?? {})).toEqual(expect.arrayContaining([
      'normal', 'subscription', 'advertising', 'spam', 'harmful', 'suspicious',
      'sensitive', 'spoofing', 'phishing', 'virus', 'account_compromised',
    ]));
    expect(overview.trend.action).toHaveLength(7);
    // 与真实后端 internal/models/security_overview.go AllActions 对齐：
    // 第 3 个动作是 advanced_review（sideline_pending），不存在 greylist。
    expect(Object.keys(overview.trend.action?.[0] ?? {})).toEqual(expect.arrayContaining([
      'deliver', 'mark_deliver', 'advanced_review', 'quarantine', 'review', 'block', 'drop', 'recall',
    ]));
    expect(Object.keys(overview.trend.action?.[0] ?? {})).not.toContain('greylist');
    expect(Object.keys(overview.trend.action?.[0] ?? {})).not.toContain('cancelled');
    expect(overview.trend.threat_level).toHaveLength(7);
    expect(overview.trend.delivery_result).toHaveLength(7);
    expect(overview.trend_previous_period?.email_type).toHaveLength(7);
    expect(mockSecurityGeo('phishing').countries).toHaveLength(10);
    expect(mockSecurityTime('daily').peak_hours).toHaveLength(4);
    expect(mockSecurityTime('weekly').weekly_matrix).toHaveLength(168);
    expect(mockSecurityDrill('action').items).toHaveLength(5);
    expect(mockSecurityEscapes.total).toBe(12);
    expect(mockSecurityCsv.split('\n')[0]).toBe('date,email_type,total,block_rate,change,change_pct');
  });

  it('provides dashboard-parity hourly and 30-day threat trend buckets', () => {
    const hourly = mockSecurityOverviewFor('2026-07-24', '2026-07-24', false, 'hour');
    expect(hourly.trend.threat_type).toHaveLength(24);
    expect(hourly.trend.threat_type[0].date).toBe('2026-07-24 00:00:00');
    expect(hourly.trend.threat_type[23].date).toBe('2026-07-24 23:00:00');
    expect(hourly.trend.threat_type[0]).toEqual(
      expect.objectContaining({ phishing: expect.any(Number), spoofing: expect.any(Number) }),
    );

    const monthly = mockSecurityOverviewFor('2026-06-25', '2026-07-24');
    expect(monthly.trend.threat_type).toHaveLength(30);
    expect(monthly.trend.threat_type[0].date).toBe('1/1');
    expect(monthly.trend.threat_type[29].date).toBe('1/30');
  });

  it('keeps KPI and geo block-rate thresholds distinct', () => {
    expect(blockRateTier(97.1)).toBe('warn');
    expect(geoBlockRateTier(97.1)).toBe('good');
  });
});
