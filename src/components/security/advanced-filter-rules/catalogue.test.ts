import { describe, it, expect } from 'vitest';
import { CONDITIONS, computeCatalogueItem, type ConditionDef, type PanelKind } from './catalogue';
import type { FieldDef } from '@/types/unified-rules';

const fd = (over: Partial<FieldDef> = {}): FieldDef =>
  ({ label: 'x', type: 'string', supported: true, ...over } as FieldDef);

describe('CONDITIONS catalogue — 49 条件目录', () => {
  it('has exactly 49 entries', () => {
    expect(CONDITIONS).toHaveLength(49);
  });

  it('all keys are unique', () => {
    const keys = CONDITIONS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('category counts: mailBasic=18 / attachment=13 / security=18', () => {
    const byCategory = (cat: ConditionDef['category']) =>
      CONDITIONS.filter((c) => c.category === cat).length;
    expect(byCategory('mailBasic')).toBe(18);
    expect(byCategory('attachment')).toBe(13);
    // 已移除 rblResult / displayNameSpoof 两个 security 条件，20 → 18。
    expect(byCategory('security')).toBe(18);
  });

  it('panel kind counts match the layer-3 中栏表 kind column', () => {
    const byPanel = (panel: PanelKind) => CONDITIONS.filter((c) => c.panel === panel).length;
    expect(byPanel('text')).toBe(15);
    expect(byPanel('number')).toBe(14);
    // comprehensiveEngineResult（意图引擎）已从 'select' 独立为专门的 'intentEngine'
    // 面板（分类优先 / 分段阈值双模式，见 ConditionConfigPanel 的 IntentEngineSection）。
    // 又移除了 rblResult / displayNameSpoof 两个 select 条件，故 select 由 12 再降为 10；
    // intentEngine 仍为 1。
    expect(byPanel('select')).toBe(10);
    expect(byPanel('intentEngine')).toBe(1);
    // senderOrganization 已从 'group' 独立为专门的 'orgDept' 面板（配置面板复用
    // 组织通讯录部门树多选，见 ConditionConfigPanel 的 OrgDepartmentSection），
    // 因此 group 由 5 降为 4、新增 orgDept=1，两者之和不变，总数仍为 51。
    expect(byPanel('group')).toBe(4);
    expect(byPanel('orgDept')).toBe(1);
    expect(byPanel('featureGroup')).toBe(0);
    expect(byPanel('cidr')).toBe(1);
    expect(byPanel('time')).toBe(1);
    expect(byPanel('weekday')).toBe(1);
    expect(byPanel('mime')).toBe(1);
  });

  it('panel kind counts sum to 49', () => {
    const kinds: PanelKind[] = [
      'text', 'number', 'select', 'group', 'featureGroup', 'orgDept', 'cidr', 'time', 'weekday', 'mime', 'intentEngine',
    ];
    const sum = kinds.reduce((acc, k) => acc + CONDITIONS.filter((c) => c.panel === k).length, 0);
    expect(sum).toBe(49);
  });

  it('senderIp is the sole cidr panel and attachmentType the sole mime panel', () => {
    expect(CONDITIONS.find((c) => c.panel === 'cidr')?.key).toBe('senderIp');
    expect(CONDITIONS.find((c) => c.panel === 'mime')?.key).toBe('attachmentType');
  });

  it('envelope conditions are flagged (envelopeSender / envelopeRecipient)', () => {
    const envelopeKeys = CONDITIONS.filter((c) => c.envelope).map((c) => c.key);
    expect(envelopeKeys.sort()).toEqual(['envelopeRecipient', 'envelopeSender']);
  });

  it('no catalogue-only (field===null) entries remain: senderOrganization now maps to sender_dept_path', () => {
    const nullFieldKeys = CONDITIONS.filter((c) => c.field === null).map((c) => c.key).sort();
    expect(nullFieldKeys).toEqual([]);
    expect(CONDITIONS.find((c) => c.key === 'senderOrganization')?.field).toBe('sender_dept_path');
  });
});

describe('computeCatalogueItem — no stage-gating parameter', () => {
  const def = (over: Partial<ConditionDef> = {}): ConditionDef =>
    ({ key: 'k', category: 'security', field: 'k', panel: 'text', ...over });

  it('field===null → catalogueOnly, not selectable', () => {
    const item = computeCatalogueItem(def({ field: null }), {});
    expect(item.selectable).toBe(false);
    expect(item.reasonKey).toBe('catalogueOnly');
  });

  it('missing FieldDef → upcoming, not selectable', () => {
    const item = computeCatalogueItem(def({ field: 'missing_field' }), {});
    expect(item.selectable).toBe(false);
    expect(item.reasonKey).toBe('upcoming');
  });

  it('FieldDef present but supported=false → upcoming', () => {
    const item = computeCatalogueItem(def({ field: 'rbl' }), { rbl: fd({ supported: false }) });
    expect(item.selectable).toBe(false);
    expect(item.reasonKey).toBe('upcoming');
  });

  it('FieldDef present and supported=true → selectable regardless of stage', () => {
    const item = computeCatalogueItem(def({ field: 'subject' }), { subject: fd({ supported: true }) });
    expect(item.selectable).toBe(true);
    expect(item.reasonKey).toBeNull();
  });

  it('every catalogue entry resolves without throwing, given a fully-supported field map', () => {
    const allSupported: Record<string, FieldDef> = {};
    for (const c of CONDITIONS) {
      if (c.field) allSupported[c.field] = fd({ supported: true });
    }
    for (const c of CONDITIONS) {
      const item = computeCatalogueItem(c, allSupported);
      if (c.field === null) {
        expect(item.reasonKey).toBe('catalogueOnly');
      } else {
        expect(item.reasonKey).toBeNull();
        expect(item.selectable).toBe(true);
      }
    }
  });
});
