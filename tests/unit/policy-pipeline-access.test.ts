import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { canAccessPolicyPipeline } from '@/components/security/PolicyPipelinePage';

describe('canAccessPolicyPipeline', () => {
  it('allows a tenant administrator in a multi-tenant deployment', () => {
    expect(canAccessPolicyPipeline({
      multiTenant: true,
      effectiveViewer: 'tenant',
      isSystemAdmin: false,
      isTenantAdmin: true,
    })).toBe(true);
  });

  it('allows a system administrator impersonating a tenant', () => {
    expect(canAccessPolicyPipeline({
      multiTenant: true,
      effectiveViewer: 'tenant',
      isSystemAdmin: true,
      isTenantAdmin: false,
    })).toBe(true);
  });

  it('keeps the multi-tenant platform view out of the tenant pipeline', () => {
    expect(canAccessPolicyPipeline({
      multiTenant: true,
      effectiveViewer: 'platform',
      isSystemAdmin: true,
      isTenantAdmin: false,
    })).toBe(false);
  });
});
