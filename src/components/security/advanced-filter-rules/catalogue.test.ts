import { describe, it, expect } from 'vitest';
import { CONDITIONS, computeCatalogueItem, type ConditionDef, type PanelKind } from './catalogue';
import type { FieldDef } from '@/types/unified-rules';

const fd = (over: Partial<FieldDef> = {}): FieldDef =>
  ({ label: 'x', type: 'string', supported: true, ...over } as FieldDef);

describe('CONDITIONS catalogue — 51 条件目录', () => {
  it('has exactly 51 entries', () => {
    expect(CONDITIONS).toHaveLength(51);
  });

  it('all keys are unique', () => {
    const keys = CONDITIONS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('category counts: mailBasic=18 / attachment=13 / security=20', () => {
    const byCategory = (cat: ConditionDef['category']) =>
      CONDITIONS.filter((c) => c.category === cat).length;
    expect(byCategory('mailBasic')).toBe(18);
    expect(byCategory('attachment')).toBe(13);
    expect(byCategory('security')).toBe(20);
  });

  it('panel kind counts match the layer-3 中栏表 kind column', () => {
    const byPanel = (panel: PanelKind) => CONDITIONS.filter((c) => c.panel === panel).length;
    expect(byPanel('text')).toBe(15);
    expect(byPanel('number')).toBe(14);
    expect(byPanel('select')).toBe(13);
    // NOTE: layer-3-conditions.html's own KINDMAP classifies senderOrganization
    // as kind 'grp' alongside senderGroup/senderIpGroup/geoIpCountry/geoIpRegion,
    // giving group=5 (not 4 as a shorthand elsewhere might suggest). Using
    // group=4 would leave the panel-kind total at 53, one short of 54, so this
    // count follows the HTML spec's own kind column per its own tie-break rule.
    expect(byPanel('group')).toBe(5);
    expect(byPanel('featureGroup')).toBe(0);
    expect(byPanel('cidr')).toBe(1);
    expect(byPanel('time')).toBe(1);
    expect(byPanel('weekday')).toBe(1);
    expect(byPanel('mime')).toBe(1);
  });

  it('panel kind counts sum to 54', () => {
    const kinds: PanelKind[] = [
      'text', 'number', 'select', 'group', 'featureGroup', 'cidr', 'time', 'weekday', 'mime',
    ];
    const sum = kinds.reduce((acc, k) => acc + CONDITIONS.filter((c) => c.panel === k).length, 0);
    expect(sum).toBe(51);
  });

  it('senderIp is the sole cidr panel and attachmentType the sole mime panel', () => {
    expect(CONDITIONS.find((c) => c.panel === 'cidr')?.key).toBe('senderIp');
    expect(CONDITIONS.find((c) => c.panel === 'mime')?.key).toBe('attachmentType');
  });

  it('envelope conditions are flagged (envelopeSender / envelopeRecipient)', () => {
    const envelopeKeys = CONDITIONS.filter((c) => c.envelope).map((c) => c.key);
    expect(envelopeKeys.sort()).toEqual(['envelopeRecipient', 'envelopeSender']);
  });

  it('catalogue-only entry (field===null) is senderOrganization', () => {
    const nullFieldKeys = CONDITIONS.filter((c) => c.field === null).map((c) => c.key).sort();
    expect(nullFieldKeys).toEqual(['senderOrganization']);
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
