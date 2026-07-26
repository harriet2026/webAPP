import { test, expect } from '../fixtures/auth.fixture';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast } from '../helpers/wait';
import { resolveTenantRoleID } from '../helpers/roles';

const API_BASE = 'http://localhost:18080/api/v1';

// The dev docker stack ships an OpenLDAP service (osixia/openldap, domain
// testdomain.local) reachable from the apiserver container as `openldap:389`.
// It is used for the LDAP "test connection success → can save" case; the
// "failure → red text" case dials an unreachable port.
//
// 2026-07-20 admin-contacts html_spec 对齐后的交互契约（本 spec 同步改写）：
// - 表单 placeholder 逐字对齐 demo（如 ldap.corp.com / 如 dc=corp,dc=com …）
// - 底部按钮「保存」→「确定」，不再禁用；未过测试点击 → toast「请先完成连接测试并通过」
// - 测试结果为行内标签：绿「连通正常」/ 红「连接失败：…」（TestResultTag）
// - CSV 列映射弹窗已删除（§10 Q2 拍板严格对齐 demo）：单文件上传 + 自动列映射
// - coremail/网易企邮 可选（demo 对齐；后端 stub，保存不需要 test_token）
// - 日志详情为右侧抽屉（Sheet），操作按钮「详情」
async function uploadCsv(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  tenantId: number,
  csv: string,
  fileName = 'users.csv',
) {
  const resp = await request.post(`${API_BASE}/contact-sources/_csv/upload`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': String(tenantId),
    },
    multipart: {
      user_file: { name: fileName, mimeType: 'text/csv', buffer: Buffer.from(csv) },
    },
  });
  expect(resp.ok()).toBeTruthy();
  return resp.json();
}

const LDAP_HOST = 'openldap';
const LDAP_BASE_DN = 'dc=testdomain,dc=local';
const LDAP_BIND_DN = 'cn=admin,dc=testdomain,dc=local';
const LDAP_BIND_PASSWORD = 'adminpass';

// Seed a CSV source end-to-end via the API (upload → preview → create → sync),
// polling until the sync finishes. Returns the new source id + sync_log id.
async function seedContactsSource(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  tenantId: number,
  name: string,
  rows: Array<{ email: string; name: string; uid: string }>,
) {
  const header = 'email,name,uid';
  const body = rows.map((r) => `${r.email},${r.name},${r.uid}`).join('\n');
  const csv = `${header}\n${body}\n`;

  const up = await uploadCsv(request, token, tenantId, csv);
  const userColumnMap: Record<string, string> = { email: 'email', display_name: 'name' };

  const pvResp = await request.post(`${API_BASE}/contact-sources/_csv/preview`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId), 'Content-Type': 'application/json' },
    data: {
      user_file_ref: up.user_file_ref,
      uid_column: 'uid',
      user_column_map: userColumnMap,
      upload_token: up.upload_token,
    },
  });
  expect(pvResp.ok()).toBeTruthy();
  const pv = await pvResp.json();

  const createResp = await request.post(`${API_BASE}/contact-sources`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId), 'Content-Type': 'application/json' },
    data: {
      name,
      source_type: 'csv',
      priority: 100,
      config: {
        user_file_ref: up.user_file_ref,
        dept_file_ref: '',
        uid_column: 'uid',
        user_column_map: userColumnMap,
      },
      sync_mode: 'full',
      test_token: pv.test_token,
    },
  });
  expect(createResp.ok()).toBeTruthy();
  const src = await createResp.json();

  const syncResp = await request.post(`${API_BASE}/contact-sources/${src.id}/sync`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
  });
  expect(syncResp.ok()).toBeTruthy();
  const syncLog = await syncResp.json();

  // Poll the source until sync_status leaves "running".
  for (let i = 0; i < 60; i++) {
    const s = await request.get(`${API_BASE}/contact-sources/${src.id}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
    });
    const j = await s.json();
    if (j.sync_status && j.sync_status !== 'running') break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { sourceId: src.id as number, syncLogId: syncLog.sync_log_id as number };
}

test.describe.serial('Organization Contacts', () => {
  const ns = uniqueSuffix();
  let token = '';
  let tenantId = 0;

  // Playwright isolates localStorage per test (fresh page each test), and the
  // login flow resets the auth context's selectedTenantId from the login
  // response (null for system_admin). So the tenant pinned by the setup test
  // below must be re-applied AFTER login, before each subsequent test
  // navigates.
  // GT-12245 起，平台视角会**主动清掉**残留的租户选择，所以只写
  // osgateway_selected_tenant 不够 —— 必须同时把视角切成 tenant，否则页面停在
  // 「请先选择租户」，本模块所有用例都取不到数据（见 webapp/AGENTS.md）。
  test.beforeEach(async ({ authenticatedPage }) => {
    if (tenantId) {
      await authenticatedPage.evaluate((tid) => {
        localStorage.setItem('osgateway_selected_tenant', String(tid));
        document.cookie = `osg_selected_tenant=${tid}; path=/; SameSite=Strict`;
        document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
      }, tenantId);
      // 写入 osg_viewer 会让 product-form context 自行触发一次导航；不等它稳定
      // 就紧接着 page.goto，会把我们的导航打断成 net::ERR_ABORTED。
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);
    }
  });

  const taUsername = `e2e_contacts_ta_${ns}`;
  const taPassword = 'ContactsTaPass1!';

  test('setup tenant + select it in the admin session', async ({ authenticatedPage }) => {
    token =
      (await authenticatedPage.evaluate(() => localStorage.getItem('osgateway_token'))) || '';

    const r = await authenticatedPage.request.post(`${API_BASE}/tenants`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `contacts_e2e_${ns}`, code: `contacts-${ns}`, description: 'E2E org contacts' },
    });
    expect(r.ok()).toBeTruthy();
    const rBody = await r.json();
    tenantId = (rBody.tenant ?? rBody).id;

    await authenticatedPage.evaluate((tid) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
      document.cookie = `osg_selected_tenant=${tid}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tenantId);
  });

  // ── UC-02: LDAP test connection failure → red inline result tag ───────
  test('LDAP test connection failure shows red error text', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/organization-contacts');
    await expect(authenticatedPage.getByRole('heading', { name: '组织通讯录' })).toBeVisible({ timeout: 15000 });

    const addSourceBtn = authenticatedPage.getByTestId('contacts-source-add');
    await expect(addSourceBtn).toBeVisible({ timeout: 15000 });
    await addSourceBtn.click();
    const sheet = authenticatedPage.getByTestId('contacts-source-form');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // 名称必填（canTest 解禁条件含名称无错），placeholder 逐字对齐 demo。
    await sheet.getByTestId('contacts-source-form-name').fill(`e2e-ldap-fail-${ns}`);
    // Point at the real OpenLDAP host on an unreachable port so the apiserver
    // observes a genuine connection failure.
    await sheet.getByTestId('contacts-source-form-server').fill(LDAP_HOST);
    // GT-12037 起 Base DN / Bind DN / 绑定密码 都是必填，缺任一项「测试连接」
    // 保持禁用，所以失败路径也要填齐 —— 失败由不可达端口(1)制造。
    await sheet.getByTestId('contacts-source-form-base-dn').fill(LDAP_BASE_DN);
    await sheet.getByTestId('contacts-source-form-bind-dn').fill(LDAP_BIND_DN);
    await sheet.getByTestId('contacts-source-form-password').fill(LDAP_BIND_PASSWORD);
    const portInput = sheet.getByTestId('contacts-source-form-port');
    await portInput.fill('');
    await portInput.fill('1');

    await sheet.getByTestId('contacts-source-form-test').click();

    // 红色行内结果标签「连接失败：…」。
    const resultTag = sheet.getByTestId('contacts-source-form-test-result');
    await expect(resultTag).toBeVisible({ timeout: 30000 });
    await expect(resultTag).toContainText('连接失败');
  });

  // ── UC-01: LDAP test connection success → 确定保存 ────────────────────
  test('LDAP test connection success enables and saves', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/organization-contacts');
    await expect(authenticatedPage.getByRole('heading', { name: '组织通讯录' })).toBeVisible({ timeout: 15000 });
    const addSourceBtn = authenticatedPage.getByTestId('contacts-source-add');
    await expect(addSourceBtn).toBeVisible({ timeout: 15000 });
    await addSourceBtn.click();
    const sheet = authenticatedPage.getByTestId('contacts-source-form');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    const name = `e2e-ldap-${ns}`;
    await sheet.getByTestId('contacts-source-form-name').fill(name);
    await sheet.getByTestId('contacts-source-form-server').fill(LDAP_HOST);
    // An authenticated bind to a non-loopback LDAP is only permitted over TLS
    // (internal/directory/ldap.go fail-closed) → enable TLS + skip_verify.
    const portInput = sheet.getByTestId('contacts-source-form-port');
    await portInput.fill('');
    await portInput.fill('636');
    await sheet.locator('[data-testid="ldap-use-tls"]').click();
    await sheet.locator('[data-testid="ldap-skip-verify"]').click();
    await sheet.getByTestId('contacts-source-form-base-dn').fill(LDAP_BASE_DN);
    await sheet.getByTestId('contacts-source-form-bind-dn').fill(LDAP_BIND_DN);
    await sheet.getByTestId('contacts-source-form-password').fill(LDAP_BIND_PASSWORD);

    await sheet.getByTestId('contacts-source-form-test').click();

    // 绿色行内标签「连通正常」。
    const resultTag = sheet.getByTestId('contacts-source-form-test-result');
    await expect(resultTag).toBeVisible({ timeout: 30000 });
    await expect(resultTag).toContainText('连通正常');

    // toast 可能悬停在底部按钮上，先等它消失。
    await authenticatedPage
      .locator('[data-sonner-toast]')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});

    await sheet.getByTestId('contacts-source-form-submit').click();
    await waitForToast(authenticatedPage, '数据源已新增');

    const row = authenticatedPage.locator('table tbody tr').filter({ hasText: name }).first();
    await expect(row).toBeVisible({ timeout: 10000 });

    const created = await authenticatedPage.request.get(`${API_BASE}/contact-sources?search=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
    });
    const createdJson = await created.json();
    const createdId = createdJson.items?.[0]?.id;
    if (createdId) {
      await authenticatedPage.request.delete(`${API_BASE}/contact-sources/${createdId}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
      });
    }
  });

  // ── UC-05: CSV import (单文件上传 → 自动列映射 → 确定) ────────────────
  test('CSV import single-file flow (upload → auto map → save)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/organization-contacts');
    await expect(authenticatedPage.getByRole('heading', { name: '组织通讯录' })).toBeVisible({ timeout: 15000 });
    await authenticatedPage.getByTestId('contacts-source-add').click();
    const sheet = authenticatedPage.getByTestId('contacts-source-form');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    const csvName = `e2e-csv-${ns}`;
    await sheet.getByTestId('contacts-source-form-name').fill(csvName);

    // 切换同步方式 → CSV 导入。
    await sheet.getByTestId('contacts-source-form-type').click();
    await authenticatedPage.locator('[role="option"]').filter({ hasText: 'CSV 导入' }).first().click();

    // demo 表单：组织 ID / 组织名称 + 单个文件输入（选择文件即自动
    // 上传 → 自动列映射（email 表头）→ 预览校验拿 test_token）。
    await sheet.getByTestId('contacts-source-form-org-id').fill(`RD-${ns}`);
    await sheet.getByTestId('contacts-source-form-org-name').fill('研发中心');
    const csvContent = `email,name\nalice-${ns}@csv-e2e.example,Alice\nbob-${ns}@csv-e2e.example,Bob\n`;
    await sheet
      .getByTestId('contacts-source-form-csv-file')
      .setInputFiles({ name: 'users.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) });

    // 上传+预览是网络往返；确定按钮点击后出「数据源已新增」。
    // （未拿到 test_token 时点确定会 toast「请先完成连接测试并通过」——
    // 用 expect.poll 等到保存成功为止。）
    await expect
      .poll(
        async () => {
          // 抽屉仍开着（尚未保存成功）才继续点「确定」；保存成功后抽屉关闭。
          if (await sheet.isVisible().catch(() => false)) {
            await sheet.getByTestId('contacts-source-form-submit').click().catch(() => {});
          }
          const created = await authenticatedPage.request.get(
            `${API_BASE}/contact-sources?search=${encodeURIComponent(csvName)}`,
            { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) } },
          );
          const j = await created.json();
          return (j.items?.length ?? 0) > 0;
        },
        { timeout: 30000, intervals: [1500] },
      )
      .toBeTruthy();

    const row = authenticatedPage.locator('table tbody tr').filter({ hasText: csvName }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
  });

  // ── coremail / 网易企邮 可选（demo 对齐；后端 stub）───────────────────
  test('Coremail and 网易企邮 source types are selectable with demo forms', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/organization-contacts');
    await expect(authenticatedPage.getByRole('heading', { name: '组织通讯录' })).toBeVisible({ timeout: 15000 });
    await authenticatedPage.getByTestId('contacts-source-add').click();
    const sheet = authenticatedPage.getByTestId('contacts-source-form');
    await expect(sheet).toBeVisible({ timeout: 10000 });

    await sheet.getByTestId('contacts-source-form-type').click();
    const coremailOpt = authenticatedPage.locator('[role="option"]').filter({ hasText: 'Coremail API' }).first();
    await expect(coremailOpt).toBeVisible();
    await coremailOpt.click();
    // Coremail 表单字段：接口 URL / 管理账号 / 账号密码。
    await expect(sheet.getByTestId('contacts-source-form-api-url')).toBeVisible();
    await expect(sheet.getByTestId('contacts-source-form-account')).toBeVisible();
    await expect(sheet.getByTestId('contacts-source-form-api-password')).toBeVisible();

    await sheet.getByTestId('contacts-source-form-type').click();
    await authenticatedPage.locator('[role="option"]').filter({ hasText: '网易企邮 API' }).first().click();
    // 网易表单字段：接口 URL / 企业域名 / 应用 ID / 授权码 / OpenID。
    await expect(sheet.getByTestId('contacts-source-form-corp-domain')).toBeVisible();
    await expect(sheet.getByTestId('contacts-source-form-app-id')).toBeVisible();
    await expect(sheet.getByTestId('contacts-source-form-auth-code')).toBeVisible();
    await expect(sheet.getByTestId('contacts-source-form-open-id')).toBeVisible();

    await authenticatedPage.keyboard.press('Escape').catch(() => {});
  });

  // ── seed contacts via API for the tag / sync-log cases ────────────────
  test('seed contacts + a failing-row source via API', async ({ authenticatedPage }) => {
    const api = authenticatedPage.request;
    const emails = [
      { email: `tag-a-${ns}@csv-e2e.example`, name: 'TagA', uid: `ua-${ns}` },
      { email: `tag-b-${ns}@csv-e2e.example`, name: 'TagB', uid: `ub-${ns}` },
      { email: `tag-c-${ns}@csv-e2e.example`, name: 'TagC', uid: `uc-${ns}` },
    ];
    await seedContactsSource(api, token, tenantId, `e2e-tag-src-${ns}`, emails);

    // A second source with an invalid-email row so its sync log has failures.
    const badCsv = `email,name,uid\nnot-an-email-${ns},Bad,ubad-${ns}\n`;
    await uploadCsv(api, token, tenantId, badCsv, 'bad.csv').then(async (up) => {
      const pvResp = await api.post(`${API_BASE}/contact-sources/_csv/preview`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId), 'Content-Type': 'application/json' },
        data: {
          user_file_ref: up.user_file_ref,
          uid_column: 'uid',
          user_column_map: { email: 'email', display_name: 'name' },
          upload_token: up.upload_token,
        },
      });
      const pv = await pvResp.json();
      const createResp = await api.post(`${API_BASE}/contact-sources`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId), 'Content-Type': 'application/json' },
        data: {
          name: `e2e-fail-src-${ns}`,
          source_type: 'csv',
          priority: 100,
          config: { user_file_ref: up.user_file_ref, dept_file_ref: '', uid_column: 'uid', user_column_map: { email: 'email', display_name: 'name' } },
          sync_mode: 'full',
          test_token: pv.test_token,
        },
      });
      const src = await createResp.json();
      await api.post(`${API_BASE}/contact-sources/${src.id}/sync`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
      });
      for (let i = 0; i < 60; i++) {
        const s = await api.get(`${API_BASE}/contact-sources/${src.id}`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) },
        });
        const j = await s.json();
        if (j.sync_status && j.sync_status !== 'running') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
    });
  });

  // ── UC-09/UC-10: contacts single + bulk tag（批量走二次确认弹窗）──────
  test('contacts single + bulk tag with confirm dialog', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/organization-contacts');
    await authenticatedPage.getByTestId('contacts-tab-book').click();

    const table = authenticatedPage.getByTestId('contacts-book-table');
    await table.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });

    // 行内「标记」下拉 → 标记为高管，即时生效 + demo 文案 toast。
    const targetEmail = `tag-a-${ns}@csv-e2e.example`;
    const row = table.locator('tbody tr').filter({ hasText: targetEmail }).first();
    await row.locator('button', { hasText: '标记' }).first().click();
    await authenticatedPage.getByRole('menuitem', { name: '标记为高管' }).click();
    await waitForToast(authenticatedPage, '已标记为高管');

    // 批量：勾选两行 → 批量标记为关键岗位 → 二次确认弹窗 → 确定。
    const bulkA = table.locator('tbody tr').filter({ hasText: `tag-b-${ns}@csv-e2e.example` }).first();
    const bulkB = table.locator('tbody tr').filter({ hasText: `tag-c-${ns}@csv-e2e.example` }).first();
    await bulkA.locator('[role="checkbox"]').click();
    await bulkB.locator('[role="checkbox"]').click();

    const batchBar = authenticatedPage.getByTestId('contacts-book-batch-bar');
    await expect(batchBar).toBeVisible();
    await expect(batchBar).toContainText('已选 2 条');
    await authenticatedPage.getByTestId('contacts-book-batch-key').click();

    const confirmDialog = authenticatedPage.getByTestId('contacts-book-batch-dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await expect(confirmDialog).toContainText('确定将选中的 2 条记录标记为关键岗位吗？');
    await expect(confirmDialog).toContainText('标记变更将实时推送至策略引擎并立即生效');
    await authenticatedPage.getByTestId('contacts-book-batch-dialog-confirm').click();
    await waitForToast(authenticatedPage, '成功标记 2 条记录');
  });

  // ── UC-13: sync log detail sheet + 失败明细导出按钮 ───────────────────
  test('sync log detail sheet shows export-failures button', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/organization-contacts');
    await authenticatedPage.getByTestId('contacts-tab-log').click();

    // 搜索框按数据源名称过滤（demo 口径，当前页客户端过滤）。
    await authenticatedPage.getByTestId('contacts-log-search').fill(`e2e-fail-src-${ns}`);

    const table = authenticatedPage.getByTestId('contacts-log-table');
    await table.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 15000 });

    await table.locator('tbody tr').first().getByRole('button', { name: '详情' }).click();
    const sheet = authenticatedPage.getByTestId('contacts-log-detail');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // 6 张统计卡 + 失败明细区块。
    await expect(sheet.getByTestId('contacts-log-detail-stat-added')).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByTestId('contacts-log-detail-stat-failed')).toBeVisible();
    await expect(sheet.getByTestId('contacts-log-detail-failures')).toBeVisible();

    const exportBtn = sheet.getByTestId('contacts-log-detail-failures-export');
    await expect(exportBtn).toBeVisible({ timeout: 5000 });
    await expect(exportBtn).toBeEnabled();
  });

  // ── UC-19: tenant_admin login → can manage its OWN tenant's sources ───
  test('setup tenant_admin user for UC-19', async ({ authenticatedPage }) => {
    const r = await authenticatedPage.request.post(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { username: taUsername, password: taPassword, role: 'tenant_admin', role_id: await resolveTenantRoleID(API_BASE, token, authenticatedPage.request), tenant_id: tenantId, must_change_password: false },
    });
    expect(r.ok()).toBeTruthy();
  });

  test('tenant_admin: can manage sources and tag contacts (UC-19 + G-2)', async ({ page }) => {
    await page.goto('/zh/login');
    await page.locator('input[name="username"]').fill(taUsername);
    await page.locator('input[name="password"]').fill(taPassword);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    await page.goto('/zh/organization-contacts');
    await expect(page.getByRole('heading', { name: '组织通讯录' })).toBeVisible({ timeout: 15000 });

    // GT-12030：数据源写操作对本租户的 tenant_admin 开放（后端
    // RequireAdminOrTenantAdmin），所以「新增数据源」对其可见。
    await expect(page.getByTestId('contacts-source-add')).toBeVisible({ timeout: 10000 });

    // 通讯录 Tab：tenant_admin 可查询 + 标记（spec §5.3）。
    await page.getByTestId('contacts-tab-book').click();
    await page.locator('table').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});

    const rowCount = await page.locator('table tbody tr').count();
    if (rowCount > 0) {
      await expect(page.getByRole('button', { name: '标记' }).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('cleanup tenant + seeded sources', async ({ authenticatedPage }) => {
    if (tenantId) {
      await authenticatedPage.request.delete(`${API_BASE}/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
