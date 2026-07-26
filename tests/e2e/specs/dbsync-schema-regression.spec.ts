/**
 * Playwright E2E: dbsyncsvr sync-field schema regression guard.
 *
 * Guards design/implement/spec/2026-07-19-dbsync-schema-fields-design.md.
 *
 * The schema change widened `rules.id` / `detection_profiles.id` to 64-bit,
 * added 4 sync columns (version/update_node/deleted/deleted_at) to 4 rule
 * tables, and widened 5 rule_id soft-reference columns. None of these
 * columns are *consumed* by application code yet (spec §7) -- the user-
 * visible risk is purely "did adding these columns break the rule CRUD
 * path that writes to the `rules` table?".
 *
 * This spec answers that for ALL FOUR sync target tables (spec §2.1) -- each
 * gets a real create/list/update/delete round trip through the API:
 *   - IP-filter rules (tenant-scoped, backed by the `rules` table): create,
 *     list, update, delete -- exercises INSERT/SELECT/UPDATE/DELETE on rules
 *     with the new sync-column defaults applying silently.
 *   - detection-profiles (tenant-scoped, backed by the `detection_profiles`
 *     table): create + list -- exercises INSERT/SELECT on detection_profiles
 *     with the new sync-column defaults + widened id.
 *   - link-protection-blacklist rules (`link_blacklist_rule`).
 *   - geoip-rules (`overseas_geoip_rule`), platform-admin only.
 *
 * The last two were previously covered only by the Go live-DB default-value
 * probe, which writes raw SQL and therefore never touches the real
 * handler/store column list -- a store that broke on the new columns would
 * have passed there while 500'ing for every actual user.
 *
 * If any sync column had a NOT NULL constraint without a default, or if
 * widening id broke the autoincrement sequence, one of these would fail.
 * The static Go DDL scan covers the column text; this covers the runtime
 * behavior end-to-end through the real API + real DB.
 */
import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { TENANT_ADMIN_USERNAME, TENANT_ADMIN_PASSWORD } from '../helpers/roles';
import { randomIP, uniqueSuffix } from '../helpers/test-data';

/**
 * createTenantClient logs in as the tenant_admin (not platform admin) and
 * resolves the tenant's id. The detection-profiles endpoint is tenant-scoped
 * and rejects the platform admin in the multi-tenant dev form (GT-12149).
 */
async function createTenantClient(request: import('@playwright/test').APIRequestContext) {
  const { ApiClient } = await import('../fixtures/api.fixture');
  const client = new ApiClient(request);
  await client.login(TENANT_ADMIN_USERNAME, TENANT_ADMIN_PASSWORD);
  // The platform admin's tenant list still works for tenant_admin (it lists
  // tenants the caller can see); pick the lowest-id one, same as the platform
  // admin path -- the dev stack's default tenant is what globalSetup provisions
  // for the tenant_admin role.
  const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:18080/api/v1';
  const tenantsResp = await request.get(`${API_BASE_URL}/tenants?page_size=500`, {
    headers: { Authorization: `Bearer ${(client as unknown as { token: string }).token}`, 'Content-Type': 'application/json' },
  });
  if (tenantsResp.ok()) {
    const data = await tenantsResp.json() as { items?: { id: number }[] };
    const lowestId = (data?.items ?? []).slice().sort((a, b) => a.id - b.id)[0]?.id;
    if (lowestId != null) {
      client.setTenantId(lowestId);
    }
  }
  return client;
}

test.describe('dbsyncsvr sync-field schema regression', () => {
  test('rule CRUD still works after the sync-column + id-widening schema change', async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    const sfx = uniqueSuffix();
    const ruleName = `pw-dbsync-${sfx}`;
    const ip = randomIP();

    // 1. CREATE -- INSERT into rules. If a sync column were NOT NULL without
    //    a default, this would 500. The schema change ships defaults for all
    //    4 sync columns, so a bare INSERT like this must succeed unchanged.
    const createResp = await api.post('/ip-filter/rules', {
      name: ruleName,
      list_type: 'blacklist',
      ip_config_type: 'single',
      ip_value: ip,
      action: 'reject',
      priority: 100,
    });
    expect(createResp.ok(), `create failed: ${createResp.status()}`).toBeTruthy();
    const created = await createResp.json();
    const ruleId: number = created.id;
    expect(ruleId).toBeGreaterThan(0);
    // rules.id is now BIGINT (64-bit). The auto-generated id from a fresh
    // BIGSERIAL sequence is still small, but the JSON shape must carry a
    // plain number (not a string) so the webapp's number parsing still
    // works -- this is the JS-safe-integer concern called out in spec §7
    // as out of scope, but the *current* shape stays a number.
    expect(typeof ruleId).toBe('number');

    try {
      // 2. LIST -- SELECT projects the rules table. The new sync columns
      //    are not in the response, but the SELECT must not error on the
      //    widened id or the new columns.
      const listResp = await api.get('/ip-filter/rules?page_size=50');
      expect(listResp.ok(), `list failed: ${listResp.status()}`).toBeTruthy();
      const listData = await listResp.json();
      const found = (listData.items ?? []).some((r: { id: number }) => r.id === ruleId);
      expect(found, `created rule id=${ruleId} not in list`).toBeTruthy();

      // 3. UPDATE -- UPDATE on rules. The sync columns have defaults and no
      //    code writes them yet, so an UPDATE that touches only the
      //    business columns must succeed.
      const newName = `${ruleName}-updated`;
      const updateResp = await api.put(`/ip-filter/rules/${ruleId}`, {
        name: newName,
        list_type: 'blacklist',
        ip_config_type: 'single',
        ip_value: ip,
        action: 'reject',
        priority: 200,
      });
      expect(updateResp.ok(), `update failed: ${updateResp.status()}`).toBeTruthy();

      // 4. Verify the update landed.
      const getResp = await api.get(`/ip-filter/rules/${ruleId}`);
      expect(getResp.ok(), `get failed: ${getResp.status()}`).toBeTruthy();
      const fetched = await getResp.json();
      expect(fetched.name).toBe(newName);
      expect(fetched.priority).toBe(200);
    } finally {
      // 5. DELETE -- DELETE from rules. Must succeed and the row must be
      //    gone afterwards.
      const delResp = await api.delete(`/ip-filter/rules/${ruleId}`);
      expect(delResp.ok(), `delete failed: ${delResp.status()}`).toBeTruthy();
      const verifyResp = await api.get(`/ip-filter/rules/${ruleId}`);
      expect(verifyResp.ok()).toBeFalsy();
    }
  });

  test('detection_profiles CRUD still works after the sync-column + id-widening schema change', async ({ request }) => {
    // detection_profiles is tenant-scoped: the platform admin is rejected by
    // the multi-tenant dev form (GT-12149), so drive this as the tenant_admin.
    // This test was previously skipped because the platform admin couldn't
    // create a profile; the tenant_admin client makes it actually exercise
    // the table.
    const api = await createTenantClient(request);
    const profileName = `pw-dbsync-dp-${uniqueSuffix()}`;

    // CREATE: INSERT into detection_profiles. Sync-column defaults must apply.
    // config_type must be in the CHECK whitelist (oneof=rbl exec_impersonation
    // domain_lookalike spoof_person spoof_brand spoof_whitelist). spoof_whitelist
    // is the simplest (no nested config). is_active is a bool here (the API
    // model uses bool, even though the DB column is INT).
    const createResp = await api.post('/detection-profiles', {
      config_type: 'spoof_whitelist',
      name: profileName,
      value: 'dbsync-e2e.example.com',
      is_active: true,
    });
    expect(createResp.ok(), `create failed: ${createResp.status()}`).toBeTruthy();
    if (!createResp.ok()) {
      const body = await createResp.text().catch(() => '');
      throw new Error(`detection-profiles create failed: ${createResp.status()} body=${body}`);
    }
    const created = await createResp.json();
    const profileId: number = created.id;
    expect(profileId).toBeGreaterThan(0);
    expect(typeof profileId).toBe('number');

    try {
      // LIST: SELECT projects detection_profiles.
      const listResp = await api.get('/detection-profiles?config_type=spoof_whitelist&page_size=50');
      expect(listResp.ok(), `list failed: ${listResp.status()}`).toBeTruthy();
      const listData = await listResp.json();
      const found = (listData.items ?? []).some((r: { id: number }) => r.id === profileId);
      expect(found, `created profile id=${profileId} not in list`).toBeTruthy();
    } finally {
      await api.delete(`/detection-profiles/${profileId}`);
    }
  });

  /**
   * The remaining two sync target tables. Both were previously covered only
   * by the Go live-DB default-value INSERT probe, which writes raw SQL and so
   * never exercises the real handler/store column list. If adding the four
   * sync columns had broken an explicit column enumeration in either store
   * (or tripped a NOT NULL without a default), the Go probe would still pass
   * while every user-facing write 500'd.
   */
  test('link_blacklist_rule CRUD still works after the sync-column schema change', async ({ request }) => {
    // Writes are gated by RequireAdminOrTenantAdmin; the platform admin
    // qualifies, so the standard authenticated client is enough here.
    const api = await createAuthenticatedClient(request);
    const sfx = uniqueSuffix();
    const ruleName = `pw-dbsync-lbr-${sfx}`;

    const createResp = await api.post('/link-protection-blacklist/rules', {
      name: ruleName,
      match_type: 'exact',
      pattern: `dbsync-${sfx}.example.com`,
      verdict: 'malicious',
      is_active: true,
    });
    expect(createResp.ok(), `create failed: ${createResp.status()} ${await createResp.text().catch(() => '')}`).toBeTruthy();
    const created = await createResp.json();
    const ruleId: number = created.id;
    expect(ruleId).toBeGreaterThan(0);

    try {
      const listResp = await api.get('/link-protection-blacklist/rules?page_size=50');
      expect(listResp.ok(), `list failed: ${listResp.status()}`).toBeTruthy();
      const listData = await listResp.json();
      const found = (listData.items ?? []).some((r: { id: number }) => r.id === ruleId);
      expect(found, `created rule id=${ruleId} not in list`).toBeTruthy();

      const updateResp = await api.put(`/link-protection-blacklist/rules/${ruleId}`, {
        name: `${ruleName}-updated`,
        match_type: 'contain',
        pattern: `dbsync-${sfx}.example.com`,
        verdict: 'malicious',
        is_active: true,
      });
      expect(updateResp.ok(), `update failed: ${updateResp.status()}`).toBeTruthy();

      const getResp = await api.get(`/link-protection-blacklist/rules/${ruleId}`);
      expect(getResp.ok(), `get failed: ${getResp.status()}`).toBeTruthy();
      expect((await getResp.json()).name).toBe(`${ruleName}-updated`);
    } finally {
      const delResp = await api.delete(`/link-protection-blacklist/rules/${ruleId}`);
      expect(delResp.ok(), `delete failed: ${delResp.status()}`).toBeTruthy();
    }
  });

  test('overseas_geoip_rule CRUD still works after the sync-column schema change', async ({ request }) => {
    // /geoip-rules is gated by RequireSystemAdmin -- platform admin only, so
    // this must NOT use the tenant_admin client.
    const api = await createAuthenticatedClient(request);
    // ip_range is UNIQUE, and a 409 here would surface as "create failed" --
    // indistinguishable from a real schema break. An earlier version of this
    // test derived a single octet (150 possible values) from the suffix, which
    // is small enough to collide with a leftover row or a concurrent run. Use
    // both low octets of the TEST-NET-2 block for ~65k distinct values, as a
    // single IP (ParseGeoIpCIDR accepts a bare IP as well as a CIDR).
    const rand8 = () => Math.floor(Math.random() * 256);
    const ipRange = `198.51.${rand8()}.${rand8()}`;
    // region_code must be in the supported enum (CN/US/HK/SG/JP/AU/GB/DE/FR/KR);
    // anything else is a deliberate 400 (GT-12104), not a schema failure.
    const createResp = await api.post('/geoip-rules', {
      ip_range: ipRange,
      region_code: 'SG',
      region_name: 'dbsync-e2e',
    });
    expect(createResp.ok(), `create failed: ${createResp.status()} ${await createResp.text().catch(() => '')}`).toBeTruthy();
    const created = await createResp.json();
    const ruleId: number = created.id;
    expect(ruleId).toBeGreaterThan(0);

    try {
      const listResp = await api.get(`/geoip-rules?search=${encodeURIComponent(ipRange)}&page_size=50`);
      expect(listResp.ok(), `list failed: ${listResp.status()}`).toBeTruthy();
      const listData = await listResp.json();
      const found = (listData.items ?? []).some((r: { id: number }) => r.id === ruleId);
      expect(found, `created geoip rule id=${ruleId} not in list`).toBeTruthy();

      const updateResp = await api.put(`/geoip-rules/${ruleId}`, {
        ip_range: ipRange,
        region_code: 'JP',
        region_name: 'dbsync-e2e-updated',
      });
      expect(updateResp.ok(), `update failed: ${updateResp.status()}`).toBeTruthy();
    } finally {
      const delResp = await api.delete(`/geoip-rules/${ruleId}`);
      expect(delResp.ok(), `delete failed: ${delResp.status()}`).toBeTruthy();
    }
  });
});
