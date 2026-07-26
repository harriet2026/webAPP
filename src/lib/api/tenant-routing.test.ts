import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as client from './client';
import {
  routingOverview,
  getTenantRouting,
  listNexthops,
  createNexthop,
  updateNexthop,
  deleteNexthop,
  listEgressBindings,
  createEgressBinding,
  updateEgressBinding,
  deleteEgressBinding,
  listEgressNames,
} from './tenant-routing';

vi.mock('./client', () => ({ apiRequest: vi.fn() }));

describe('tenant-routing api', () => {
  beforeEach(() => vi.mocked(client.apiRequest).mockReset());

  it('routingOverview hits paginated /tenants/_meta/routing-overview', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    await routingOverview({ page: 2, pageSize: 10, search: 'acme', status: 'active' });
    expect(client.apiRequest).toHaveBeenCalledWith(
      '/tenants/_meta/routing-overview?page=2&page_size=10&search=acme&status=active'
    );
  });

  it('getTenantRouting hits /tenants/:id/routing', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({
      tenant_id: 7,
      routing_progress: { receiving: true, relay: false, outbound: true, auth: false },
      access_status: 'pending',
      counts: {
        receiving_domains: 1,
        active_egress_names: [],
        outbound_rules: 1,
        smtp_credentials: 0,
        active_dkim_keys: 0,
      },
    });
    await getTenantRouting(7);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/7/routing');
  });

  it('listNexthops unwraps items', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ items: [{ id: 1 }] });
    const out = await listNexthops(3, 9);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/3/domains/9/nexthops');
    expect(out).toEqual([{ id: 1 }]);
  });

  it('createNexthop POSTs to the nested collection', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ id: 5 });
    await createNexthop(3, 9, { host: 'mx.test', port: 25 });
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/3/domains/9/nexthops', {
      method: 'POST',
      body: { host: 'mx.test', port: 25 },
    });
  });

  it('updateNexthop PUTs the nested member', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ id: 5 });
    await updateNexthop(3, 9, 5, { host: 'mx2.test', port: 25 });
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/3/domains/9/nexthops/5', {
      method: 'PUT',
      body: { host: 'mx2.test', port: 25 },
    });
  });

  it('deleteNexthop DELETEs the nested member', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue(undefined);
    await deleteNexthop(3, 9, 5);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/3/domains/9/nexthops/5', {
      method: 'DELETE',
    });
  });

  it('listEgressBindings unwraps items', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ items: [{ id: 1 }] });
    const out = await listEgressBindings(7);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/7/egress-bindings');
    expect(out).toEqual([{ id: 1 }]);
  });

  it('createEgressBinding POSTs to /tenants/:id/egress-bindings', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ id: 2 });
    await createEgressBinding(7, { tenant_domain_id: 9, egress_name: 'edm-1' });
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/7/egress-bindings', {
      method: 'POST',
      body: { tenant_domain_id: 9, egress_name: 'edm-1' },
    });
  });

  it('updateEgressBinding PUTs the member', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ id: 2 });
    await updateEgressBinding(7, 2, { tenant_domain_id: 9, egress_name: 'edm-2' });
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/7/egress-bindings/2', {
      method: 'PUT',
      body: { tenant_domain_id: 9, egress_name: 'edm-2' },
    });
  });

  it('deleteEgressBinding DELETEs the member', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue(undefined);
    await deleteEgressBinding(7, 2);
    expect(client.apiRequest).toHaveBeenCalledWith('/tenants/7/egress-bindings/2', {
      method: 'DELETE',
    });
  });

  it('listEgressNames unwraps items', async () => {
    vi.mocked(client.apiRequest).mockResolvedValue({ items: ['edm-1', 'edm-2'] });
    const out = await listEgressNames();
    expect(client.apiRequest).toHaveBeenCalledWith('/routing/_meta/egress-ips');
    expect(out).toEqual(['edm-1', 'edm-2']);
  });
});
