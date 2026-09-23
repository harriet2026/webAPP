import { describe, expect, it } from 'vitest';
import { duplicateReasonMessageKey } from '@/lib/rule-import-duplicate-reason';

describe('GT-13691 duplicate reason localization', () => {
  it.each([
    ['exact_match', 'exactMatch'],
    ['unique_key_conflict', 'uniqueKeyConflict'],
    ['future_backend_reason', 'duplicate'],
    ['', 'duplicate'],
    [undefined, 'duplicate'],
  ] as const)('maps %s to a stable message key', (reason, expected) => {
    expect(duplicateReasonMessageKey(reason)).toBe(expected);
  });
});
