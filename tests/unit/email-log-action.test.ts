import { describe, it, expect } from 'vitest';
import {
  actionToVariant,
  actionExtraClass,
  actionLabel,
  summarizeFinalActions,
} from '@/lib/email-log-action';

const fakeT = (key: string): string => {
  const map: Record<string, string> = {
    'logs.actionLabels.accept': 'Accept',
    'logs.actionLabels.reject': 'Reject',
    'logs.actionLabels.mixed': 'Mixed',
  };
  return map[key] ?? key;
};

describe('actionToVariant', () => {
  it('maps accept to secondary', () => {
    expect(actionToVariant('accept')).toBe('secondary');
  });
  it('maps reject/bounce/discard to destructive', () => {
    expect(actionToVariant('reject')).toBe('destructive');
    expect(actionToVariant('bounce')).toBe('destructive');
    expect(actionToVariant('discard')).toBe('destructive');
  });
  it('maps quarantine/sideline/audit/mixed to outline', () => {
    expect(actionToVariant('quarantine')).toBe('outline');
    expect(actionToVariant('sideline')).toBe('outline');
    expect(actionToVariant('audit')).toBe('outline');
    expect(actionToVariant('mixed')).toBe('outline');
  });
  it('is case-insensitive', () => {
    expect(actionToVariant('ACCEPT')).toBe('secondary');
  });
  it('falls back to default for unknown action', () => {
    expect(actionToVariant('weird')).toBe('default');
    expect(actionToVariant('')).toBe('default');
    expect(actionToVariant(null)).toBe('default');
  });
});

describe('actionExtraClass', () => {
  it('returns amber styling only for mixed', () => {
    expect(actionExtraClass('mixed')).toContain('amber');
    expect(actionExtraClass('accept')).toBe('');
    expect(actionExtraClass('')).toBe('');
  });
});

describe('actionLabel', () => {
  it('uses translator output when present', () => {
    expect(actionLabel('accept', fakeT)).toBe('Accept');
    expect(actionLabel('mixed', fakeT)).toBe('Mixed');
  });
  it('falls back to raw lowercased action when translation missing', () => {
    expect(actionLabel('weird', fakeT)).toBe('weird');
    expect(actionLabel('QUARANTINE', fakeT)).toBe('quarantine');
  });
  it('returns dash for empty', () => {
    expect(actionLabel('', fakeT)).toBe('-');
    expect(actionLabel(null, fakeT)).toBe('-');
  });
});

describe('summarizeFinalActions', () => {
  it('counts unique actions and sorts by count desc', () => {
    const result = summarizeFinalActions({
      'a@x.com': { rule_id: 1, action: 'accept' },
      'b@x.com': { rule_id: 1, action: 'accept' },
      'c@x.com': { rule_id: 2, action: 'reject' },
    });
    expect(result).toEqual([
      { action: 'accept', count: 2 },
      { action: 'reject', count: 1 },
    ]);
  });
  it('returns empty for undefined input', () => {
    expect(summarizeFinalActions(undefined)).toEqual([]);
  });
  it('skips entries with empty action', () => {
    const result = summarizeFinalActions({
      'a@x.com': { rule_id: 1, action: '' },
      'b@x.com': { rule_id: 1, action: 'accept' },
    });
    expect(result).toEqual([{ action: 'accept', count: 1 }]);
  });
  it('normalizes case', () => {
    const result = summarizeFinalActions({
      'a@x.com': { rule_id: 1, action: 'Accept' },
      'b@x.com': { rule_id: 1, action: 'ACCEPT' },
    });
    expect(result).toEqual([{ action: 'accept', count: 2 }]);
  });
});
