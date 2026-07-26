import { describe, it, expect } from 'vitest';
import {
  computeIsPlatformScope,
  effectiveDimension,
} from '@/components/statistics/ops-top-trend/scope';

// The frontend gate MUST equal the backend's
// denyConnectionDimOutOfPlatformScope: role == "system_admin" && no tenant.
// Using is_super_admin instead would hide the connection tab from accounts the
// backend happily serves (e.g. platform_auditor).
describe('computeIsPlatformScope', () => {
  it('grants platform scope to a system_admin with no tenant selected', () => {
    expect(computeIsPlatformScope(true, null)).toBe(true);
    expect(computeIsPlatformScope(true, undefined)).toBe(true);
  });

  it('denies platform scope to a tenant-switched system_admin', () => {
    expect(computeIsPlatformScope(true, 7)).toBe(false);
  });

  it('denies platform scope to a non-system_admin', () => {
    expect(computeIsPlatformScope(false, null)).toBe(false);
    expect(computeIsPlatformScope(false, 7)).toBe(false);
  });
});

describe('effectiveDimension', () => {
  it('keeps connection in platform scope', () => {
    expect(effectiveDimension('connection', true)).toBe('connection');
  });

  it('downgrades connection to subject out of platform scope', () => {
    expect(effectiveDimension('connection', false)).toBe('subject');
  });

  it('leaves every other dimension untouched in both scopes', () => {
    for (const dim of ['auth', 'sendIp', 'subject', 'sender', 'recipient'] as const) {
      expect(effectiveDimension(dim, true)).toBe(dim);
      expect(effectiveDimension(dim, false)).toBe(dim);
    }
  });
});
