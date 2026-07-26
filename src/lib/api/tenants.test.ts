import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from './client';
import {
  getTenantStats,
  setTenantStatus,
  verifyDomainDNS,
  verifyDomainManual,
  updateTenantDomain,
  deleteTenantDomain,
} from './tenants';

vi.mock('./client', () => ({ apiRequest: vi.fn() }));

describe('tenants api', () => {
  beforeEach(() => vi.mocked(client.apiRequest).mockReset());

  it('stats hits /tenants/_meta/stats', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ total: 1, active: 1, pending: 0, awaitingRouting: 0 });
    await getTenantStats();
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/_meta/stats');
  });

  it('setTenantStatus PUTs /tenants/:id/status', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({});
    await setTenantStatus(7, 'suspended');
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/7/status', { method: 'PUT', body: { status: 'suspended' } });
  });
});

describe('domain verify api', () => {
  beforeEach(() => vi.mocked(client.apiRequest).mockReset());

  it('DNS verify posts the right path', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ verify_status: 'verified' });
    await verifyDomainDNS(3, 9);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/3/domains/9/verify', {
      method: 'POST',
      headers: { 'X-Tenant-ID': '3' },
    });
  });

  it('manual verify posts the right path', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ verify_status: 'verified' });
    await verifyDomainManual(3, 9);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/3/domains/9/verify/manual', {
      method: 'POST',
      headers: { 'X-Tenant-ID': '3' },
    });
  });
});

// Review P2: PUT/DELETE domain must use /tenant-domains/:id, not /tenants/domains/:id.
describe('domain edit/delete api paths', () => {
  beforeEach(() => vi.mocked(client.apiRequest).mockReset());

  it('updateTenantDomain PUTs /tenant-domains/:id', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({});
    await updateTenantDomain(42, { domain: 'new.example.com' });
    expect(client.apiRequest).toHaveBeenCalledWith('/tenant-domains/42', expect.objectContaining({ method: 'PUT' }));
  });

  it('deleteTenantDomain DELETEs /tenant-domains/:id', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue(undefined);
    await deleteTenantDomain(42);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenant-domains/42', expect.objectContaining({ method: 'DELETE' }));
  });
});
