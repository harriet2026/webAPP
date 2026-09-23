import { describe, expect, it, vi } from 'vitest';
import { buildEmailDisposalCenterQuery, getRuleEffectiveness, type RuleEffectivenessRow } from './rule-effectiveness';
import type { ApiRequestFn } from './client';

describe('rule effectiveness report contract', () => {
  it('sends all module filters and the requested page to the real API', async () => {
    const request = vi.fn().mockResolvedValue({ rows: [] });
    await getRuleEffectiveness({ startDate: '2026-09-01', endDate: '2026-09-20', modules: ['sender_filter', 'auth_spoofing'], tenantId: 12, page: 3, overdueOnly: true }, request as ApiRequestFn);
    const url = new URL(request.mock.calls[0][0], 'http://test');
    expect(url.pathname).toBe('/statistics/rule-effectiveness');
    expect(url.searchParams.getAll('module')).toEqual(['sender_filter', 'auth_spoofing']);
    expect(url.searchParams.get('tenant_id')).toBe('12');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('overdue_only')).toBe('true');
  });
  it('drills into the exact period and preserves the report timezone across tenant scopes', () => {
    const row = { policy_module: 'sender_filter', tenant_id: 12, observation_period_id: 'period-old', sub_strategy_id: 'rule:uid', sub_strategy_name_snapshot: 'name & renamed', time_zone: 'America/New_York' } as RuleEffectivenessRow;
    const query = new URLSearchParams(buildEmailDisposalCenterQuery(row, '2026-09-01', '2026-09-20'));
    expect(query.get('observation_period_id')).toBe('period-old');
    expect(query.get('observe_time_zone')).toBe('America/New_York');
    expect(query.get('tenant_id')).toBe('12');
    expect(query.get('strategy_name')).toBe('name & renamed');
    expect(query.get('observe_window_from')).toBe('2026-09-01');
    expect(query.get('observe_window_to')).toBe('2026-09-20');
  });
});

describe('report locale coverage', () => {
  it('has every selectable module label in all supported languages', async () => {
    const { MODULE_FILTER_OPTIONS } = await import('@/components/statistics/rule-effectiveness/constants');
    for (const language of ['zh', 'en', 'ru', 'th']) {
      const messages = (await import(`../../../messages/${language}.json`)).default;
      for (const moduleOption of MODULE_FILTER_OPTIONS) {
        expect(messages.ruleEffectiveness.filter.modules[moduleOption], `${language}: ${moduleOption}`).toBeTruthy();
      }
      expect(JSON.stringify(messages.ruleEffectiveness)).not.toContain('\uFFFD');
      expect(messages.ruleEffectiveness.detail.col.path).toBeTruthy();
      expect(messages.emailDisposal.ruleEffectivenessContext.matches).toBeTruthy();
    }
  });
});
