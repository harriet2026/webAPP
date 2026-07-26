import { describe, it, expect } from 'vitest';
import { filterRules, foldKeywords, type ListRule } from './list-filter';

const rule = (over: Partial<ListRule>): ListRule => ({
  id: 1,
  name: 'Rule',
  keywords: [],
  scope: [],
  enabled: true,
  ...over,
});

describe('filterRules', () => {
  const rules: ListRule[] = [
    rule({ id: 1, name: 'Phishing block', keywords: ['evil.com', 'Bad'], enabled: true, scope: ['incoming'] }),
    rule({ id: 2, name: 'Outbound cap', keywords: ['bulk'], enabled: false, scope: ['outgoing'] }),
    rule({ id: 3, name: 'Multi scope', keywords: [], enabled: true, scope: ['incoming', 'internal'] }),
  ];

  it('matches q against name case-insensitively', () => {
    expect(filterRules(rules, 'phish', 'all', 'all').map((r) => r.id)).toEqual([1]);
    expect(filterRules(rules, 'PHISHING', 'all', 'all').map((r) => r.id)).toEqual([1]);
  });

  it('matches q against any keyword case-insensitively', () => {
    expect(filterRules(rules, 'bad', 'all', 'all').map((r) => r.id)).toEqual([1]);
    expect(filterRules(rules, 'BULK', 'all', 'all').map((r) => r.id)).toEqual([2]);
  });

  it('filters by status enabled/disabled/all', () => {
    expect(filterRules(rules, '', 'enabled', 'all').map((r) => r.id)).toEqual([1, 3]);
    expect(filterRules(rules, '', 'disabled', 'all').map((r) => r.id)).toEqual([2]);
    expect(filterRules(rules, '', 'all', 'all').map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('filters by scope using array-includes semantics (multi-scope rules match every scope they contain)', () => {
    expect(filterRules(rules, '', 'all', 'incoming').map((r) => r.id)).toEqual([1, 3]);
    expect(filterRules(rules, '', 'all', 'outgoing').map((r) => r.id)).toEqual([2]);
    expect(filterRules(rules, '', 'all', 'internal').map((r) => r.id)).toEqual([3]);
  });

  it('combines q, status, and scope filters', () => {
    expect(filterRules(rules, 'scope', 'enabled', 'internal').map((r) => r.id)).toEqual([3]);
  });

  it('empty q matches everything', () => {
    expect(filterRules(rules, '', 'all', 'all').map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('foldKeywords', () => {
  it('returns all keywords visible with more=0 when count <= 3', () => {
    expect(foldKeywords([])).toEqual({ visible: [], more: 0 });
    expect(foldKeywords(['a'])).toEqual({ visible: ['a'], more: 0 });
    expect(foldKeywords(['a', 'b', 'c'])).toEqual({ visible: ['a', 'b', 'c'], more: 0 });
  });

  it('shows first 3 and counts the remainder when count > 3', () => {
    expect(foldKeywords(['a', 'b', 'c', 'd'])).toEqual({ visible: ['a', 'b', 'c'], more: 1 });
    expect(foldKeywords(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ visible: ['a', 'b', 'c'], more: 3 });
  });
});
