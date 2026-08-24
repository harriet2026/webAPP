import { beforeEach, describe, expect, it } from 'vitest';
import { dispatch, isMockable } from './dispatcher';
import { resetPhishingMockState } from './fixtures';

describe('phishing demo boundary', () => {
  beforeEach(() => resetPhishingMockState());
  it.each([
    { method: 'GET', path: '/phishing-agent/control', expected: 200 },
    { method: 'PUT', path: '/phishing-agent/control', body: { enabled: true, expected_revision: 1 }, expected: 200 },
    { method: 'GET', path: '/phishing-agent/config', expected: 200 },
    { method: 'PUT', path: '/phishing-agent/config', body: { risk_policy: { expected_version: 1, cutoffs: { low: 40, medium: 70, high: 90 }, policies: { suspicious: { base_disposition: 'proceed' }, low: { base_disposition: 'proceed' }, medium: { base_disposition: 'audit' }, high: { base_disposition: 'quarantine' } } }, runtime_policy: { expected_version: 1, run_mode: 'realtime', observe_action: 'accept', observe_mark_enabled: true, timeout_minutes: 5, max_recheck_minutes: 30, timeout_async_enabled: true } }, expected: 200 },
    { method: 'GET', path: '/phishing-agent/analysis-config', expected: 200 },
    { method: 'PUT', path: '/phishing-agent/analysis-config', body: { expected_version: 1, netdisk_domain: false, netdisk_extract: false, netdisk_spoof: false }, expected: 200 },
    { method: 'GET', path: '/phishing-agent/admission-rules', expected: 200 },
  ])('serves deterministic demo data for $method $path', ({ method, path, body, expected }) => {
    expect(isMockable(method, path)).toBe(true);
    expect(dispatch({ method, path, body })).toMatchObject({ status: expected });
  });

  it('keeps detection rows stable with internally consistent policy facts', () => {
    const response = dispatch({ method: 'GET', path: '/phishing-agent/detection-logs' });
    expect(response.status).toBe(200);
    const item = (response.data as { items: Array<Record<string, unknown>> }).items[0];
    expect(item).toMatchObject({ display_statuses: expect.any(Array), recipient_dispositions: expect.any(Array) });
    expect(item).toMatchObject({ policy_disposition: 'quarantine', risk_level: 'high', confidence: 0.96, agent_rounds: 5 });
  });

  it('maps every completed confidence band to the configured policy', () => {
    const response = dispatch({ method: 'GET', path: '/phishing-agent/detection-logs' });
    expect(response.status).toBe(200);
    const items = (response.data as { items: Array<{ confidence?: number | null; risk_level?: string; policy_disposition?: string; display_statuses: Array<{ status: string }>; recall_status: string }> }).items;
    const expected = new Map([
      [0.62, ['low', 'proceed']], [0.79, ['medium', 'audit']],
      [0.85, ['medium', 'audit']], [0.88, ['medium', 'audit']], [0.94, ['high', 'quarantine']], [0.96, ['high', 'quarantine']], [0.98, ['high', 'quarantine']],
    ]);
    for (const item of items) {
      if (item.confidence == null) continue;
      expect([item.risk_level, item.policy_disposition]).toEqual(expected.get(item.confidence));
      if (item.recall_status === 'recalled') {
        expect(item.display_statuses.map(({ status }) => status)).toContain('recall_success');
        expect(item.display_statuses.map(({ status }) => status)).not.toContain('partial_recall_success');
      }
    }
  });

  it('keeps completed fixture semantics free of observe/undecided side effects', () => {
    const response = dispatch({ method: 'GET', path: '/phishing-agent/detection-logs' });
    expect(response.status).toBe(200);
    type FixtureRow = { detection_mode?: string; recall_status?: string; recalls?: unknown[]; disposition_actions?: unknown[]; disposition?: string; display_statuses?: unknown; verdict?: string; confidence?: number | null; risk_level?: string | null; policy_disposition?: string | null };
    const items = (response.data as { items: FixtureRow[] }).items;
    const observed = items.find((item) => item.detection_mode === 'observe');
    expect(observed).toMatchObject({ recall_status: 'none', recalls: [], disposition_actions: [], disposition: 'pass' });
    expect(observed?.display_statuses).toEqual([{ status: 'delivered', count: 1 }]);
    const undecided = items.find((item) => item.verdict === '');
    expect(undecided).toMatchObject({ confidence: null, risk_level: null, policy_disposition: null });
  });

  it('creates, reads, updates, deletes, and rejects missing admission rules deterministically', () => {
    const payload = { name: 'CRUD rule', directions: ['inbound'], require_url: true, sender_first_seen: false, require_qrcode: false, enabled: true };
    const created = dispatch({ method: 'POST', path: '/phishing-agent/admission-rules', body: payload });
    expect(created).toMatchObject({ status: 201, data: { id: 1, rule_uid: 'demo-rule-1', revision: 'demo-rev-1', ...payload } });
    expect(dispatch({ method: 'GET', path: '/phishing-agent/admission-rules' })).toMatchObject({ status: 200, data: { items: [expect.objectContaining({ id: 1, name: 'CRUD rule' })] } });
    const updated = { ...payload, name: 'CRUD rule updated', enabled: false, expected_revision: 'demo-rev-1' };
    expect(dispatch({ method: 'PUT', path: '/phishing-agent/admission-rules/1', body: updated })).toEqual({ status: 204, data: null });
    expect(dispatch({ method: 'GET', path: '/phishing-agent/admission-rules' })).toMatchObject({ status: 200, data: { items: [expect.objectContaining({ id: 1, name: 'CRUD rule updated', enabled: false, revision: 'demo-rev-1' })] } });
    expect(dispatch({ method: 'DELETE', path: '/phishing-agent/admission-rules/1' })).toEqual({ status: 204, data: null });
    expect(dispatch({ method: 'GET', path: '/phishing-agent/admission-rules' })).toEqual({ status: 200, data: { items: [] } });
    expect(dispatch({ method: 'DELETE', path: '/phishing-agent/admission-rules/1' })).toMatchObject({ status: 404, data: { error: { code: 'not_found' } } });
    expect(dispatch({ method: 'PUT', path: '/phishing-agent/admission-rules/1/status', body: { enabled: true } })).toMatchObject({ status: 404, data: { error: { code: 'not_found' } } });
  });

  it('updates admission readiness in the demo state', () => {
    const created = dispatch({ method: 'POST', path: '/phishing-agent/admission-rules', body: { name: 'Readiness rule', directions: ['inbound'], require_url: true, sender_first_seen: false, require_qrcode: false, enabled: true } });
    expect(created.status).toBe(201);
    expect(dispatch({ method: 'PUT', path: '/phishing-agent/admission-rules/1/status', body: { enabled: false } })).toEqual({ status: 204, data: null });
    const disabled = dispatch({ method: 'GET', path: '/phishing-agent/admission-rules' });
    expect((disabled.data as { items: Array<{ enabled: boolean }> }).items.some((item) => item.enabled)).toBe(false);
    expect(dispatch({ method: 'PUT', path: '/phishing-agent/admission-rules/1/status', body: { enabled: true } })).toEqual({ status: 204, data: null });
  });
});
