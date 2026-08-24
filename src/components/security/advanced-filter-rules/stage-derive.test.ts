import { describe, it, expect } from 'vitest';
import { deriveStage } from './stage-derive';
import type { FieldDef } from '@/types/unified-rules';
import type { ConditionLeaf } from './serde';

const leaf = (over: Partial<ConditionLeaf> = {}): ConditionLeaf => ({
  id: 'id-1',
  conditionKey: 'subject',
  field: 'subject',
  operator: 'contain',
  value: 'x',
  exclude: false,
  ...over,
});

const fd = (over: Partial<FieldDef> = {}): FieldDef => ({
  label: 'x',
  type: 'string',
  min_stage: 'data',
  operators: [],
  supported: true,
  ...over,
});

describe('deriveStage', () => {
  it('returns sideline when any leaf field has availability sideline_async, overriding action', () => {
    const fieldDefs = { attach_deep_scan: fd({ availability: 'sideline_async', min_stage: 'data' }) };
    const leaves = [leaf({ field: 'attach_deep_scan' })];
    expect(deriveStage(leaves, fieldDefs, 'accept')).toBe('sideline');
    // even for data-only actions, sideline wins.
    expect(deriveStage(leaves, fieldDefs, 'quarantine')).toBe('sideline');
  });

  it('returns data for data-only actions when no sideline field is present', () => {
    const fieldDefs = { ip: fd({ min_stage: 'mail' }) };
    const leaves = [leaf({ field: 'ip' })];
    expect(deriveStage(leaves, fieldDefs, 'quarantine')).toBe('data');
    expect(deriveStage(leaves, fieldDefs, 'audit')).toBe('data');
    expect(deriveStage(leaves, fieldDefs, 'discard')).toBe('data');
    expect(deriveStage(leaves, fieldDefs, 'proceed')).toBe('data');
  });

  it('floors the max-of-min_stage result at data: since data is the last element of the ' +
    'truncated stage order (mail<rcpt<header<data), no non-sideline field min_stage can push ' +
    'the result past data', () => {
    const fieldDefsHeader = { subject: fd({ min_stage: 'header' }) };
    expect(deriveStage([leaf({ field: 'subject' })], fieldDefsHeader, 'accept')).toBe('data');

    const fieldDefsMail = { ip: fd({ min_stage: 'mail' }) };
    expect(deriveStage([leaf({ field: 'ip' })], fieldDefsMail, 'accept')).toBe('data');

    const fieldDefsMixed = { ip: fd({ min_stage: 'mail' }), subject: fd({ min_stage: 'rcpt' }) };
    const leaves = [leaf({ field: 'ip' }), leaf({ id: 'id-2', field: 'subject' })];
    expect(deriveStage(leaves, fieldDefsMixed, 'accept')).toBe('data');
  });

  it('falls back to data with empty leaves', () => {
    expect(deriveStage([], {}, 'accept')).toBe('data');
    expect(deriveStage([], {}, 'proceed')).toBe('data');
  });

  it('falls back to data when action is data-only but leaves is empty', () => {
    expect(deriveStage([], {}, 'quarantine')).toBe('data');
  });

  it('unknown/missing min_stage does not crash and still floors at data', () => {
    const fieldDefs = { weird: fd({ min_stage: 'onconnect' }) };
    expect(deriveStage([leaf({ field: 'weird' })], fieldDefs, 'accept')).toBe('data');
    expect(deriveStage([leaf({ field: 'unknown-field' })], {}, 'accept')).toBe('data');
  });
});
