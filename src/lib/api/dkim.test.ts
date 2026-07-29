import { describe, expect, it, vi } from 'vitest';
import { generateDkimKey, listDkimSigningDomains } from './dkim';

describe('DKIM API contract', () => {
  it('reads the tenant-scoped minimal signing-domain projection', async () => {
    const requestFn = vi.fn().mockResolvedValue({
      items: [{ id: 1, tenant_id: 7, domain: 'example.com' }],
    });

    await expect(listDkimSigningDomains(7, requestFn as never)).resolves.toEqual([
      { id: 1, tenant_id: 7, domain: 'example.com' },
    ]);
    expect(requestFn).toHaveBeenCalledWith('/dkim/signing-domains?tenant_id=7');
  });

  it('treats generated private key material as server-side only', async () => {
    const response = {
      id: 2,
      tenant_id: 7,
      domain: 'example.com',
      selector: 's2026',
      algorithm: 'rsa-sha256',
      key_size: 2048,
      public_key: 'public',
      dns_record_name: 's2026._domainkey.example.com',
      dns_record: 'v=DKIM1; k=rsa; p=public',
      dns_status: 'unverified',
      is_active: false,
      created_at: '2026-07-28T00:00:00Z',
    };
    const requestFn = vi.fn().mockResolvedValue(response);
    const request = {
      tenant_id: 7,
      domain: 'example.com',
      selector: 's2026',
      algorithm: 'rsa-sha256' as const,
      key_size: 2048 as const,
    };

    await expect(generateDkimKey(request, requestFn as never)).resolves.toEqual(response);
    expect(requestFn).toHaveBeenCalledWith('/dkim/keys/generate', {
      method: 'POST',
      body: request,
    });
    expect(response).not.toHaveProperty('private_key_pem');
  });
});
