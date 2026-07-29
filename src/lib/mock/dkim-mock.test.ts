import { describe, it, expect } from 'vitest';
import { isMockable, dispatch } from './dispatcher';

// Exercises the DKIM outbound-signing + signing-domains mock routes registered in
// dispatcher.ts. These back the "DKIM 外发签名" subsection in ProtocolChecksSection
// when the real backend is unreachable (v0 preview / dev).

describe('mock: tenant sending domains', () => {
  it('is mockable and returns domains for a tenant', () => {
    expect(isMockable('GET', '/dkim/signing-domains?tenant_id=1')).toBe(true);
    const res = dispatch({ method: 'GET', path: '/dkim/signing-domains?tenant_id=1' });
    expect(res.status).toBe(200);
    const data = res.data as { items: { domain: string }[] };
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0]).toHaveProperty('domain');
    expect(data.items[0]).not.toHaveProperty('mail_system_config');
  });

  it('returns an empty list for an unknown tenant', () => {
    const res = dispatch({ method: 'GET', path: '/dkim/signing-domains?tenant_id=999' });
    expect((res.data as { items: unknown[] }).items).toHaveLength(0);
  });

  it('rejects a missing tenant scope like the real API', () => {
    const res = dispatch({ method: 'GET', path: '/dkim/signing-domains' });
    expect(res.status).toBe(400);
  });
});

describe('mock: DKIM keys', () => {
  it('lists keys filtered by tenant_id from the query string', () => {
    expect(isMockable('GET', '/dkim/keys?tenant_id=1')).toBe(true);
    const res = dispatch({ method: 'GET', path: '/dkim/keys?tenant_id=1' });
    const data = res.data as { items: { tenant_id: number }[] };
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.every((k) => k.tenant_id === 1)).toBe(true);
  });

  it('generate → keeps private key server-side and returns an unverified/inactive key', () => {
    const gen = dispatch({
      method: 'POST',
      path: '/dkim/keys/generate',
      body: { tenant_id: 1, domain: 'gen-test.com', selector: 'g1', algorithm: 'rsa-sha256', key_size: 2048 },
    });
    const key = gen.data as { id: number; private_key_pem?: string; dns_status: string; is_active: boolean; domain: string };
    expect(gen.status).toBe(201);
    expect(key.private_key_pem).toBeUndefined();
    expect(key.dns_status).toBe('unverified');
    expect(key.is_active).toBe(false);

    const listed = dispatch({ method: 'GET', path: '/dkim/keys?tenant_id=1&domain=gen-test.com' })
      .data as { items: { id: number }[] };
    expect(listed.items.some((k) => k.id === key.id)).toBe(true);
  });

  it('verify-dns flips the key to verified', () => {
    const gen = dispatch({
      method: 'POST',
      path: '/dkim/keys/generate',
      body: { tenant_id: 2, domain: 'verify-test.com', selector: 'v1', algorithm: 'ed25519-sha256' },
    }).data as { id: number };

    expect(isMockable('POST', `/dkim/keys/${gen.id}/verify-dns`)).toBe(true);
    const verify = dispatch({ method: 'POST', path: `/dkim/keys/${gen.id}/verify-dns` });
    expect((verify.data as { dns_status: string }).dns_status).toBe('verified');
  });

  it('activate makes exactly one key active per domain (others deactivated)', () => {
    const a = dispatch({
      method: 'POST',
      path: '/dkim/keys/generate',
      body: { tenant_id: 3, domain: 'act.com', selector: 'a', algorithm: 'rsa-sha256', key_size: 2048 },
    }).data as { id: number };
    const b = dispatch({
      method: 'POST',
      path: '/dkim/keys/generate',
      body: { tenant_id: 3, domain: 'act.com', selector: 'b', algorithm: 'rsa-sha256', key_size: 2048 },
    }).data as { id: number };

    dispatch({ method: 'PUT', path: `/dkim/keys/${a.id}/status`, body: { is_active: true } });
    dispatch({ method: 'PUT', path: `/dkim/keys/${b.id}/status`, body: { is_active: true } });

    const list = dispatch({ method: 'GET', path: '/dkim/keys?tenant_id=3&domain=act.com' })
      .data as { items: { id: number; is_active: boolean }[] };
    const active = list.items.filter((k) => k.is_active);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(b.id);
  });

  it('delete removes the key from the list', () => {
    const g = dispatch({
      method: 'POST',
      path: '/dkim/keys/generate',
      body: { tenant_id: 1, domain: 'del.com', selector: 'd', algorithm: 'rsa-sha256', key_size: 2048 },
    }).data as { id: number };
    dispatch({ method: 'DELETE', path: `/dkim/keys/${g.id}` });
    const list = dispatch({ method: 'GET', path: '/dkim/keys?tenant_id=1&domain=del.com' })
      .data as { items: { id: number }[] };
    expect(list.items.some((k) => k.id === g.id)).toBe(false);
  });
});
