import { describe, expect, it } from 'vitest';

import { formatAdminAuditDetailsPreview, getAdminAuditContext } from '@/lib/admin-audit';

describe('admin audit helpers', () => {
  it('detects system admin impersonation context', () => {
    const context = getAdminAuditContext({
      actor_user_id: 42,
      effective_tenant_id: 9,
      tenant_id: 9,
      details: {
        effective_tenant_source: 'x_tenant_id_header',
        requested_tenant_id_header: '9',
        impersonation: {
          enabled: true,
          source_header: 'X-Tenant-ID',
          target_tenant_id: 9,
        },
      },
    });

    expect(context.actorUserId).toBe(42);
    expect(context.effectiveTenantId).toBe(9);
    expect(context.isImpersonating).toBe(true);
    expect(context.effectiveTenantSource).toBe('x_tenant_id_header');
    expect(context.requestedTenantIdHeader).toBe('9');
  });

  it('falls back to non-impersonated tenant context', () => {
    const context = getAdminAuditContext({
      admin_user_id: 7,
      tenant_id: 5,
      details: {
        effective_tenant_source: 'jwt',
        impersonation: {
          enabled: false,
        },
      },
    });

    expect(context.actorUserId).toBe(7);
    expect(context.effectiveTenantId).toBe(5);
    expect(context.isImpersonating).toBe(false);
    expect(context.effectiveTenantSource).toBe('jwt');
  });

  it('formats a compact details preview', () => {
    const preview = formatAdminAuditDetailsPreview({
      method: 'GET',
      path: '/api/v1/quarantine',
      effective_tenant_id: 9,
      requested_tenant_id_header: '9',
    });

    expect(preview).toContain('GET');
    expect(preview).toContain('/api/v1/quarantine');
    expect(preview).toContain('9');
  });
});
