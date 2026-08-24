import { describe, expect, it } from 'vitest';
import { getRulePrimaryAction, getRuleScope, parseRuleMetadata } from './list-row';

describe('list-row metadata readers', () => {
  it('parses well-formed JSON metadata', () => {
    expect(parseRuleMetadata('{"primary_action":"discard","scope":["incoming"]}')).toEqual({
      primary_action: 'discard',
      scope: ['incoming'],
    });
  });

  it('returns null for missing/undefined metadata', () => {
    expect(parseRuleMetadata(undefined)).toBeNull();
    expect(parseRuleMetadata('')).toBeNull();
  });

  it('returns null for malformed JSON rather than throwing', () => {
    expect(parseRuleMetadata('{not json')).toBeNull();
  });

  it('reads a valid primary_action', () => {
    expect(getRulePrimaryAction({ metadata: '{"primary_action":"quarantine"}' })).toBe('quarantine');
  });

  it('falls back to proceed for a missing/unknown primary_action', () => {
    expect(getRulePrimaryAction({ metadata: '{}' })).toBe('proceed');
    expect(getRulePrimaryAction({ metadata: '{"primary_action":"bogus"}' })).toBe('proceed');
    expect(getRulePrimaryAction({ metadata: undefined })).toBe('proceed');
  });

  it('reads scope as a string array', () => {
    expect(getRuleScope({ metadata: '{"scope":["incoming","outgoing","internal"]}' })).toEqual([
      'incoming',
      'outgoing',
      'internal',
    ]);
  });

  it('filters non-string scope entries and defaults to [] when absent/malformed', () => {
    expect(getRuleScope({ metadata: '{"scope":["incoming",1,null]}' })).toEqual(['incoming']);
    expect(getRuleScope({ metadata: '{}' })).toEqual([]);
    expect(getRuleScope({ metadata: undefined })).toEqual([]);
  });
});
