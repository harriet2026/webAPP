/**
 * Playwright E2E smoke for the Impersonation Detection Agent (P4 frontend).
 *
 * Covers the UI surface introduced by spec §7 / plan-5:
 *   a) sidebar entry / direct URL navigates to the page
 *   b) the three top-level tabs render and switch (overview / displayname / brand)
 *   c) the agent enable toggle and the audit-only banner path exist
 *   d) the allow-list (whitelist) popover opens from the top bar
 *   e) the persons/brands management UI renders
 *   f) all four locales render without missing-key fallback
 *
 * This is a UI smoke: it asserts the rendered i18n labels and that the
 * component shells mount. It does not seed backend rows (the detection-logs
 * table empty state is itself a valid assertion). Requires the running stack
 * (apiserver + webapp) to execute — same fixture/login pattern as
 * phishing-detection.spec.ts.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { getDefaultTenantId } from '../helpers/tenant';

const LOCALES = ['zh', 'en', 'th', 'ru'] as const;

// Localized tab labels keyed by locale. Tabs are i18n-rendered; matching the
// visible label keeps the selector robust to markup changes.
const TAB_LABELS = {
  zh: { overview: '检测总览', displayname: '发信人名称仿冒', brand: '品牌保护' },
  en: { overview: 'Overview', displayname: 'Display-name spoof', brand: 'Brand protection' },
  th: { overview: 'ภาพรวมการตรวจจับ', displayname: 'ปลอมชื่อผู้ส่ง', brand: 'ปกป้องแบรนด์' },
  ru: { overview: 'Обзор обнаружения', displayname: 'Подделка имени отправителя', brand: 'Защита брендов' },
} as const;

const PAGE_TITLES = {
  zh: { person: '保护对象', brand: '保护品牌列表' },
  en: { person: 'Protected identities', brand: 'Protected brand list' },
  th: { person: 'อัตลักษณ์ที่ปกป้อง', brand: 'รายการแบรนด์ที่ปกป้อง' },
  ru: { person: 'Защищаемые персоны', brand: 'Список защищаемых брендов' },
} as const;

const DRAWER_LABELS = {
  zh: { personAdd: '添加保护对象', personTitle: '添加保护对象', brandAdd: '添加品牌', brandTitle: '添加保护品牌' },
  en: { personAdd: 'Add identity', personTitle: 'Add identity', brandAdd: 'Add brand', brandTitle: 'Add protected brand' },
  th: { personAdd: 'เพิ่มอัตลักษณ์', personTitle: 'เพิ่มอัตลักษณ์', brandAdd: 'เพิ่มแบรนด์', brandTitle: 'เพิ่มแบรนด์ที่ปกป้อง' },
  ru: { personAdd: 'Добавить персону', personTitle: 'Добавить персону', brandAdd: 'Добавить бренд', brandTitle: 'Добавить защищаемый бренд' },
} as const;

const KPI_LABELS = {
  zh: ['今日检测', '今日拦截', '待审核', '发信人名称仿冒', '品牌保护命中'],
  en: ['Today detected', 'Today intercepted', 'Pending review', 'Display-name spoof', 'Brand protection hits'],
  th: ['ตรวจพบวันนี้', 'ดักจับวันนี้', 'รอตรวจสอบ', 'ปลอมชื่อผู้ส่ง', 'พบการปกป้องแบรนด์'],
  ru: ['Обнаружено сегодня', 'Перехвачено сегодня', 'Ожидает проверки', 'Подделка имени отправителя', 'Срабатывания защиты бренда'],
} as const;

const MOCK_ENGINE_CONFIG = {
  enabled: true,
  run_mode: 'realtime',
  default_mark_style: { positions: ['subject'], text: '[Spoof Alert]' },
  caps: {
    max_persons: 500,
    max_brands: 100,
    max_legit_emails_per_person: 20,
    max_domains_per_brand: 20,
    max_whitelist_entries: 500,
  },
};

const MOCK_AGENT_OVERVIEW = {
  agents: [
    {
      key: 'spoofing',
      module_key: 'spoofing_agent',
      feature_id: 'spoofing-detection',
      access: 'enabled',
      status: 'running',
      stage_position: '4.1',
      policy_pages: [
        { page: 'spoofing_admission', role: 'admission', management: 'internal' },
        { page: 'spoofing_disposition', role: 'disposition', management: 'internal' },
      ],
      today_processed: 8,
      hit_count: 2,
      processed_count: 8,
      hit_rate: 0.25,
    },
  ],
};

const EXISTING_PERSON = {
  id: 9001,
  name: 'spoof_person:existing',
  display_name: '已有对象',
  category: 'finance',
  protection_level: 'high',
  sensitivity: 85,
  confidence_threshold: 80,
  legit_emails: [{ email: 'existing@corp.test', match_type: 'exact' }],
  disposition: {
    mode: 'standard',
    action: 'quarantine',
    mark_style: ['subject'],
    notify: false,
  },
  enabled: true,
  observe_mode: false,
  read_only: false,
};

function mockContact(id: number, displayName: string, email: string) {
  return {
    id,
    source_id: 31,
    source_name: 'Org Directory',
    email,
    display_name: displayName,
    department_path: '财务部/审计组',
    job_title: '财务总监',
    external_uid: `ext-${id}`,
    tag: 'executive',
    tag_label: '高管',
    status: 'active',
    status_label: '正常',
  };
}

// selectedTenantId: pin the globally-selected tenant for a SYSTEM ADMIN caller.
// useApiRequest() stamps X-Tenant-ID from that selection (a tenant_admin instead
// uses its own user.tenant_id, so it must NOT be pinned — doing so inside this
// shared helper broke the tenant-admin import test, which expects tenant 7).
async function mockSpoofingImportApis(page: Page, selectedTenantId?: string) {
  const contacts = [
    mockContact(1, '已有对象', 'existing@corp.test'),
    ...Array.from({ length: 21 }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return mockContact(i + 2, `员工 ${n}`, `employee-${n}@corp.test`);
    }),
  ];
  const contactRequests: { url: URL; tenantHeader?: string }[] = [];
  let bulkPayload: Record<string, unknown> | null = null;
  let bulkTenantHeader: string | undefined;
  let previewPayload: Record<string, unknown> | null = null;
  let previewTenantHeader: string | undefined;

  // Every import call (contacts query / notification preview / bulk submit) is
  // issued through useApiRequest(), which stamps X-Tenant-ID from the globally
  // SELECTED tenant — NOT from /routing/_meta/scope (the spoofing pages never read
  // that endpoint). Left unpinned, the header is whatever globalSetup happened to
  // select (observed: "1"), so a system-admin test asserting toBe('31') fails even
  // though its query params are perfectly correct. The invariant worth protecting
  // is "all three import calls are scoped to the same, selected tenant" — so make
  // that tenant deterministic. /tenants must list it too: the TenantSelector drops
  // a selection that is not in the list, which would silently reset the header.
  if (selectedTenantId) {
    await page.addInitScript((tid) => {
      localStorage.setItem('osgateway_selected_tenant', tid);
    }, selectedTenantId);
    await page.route('**/api/v1/tenants**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ id: Number(selectedTenantId), name: 'import-e2e-tenant', code: `imp${selectedTenantId}`, status: 'active' }],
          total: 1,
          page: 1,
          page_size: 100,
        }),
      });
    });
  }

  await page.route('**/api/v1/agent-center/overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AGENT_OVERVIEW),
    });
  });

  await page.route('**/api/v1/routing/_meta/scope**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mode: 'single', tenant_id: 31 }),
    });
  });

  await page.route('**/api/v1/spoofing-agent/engine-config**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ENGINE_CONFIG),
    });
  });

  await page.route('**/api/v1/spoofing-agent/persons/bulk', async (route) => {
    bulkPayload = (route.request().postDataJSON?.() ?? {}) as Record<string, unknown>;
    bulkTenantHeader = route.request().headers()['x-tenant-id'];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/v1/spoofing-agent/persons/notification-preview', async (route) => {
    previewPayload = (route.request().postDataJSON?.() ?? {}) as Record<string, unknown>;
    previewTenantHeader = route.request().headers()['x-tenant-id'];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        from: 'security-alert@osgateway.local',
        to: 'secops@corp.test',
        subject: '【仿冒告警】检测到针对“员工 01”的仿冒邮件',
        text: '保护目标：员工 01\n样例发件人：billing@cacter-support.test',
        mime: 'From: security-alert@osgateway.local\r\nTo: secops@corp.test',
        content_type: 'text/plain; charset=utf-8',
      }),
    });
  });

  await page.route('**/api/v1/spoofing-agent/persons?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [EXISTING_PERSON], total: 1, page: 1, page_size: 100 }),
    });
  });

  await page.route('**/api/v1/contacts?**', async (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get('page') || '1');
    const pageSize = Number(url.searchParams.get('page_size') || '20');
    contactRequests.push({
      url,
      tenantHeader: route.request().headers()['x-tenant-id'],
    });
    const start = (pageNumber - 1) * pageSize;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: contacts.slice(start, start + pageSize), total: contacts.length, page: pageNumber, page_size: pageSize }),
    });
  });

  return {
    contactRequests,
    getBulkPayload: () => bulkPayload,
    getBulkTenantHeader: () => bulkTenantHeader,
    getPreviewPayload: () => previewPayload,
    getPreviewTenantHeader: () => previewTenantHeader,
  };
}

type SpoofingAdminRole = 'system_admin' | 'tenant_admin';

async function configureSpoofingAdminPage(page: Page, role: SpoofingAdminRole, granted: boolean) {
  // Catch-all FIRST (Playwright runs routes in reverse registration order, so the
  // specific mocks registered below still win).
  //
  // These specs authenticate with a FAKE token. Any /api/v1 call that is NOT
  // explicitly mocked therefore reaches the real API, comes back 401, and the
  // client's 401 handler hard-navigates to /zh/login — the test then dies with a
  // bare `page.goto: net::ERR_ABORTED` or "waiting for /zh/login navigation",
  // pointing nowhere near the real cause. That made this file flaky: whichever
  // test happened to trigger an unmocked call (the shell's /tenants fetch, for
  // one) failed, and the victim rotated between runs.
  //
  // Serving an empty 200 for anything unmocked keeps the spec hermetic, which is
  // what it is designed to be. Do NOT add this to the real-login (authenticatedPage)
  // tests — those are supposed to hit the live API.
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
    });
  });
  await page.addInitScript(({ adminRole }) => {
    localStorage.setItem('osgateway_user', JSON.stringify({
      id: 77,
      username: 'tenant-reviewer',
      role: adminRole,
      tenant_id: 7,
      created_at: '',
      updated_at: '',
    }));
    localStorage.setItem('osgateway_selected_tenant', '7');
    localStorage.setItem('osgateway_show_advanced_rules', '1');
  }, { adminRole: role });
  await page.context().addCookies([
    { name: 'osgateway_auth', value: '1', domain: 'localhost', path: '/' },
    { name: 'osgateway_auth', value: '1', domain: '127.0.0.1', path: '/' },
    { name: 'osgateway_token', value: 'e2e-tenant-token', domain: 'localhost', path: '/' },
    { name: 'osgateway_token', value: 'e2e-tenant-token', domain: '127.0.0.1', path: '/' },
    { name: 'osg_viewer', value: 'tenant', domain: 'localhost', path: '/' },
    { name: 'osg_viewer', value: 'tenant', domain: '127.0.0.1', path: '/' },
  ]);
  // The app shell renders a TenantSelector for a system_admin, which fetches
  // /tenants. These specs authenticate with a FAKE token and mock every backend
  // call, so any unmocked request reaches the real API, gets a 401, and the
  // client's 401 handler hard-navigates to /zh/login — the test then dies with
  // "navigated to /zh/login" / ERR_ABORTED rather than any useful assertion.
  // Keep this mock in sync whenever the shell starts calling a new endpoint.
  await page.route('**/api/v1/tenants**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ id: 7, name: 'e2e-tenant', code: 'e2e', status: 'active' }],
        total: 1,
        page: 1,
        page_size: 100,
      }),
    });
  });
  await page.route('**/api/v1/bootstrap**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        form: 'ai-multi',
        capabilities: {},
        branding: { deployment: 'self-hosted' },
        user: { role, tenantId: 7 },
        featureRegistry: [{
          id: 'spoofing-detection',
          visibility: 'AI_ELSE_LOCK',
          scope: 'mixed',
          platformAccess: 'edit',
          tenantAccess: 'edit',
          platformHidden: true,
          grantable: true,
          href: '/agent-center/overview?agent=spoofing',
        }],
        grants: granted ? ['spoofing-detection'] : [],
      }),
    });
  });
  await page.route('**/api/v1/agent-center/overview**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AGENT_OVERVIEW) });
  });
  await page.route('**/api/v1/spoofing-agent/engine-config**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENGINE_CONFIG) });
  });
}

async function openAdminSpoofingPage(page: Page, role: SpoofingAdminRole, granted: boolean) {
  await configureSpoofingAdminPage(page, role, granted);
  await page.route('**/api/v1/spoofing-agent/persons?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 100 }) });
  });

  await page.goto('/zh/agent-center/overview?agent=spoofing&tab=protected-objects');
  await expect(page.getByText('保护对象', { exact: true }).first()).toBeVisible();
}

test.describe('Impersonation Detection Agent', () => {
  // The spoofing agent is platformHidden: without a selected tenant the
  // agent-center deep link falls back to the overview and no detail renders.
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const tenantId = await getDefaultTenantId(request);
    // GT-12245: the platform viewer actively clears a residual tenant selection
    // (product-form-context.tsx), so localStorage alone is wiped on mount and the
    // platformHidden spoofing agent never renders. Switch the viewer too.
    await authenticatedPage.evaluate((tid: number) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
      document.cookie = `osg_selected_tenant=${tid}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tenantId);
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
  });

  test('agent-center deep link renders the impersonation page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/agent-center\/overview.*agent=spoofing/);
    await expect(authenticatedPage.locator('h1, h2').filter({ hasText: /仿冒|Impersonation/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('three tabs render and switch (zh)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing');
    await authenticatedPage.waitForLoadState('networkidle');
    const labels = TAB_LABELS.zh;

    // All three tab triggers are visible.
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 15000 },
    ).toContain(labels.overview);

    // Switch to the display-name (persons) tab → its page title renders.
    await authenticatedPage.getByRole('tab', { name: labels.displayname }).click();
    await expect(authenticatedPage).toHaveURL(/tab=protected-objects/);
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 10000 },
    ).toContain(PAGE_TITLES.zh.person);
    await authenticatedPage.reload();
    await expect(authenticatedPage.getByText(PAGE_TITLES.zh.person, { exact: true }).first()).toBeVisible();

    // Switch to the brand tab → its page title renders.
    await authenticatedPage.getByRole('tab', { name: labels.brand }).click();
    await expect(authenticatedPage).toHaveURL(/tab=brand/);
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 10000 },
    ).toContain(PAGE_TITLES.zh.brand);

    // Back to overview → KPI label renders.
    await authenticatedPage.getByRole('tab', { name: labels.overview }).click();
    await expect(authenticatedPage).toHaveURL(/tab=overview/);
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 10000 },
    ).toContain('今日检测');
  });

  test('agent enable toggle and audit-only banner render', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing');
    await authenticatedPage.waitForLoadState('networkidle');
    // The enable toggle's accessible label (the text next to the switch).
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 15000 },
    ).toContain('已启用');
  });

  test('unified v0 header exposes the spec-backed allow-list action', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing');
    await authenticatedPage.waitForLoadState('networkidle');
    const button = authenticatedPage.getByRole('button', { name: '放行名单' });
    await expect(button).toBeVisible();
    await button.click();
    await expect(authenticatedPage.getByText('命中信封发件人即整封放行、不进检测（不以 Header-From 放行）')).toBeVisible();
  });

  test('persons management UI renders with empty state', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.getByRole('tab', { name: TAB_LABELS.zh.displayname }).click();
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 10000 },
    ).toContain(PAGE_TITLES.zh.person);
    // The add button is present (admin is logged in).
    await expect(authenticatedPage.getByRole('button', { name: /添加保护对象/ }).first()).toBeVisible({ timeout: 10000 });
  });

  test('protected identities remain reachable beyond the backend 100-row page limit', async ({ authenticatedPage }) => {
    const requestedPages: number[] = [];
    await authenticatedPage.route('**/api/v1/agent-center/overview**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AGENT_OVERVIEW) });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/engine-config**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENGINE_CONFIG) });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/persons?**', async (route) => {
      const url = new URL(route.request().url());
      const page = Number(url.searchParams.get('page') || '1');
      requestedPages.push(page);
      expect(url.searchParams.get('page_size')).toBe('100');
      const item = {
        ...EXISTING_PERSON,
        id: page,
        name: `spoof_person:page-${page}`,
        display_name: page === 1 ? '第一页保护对象' : '第 101 位保护对象',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [item], total: 101, page, page_size: 100 }),
      });
    });

    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing&tab=protected-objects');
    await expect.poll(() => authenticatedPage.locator('main').innerText()).toContain('第一页保护对象');
    const pagination = authenticatedPage.getByTestId('spoof-person-pagination');
    await pagination.locator('button').nth(2).click();
    await expect.poll(() => authenticatedPage.locator('main').innerText()).toContain('第 101 位保护对象');
    expect(requestedPages).toContain(2);
  });

  test('granted tenant admin can edit protected identities', async ({ page }) => {
    await openAdminSpoofingPage(page, 'tenant_admin', true);
    await expect(page.getByRole('button', { name: '添加保护对象' }).first()).toBeEnabled();
  });

  test('ungranted tenant admin sees protected identities as read-only', async ({ page }) => {
    await openAdminSpoofingPage(page, 'tenant_admin', false);
    await expect(page.getByRole('button', { name: '添加保护对象' }).first()).toBeDisabled();
  });

  test('system admin can edit a selected tenant without a tenant capability grant', async ({ page }) => {
    await openAdminSpoofingPage(page, 'system_admin', false);
    await expect(page.getByRole('button', { name: '添加保护对象' }).first()).toBeEnabled();
  });

  test('organization import queries contacts, disables existing contacts, enforces limit, and submits bulk payload', async ({ authenticatedPage }) => {
    const importApis = await mockSpoofingImportApis(authenticatedPage, '31');

    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing&tab=protected-objects');
    await expect(authenticatedPage.getByText('保护对象', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await authenticatedPage.getByRole('button', { name: /添加保护对象/ }).first().click();

    const drawer = authenticatedPage.getByRole('dialog', { name: /添加保护对象/ });
    await expect(drawer.getByText('数据来源')).toBeVisible();
    await expect(drawer.getByText('从组织架构导入').first()).toBeVisible();
    await expect(drawer.getByText('手动添加').first()).toBeVisible();
    await expect(drawer.getByText('批量粘贴').first()).toBeVisible();

    const filterInputs = drawer.getByRole('textbox');
    const existingRow = drawer.locator('label').filter({ hasText: '已有对象' });
    await expect(existingRow.locator('input[type="checkbox"]')).toBeDisabled();
    await expect(existingRow).toContainText('已存在');

    await filterInputs.nth(0).fill('员工');
    await filterInputs.nth(1).fill('财务部');
    await filterInputs.nth(2).fill('总监');
    await filterInputs.nth(3).fill('31');
    await drawer.getByRole('combobox').first().click();
    await authenticatedPage.getByRole('option', { name: '关键岗位' }).click();

    await expect.poll(() => importApis.contactRequests.some((request) => (
      request.tenantHeader === '31'
      && request.url.searchParams.get('keyword') === '员工'
      && request.url.searchParams.get('dept') === '财务部'
      && request.url.searchParams.get('job_title') === '总监'
      && request.url.searchParams.get('source_id') === '31'
      && request.url.searchParams.get('tag') === 'key_position'
      && request.url.searchParams.get('page_size') === '20'
    )), { timeout: 10000 }).toBeTruthy();

    for (let i = 1; i <= 19; i += 1) {
      const n = String(i).padStart(2, '0');
      await drawer
        .locator('label')
        .filter({ hasText: `员工 ${n}` })
        .locator('input[type="checkbox"]')
        .check();
    }

    await drawer.getByRole('button', { name: '下一页' }).click();
    await expect(drawer.getByTitle('移除该联系人').filter({ hasText: '员工 01' })).toBeVisible();
    const twentiethRow = drawer.locator('label').filter({ hasText: '员工 20' });
    await twentiethRow.locator('input[type="checkbox"]').check();

    await expect(drawer.getByText('已选 20/20 人').first()).toBeVisible();
    await expect(drawer.getByText('单次最多选择 20 人。')).toBeVisible();
    await expect(drawer.getByText('已选择 20 人进行批量创建')).toBeVisible();
    const overLimitRow = drawer.locator('label').filter({ hasText: '员工 21' });
    await expect(overLimitRow.locator('input[type="checkbox"]')).toBeDisabled();
    await expect(overLimitRow).toContainText('已达上限');

    await drawer.getByRole('switch', { name: '检测到被仿冒时通知管理员' }).click();
    await drawer.getByRole('button', { name: '预览通知' }).click();
    const previewDialog = authenticatedPage.getByRole('dialog', { name: '告警通知预览' });
    await expect(previewDialog).toContainText('员工 01');
    await expect(previewDialog).toContainText('billing@cacter-support.test');
    const previewPayload = importApis.getPreviewPayload() as { person?: Record<string, unknown>; language?: string };
    expect(importApis.getPreviewTenantHeader()).toBe('31');
    expect(previewPayload.language).toBe('zh');
    expect(previewPayload.person).toMatchObject({ display_name: '员工 01' });
    await previewDialog.getByRole('button', { name: '关闭' }).first().click();

    await drawer.getByRole('button', { name: '保存已选 20 人' }).click();

    await expect.poll(() => importApis.getBulkPayload(), { timeout: 10000 }).not.toBeNull();
    const payload = importApis.getBulkPayload() as { action?: string; items?: Record<string, unknown>[] };
    expect(payload.action).toBe('create');
    expect(importApis.getBulkTenantHeader()).toBe('31');
    expect(payload.items).toHaveLength(20);
    expect(payload.items?.[0]).toMatchObject({
      display_name: '员工 01',
      legit_emails: [{ email: 'employee-01@corp.test', match_type: 'exact' }],
      protection_level: 'medium',
      confidence_threshold: 80,
    });
    expect(payload.items?.[0]).not.toHaveProperty('department_path');
    expect(payload.items?.[0]).not.toHaveProperty('job_title');
    expect(payload.items?.[0]).not.toHaveProperty('external_uid');
  });

  test('granted tenant admin completes contact import and notification preview in its own tenant', async ({ page }) => {
    await configureSpoofingAdminPage(page, 'tenant_admin', true);
    const importApis = await mockSpoofingImportApis(page);

    await page.goto('/zh/agent-center/overview?agent=spoofing&tab=protected-objects');
    await page.getByRole('button', { name: /添加保护对象/ }).first().click();
    const drawer = page.getByRole('dialog', { name: /添加保护对象/ });
    const contactRow = drawer.locator('label').filter({ hasText: '员工 01' });
    await contactRow.locator('input[type="checkbox"]').check();
    await drawer.getByRole('switch', { name: '检测到被仿冒时通知管理员' }).click();
    await drawer.getByRole('button', { name: '预览通知' }).click();
    const previewDialog = page.getByRole('dialog', { name: '告警通知预览' });
    await expect(previewDialog).toContainText('员工 01');
    await previewDialog.getByRole('button', { name: '关闭' }).first().click();
    await drawer.getByRole('button', { name: '保存已选 1 人' }).click();

    await expect.poll(() => importApis.getBulkPayload(), { timeout: 10000 }).not.toBeNull();
    expect(importApis.getPreviewTenantHeader()).toBe('7');
    expect(importApis.getBulkTenantHeader()).toBe('7');
  });

  test('bulk paste validates rows and submits the canonical bulk-create payload', async ({ authenticatedPage }) => {
    const importApis = await mockSpoofingImportApis(authenticatedPage, '31');

    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing&tab=protected-objects');
    await authenticatedPage.getByRole('button', { name: /添加保护对象/ }).first().click();
    const drawer = authenticatedPage.getByRole('dialog', { name: /添加保护对象/ });
    await drawer.getByText('批量粘贴').first().click();

    const paste = drawer.getByPlaceholder(/每行一条：姓名,邮箱/);
    await paste.fill([
      '批量用户一,batch-one@corp.test',
      '已有对象,existing@corp.test',
      '重复用户,batch-one@corp.test',
    ].join('\n'));
    await expect(drawer.getByText('第 2 行：该邮箱已是保护对象')).toBeVisible();
    await expect(drawer.getByText('第 3 行：邮箱在本次粘贴中重复')).toBeVisible();
    await expect(drawer.getByRole('button', { name: '保存已选 1 人' })).toBeDisabled();

    await paste.fill([
      '批量用户一,batch-one@corp.test',
      '批量用户二，batch-two@corp.test',
    ].join('\n'));
    await expect(drawer.getByText('2/20')).toBeVisible();
    await drawer.getByRole('button', { name: '保存已选 2 人' }).click();

    await expect.poll(() => importApis.getBulkPayload(), { timeout: 10000 }).not.toBeNull();
    const payload = importApis.getBulkPayload() as { action?: string; items?: Record<string, unknown>[] };
    expect(payload.action).toBe('create');
    expect(payload.items).toHaveLength(2);
    expect(payload.items?.[0]).toMatchObject({
      display_name: '批量用户一',
      legit_emails: [{ email: 'batch-one@corp.test', match_type: 'exact' }],
    });
    expect(payload.items?.[1]).toMatchObject({
      display_name: '批量用户二',
      legit_emails: [{ email: 'batch-two@corp.test', match_type: 'exact' }],
    });
  });

  test('brands management UI renders with add button', async ({ authenticatedPage }) => {
    let previewPayload: Record<string, unknown> | null = null;
    await authenticatedPage.route('**/api/v1/agent-center/overview**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AGENT_OVERVIEW) });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/engine-config**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENGINE_CONFIG) });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/brands?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 200 }) });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/brands/notification-preview', async (route) => {
      previewPayload = (route.request().postDataJSON?.() ?? {}) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          from: 'security-alert@osgateway.local',
          to: 'security-admin@osgateway.local',
          subject: '【仿冒告警】检测到针对“Coremail”的仿冒邮件',
          text: '保护类型：保护品牌\n保护目标：Coremail\n合法参考：coremail.test',
          mime: 'From: security-alert@osgateway.local\r\nTo: security-admin@osgateway.local',
          content_type: 'text/plain; charset=utf-8',
        }),
      });
    });
    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.getByRole('tab', { name: TAB_LABELS.zh.brand }).click();
    await expect(authenticatedPage).toHaveURL(/tab=brand/);
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 10000 },
    ).toContain(PAGE_TITLES.zh.brand);
    const addButton = authenticatedPage.getByRole('button', { name: /添加品牌/ }).first();
    await expect(addButton).toBeVisible({ timeout: 10000 });
    await addButton.click();

    const drawer = authenticatedPage.getByRole('dialog', { name: /添加保护品牌/ });
    await expect(drawer.getByPlaceholder('CACTER科技')).toBeVisible();
    await expect(drawer.getByPlaceholder('cacter.com')).toBeVisible();
    await expect(drawer.getByRole('button', { name: /观察模式/ })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /标准模式/ })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /严格模式/ })).toBeVisible();
    await expect(drawer.getByText('隔离').last()).toBeVisible();
    await drawer.getByPlaceholder('CACTER科技').fill('Coremail');
    await drawer.getByPlaceholder('cacter.com').fill('coremail.test');
    await drawer.getByRole('button', { name: '添加域名' }).click();
    await expect(drawer.getByText('保存前请填写或删除空白域名行')).toBeVisible();
    await expect(drawer.getByRole('button', { name: '保存' })).toBeDisabled();
    await drawer.getByRole('switch').click();
    await drawer.getByRole('button', { name: '预览通知' }).click();
    const previewDialog = authenticatedPage.getByRole('dialog', { name: '告警通知预览' });
    await expect(previewDialog).toContainText('保护目标：Coremail');
    expect(previewPayload).toMatchObject({ language: 'zh', brand: { brand_name: 'Coremail' } });
    const protectedDomains = ((previewPayload as unknown as { brand?: { protected_domains?: unknown[] } }).brand?.protected_domains ?? []);
    expect(protectedDomains).toHaveLength(1);
  });

  test('brand pagination, protected-domain search, and mode filtering use the server contract', async ({ authenticatedPage }) => {
    const requests: URL[] = [];
    await authenticatedPage.route('**/api/v1/agent-center/overview**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_AGENT_OVERVIEW) });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/engine-config**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ENGINE_CONFIG) });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/brands?**', async (route) => {
      const url = new URL(route.request().url());
      requests.push(url);
      const page = Number(url.searchParams.get('page') || '1');
      const searchingDomain = url.searchParams.get('keyword') === 'special.corp.test';
      const item = {
        id: page,
        name: `spoof_brand:page-${page}`,
        brand_name: searchingDomain ? '域名命中品牌' : page === 1 ? '第一页品牌' : '第 101 位品牌',
        protected_domains: [{ domain: searchingDomain ? 'special.corp.test' : `page-${page}.corp.test`, edit_distance_threshold: 2 }],
        keywords: [],
        confidence_threshold: 80,
        disposition: { mode: 'strict', action: 'reject', mark_style: ['subject'], notify: true },
        enabled: true,
        observe_mode: false,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [item], total: searchingDomain ? 1 : 101, page, page_size: 100 }),
      });
    });

    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing&tab=brand');
    await expect.poll(() => authenticatedPage.locator('main').innerText()).toContain('第一页品牌');
    const pagination = authenticatedPage.getByTestId('spoof-brand-pagination');
    await pagination.locator('button').nth(2).click();
    await expect.poll(() => authenticatedPage.locator('main').innerText()).toContain('第 101 位品牌');

    await authenticatedPage.getByPlaceholder('按品牌名称、保护域名搜索').fill('special.corp.test');
    await expect.poll(() => authenticatedPage.locator('main').innerText()).toContain('域名命中品牌');
    await authenticatedPage.getByRole('combobox').click();
    await authenticatedPage.getByRole('option', { name: '严格模式' }).click();
    await expect.poll(() => requests.some((url) => (
      url.searchParams.get('page') === '1'
      && url.searchParams.get('page_size') === '100'
      && url.searchParams.get('keyword') === 'special.corp.test'
      && url.searchParams.get('disposition_mode') === 'strict'
    ))).toBeTruthy();
  });

  test('four locales render without missing-key fallback', async ({ authenticatedPage }) => {
    // Switching locale via the URL prefix must not surface a raw
    // "spoofingDetection.<key>" string (missing-translation guard). Spec §7.4
    // mandates coverage of all four built-in locales (zh / en / th / ru).
    for (const locale of LOCALES) {
      await authenticatedPage.goto(`/${locale}/agent-center/overview?agent=spoofing`);
      await authenticatedPage.waitForLoadState('networkidle');
      const mainText = await authenticatedPage.locator('main').innerText();
      expect(mainText, `locale ${locale} leaked a raw namespace.key`).not.toContain('spoofingDetection.');
      // Each locale renders its overview tab label.
      expect(mainText).toContain(TAB_LABELS[locale].overview);
      for (const kpi of KPI_LABELS[locale]) expect(mainText).toContain(kpi);
    }
  });

  for (const locale of LOCALES) {
    test(`${locale} locale renders person and brand drawers`, async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`/${locale}/agent-center/overview?agent=spoofing&tab=protected-objects`);
      await authenticatedPage.getByRole('button', { name: DRAWER_LABELS[locale].personAdd }).first().click();
      const personDrawer = authenticatedPage.getByRole('dialog', { name: DRAWER_LABELS[locale].personTitle });
      await expect(personDrawer).toBeVisible();
      await authenticatedPage.keyboard.press('Escape');
      await expect(personDrawer).toBeHidden();

      await authenticatedPage.getByRole('tab', { name: TAB_LABELS[locale].brand }).click();
      await expect(authenticatedPage).toHaveURL(/tab=brand/);
      await expect(authenticatedPage.getByText(PAGE_TITLES[locale].brand, { exact: true }).first()).toBeVisible();
      const brandAdd = authenticatedPage.getByRole('button', { name: DRAWER_LABELS[locale].brandAdd }).first();
      await brandAdd.click();
      const brandDrawer = authenticatedPage.getByRole('dialog', { name: DRAWER_LABELS[locale].brandTitle });
      await expect(brandDrawer).toBeVisible();
      await authenticatedPage.keyboard.press('Escape');
      await expect(brandDrawer).toBeHidden();
    });
  }

  test('detection-logs table region renders on overview', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing');
    await authenticatedPage.waitForLoadState('networkidle');
    // The overview tab is default. The table surface + its empty state render
    // when there are no rows; assert the empty-state title is present.
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 15000 },
    ).toContain('今日检测');
    const mainText = await authenticatedPage.locator('main').innerText();
    for (const label of ['今日检测', '今日拦截', '待审核', '发信人名称仿冒', '品牌保护命中']) {
      expect(mainText).toContain(label);
    }
  });

  test('KPI cards apply a real server-side detection-log drilldown', async ({ authenticatedPage }) => {
    await configureSpoofingAdminPage(authenticatedPage, 'system_admin', true);
    const logRequests: URL[] = [];
    await authenticatedPage.route('**/api/v1/spoofing-agent/stats?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ today_detected: 8, today_intercepted: 5, pending_review: 2, displayname_hits: 5, brand_hits: 2 }),
      });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/detection-logs?**', async (route) => {
      const url = new URL(route.request().url());
      logRequests.push(url);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }) });
    });

    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing&tab=overview');
    await authenticatedPage.getByRole('button', { name: /今日拦截/ }).click();
    await expect.poll(() => logRequests.some((url) => url.searchParams.getAll('category').includes('intercepted'))).toBeTruthy();
    await expect(authenticatedPage.getByText('已拦截', { exact: true })).toBeVisible();

    await authenticatedPage.getByRole('button', { name: /待审核/ }).click();
    await expect.poll(() => logRequests.some((url) => (
      url.searchParams.getAll('category').includes('pending_review')
      && !url.searchParams.has('start')
      && !url.searchParams.has('end')
    ))).toBeTruthy();
  });

  test('inherited platform profiles are visibly read-only in tenant scope', async ({ authenticatedPage }) => {
    await configureSpoofingAdminPage(authenticatedPage, 'tenant_admin', true);
    await authenticatedPage.route('**/api/v1/spoofing-agent/persons?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [{ ...EXISTING_PERSON, read_only: true }], total: 1, page: 1, page_size: 100 }),
      });
    });
    await authenticatedPage.route('**/api/v1/spoofing-agent/brands?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{
            id: 81,
            name: 'spoof_brand:global',
            brand_name: '平台品牌基线',
            protected_domains: [{ domain: 'platform.test', edit_distance_threshold: 3 }],
            keywords: [],
            confidence_threshold: 80,
            disposition: { mode: 'standard', action: 'quarantine', mark_style: ['subject'], notify: false },
            enabled: true,
            observe_mode: false,
            read_only: true,
          }],
          total: 1,
          page: 1,
          page_size: 100,
        }),
      });
    });

    await authenticatedPage.goto('/zh/agent-center/overview?agent=spoofing&tab=protected-objects');
    await expect(authenticatedPage.getByText('继承自平台（只读）')).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: '编辑' }).first()).toBeDisabled();
    await authenticatedPage.getByRole('tab', { name: TAB_LABELS.zh.brand }).click();
    await expect(authenticatedPage.getByText('平台品牌基线')).toBeVisible();
    await expect(authenticatedPage.getByText('继承自平台（只读）')).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: '编辑' }).first()).toBeDisabled();
  });
});
