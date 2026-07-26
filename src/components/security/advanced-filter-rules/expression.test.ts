import { describe, it, expect } from 'vitest';
import { summarizeLeaf, renderBriefLine, buildExpressionText, splitDisplayValues } from './expression';
import type { ConditionLeaf, ConditionGroups } from './serde';

// Minimal fake i18n: mirrors the real message shape closely enough for
// pure-function assertions (condition names / matchModes / incomplete
// marker) without pulling in next-intl or the JSON message files.
function fakeT(key: string): string {
  const table: Record<string, string> = {
    'v3Conditions.conditions.subject': '主题',
    'v3Conditions.conditions.urlCount': 'URL 数量',
    'v3Conditions.conditions.senderIp': '发信IP地址',
    'v3Conditions.conditions.sendDayOfWeek': '发信星期',
    'v3Conditions.matchModes.contains': '包含',
    'v3Conditions.matchModes.equals': '等于',
    'v3Conditions.matchModes.gt': '大于',
    'v3Conditions.matchModes.between': '介于',
    'v3Conditions.matchModes.matchAny': '匹配任意',
    incompleteCondition: '[配置不完整]',
  };
  return table[key] ?? key;
}

function leaf(overrides: Partial<ConditionLeaf>): ConditionLeaf {
  return {
    id: 'l1',
    conditionKey: 'subject',
    field: 'subject',
    operator: 'contain',
    value: '',
    exclude: false,
    ...overrides,
  };
}

describe('summarizeLeaf / renderBriefLine', () => {
  it('renders a simple single-value leaf', () => {
    const l = leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'invoice' });
    const s = summarizeLeaf(l, fakeT);
    expect(s.name).toBe('主题');
    expect(s.operatorLabel).toBe('包含');
    expect(s.incomplete).toBe(false);
    const line = renderBriefLine(s, { incompleteMarker: '[配置不完整]', notMarker: '(NOT)' });
    expect(line).toBe('主题 包含 "invoice"');
  });

  it('flags a value-less leaf as [配置不完整]', () => {
    const l = leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: '' });
    const s = summarizeLeaf(l, fakeT);
    expect(s.incomplete).toBe(true);
    const line = renderBriefLine(s, { incompleteMarker: '[配置不完整]', notMarker: '(NOT)' });
    expect(line).toBe('主题 包含 [配置不完整]');
  });

  it('never marks a number leaf as incomplete, even with an empty/zero value', () => {
    const l = leaf({ conditionKey: 'urlCount', field: 'url_count', operator: 'gt', value: '0' });
    const s = summarizeLeaf(l, fakeT);
    expect(s.panel).toBe('number');
    expect(s.incomplete).toBe(false);
  });

  it('folds more than 2 multi-line values into "+N"', () => {
    const l = leaf({
      conditionKey: 'subject',
      field: 'subject',
      operator: 'contain',
      value: 'a\nb\nc\nd',
    });
    const s = summarizeLeaf(l, fakeT);
    expect(s.values).toEqual(['a', 'b']);
    expect(s.foldedCount).toBe(2);
    const line = renderBriefLine(s, { incompleteMarker: '[配置不完整]', notMarker: '(NOT)' });
    expect(line).toBe('主题 包含 "a", "b" +2');
  });

  it('does not fold when there are 2 or fewer values', () => {
    const l = leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'a\nb' });
    const s = summarizeLeaf(l, fakeT);
    expect(s.foldedCount).toBe(0);
  });

  it('ignores blank lines when splitting multi-line values', () => {
    expect(splitDisplayValues('a\n\n b \n')).toEqual(['a', 'b']);
  });

  it('renders a "(NOT)" suffix for excluded leaves', () => {
    const l = leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'x', exclude: true });
    const s = summarizeLeaf(l, fakeT);
    expect(s.exclude).toBe(true);
    const line = renderBriefLine(s, { incompleteMarker: '[配置不完整]', notMarker: '(NOT)' });
    expect(line).toBe('主题 包含 "x" (NOT)');
  });

  it('shows the raw catalogue key (not the translated label) for envelope conditions', () => {
    // envelopeSender is envelope:true in catalogue.ts
    const l = leaf({ conditionKey: 'envelopeSender', field: 'sender', operator: 'contain', value: 'a@b.com' });
    const s = summarizeLeaf(l, fakeT);
    expect(s.envelope).toBe(true);
    expect(s.name).toBe('envelopeSender');
  });

  it('renders a between (number range) pair', () => {
    const l = leaf({ conditionKey: 'urlCount', field: 'url_count', operator: 'between', value: '1,5' });
    const s = summarizeLeaf(l, fakeT);
    expect(s.values).toEqual(['1', '5']);
    const line = renderBriefLine(s, { incompleteMarker: '[配置不完整]', notMarker: '(NOT)' });
    expect(line).toBe('URL 数量 介于 "1", "5"');
  });
});

describe('buildExpressionText', () => {
  const emptyGroups: ConditionGroups = { any: [], all: [] };

  it('returns empty string when both groups are empty', () => {
    expect(buildExpressionText(emptyGroups, fakeT)).toBe('');
  });

  it('collapses to just the OR block when AND group is empty', () => {
    const groups: ConditionGroups = {
      any: [leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'a' })],
      all: [],
    };
    expect(buildExpressionText(groups, fakeT)).toBe('((主题 包含 "a"))');
  });

  it('collapses to just the AND block when OR group is empty', () => {
    const groups: ConditionGroups = {
      any: [],
      all: [leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'a' })],
    };
    expect(buildExpressionText(groups, fakeT)).toBe('((主题 包含 "a"))');
  });

  it('joins both non-empty groups with a literal AND between two parenthesized blocks', () => {
    const groups: ConditionGroups = {
      any: [leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'a' })],
      all: [leaf({ conditionKey: 'urlCount', field: 'url_count', operator: 'gt', value: '5' })],
    };
    expect(buildExpressionText(groups, fakeT)).toBe('((主题 包含 "a"))\nAND\n((URL 数量 大于 "5"))');
  });

  it('joins multiple leaves inside a group with the group connective word', () => {
    const groups: ConditionGroups = {
      any: [
        leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'a' }),
        leaf({ id: 'l2', conditionKey: 'urlCount', field: 'url_count', operator: 'gt', value: '5' }),
      ],
      all: [],
    };
    expect(buildExpressionText(groups, fakeT)).toBe(
      '((主题 包含 "a" OR URL 数量 大于 "5"))',
    );
  });

  it('shows the incomplete marker (untruncated, no folding) inside the full expression', () => {
    const groups: ConditionGroups = {
      any: [leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: '' })],
      all: [],
    };
    expect(buildExpressionText(groups, fakeT)).toBe('((主题 包含 [配置不完整]))');
  });

  it('marks excluded leaves with a NOT(...) wrapper in the full expression', () => {
    const groups: ConditionGroups = {
      any: [leaf({ conditionKey: 'subject', field: 'subject', operator: 'contain', value: 'a', exclude: true })],
      all: [],
    };
    expect(buildExpressionText(groups, fakeT)).toBe('((NOT (主题 包含 "a")))');
  });
});

// GT-12261：map_* 条件必须显示它指向的键，否则重开规则时所有 map 条件
// 都长成「<字段名> 等于 true」，看不出绑定的是哪个群组。
describe('summarizeLeaf map_key rendering (GT-12261)', () => {
  const mapLeaf = (mapKey: string | undefined) => ({
    id: 'x',
    conditionKey: 'featureGroup',
    field: 'feature_group',
    mapKey,
    operator: 'eq',
    value: 'true',
    exclude: false,
  });

  it('shows the feature group name instead of a bare boolean expression', () => {
    const s = summarizeLeaf(mapLeaf('grp:myfeature'), fakeT);
    expect(s.mapKeyLabel).toBe('myfeature');
    expect(s.name).toContain('myfeature');
    expect(renderBriefLine(s, { incompleteMarker: '?', notMarker: 'NOT' })).toContain('myfeature');
  });

  it('keeps the wildcard key unlabelled so existing RBL-style conditions are unchanged', () => {
    const s = summarizeLeaf(mapLeaf('*'), fakeT);
    expect(s.mapKeyLabel).toBe('');
    expect(s.name).not.toContain('[');
  });

  it('is a no-op for conditions without a map key', () => {
    const s = summarizeLeaf(mapLeaf(undefined), fakeT);
    expect(s.mapKeyLabel).toBe('');
    expect(s.name).not.toContain('[');
  });

  it('keeps non-group map keys verbatim (only the grp: prefix is stripped)', () => {
    const s = summarizeLeaf(mapLeaf('zen.spamhaus.org'), fakeT);
    expect(s.mapKeyLabel).toBe('zen.spamhaus.org');
    expect(s.name).toContain('zen.spamhaus.org');
  });
});
