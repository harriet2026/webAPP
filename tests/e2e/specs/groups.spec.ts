import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';
import { resolveTenantRoleID } from '../helpers/roles';

interface RuleListItem {
  id: number;
  name: string;
  member_count?: number | null;
  reference_count?: number | null;
}

const localeTitles: Record<string, RegExp> = {
  zh: /群组管理/,
  en: /Group Management/,
  th: /การจัดการกลุ่ม/,
  ru: /Управление группами/,
};

test.describe('Group Management (/security/groups)', () => {
  // /security/groups is tenant-scoped: since GT-12245/GT-12257 the PLATFORM
  // viewer (no tenant) renders a 403 interception page there, and it also
  // actively clears any residual tenant selection. A system_admin must enter
  // with BOTH osg_viewer=tenant and a selected tenant. (The tenant-user describe
  // further down logs in as a real tenant account and needs none of this.)
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const tenantId = api.getTenantId();
    expect(tenantId, 'a tenant must exist (see global-setup)').not.toBeNull();
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost';
    await authenticatedPage.context().addCookies([
      { name: 'osg_viewer', value: 'tenant', url: base, sameSite: 'Lax' },
      { name: 'osg_selected_tenant', value: String(tenantId), url: base, sameSite: 'Lax' },
    ]);
    await authenticatedPage.evaluate((tid) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
    }, tenantId);
    // Flipping the viewer makes the app navigate on its own; goto-ing straight
    // away truncates that into net::ERR_ABORTED.
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
    await authenticatedPage.goto('/zh/security/groups');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('sidebar entry visible and page loads', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByText('群组管理').first()).toBeVisible();
  });

  for (const [locale, title] of Object.entries(localeTitles)) {
    test(`page loads in ${locale}`, async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`/${locale}/security/groups`);
      await authenticatedPage.waitForLoadState('networkidle');
      // html_spec 对齐后「群组管理」是卡片一的 CardTitle（不再是页级 heading，
      // 页级 heading 为「群组策略」）
      await expect(authenticatedPage.getByTestId('groups-card').getByText(title).first()).toBeVisible();
    });
  }

  test('4 group type tabs visible', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByRole('tab', { name: /IP 组/ })).toBeVisible();
    await expect(authenticatedPage.getByRole('tab', { name: /发信人组/ })).toBeVisible();
    await expect(authenticatedPage.getByRole('tab', { name: /收信人组/ })).toBeVisible();
    await expect(authenticatedPage.getByRole('tab', { name: /内容组/ })).toBeVisible();
  });

  test('create + list + delete sender group', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-sender-${uniqueSuffix()}`;

    await authenticatedPage.getByRole('tab', { name: /发信人/ }).click();
    const tabPanel = authenticatedPage.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await tabPanel.getByRole('button', { name: /新建群组/ }).click();

    await authenticatedPage.locator('[role="dialog"] input[placeholder*="群组名称"]').fill(unique);
    await authenticatedPage.locator('[role="dialog"] textarea').fill('alice@x.com\nbob@y.com');
    await authenticatedPage.locator('[role="dialog"]').getByRole('button', { name: '保存' }).click();

    await expect(authenticatedPage.getByRole('cell', { name: unique })).toBeVisible({ timeout: 10000 });

    const listResp = await api.get(`/unified-rules?rule_class=tag&page=groups`);
    const listData = await listResp.json();
    const created = ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    expect(created).toBeTruthy();

    await authenticatedPage.locator('tr', { hasText: unique }).locator('button:has(svg.lucide-trash-2)').click();
    await authenticatedPage.getByRole('button', { name: /确定|确认/ }).click();
  });

  test('edit sender group members via UI', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-edit-${uniqueSuffix()}`;

    await authenticatedPage.getByRole('tab', { name: /发信人/ }).click();
    const tabPanel = authenticatedPage.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await tabPanel.getByRole('button', { name: /新建群组/ }).click();
    await authenticatedPage.locator('[role="dialog"] input[placeholder*="群组名称"]').fill(unique);
    await authenticatedPage.locator('[role="dialog"] textarea').fill('alice@x.com\nbob@y.com');
    await authenticatedPage.locator('[role="dialog"]').getByRole('button', { name: '保存' }).click();
    await expect(authenticatedPage.getByRole('cell', { name: unique })).toBeVisible({ timeout: 10000 });

    await authenticatedPage.locator('tr', { hasText: unique }).locator('button:has(svg.lucide-pencil)').click();
    await authenticatedPage.locator('[role="dialog"] textarea').fill('carol@z.com');
    await authenticatedPage.locator('[role="dialog"]').getByRole('button', { name: '保存' }).click();

    await expect.poll(async () => {
      const listResp = await api.get(`/unified-rules?rule_class=tag&page=groups&include=member_count`);
      const listData = await listResp.json();
      return ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    }, { timeout: 10000 }).toMatchObject({ member_count: 1 });
    const listResp = await api.get(`/unified-rules?rule_class=tag&page=groups&include=member_count`);
    const listData = await listResp.json();
    const saved = ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    if (!saved) throw new Error('created group not found');
    await api.delete(`/unified-rules/${saved.id}`);
  });

  test('create IP group via UI', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-ip-${uniqueSuffix()}`;

    await authenticatedPage.getByRole('tab', { name: /IP 组/ }).click();
    const tabPanel = authenticatedPage.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await tabPanel.getByRole('button', { name: /新建群组/ }).click();

    await authenticatedPage.locator('[role="dialog"] input[placeholder*="群组名称"]').fill(unique);
    await authenticatedPage.locator('[role="dialog"] textarea').fill('1.2.3.4\n10.0.0.0/8');
    await authenticatedPage.locator('[role="dialog"]').getByRole('button', { name: '保存' }).click();

    await expect(authenticatedPage.getByRole('cell', { name: unique })).toBeVisible({ timeout: 10000 });

    const listResp = await api.get(`/unified-rules?rule_class=tag&page=groups&include=member_count`);
    const listData = await listResp.json();
    const created = ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    expect(created).toBeTruthy();
    if (!created) throw new Error('created group not found');
    expect(created.member_count).toBe(2);

    await api.delete(`/unified-rules/${created.id}`);
  });

  // GT-11943 problem A: a QC scan reported the delete confirmation dialog as
  // invisible because `offsetParent === null`. Per CSSOM, offsetParent is null
  // for any `position: fixed` element regardless of visibility, and Radix
  // renders AlertDialogContent as fixed. This test pins both halves: the dialog
  // really is painted (non-empty box, opaque, hit-testable at its centre) AND
  // offsetParent is null, so the null value can never again be read as a defect.
  test('delete confirm dialog is painted even though offsetParent is null', async ({
    authenticatedPage,
    request,
  }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-confirm-${uniqueSuffix()}`;
    const createResp = await api.post('/unified-rules', {
      name: unique,
      rule_class: 'tag',
      stage: 'mail',
      condition_tree: { type: 'condition', field: 'sender', operator: 'within', value: 'alice@x.com' },
      tags: [`grp:${unique}`],
      priority: 100,
      is_active: true,
      page: 'groups',
      metadata: { group_type: 'sender' },
    });
    const created = await createResp.json();

    await authenticatedPage.goto('/zh/security/groups');
    await authenticatedPage.getByRole('tab', { name: /发信人/ }).click();
    const row = authenticatedPage.locator('tr', { hasText: unique });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.locator('button:has(svg.lucide-trash-2)').click();

    const dialog = authenticatedPage.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/确定删除|删除此群组/);

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    const probe = await dialog.evaluate(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        offsetParent: (el as HTMLElement).offsetParent,
        position: style.position,
        visibility: style.visibility,
        display: style.display,
        opacity: Number(style.opacity),
        containsHitTarget: el.contains(hit),
      };
    });
    // The value QC flagged — expected, and caused solely by `position: fixed`.
    expect(probe.offsetParent).toBeNull();
    expect(probe.position).toBe('fixed');
    // ...while every property that actually governs visibility says "painted".
    expect(probe.visibility).toBe('visible');
    expect(probe.display).not.toBe('none');
    expect(probe.opacity).toBeGreaterThan(0);
    expect(probe.containsHitTarget).toBe(true);

    await authenticatedPage.getByRole('button', { name: /取消/ }).click();
    await expect(dialog).toBeHidden();

    await api.delete(`/unified-rules/${created.id}`);
  });

  test('delete is disabled when a group is referenced', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-ref-${uniqueSuffix()}`;
    const refName = `${unique}-action`;

    const groupResp = await api.post('/unified-rules', {
      name: unique,
      rule_class: 'tag',
      stage: 'mail',
      condition_tree: { type: 'condition', field: 'sender', operator: 'within', value: 'alice@x.com' },
      tags: [`grp:${unique}`],
      priority: 100,
      is_active: true,
      page: 'groups',
      metadata: { group_type: 'sender' },
    });
    expect(groupResp.ok()).toBeTruthy();
    const group = await groupResp.json();
    const actionResp = await api.post('/unified-rules', {
      name: refName,
      rule_class: 'action',
      stage: 'data',
      condition_tree: { type: 'condition', field: 'rcpttags', operator: 'hasTag', value: `grp:${unique}` },
      tags: [],
      action: 'reject',
      priority: 100,
      is_active: true,
    });
    expect(actionResp.ok()).toBeTruthy();
    const action = await actionResp.json();

    await authenticatedPage.goto('/zh/security/groups');
    await authenticatedPage.getByRole('tab', { name: /发信人/ }).click();
    const row = authenticatedPage.locator('tr', { hasText: unique });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.locator('button:has(svg.lucide-trash-2)')).toBeDisabled();

    await api.delete(`/unified-rules/${action.id}`);
    await api.delete(`/unified-rules/${group.id}`);
  });

  test('tag page shows warning for group-managed rule', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-warning-${uniqueSuffix()}`;
    const createResp = await api.post('/unified-rules', {
      name: unique,
      rule_class: 'tag',
      stage: 'mail',
      condition_tree: { type: 'condition', field: 'sender', operator: 'within', value: 'alice@x.com' },
      tags: [`grp:${unique}`],
      priority: 100,
      is_active: true,
      page: 'groups',
      metadata: { group_type: 'sender' },
    });
    const created = await createResp.json();

    await authenticatedPage.goto('/zh/rules/tag');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.locator('tr', { hasText: unique }).locator('button:has(svg.lucide-pencil)').click();
    await expect(authenticatedPage.getByText(/群组管理页面维护|Group Management page/)).toBeVisible();
    await authenticatedPage.getByRole('link', { name: /前往群组管理|Go to Group Management/ }).click();
    await expect(authenticatedPage).toHaveURL(/\/zh\/security\/groups$/);

    await api.delete(`/unified-rules/${created.id}`);
  });

  test('complex group remains visible and routes to localized tag page', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-complex-${uniqueSuffix()}`;
    const createResp = await api.post('/unified-rules', {
      name: unique,
      rule_class: 'tag',
      stage: 'header',
      condition_tree: {
        type: 'AND',
        children: [
          { type: 'condition', field: 'sender', operator: 'eq', value: 'alice@x.com' },
          { type: 'condition', field: 'subject', operator: 'contain', value: 'urgent' },
        ],
      },
      tags: [`grp:${unique}`],
      priority: 100,
      is_active: true,
      page: 'groups',
      metadata: { group_type: 'sender' },
    });
    const created = await createResp.json();

    await authenticatedPage.goto('/zh/security/groups');
    await authenticatedPage.getByRole('tab', { name: /发信人/ }).click();
    const row = authenticatedPage.locator('tr', { hasText: unique });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByText(/复杂条件/)).toBeVisible();
    await row.locator('button:has(svg.lucide-pencil)').click();
    await authenticatedPage.getByRole('button', { name: /确定|确认/ }).click();
    await expect(authenticatedPage).toHaveURL(/\/zh\/rules\/tag$/);

    await api.delete(`/unified-rules/${created.id}`);
  });
});

test.describe('groups - tenant_admin D1 regression', () => {
  const API_BASE = 'http://localhost:18080/api/v1';
  let tenantId: number;
  let tenantUserId: number;
  let adminToken: string;
  const tenantUsername = `e2e-grp-tenant-${uniqueSuffix()}`;
  const tenantPassword = 'TenantPass123!';

  test.beforeAll(async ({ request }) => {
    const loginResp = await request.post(`${API_BASE}/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    const loginData = await loginResp.json();
    adminToken = loginData.token;

    const tenantResp = await request.post(`${API_BASE}/tenants`, {
      data: { name: `grp-tenant-${uniqueSuffix()}`, code: `grp-${uniqueSuffix()}` },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(tenantResp.ok()).toBeTruthy();
    const tenant = await tenantResp.json();
    tenantId = (tenant.tenant ?? tenant).id;

    const userResp = await request.post(`${API_BASE}/users`, {
      data: { username: tenantUsername, password: tenantPassword, role: 'tenant_admin', role_id: await resolveTenantRoleID(API_BASE, adminToken), tenant_id: tenantId, must_change_password: false },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(userResp.ok()).toBeTruthy();
    const user = await userResp.json();
    tenantUserId = user.id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${API_BASE}/users/${tenantUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    await request.delete(`${API_BASE}/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  test.beforeEach(async ({ page }) => {
    // ?advance opts into requiresAdvancedRules sidebar groups (login checkbox
    // dropped in the 2FA refactor). Harmless for the tenant user here, which
    // navigates to the page directly.
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill(tenantUsername);
    await page.locator('input[name="password"]').fill(tenantPassword);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    await page.goto('/zh/security/groups');
    await page.waitForLoadState('networkidle');
  });

  // GT-11941 deliberately REVERSED the old D1 trimming: a group is a reusable
  // named set of conditions, not a stage execution, so defining an IP group does
  // not imply running stage-1 on it. 「五类群组管理 P0」 applies to tenant admins
  // too, and group-management-page.tsx now derives the tab set from
  // platformScope ALONE (allowedTypes = platformScope ? ['ip'] : ALL_TYPES) --
  // role is not a factor. What IS narrowed by role is the policy pipeline's
  // stage 1, which group-policy-drawer greys out instead.
  //
  // Asserted positively: if role-based trimming is ever reintroduced here, this
  // fails.
  test('tenant_admin sees all five group type tabs (GT-11941)', async ({ page }) => {
    for (const name of [/IP 组/, /发信人组/, /收信人组/, /内容组/, /特征组/]) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }
  });

  test('tenant_admin can create recipient group', async ({ page }) => {
    const unique = `e2e-rcpt-${uniqueSuffix()}`;

    await page.getByRole('tab', { name: /收信人/ }).click();
    const tabPanel = page.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await tabPanel.getByRole('button', { name: /新建群组/ }).click();

    await page.locator('[role="dialog"] input[placeholder*="群组名称"]').fill(unique);
    await page.locator('[role="dialog"] textarea').fill('alice@x.com\nbob@y.com');
    await page.locator('[role="dialog"]').getByRole('button', { name: '保存' }).click();

    await expect(page.getByRole('cell', { name: unique })).toBeVisible({ timeout: 10000 });

    const loginResp = await page.request.post(`${API_BASE}/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    const { token } = await loginResp.json();
    const listResp = await page.request.get(`${API_BASE}/unified-rules?rule_class=tag&page=groups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listResp.json();
    const created = ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    if (created) {
      await page.request.delete(`${API_BASE}/unified-rules/${created.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  // GT-11941 again (see the tab test above): the dialog's type options come from
  // the page's `allowedTypes`, which is platformScope-driven only
  // (platformScope ? ['ip'] : ALL_TYPES) -- a tenant admin may define any of the
  // five group types. Asserted positively so reintroduced role-trimming fails.
  test('tenant_admin can pick every group type in the create dialog (GT-11941)', async ({ page }) => {
    await page.getByRole('tab', { name: /收件人|收信人|recipient/i }).click();
    const tabPanel = page.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await tabPanel.getByRole('button', { name: /新建群组/ }).click();

    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const typeTrigger = page.locator('[role="dialog"] button[role="combobox"]');
    await typeTrigger.click();

    for (const type of ['ip', 'sender', 'recipient', 'content', 'feature']) {
      await expect(page.locator(`[role="option"][data-value="${type}"]`)).toBeVisible();
    }

    await page.keyboard.press('Escape');
  });

  // audit M10: a sender group whose member is a bare domain (e.g.
  // "example.com" with no "@" / "." prefix) is how the webapp normalizes a
  // domain-only entry. Before the fix, the webapp serialized the member with
  // field name `senderdomain` but antispam's parser only recognized
  // `sender_domain` — so the whole group was silently dropped. This test
  // exercises the webapp→API→antispam round trip end-to-end and asserts the
  // group survives serialization AND round-trips with a domain member.
  test('create sender group with bare-domain member round-trips through webapp serialization (M10)', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `e2e-bare-domain-${uniqueSuffix()}`;

    // This test drives the system_admin `authenticatedPage`, but it lives in the
    // tenant_admin describe whose beforeEach only navigates the tenant `page`.
    // So navigate authenticatedPage ourselves -- and scope it first: since
    // GT-12245/GT-12257 a platform viewer with no tenant gets a 403 page at
    // /security/groups, which is why the 发信人 tab was never found.
    // (The old note that this tab is "system_admin-only" is stale: GT-11941
    // stopped trimming group types by role.)
    const tenantId = api.getTenantId();
    expect(tenantId, 'a tenant must exist (see global-setup)').not.toBeNull();
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost';
    await authenticatedPage.context().addCookies([
      { name: 'osg_viewer', value: 'tenant', url: base, sameSite: 'Lax' },
      { name: 'osg_selected_tenant', value: String(tenantId), url: base, sameSite: 'Lax' },
    ]);
    await authenticatedPage.evaluate((tid) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
    }, tenantId);
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
    await authenticatedPage.goto('/zh/security/groups');
    await authenticatedPage.waitForLoadState('networkidle');

    await authenticatedPage.getByRole('tab', { name: /发信人/ }).click();
    const tabPanel = authenticatedPage.locator('[role="tabpanel"]').filter({ hasText: /新建群组/ }).first();
    await tabPanel.getByRole('button', { name: /新建群组/ }).click();

    await authenticatedPage.locator('[role="dialog"] input[placeholder*="群组名称"]').fill(unique);
    // A bare domain member (no "@" / "." prefix) — the webapp normalizes a
    // domain-only group entry this way.
    await authenticatedPage.locator('[role="dialog"] textarea').fill('bare-domain-test.example');
    await authenticatedPage.locator('[role="dialog"]').getByRole('button', { name: '保存' }).click();

    await expect(authenticatedPage.getByRole('cell', { name: unique })).toBeVisible({ timeout: 10000 });

    // The group must round-trip with its member intact (the API serialization
    // bug M10 was that antispam dropped the whole group when a domain member
    // was present, so this find would fail on the buggy path).
    const listResp = await api.get(`/unified-rules?rule_class=tag&page=groups`);
    const listData = await listResp.json();
    const created = ((listData.items || []) as RuleListItem[]).find(r => r.name === unique);
    expect(created, `sender group ${unique} with a bare-domain member should round-trip`).toBeTruthy();

    // Cleanup.
    if (created) {
      await api.delete(`/unified-rules/${created.id}`);
    }
  });
});
