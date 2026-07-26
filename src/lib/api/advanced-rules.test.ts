import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from './client';
import {
  listAdvancedRules,
  createAdvancedRule,
  updateAdvancedRule,
  deleteAdvancedRule,
  toggleAdvancedRule,
  getAdvancedFieldDefinitions,
  getModuleEnabled,
  setModuleEnabled,
  getHitTrend,
  getEffectStats,
  listRuleVersions,
  rollbackRule,
  testRuleWithEml,
} from './advanced-rules';
import type { CreateRuleRequest, UpdateRuleRequest, RuleNode } from '@/types/unified-rules';

// A stub requestFn recording (path, options) and returning a canned value.
function makeStub(returnValue: unknown) {
  const calls: { path: string; options?: unknown }[] = [];
  const fn = vi.fn(async (path: string, options?: unknown) => {
    calls.push({ path, options });
    return returnValue as never;
  });
  return { fn: fn as never, calls };
}

describe('advanced-rules API', () => {
  it('listAdvancedRules → GET /unified-rules?rule_page=advanced_rules, returns items', async () => {
    const { fn, calls } = makeStub({ items: [{ id: 1 }, { id: 2 }] });
    const result = await listAdvancedRules(fn);
    expect(calls[0].path).toBe('/unified-rules?rule_page=advanced_rules');
    expect(calls[0].options).toBeUndefined();
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('listAdvancedRules returns [] when items missing', async () => {
    const { fn } = makeStub({});
    expect(await listAdvancedRules(fn)).toEqual([]);
  });

  it('createAdvancedRule → POST /unified-rules with body', async () => {
    const { fn, calls } = makeStub({ id: 5 });
    const data = { name: 'r', rule_class: 'action', stage: 'data', condition_tree: { type: 'AND' } } as CreateRuleRequest;
    await createAdvancedRule(data, fn);
    expect(calls[0].path).toBe('/unified-rules');
    expect(calls[0].options).toEqual({ method: 'POST', body: data });
  });

  it('updateAdvancedRule → PUT /unified-rules/:id with body', async () => {
    const { fn, calls } = makeStub({ id: 7 });
    const data = { name: 'x' } as UpdateRuleRequest;
    await updateAdvancedRule(7, data, fn);
    expect(calls[0].path).toBe('/unified-rules/7');
    expect(calls[0].options).toEqual({ method: 'PUT', body: data });
  });

  it('deleteAdvancedRule → DELETE /unified-rules/:id', async () => {
    const { fn, calls } = makeStub(undefined);
    await deleteAdvancedRule(9, fn);
    expect(calls[0].path).toBe('/unified-rules/9');
    expect(calls[0].options).toEqual({ method: 'DELETE' });
  });

  it('toggleAdvancedRule → PUT /unified-rules/:id/status with {is_active}', async () => {
    const { fn, calls } = makeStub({ id: 3 });
    await toggleAdvancedRule(3, false, fn);
    expect(calls[0].path).toBe('/unified-rules/3/status');
    expect(calls[0].options).toEqual({ method: 'PUT', body: { is_active: false } });
  });

  it('getAdvancedFieldDefinitions → GET field-definitions with stage=sideline&page=advanced_rules', async () => {
    const { fn, calls } = makeStub({ fields: {} });
    await getAdvancedFieldDefinitions(fn);
    expect(calls[0].path).toBe('/unified-rules/field-definitions?stage=sideline&page=advanced_rules');
  });

  it('getModuleEnabled → GET /security/advanced-rules/enabled', async () => {
    const { fn, calls } = makeStub({ enabled: true });
    const r = await getModuleEnabled(fn);
    expect(calls[0].path).toBe('/security/advanced-rules/enabled');
    expect(r).toEqual({ enabled: true });
  });

  it('setModuleEnabled → PUT /security/advanced-rules/enabled with {enabled}', async () => {
    const { fn, calls } = makeStub(undefined);
    await setModuleEnabled(true, fn);
    expect(calls[0].path).toBe('/security/advanced-rules/enabled');
    expect(calls[0].options).toEqual({ method: 'PUT', body: { enabled: true } });
  });

  it('getHitTrend → GET /unified-rules/:id/hit-trend?range=', async () => {
    const { fn, calls } = makeStub({ range: '7d', points: [] });
    await getHitTrend(4, '7d', fn);
    expect(calls[0].path).toBe('/unified-rules/4/hit-trend?range=7d');
  });

  it('getEffectStats → GET /unified-rules/:id/effect-stats?range=', async () => {
    const { fn, calls } = makeStub({ range: '24h' });
    await getEffectStats(4, '24h', fn);
    expect(calls[0].path).toBe('/unified-rules/4/effect-stats?range=24h');
  });

  it('listRuleVersions → GET /unified-rules/:id/versions', async () => {
    const { fn, calls } = makeStub({ items: [] });
    await listRuleVersions(11, fn);
    expect(calls[0].path).toBe('/unified-rules/11/versions');
  });

  it('rollbackRule → POST /unified-rules/:id/rollback with {version_no}', async () => {
    const { fn, calls } = makeStub({ id: 11 });
    await rollbackRule(11, 3, fn);
    expect(calls[0].path).toBe('/unified-rules/11/rollback');
    expect(calls[0].options).toEqual({ method: 'POST', body: { version_no: 3 } });
  });

  describe('testRuleWithEml (multipart fetch)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('POSTs multipart FormData to /api/v1/unified-rules/test-eml', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ matched: true, evaluated_conditions: [], unavailable_fields: [], derived: {} }),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const file = new File(['raw eml'], 'test.eml', { type: 'message/rfc822' });
      const tree: RuleNode = { type: 'condition', field: 'subject', operator: 'contains', value: 'hi' };
      const result = await testRuleWithEml(file, tree);

      expect(result.matched).toBe(true);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/v1/unified-rules/test-eml');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      // No manual Content-Type — browser sets the boundary.
      expect(init.headers).toBeUndefined();

      const body = init.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('file')).toBe(file);
      expect(body.get('condition_tree')).toBe(JSON.stringify(tree));
    });

    it('throws ApiError on non-2xx', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'bad eml' }),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const file = new File(['x'], 'x.eml');
      const tree: RuleNode = { type: 'AND', children: [] };
      await expect(testRuleWithEml(file, tree)).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        message: 'bad eml',
      });
      await expect(testRuleWithEml(file, tree)).rejects.toBeInstanceOf(ApiError);
    });
  });
});
