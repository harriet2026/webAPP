import { describe, expect, it } from 'vitest';

import type { Role } from '@/lib/api/roles';
import { authSpoofingAccessForRole } from './use-auth-spoofing-access';

function role(overrides: Partial<Role> = {}): Role {
  return {
    id: 9,
    name: 'test role',
    scope: 'tenant',
    status: 'normal',
    isSystemDefault: false,
    isSuperAdmin: false,
    permissions: [],
    ...overrides,
  };
}

describe('authSpoofingAccessForRole', () => {
  it.each([
    ['tenant_ops', true, true],
    ['tenant_auditor', true, false],
    ['platform_auditor', true, false],
  ])('applies the backend-compatible built-in policy for %s', (code, canView, canEdit) => {
    expect(authSpoofingAccessForRole(role({ code, isSystemDefault: true }), false)).toEqual({
      canView,
      canEdit,
    });
  });

  it('requires visible, view and edit permissions for a custom role', () => {
    expect(authSpoofingAccessForRole(role({
      permissions: [{
        submoduleId: 'strategy-pipeline',
        visible: true,
        canView: true,
        canEdit: true,
        canApprove: null,
        canDelete: null,
      }],
    }), false)).toEqual({ canView: true, canEdit: true });

    expect(authSpoofingAccessForRole(role({
      permissions: [{
        submoduleId: 'strategy-pipeline',
        visible: true,
        canView: true,
        canEdit: false,
        canApprove: null,
        canDelete: null,
      }],
    }), false)).toEqual({ canView: true, canEdit: false });
  });

  it('does not trust a built-in-looking code on a custom or disabled role', () => {
    expect(authSpoofingAccessForRole(role({ code: 'tenant_ops' }), false)).toEqual({
      canView: false,
      canEdit: false,
    });
    expect(authSpoofingAccessForRole(role({
      code: 'tenant_ops',
      isSystemDefault: true,
      status: 'disabled',
    }), false)).toEqual({ canView: false, canEdit: false });
  });
});
