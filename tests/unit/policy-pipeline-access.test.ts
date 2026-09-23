import { describe, expect, it } from 'vitest';

import { canAccessPolicyPipeline } from '@/components/security/policy-pipeline-access';

describe('canAccessPolicyPipeline', () => {
  it('allows a tenant administrator in a multi-tenant deployment', () => {
    expect(canAccessPolicyPipeline({
      multiTenant: true,
      effectiveViewer: 'tenant',
      isSystemAdmin: false,
      isTenantAdmin: true,
      hasViewPermission: true,
    })).toBe(true);
  });

  it('allows a system administrator impersonating a tenant', () => {
    expect(canAccessPolicyPipeline({
      multiTenant: true,
      effectiveViewer: 'tenant',
      isSystemAdmin: true,
      isTenantAdmin: false,
      hasViewPermission: true,
    })).toBe(true);
  });

  it('keeps the multi-tenant platform view out of the tenant pipeline', () => {
    expect(canAccessPolicyPipeline({
      multiTenant: true,
      effectiveViewer: 'platform',
      isSystemAdmin: true,
      isTenantAdmin: false,
      hasViewPermission: true,
    })).toBe(false);
  });

  it('denies a custom tenant role without strategy-pipeline view permission', () => {
    expect(canAccessPolicyPipeline({
      multiTenant: true,
      effectiveViewer: 'tenant',
      isSystemAdmin: false,
      isTenantAdmin: true,
      hasViewPermission: false,
    })).toBe(false);
  });
});
