import { describe, expect, it } from 'vitest';

import { dispatch } from './dispatcher';

describe('tenant ARC mock contract', () => {
  it('keeps ARC settings isolated by selected tenant', () => {
    const tenant7 = { 'X-Tenant-ID': '7' };
    const tenant8 = { 'X-Tenant-ID': '8' };

    dispatch({
      method: 'PUT', path: '/arc/settings', headers: tenant7,
      body: { enabled: true, signing_domain: 'arc.example.com' },
    });

    expect(dispatch({ method: 'GET', path: '/arc/settings', headers: tenant7 }).data).toMatchObject({
      tenant_id: 7, enabled: true, signing_domain: 'arc.example.com',
    });
    expect(dispatch({ method: 'GET', path: '/arc/settings', headers: tenant8 }).data).toMatchObject({
      tenant_id: 8, enabled: false, signing_domain: '',
    });
  });
});
