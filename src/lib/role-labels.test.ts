import { describe, it, expect } from 'vitest';
import { roleLabelKey } from './role-labels';

describe('role label key mapping', () => {
  // Keys are relative to the `users` namespace (resolved via
  // useTranslations('users')) — no leading `users.` prefix.
  it('maps known backend roles to their users.<key> label key', () => {
    expect(roleLabelKey('system_admin')).toBe('systemAdmin');
    expect(roleLabelKey('tenant_admin')).toBe('tenantAdmin');
  });

  it('returns null for unknown roles so callers fall back to the raw value', () => {
    // Regression guard for GT-11970: a future role (or a garbage value) must
    // not silently render an empty / MISSING_MESSAGE label — the caller shows
    // the raw string instead.
    expect(roleLabelKey('super_admin')).toBeNull();
    expect(roleLabelKey('')).toBeNull();
    expect(roleLabelKey('tenant_admin ')).toBeNull(); // trailing space ≠ exact match
  });
});
