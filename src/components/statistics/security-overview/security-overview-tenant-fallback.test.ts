import { describe, it, expect } from 'vitest';

// Extract the condition logic as a pure function to test
function shouldFallback(tn: { status: string; expired: boolean }): boolean {
  return tn.status !== 'active' || tn.expired === true;
}

describe('tenant scope fallback condition', () => {
  it('active non-expired tenant → no fallback', () => {
    expect(shouldFallback({ status: 'active', expired: false })).toBe(false);
  });
  it('suspended tenant → fallback', () => {
    expect(shouldFallback({ status: 'suspended', expired: false })).toBe(true);
  });
  it('active but expired tenant → fallback', () => {
    expect(shouldFallback({ status: 'active', expired: true })).toBe(true);
  });
  it('pending expired tenant → fallback', () => {
    expect(shouldFallback({ status: 'pending', expired: true })).toBe(true);
  });
});
