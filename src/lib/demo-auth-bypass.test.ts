import { describe, expect, it } from 'vitest';
import { isDemoAuthBypassEnabled } from './demo-auth-bypass';

describe('isDemoAuthBypassEnabled', () => {
  it('accepts the supported truthy switcher values', () => {
    for (const value of ['true', '1', 'TRUE', 'yes', 'YeS', ' true ']) {
      expect(isDemoAuthBypassEnabled(value)).toBe(true);
    }
  });

  it('keeps false and other false-like values disabled', () => {
    for (const value of [undefined, '', 'false', 'FALSE', '0', 'no']) {
      expect(isDemoAuthBypassEnabled(value)).toBe(false);
    }
  });
});
