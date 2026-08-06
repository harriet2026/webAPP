import { describe, it, expect } from 'vitest';
import {
  serializeGroups,
  deserializeGroups,
  remapLeavesToCatalogueKey,
  defaultModeForField,
  MATCH_MODE_TO_OPERATOR,
  OPERATOR_TO_MATCH_MODE,
  parseIntentEngineList,
  encodeIntentEngineList,
  type ConditionLeaf,
  type ConditionGroups,
  type MatchMode,
} from './serde';
import type { FieldDef } from '@/types/unified-rules';
import { CONDITIONS } from './catalogue';
import type { RuleNode } from '@/types/unified-rules';

const leaf = (over: Partial<ConditionLeaf> = {}): ConditionLeaf => ({
  id: 'id-1',
  conditionKey: 'subject',
  field: 'subject',
  operator: 'contain',
  value: 'invoice',
  exclude: false,
  ...over,
});

describe('serializeGroups', () => {
  it('both groups empty → null', () => {
    expect(serializeGroups({ any: [], all: [] })).toBeNull();
  });

  it('single-group collapse: only any → bare OR node (no outer AND)', () => {
    const g: ConditionGroups = { any: [leaf({ id: 'a' })], all: [] };
    const tree = serializeGroups(g);
    expect(tree).toEqual({
      type: 'OR',
      children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'invoice', note: 'subject' }],
    });
  });

  it('single-group collapse: only all → bare AND node (no outer AND wrapper duplication)', () => {
    const g: ConditionGroups = { any: [], all: [leaf({ id: 'b' })] };
    const tree = serializeGroups(g);
    expect(tree).toEqual({
      type: 'AND',
      children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'invoice', note: 'subject' }],
    });
  });

  it('both groups non-empty → AND[ OR[...any], AND[...all] ]', () => {
    const g: ConditionGroups = {
      any: [leaf({ id: 'a', conditionKey: 'subject', field: 'subject' })],
      all: [leaf({ id: 'b', conditionKey: 'body', field: 'content' })],
    };
    const tree = serializeGroups(g);
    expect(tree?.type).toBe('AND');
    expect(tree?.children).toHaveLength(2);
    expect(tree?.children?.[0].type).toBe('OR');
    expect(tree?.children?.[1].type).toBe('AND');
    expect(tree?.children?.[0].children?.[0].field).toBe('subject');
    expect(tree?.children?.[1].children?.[0].field).toBe('content');
  });

  it('exclude → NOT wraps the condition node', () => {
    const g: ConditionGroups = { any: [], all: [leaf({ exclude: true })] };
    const tree = serializeGroups(g);
    expect(tree).toEqual({
      type: 'AND',
      children: [
        {
          type: 'NOT',
          children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'invoice', note: 'subject' }],
        },
      ],
    });
  });

  it('mapKey is carried through onto the condition node', () => {
    const g: ConditionGroups = {
      any: [],
      all: [leaf({ conditionKey: 'senderGroup', field: 'sender_group', mapKey: 'grp-1', operator: 'eq', value: 'true' })],
    };
    const tree = serializeGroups(g);
    expect(tree?.children?.[0]).toMatchObject({ field: 'sender_group', map_key: 'grp-1' });
  });
});

describe('deserializeGroups', () => {
  it('null/undefined tree → empty groups', () => {
    expect(deserializeGroups(null)).toEqual({ any: [], all: [] });
    expect(deserializeGroups(undefined)).toEqual({ any: [], all: [] });
  });

  it('round-trips serializeGroups output (both groups populated)', () => {
    const g: ConditionGroups = {
      any: [
        leaf({ id: 'a1', conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'x' }),
        leaf({ id: 'a2', conditionKey: 'body', field: 'content', operator: 'match', value: 'y', exclude: true }),
      ],
      all: [
        leaf({ id: 'b1', conditionKey: 'senderIp', field: 'client_ip', operator: 'cidr', value: '10.0.0.0/8' }),
      ],
    };
    const tree = serializeGroups(g);
    const back = deserializeGroups(tree);
    expect(back.any).toHaveLength(2);
    expect(back.all).toHaveLength(1);
    expect(back.any[0]).toMatchObject({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'x', exclude: false });
    expect(back.any[1]).toMatchObject({ conditionKey: 'body', field: 'content', operator: 'match', value: 'y', exclude: true });
    expect(back.all[0]).toMatchObject({ conditionKey: 'senderIp', field: 'client_ip', operator: 'cidr', value: '10.0.0.0/8' });
  });

  it('round-trips a single-group (any-only) tree', () => {
    const g: ConditionGroups = { any: [leaf({ id: 'a1' })], all: [] };
    const back = deserializeGroups(serializeGroups(g));
    expect(back.any).toHaveLength(1);
    expect(back.all).toHaveLength(0);
    expect(back.any[0]).toMatchObject({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'invoice', exclude: false });
  });

  it('round-trips a single-group (all-only) tree with exclude', () => {
    const g: ConditionGroups = { any: [], all: [leaf({ id: 'b1', exclude: true })] };
    const back = deserializeGroups(serializeGroups(g));
    expect(back.any).toHaveLength(0);
    expect(back.all).toHaveLength(1);
    expect(back.all[0]).toMatchObject({ exclude: true });
  });

  it('NOT round-trip preserves exclude flag through both single-group and dual-group shapes', () => {
    const g: ConditionGroups = {
      any: [leaf({ id: 'a1', exclude: true })],
      all: [leaf({ id: 'b1', exclude: true, conditionKey: 'body', field: 'content' })],
    };
    const back = deserializeGroups(serializeGroups(g));
    expect(back.any[0].exclude).toBe(true);
    expect(back.all[0].exclude).toBe(true);
  });

  it('flattens a historical/legacy tree: top-level AND with a nested OR subtree → any, other AND leaves → all', () => {
    const legacy: RuleNode = {
      type: 'AND',
      children: [
        {
          type: 'OR',
          children: [
            { type: 'condition', field: 'subject', operator: 'contain', value: 'a' },
            { type: 'condition', field: 'content', operator: 'contain', value: 'b' },
          ],
        },
        { type: 'condition', field: 'client_ip', operator: 'cidr', value: '1.2.3.0/24' },
      ],
    };
    const out = deserializeGroups(legacy);
    expect(out.any).toHaveLength(2);
    expect(out.any.map((l) => l.field)).toEqual(['subject', 'content']);
    expect(out.all).toHaveLength(1);
    expect(out.all[0].field).toBe('client_ip');
  });

  it('flattens a bare top-level AND of plain conditions (no OR) into all', () => {
    const legacy: RuleNode = {
      type: 'AND',
      children: [
        { type: 'condition', field: 'subject', operator: 'contain', value: 'a' },
        { type: 'condition', field: 'content', operator: 'contain', value: 'b' },
      ],
    };
    const out = deserializeGroups(legacy);
    expect(out.any).toHaveLength(0);
    expect(out.all).toHaveLength(2);
  });

  it('flattens a bare top-level OR into any', () => {
    const legacy: RuleNode = {
      type: 'OR',
      children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'a' }],
    };
    const out = deserializeGroups(legacy);
    expect(out.any).toHaveLength(1);
    expect(out.all).toHaveLength(0);
  });

  it('flattens a bare root condition (no AND/OR wrapper) into a single all leaf', () => {
    const legacy: RuleNode = { type: 'condition', field: 'subject', operator: 'contain', value: 'a' };
    const out = deserializeGroups(legacy);
    expect(out.all).toHaveLength(1);
    expect(out.all[0].field).toBe('subject');
  });

  it('flattens a bare root NOT-wrapped condition into a single excluded all leaf', () => {
    const legacy: RuleNode = {
      type: 'NOT',
      children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'a' }],
    };
    const out = deserializeGroups(legacy);
    expect(out.all).toHaveLength(1);
    expect(out.all[0]).toMatchObject({ field: 'subject', exclude: true });
  });

  it('assigns a non-empty id to every deserialized leaf', () => {
    const legacy: RuleNode = {
      type: 'OR',
      children: [{ type: 'condition', field: 'subject', operator: 'contain', value: 'a' }],
    };
    const out = deserializeGroups(legacy);
    expect(out.any[0].id).toBeTruthy();
  });
});

describe('remapLeavesToCatalogueKey', () => {
  it('leaves a valid conditionKey/field pairing untouched', () => {
    const leaves = [leaf({ conditionKey: 'subject', field: 'subject' })];
    const out = remapLeavesToCatalogueKey(leaves, CONDITIONS);
    expect(out[0].conditionKey).toBe('subject');
  });

  it('remaps when conditionKey is missing (empty note) by reverse-looking-up the field', () => {
    const leaves = [leaf({ conditionKey: '', field: 'sender_group' })];
    const out = remapLeavesToCatalogueKey(leaves, CONDITIONS);
    expect(out[0].conditionKey).toBe('senderGroup');
  });

  it('remaps when conditionKey does not match any catalogue entry for the field', () => {
    const leaves = [leaf({ conditionKey: 'bogusKey', field: 'client_ip' })];
    const out = remapLeavesToCatalogueKey(leaves, CONDITIONS);
    expect(out[0].conditionKey).toBe('senderIp');
  });

  it('urls field with no/invalid note defaults to url (not urlDomain)', () => {
    const leaves = [leaf({ conditionKey: '', field: 'urls' })];
    const out = remapLeavesToCatalogueKey(leaves, CONDITIONS);
    expect(out[0].conditionKey).toBe('url');
  });

  it('urls field with note=urlDomain is preserved (disambiguation still works)', () => {
    const leaves = [leaf({ conditionKey: 'urlDomain', field: 'urls' })];
    const out = remapLeavesToCatalogueKey(leaves, CONDITIONS);
    expect(out[0].conditionKey).toBe('urlDomain');
  });

  it('unknown field with no catalogue match is left as-is', () => {
    const leaves = [leaf({ conditionKey: '', field: 'totally_unknown_field' })];
    const out = remapLeavesToCatalogueKey(leaves, CONDITIONS);
    expect(out[0].conditionKey).toBe('');
    expect(out[0].field).toBe('totally_unknown_field');
  });
});

describe('OPERATOR_TO_MATCH_MODE is the strict inverse of MATCH_MODE_TO_OPERATOR', () => {
  it('every mode maps to a unique operator', () => {
    const ops = Object.values(MATCH_MODE_TO_OPERATOR);
    expect(new Set(ops).size).toBe(ops.length);
  });
  it('round-trip mode → operator → mode is identity for all modes', () => {
    for (const mode of Object.keys(MATCH_MODE_TO_OPERATOR) as MatchMode[]) {
      const op = MATCH_MODE_TO_OPERATOR[mode];
      expect(OPERATOR_TO_MATCH_MODE[op]).toBe(mode);
    }
  });
});

describe('defaultModeForField', () => {
  const fd = (over: Partial<FieldDef> = {}): FieldDef => ({
    label: 'x', type: 'string', min_stage: 'data', operators: ['contain', 'eq', 'within'], supported: true, ...over,
  });

  it('prefers contains for a plain string field', () => {
    expect(defaultModeForField(fd())).toBe('contains');
  });

  it('prefers cidr for an ip field when supported', () => {
    expect(defaultModeForField(fd({ type: 'ip', operators: ['cidr', 'within', 'eq'] }))).toBe('cidr');
  });

  it('prefers gt for a number field when supported', () => {
    expect(defaultModeForField(fd({ type: 'number', operators: ['gt', 'eq'] }))).toBe('gt');
  });

  it('falls back to equals when the preferred operator is unsupported', () => {
    expect(defaultModeForField(fd({ type: 'number', operators: ['eq'] }))).toBe('equals');
  });

  it('applies the send_time field override to between', () => {
    expect(defaultModeForField(fd({ type: 'number', operators: ['between', 'eq'] }), 'send_time')).toBe('between');
  });

  it('applies the send_dow field override to matchAny', () => {
    expect(defaultModeForField(fd({ type: 'number', operators: ['within', 'eq'] }), 'send_dow')).toBe('matchAny');
  });

  it('ignores a field override whose operator is unsupported and falls through to the type preference', () => {
    expect(defaultModeForField(fd({ type: 'number', operators: ['eq'] }), 'send_time')).toBe('equals');
  });
});

// 意图引擎取值编解码（GT-12750 契约裁决：leaf.value 为 JSON 数组，废弃早期
// 「intent:mode[:lo,hi];...」自定义文法——分隔符与后端 within 逗号拆分冲突）。
// 面板与表达式预览共用，往返必须无损；lo/hi 以字符串原样往返（编辑中间态如
// "0." 不能被数字化毁掉）。
describe('intent engine multi-intent list codec (JSON)', () => {
  it('round-trips multiple intents each with its own mode/threshold', () => {
    const s = encodeIntentEngineList([
      { intent: 'phishing', mode: 'threshold', lo: '0.6', hi: '0.9' },
      { intent: 'spam', mode: 'classification', lo: '', hi: '' },
    ]);
    expect(JSON.parse(s)).toEqual([
      { intent: 'phishing', mode: 'threshold', lo: '0.6', hi: '0.9' },
      { intent: 'spam', mode: 'classification' },
    ]);
    const back = parseIntentEngineList(s);
    expect(back).toHaveLength(2);
    expect(back[0]).toMatchObject({ intent: 'phishing', mode: 'threshold', lo: '0.6', hi: '0.9' });
    expect(back[1]).toMatchObject({ intent: 'spam', mode: 'classification' });
  });

  it('treats an empty value as an empty list', () => {
    expect(parseIntentEngineList('')).toEqual([]);
    expect(encodeIntentEngineList([])).toBe('');
  });

  it('dedupes the same intent, keeping the last-written entry', () => {
    const back = parseIntentEngineList(JSON.stringify([
      { intent: 'phishing', mode: 'classification' },
      { intent: 'phishing', mode: 'threshold', lo: '0.2', hi: '0.8' },
    ]));
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ intent: 'phishing', mode: 'threshold', lo: '0.2', hi: '0.8' });
  });

  it('drops empty/blank entries and unselected intents', () => {
    const back = parseIntentEngineList(JSON.stringify([
      { intent: 'phishing', mode: 'classification' },
      {},
      { intent: '', mode: 'threshold', lo: '0.1', hi: '0.2' },
      { intent: 'spam', mode: 'classification' },
    ]));
    expect(back.map((e) => e.intent)).toEqual(['phishing', 'spam']);
  });

  it('fails closed on malformed / non-JSON / legacy-grammar values', () => {
    expect(parseIntentEngineList('phishing:classification')).toEqual([]);
    expect(parseIntentEngineList('{"intent":"phishing"}')).toEqual([]);
    expect(parseIntentEngineList('[not json')).toEqual([]);
  });

  it('preserves in-progress threshold input verbatim (string round-trip)', () => {
    const s = encodeIntentEngineList([{ intent: 'spam', mode: 'threshold', lo: '0.', hi: '' }]);
    const back = parseIntentEngineList(s);
    expect(back[0]).toMatchObject({ lo: '0.', hi: '' });
  });
});
