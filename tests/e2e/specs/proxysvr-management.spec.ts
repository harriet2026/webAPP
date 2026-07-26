import { test, expect } from '../fixtures/auth.fixture';
import { ProxysvrPage } from '../pages/proxysvr.page';
import { RouteRulesPage } from '../pages/route-rules.page';
import { uniqueSuffixAlnum } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';

const API_BASE = 'http://localhost:18080/api/v1';
const AUTH = { username: 'admin', password: 'admin123' };

test.describe.serial('proxysvr management + route channel', () => {
  const suffix = uniqueSuffixAlnum();
  const endpointName = `ep_${suffix}`;
  const groupName = `grp_${suffix}`;
  const ruleName = `route_proxysvr_${suffix}`;
  let token = '';
  let endpointId: number | null = null;
  let groupId: number | null = null;
  let ruleId: number | null = null;

  test('create endpoint via UI', async ({ authenticatedPage, request }) => {
    const loginResp = await request.post(`${API_BASE}/auth/login`, { data: AUTH });
    const { token: tk } = (await loginResp.json()) as { token: string };
    token = tk;

    const px = new ProxysvrPage(authenticatedPage);
    await px.goto();
    await px.openEndpointsTab();
    await px.createEndpoint({
      name: endpointName,
      host: `proxysvr-${suffix}.example.com`,
      port: 2526,
      lid: `lid-${suffix}`,
      license: 'plaintext-license-secret',
    });
    await waitForToast(authenticatedPage);

    // verify via API: endpoint exists, license_present set, plaintext/ciphertext never echoed
    const resp = await request.get(`${API_BASE}/proxysvr-endpoints`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    const ep = body.items.find((e: { name: string }) => e.name === endpointName);
    expect(ep).toBeTruthy();
    expect(ep.license_present).toBe(true);
    expect(ep.license).toBeFalsy();
    expect(ep.license_enc).toBeFalsy();
    endpointId = ep.id;
  });

  test('create group with member via UI', async ({ authenticatedPage, request }) => {
    const px = new ProxysvrPage(authenticatedPage);
    await px.goto();
    await px.createGroup({ name: groupName, memberEndpointName: endpointName });
    await waitForToast(authenticatedPage);

    const resp = await request.get(`${API_BASE}/proxysvr-groups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    const grp = body.items.find((g: { name: string }) => g.name === groupName);
    expect(grp).toBeTruthy();
    expect(grp.is_active).toBe(true);
    expect(grp.members.length).toBe(1);
    groupId = grp.id;
  });

  test('create route rule with proxysvr channel via UI', async ({ authenticatedPage, request }) => {
    const rr = new RouteRulesPage(authenticatedPage);
    await rr.goto();
    await rr.openCreateDialog();
    await rr.fillName(ruleName);
    await rr.fillConditionValue('example.com');
    await rr.selectChannel('proxysvr');
    await rr.selectProxysvrGroup(groupName);
    await rr.submit();
    await waitForToast(authenticatedPage);

    // verify saved metadata
    const resp = await request.get(`${API_BASE}/unified-rules?rule_class=route&stage=data`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    const rule = body.items.find((r: { name: string }) => r.name === ruleName);
    expect(rule).toBeTruthy();
    ruleId = rule.id;
    const meta = typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : rule.metadata;
    expect(meta.channel).toBe('proxysvr');
    expect(meta.proxysvr_group_id).toBe(groupId);
  });

  test('cleanup', async ({ request }) => {
    const headers = { Authorization: `Bearer ${token}` };
    if (ruleId) {
      await request.delete(`${API_BASE}/unified-rules/${ruleId}`, { headers });
    }
    if (groupId) {
      await request.delete(`${API_BASE}/proxysvr-groups/${groupId}`, { headers });
    }
    if (endpointId) {
      await request.delete(`${API_BASE}/proxysvr-endpoints/${endpointId}`, { headers });
    }
  });
});
