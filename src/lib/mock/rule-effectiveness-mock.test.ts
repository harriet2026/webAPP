import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuleEffectiveness, type RuleEffectivenessResponse } from '@/lib/api/rule-effectiveness';
import type { AuthSpoofingConfig } from '@/types/auth-spoofing';
import { dispatch, isMockable } from './dispatcher';
import { resetMockAuthSpoofingConfigForTests } from './fixtures';
import { setMockEnabled } from './storage';

describe('rule effectiveness mock contract', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    resetMockAuthSpoofingConfigForTests();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('uses local fixtures only while the webapp mock switch is enabled', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network must not be used'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    setMockEnabled(true);

    const mocked = await getRuleEffectiveness({ modules: ['sender_filter'] });
    expect(mocked.rows_total).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();

    setMockEnabled(false);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: 'backend' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
    const backend = await getRuleEffectiveness();
    expect(backend).toEqual({ source: 'backend' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('routes and filters the report with server pagination semantics', () => {
    const path = '/statistics/rule-effectiveness?mode=observe&module=auth_spoofing&page=2&page_size=2';
    expect(isMockable('GET', path)).toBe(true);

    const response = dispatch({ method: 'GET', path });
    const data = response.data as RuleEffectivenessResponse;

    expect(response.status).toBe(200);
    expect(data.page).toBe(2);
    expect(data.page_size).toBe(2);
    expect(data.rows_total).toBeGreaterThan(data.rows.length);
    expect(data.rows).toHaveLength(2);
    expect(data.rows.every((row) => row.policy_module === 'auth_spoofing')).toBe(true);
    expect(data.kpi.observing_count).toBe(data.rows_total);
    expect(data.kpi.total_hits).toBeGreaterThan(0);
    expect(data.quality).toMatchObject({ history_complete: true, complete: true });
  });

  it('filters similar detection objects by strategy and observation duration', () => {
    const response = dispatch({
      method: 'GET',
      path: '/statistics/rule-effectiveness?mode=observe&module=similar_detection&similar_detection_type=same_subject&duration_bucket=gt30&page=1&page_size=20',
    });
    const data = response.data as RuleEffectivenessResponse;

    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.rows.every((row) => row.policy_module === 'similar_detection')).toBe(true);
    expect(data.rows.every((row) => row.similar_detection_type === 'same_subject')).toBe(true);
    expect(data.rows.every((row) => (row.observed_days ?? 0) > 30)).toBe(true);
  });

  it('returns period-scoped mail rows and an observation reconciliation summary', () => {
    const path = '/mail-logs?observation_period_id=mock-period-sender-1&observe_window_from=2026-09-14&observe_window_to=2026-09-20&page=1&page_size=20';
    const response = dispatch({ method: 'GET', path });
    const data = response.data as {
      items: { tid: string }[];
      total: number;
      observation: { hits: number; messages: number; missing_messages: number; orphan_hits: number; matches: { recipient: string; configured_action: string; outcome: string; source_ref: string }[]; orphans: unknown[] };
    };

    expect(data.items.map((item) => item.tid)).toEqual(['MIC001', 'MIC053']);
    expect(data.total).toBe(2);
    expect(data.observation).toMatchObject({ hits: 5, messages: 3, missing_messages: 1, orphan_hits: 1 });
    expect(data.observation.matches.length).toBeGreaterThan(0);
    expect(data.observation.matches[0]).toMatchObject({ configured_action: 'quarantine', outcome: 'quarantine' });
    expect(data.observation.orphans).toHaveLength(1);
  });

  it('persists independent protocol observe switches across PUT and GET', () => {
    const initial = dispatch({ method: 'GET', path: '/auth-spoofing/config' }).data as AuthSpoofingConfig;
    const updated: AuthSpoofingConfig = {
      ...initial,
      protocol_checks: {
        ...initial.protocol_checks,
        spf_observe_mode: false,
        dkim_observe_mode: true,
        dmarc_observe_mode: false,
        ptr_observe_mode: true,
      },
    };

    expect(dispatch({ method: 'PUT', path: '/auth-spoofing/config', body: updated })).toMatchObject({
      status: 200,
      data: { ok: true, warnings: [] },
    });
    const saved = dispatch({ method: 'GET', path: '/auth-spoofing/config' }).data as AuthSpoofingConfig;
    expect(saved.protocol_checks).toMatchObject({
      spf_observe_mode: false,
      dkim_observe_mode: true,
      dmarc_observe_mode: false,
      ptr_observe_mode: true,
    });

    saved.protocol_checks.dkim_observe_mode = false;
    const reread = dispatch({ method: 'GET', path: '/auth-spoofing/config' }).data as AuthSpoofingConfig;
    expect(reread.protocol_checks.dkim_observe_mode).toBe(true);
  });
});

describe('observation version fixtures', () => {
  it('keeps phishing domains and closed history separate from current KPI', () => {
    const path='/statistics/rule-effectiveness?tenant_id=1&module=phishing_detection';
    const before=dispatch({method:'GET',path}).data as RuleEffectivenessResponse;
    expect(before.rows.map(r=>r.sub_strategy_id).sort()).toEqual(['admission:external-link','risk_policy','runtime_policy']);
    expect(before.kpi.pending_review_count).toBe(3);
    for(const row of before.rows) {
      const history=dispatch({method:'GET',path:`/statistics/rule-effectiveness/versions?tenant_id=1&module=phishing_detection&sub_strategy_key=${encodeURIComponent(row.sub_strategy_id)}`});
      const data=history.data as {items: import('@/lib/api/rule-effectiveness').RuleEffectivenessRow[]};
      expect(data.items.length).toBe(row.version_no-1);
      expect(data.items.every(v=>v.sub_strategy_id===row.sub_strategy_id && v.version_no<row.version_no)).toBe(true);
      const snapshot=dispatch({method:'GET',path:`/statistics/rule-effectiveness/versions/${row.id}?tenant_id=1`});
      expect(snapshot.status).toBe(200);
      expect(snapshot.data).toMatchObject({version_no:row.version_no,config_snapshot:{schema_version:1}});
      expect(dispatch({method:'GET',path:`/statistics/rule-effectiveness/versions/${row.id}?tenant_id=2`}).status).toBe(404);
    }
    expect(dispatch({method:'GET',path}).data).toEqual(before);
  });
});
