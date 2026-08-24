import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentManagementAccess } from './use-agent-management-access';

const featureAccess = vi.fn();
const auth = vi.fn();
const myRole = vi.fn();

vi.mock('./use-agent-feature-access', () => ({
  useAgentFeatureAccess: () => featureAccess(),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => auth() }));
vi.mock('@/lib/api/roles', () => ({ useMyRole: () => myRole() }));

function role(overrides: Record<string, unknown> = {}) {
  return {
    code: '',
    isSystemDefault: false,
    isSuperAdmin: false,
    status: 'normal',
    permissions: [],
    ...overrides,
  };
}

describe('useAgentManagementAccess', () => {
  beforeEach(() => {
    featureAccess.mockReturnValue({ status: 'ready', canView: true, canEdit: true, readOnly: false });
    auth.mockReturnValue({ user: { role_id: 9 }, isTrueSuperAdmin: false });
    myRole.mockReturnValue({ data: role(), isSuccess: true, isPending: false, isError: false });
  });

  it.each([
    ['tenant_ops', true, true],
    ['tenant_auditor', true, false],
    ['platform_auditor', true, false],
  ])('applies the temporary built-in policy for %s', (code, canView, canEdit) => {
    myRole.mockReturnValue({
      data: role({ code, isSystemDefault: true }),
      isSuccess: true,
      isPending: false,
      isError: false,
    });

    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current).toEqual({
      status: 'ready',
      canView,
      canEdit,
      readOnly: !canEdit,
    });
  });

  it('allows a true super administrator with a normal assigned role', () => {
    auth.mockReturnValue({ user: { role_id: 9 }, isTrueSuperAdmin: true });
    myRole.mockReturnValue({
      data: role({ code: 'super_admin', isSystemDefault: true, isSuperAdmin: true }),
      isSuccess: true,
      isPending: false,
      isError: false,
    });

    expect(renderHook(() => useAgentManagementAccess('spoofing-detection')).result.current.canEdit).toBe(true);
  });

  it('requires explicit visible, view and edit bits for a custom role', () => {
    myRole.mockReturnValue({
      data: role({
        permissions: [{ submoduleId: 'agent-management', visible: true, canView: true, canEdit: true }],
      }),
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    expect(renderHook(() => useAgentManagementAccess('threat-retro')).result.current.canEdit).toBe(true);

    myRole.mockReturnValue({
      data: role({
        permissions: [{ submoduleId: 'agent-management', visible: true, canView: false, canEdit: true }],
      }),
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    expect(renderHook(() => useAgentManagementAccess('threat-retro')).result.current).toEqual({
      status: 'ready', canView: false, canEdit: false, readOnly: true,
    });
  });

  it('does not apply a built-in code to a non-system-default role', () => {
    myRole.mockReturnValue({
      data: role({ code: 'tenant_ops' }),
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current.canEdit).toBe(false);
  });

  it('intersects RBAC with product access', () => {
    myRole.mockReturnValue({
      data: role({ code: 'tenant_ops', isSystemDefault: true }),
      isSuccess: true,
      isPending: false,
      isError: false,
    });
    featureAccess.mockReturnValue({ status: 'ready', canView: true, canEdit: false, readOnly: true });
    expect(renderHook(() => useAgentManagementAccess('spoofing-detection')).result.current).toEqual({
      status: 'ready', canView: true, canEdit: false, readOnly: true,
    });

    featureAccess.mockReturnValue({ status: 'ready', canView: false, canEdit: false, readOnly: false });
    expect(renderHook(() => useAgentManagementAccess('spoofing-detection')).result.current).toEqual({
      status: 'ready', canView: false, canEdit: false, readOnly: true,
    });
  });

  it('fails closed while loading without presenting a policy denial', () => {
    myRole.mockReturnValue({ data: undefined, isSuccess: false, isPending: true, isError: false });
    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current).toEqual({
      status: 'loading', canView: false, canEdit: false, readOnly: false,
    });

    featureAccess.mockReturnValue({ status: 'loading', canView: false, canEdit: false, readOnly: false });
    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current.status).toBe('loading');
  });

  it('fails closed on role lookup errors without presenting a policy denial', () => {
    myRole.mockReturnValue({ data: role({ code: 'tenant_ops', isSystemDefault: true }), isSuccess: false, isPending: false, isError: true });
    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current).toEqual({
      status: 'error', canView: false, canEdit: false, readOnly: false,
    });
  });

  it('denies missing assignments and disabled roles', () => {
    auth.mockReturnValue({ user: { role_id: null }, isTrueSuperAdmin: false });
    myRole.mockReturnValue({ data: undefined, isSuccess: false, isPending: false, isError: false });
    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current.status).toBe('ready');
    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current.canView).toBe(false);

    auth.mockReturnValue({ user: { role_id: 9 }, isTrueSuperAdmin: true });
    myRole.mockReturnValue({ data: role({ code: 'super_admin', isSystemDefault: true, status: 'disabled' }), isSuccess: true, isPending: false, isError: false });
    expect(renderHook(() => useAgentManagementAccess('phishing-detection')).result.current.canEdit).toBe(false);
  });
});
