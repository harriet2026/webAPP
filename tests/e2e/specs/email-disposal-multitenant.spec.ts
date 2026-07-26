import { test, expect } from '../fixtures/auth.fixture';
import { seedMailLogs, getAdminToken, createTenant } from '../helpers/seed-data';
import { resolveTenantRoleID } from '../helpers/roles';
import { waitForDataRow } from '../helpers/mail-list';
import type { APIRequestContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const API_BASE = 'http://localhost:18080/api/v1';
const INGEST_URL = (process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081') + '/internal/mail-logs/ingest';

async function mockProductForm(page: Page, form: string, capabilities: { ai: boolean; multiTenant: boolean; saas?: boolean }) {
  await page.route('**/api/v1/bootstrap', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        form,
        capabilities: { ...body.capabilities, ...capabilities },
      },
    });
  });
  await page.reload({ waitUntil: 'networkidle' });
}

async function loginAs(page: Page, username: string, password: string) {
  // ?advance opts into the requiresAdvancedRules sidebar groups (the login
  // checkbox was dropped in the 2FA refactor; see login/page.tsx).
  await page.goto('/zh/login?advance');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}

async function createTenantAdmin(request: APIRequestContext) {
  const token = await getAdminToken(request);
  const uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const tenantId = await createTenant(request, token, `edc-pw-tenant-${uid}`);
  await request.put(`${API_BASE}/tenants/${tenantId}/status`, {
    data: { status: 'active' },
    headers: { Authorization: `Bearer ${token}` },
  });
  const username = `edc-pw-admin-${uid}`;
  const password = 'Passw0rd!1';
  // RBAC 后 POST /users 强制 role_id；动态解析租户作用域角色（同 helpers/roles.ts）。
  const roleID = await resolveTenantRoleID('http://localhost:18080', token);
  const resp = await request.post(`${API_BASE}/users`, {
    data: {
      username,
      password,
      role: 'tenant_admin',
      role_id: roleID,
      tenant_id: tenantId,
      must_change_password: false,
    },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(resp.status()).toBeLessThan(300);
  return { username, password, tenantId };
}

async function seedDisposalRows(request: APIRequestContext, count: number) {
  const now = new Date().toISOString();
  const rows = Array.from({ length: count }, (_, i) => ({
    message_id: `<edc-recall-${Date.now()}-${i}@test.local>`,
    message_uuid: crypto.randomUUID(),
    queue_id: `EDC${Date.now()}${i}`,
    client_ip: `203.0.113.${10 + i}`,
    sender: `edc-recall-${i}@test.local`,
    sender_domain: 'test.local',
    recipients: [`edc-recall-${i}@testdomain.local`],
    subject: `EDC Recall Cap ${i}`,
    // Recall only applies to mail that was actually delivered: the batch-recall
    // button is gated on displayStatus ∈ {delivered, partial_delivered}, and
    // mapToDisplayStatus derives `delivered` from action=accept +
    // delivery_status_summary=delivered. Seeding action/status=quarantine* left
    // the button permanently disabled — which not only blocked TC-O10 but made
    // TC-O08 ("capped at 10") vacuous, since it asserts the button is disabled
    // and that held for the wrong reason no matter what the cap logic did.
    action: 'accept',
    status: 'delivered',
    direction: 'receive',
    delivery_status_summary: 'delivered',
    received_at: now,
    timestamp: now,
  }));
  await request.post(INGEST_URL, {
    data: rows,
    headers: { 'Content-Type': 'application/json' },
  });
}

test.describe('Email Disposal Center — multi-tenant view (TC-O01..O07)', () => {
  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    const bootstrapPromise = authenticatedPage
      .waitForResponse((r) => /\/api\/v1\/bootstrap\b/.test(r.url()) && r.status() === 200, { timeout: 15000 })
      .catch(() => null);
    await authenticatedPage.goto('/zh/email-disposal/center');
    await bootstrapPromise;
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('TC-O03/O06 cloud-platform: tenant selector visible', async ({ authenticatedPage }) => {
    // 09ee6b4cdd: 结构化筛选（含租户选择器）默认折叠在「高级筛选」开关后面。
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    // Locate by testid, not by the trigger's TEXT: filtering on
    // /all|全部租户|所有租户|租户/ is self-defeating once a tenant is picked --
    // the trigger then renders the tenant's NAME (e.g. "audit-rcpt-test"), the
    // filter stops matching, and the locator resolves to nothing. Playwright
    // locators are lazy, so the re-use after selection fails with
    // "element(s) not found" rather than a text mismatch.
    const tenantTrigger = authenticatedPage
      .locator('main')
      .getByTestId('tenant-selector')
      .first();
    await expect(tenantTrigger).toBeVisible({ timeout: 10000 });
  });

  test('TC-O03 cloud-platform: AI parse button visible (capabilities.ai=true)', async ({ authenticatedPage }) => {
    const aiBtn = authenticatedPage.getByRole('button', { name: /AI\s*解析/ });
    await expect(aiBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-O01-style: recall button label is i18n-driven (zh => 召回)', async ({ authenticatedPage }) => {
    const firstRowCheckbox = authenticatedPage.locator('tbody tr').first().getByRole('checkbox');
    if ((await firstRowCheckbox.count()) === 0) {
      test.skip(true, 'no rows available to reveal batch toolbar');
    }
    await firstRowCheckbox.click();

    const recallBtn = authenticatedPage.getByRole('button', { name: /^召回$/ });
    await expect(recallBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('TC-O03 cloud-platform: selecting a specific tenant scopes the list without entering tenant view', async ({ authenticatedPage }) => {
    // Locate by testid, not by the trigger's TEXT: filtering on
    // 09ee6b4cdd: expand the collapsed structured filters first.
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    // /all|全部租户|所有租户|租户/ is self-defeating once a tenant is picked --
    // the trigger then renders the tenant's NAME (e.g. "audit-rcpt-test"), the
    // filter stops matching, and the locator resolves to nothing. Playwright
    // locators are lazy, so the re-use after selection fails with
    // "element(s) not found" rather than a text mismatch.
    const tenantTrigger = authenticatedPage
      .locator('main')
      .getByTestId('tenant-selector')
      .first();
    await expect(tenantTrigger).toBeVisible({ timeout: 10000 });
    await tenantTrigger.click();

    const listbox = authenticatedPage.locator('[role="listbox"]').first();
    await expect(listbox).toBeVisible({ timeout: 5000 });
    const options = listbox.locator('[role="option"]');
    const count = await options.count();
    if (count < 2) {
      await authenticatedPage.keyboard.press('Escape');
      test.skip(true, 'no tenants other than "全部租户" available in dev seed');
    }

    const selectedOption = options.nth(1);
    const selectedTenantId = await selectedOption.getAttribute('data-value');
    const selectedTenantName = (await selectedOption.innerText()).trim();
    expect(selectedTenantId).toMatch(/^\d+$/);

    const reqPromise = authenticatedPage.waitForRequest(
      (req) =>
        /\/api\/v1\/mail-logs/.test(req.url()) &&
        req.headers()['x-tenant-id'] === selectedTenantId,
      { timeout: 10000 },
    );

    await selectedOption.click();
    await reqPromise;

    await expect(authenticatedPage).toHaveURL(/\/email-disposal\/center/);
    await expect(tenantTrigger).toContainText(selectedTenantName);
    await expect
      .poll(() => authenticatedPage.evaluate(() => localStorage.getItem('osgateway_selected_tenant')))
      .toBeNull();
    const heading = authenticatedPage.locator('main h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('TC-O09 cloud-platform: disposal-settings is platform-hidden (403) until a tenant is drilled in', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/disposal-settings');
    await authenticatedPage
      .waitForResponse((r) => /\/api\/v1\/bootstrap\b/.test(r.url()) && r.status() === 200, { timeout: 15000 })
      .catch(() => null);
    await authenticatedPage.waitForLoadState('networkidle');

    // GT-12427: in the cloud/multi-tenant form, a platform admin WITHOUT a
    // drilled-in tenant no longer gets an in-page tenant selector on the
    // disposal-settings page — the page is platformHidden and renders a
    // 403「无访问权限」guard (consistent with the sibling group-policy page and
    // locked by the vitest unit test disposal-settings-page.test.tsx
    // "platform admin without a drilled-in tenant sees 403"). Managing a
    // tenant's disposal settings requires switching into that tenant's view.
    const main = authenticatedPage.locator('main');
    await expect(main.getByRole('heading', { name: '403' })).toBeVisible({ timeout: 10000 });
    await expect(main.getByText('无访问权限')).toBeVisible();
    await expect(main.getByTestId('tenant-selector')).toHaveCount(0);
    await expect(main.locator('form')).toHaveCount(0);
  });
});

test.describe('Email Disposal Center — tenant admin view', () => {
  test('TC-O04/O05: no tenant selector, list scoped to own tenant, cross-tenant detail denied', async ({ page, request }) => {
    const user = await createTenantAdmin(request);
    await loginAs(page, user.username, user.password);
    await page.goto('/zh/email-disposal/center');
    await page.waitForLoadState('networkidle');

    const tenantTrigger = page
      .locator('main [data-slot="select-trigger"]')
      .filter({ hasText: /all|全部租户|所有租户|租户/i });
    await expect(tenantTrigger).toHaveCount(0);

    const rows = page.locator('tbody tr');
    if ((await rows.count()) > 0) {
      await expect(page.locator('main')).not.toContainText(/租户范围/);
    }

    // TC-O05 (review TEST-4): assert the actual tenant-isolation semantics
    // that the previous test only implied. page.request shares the logged-in
    // tenant admin's cookie context, so these calls go out as that admin.
    // (a) A list carrying a foreign tenant_id is silently re-scoped to the
    //     admin's own tenant (no leak).
    // (b) A detail GET on a foreign tenant's mail-log row is 403.

    // Seed a row owned by a DIFFERENT tenant (platform token) to probe against.
    const platformToken = await getAdminToken(request);
    const otherTenant = await createTenant(request, platformToken, `edc-pw-other-${Date.now().toString(36)}`);
    await request.put(`${API_BASE}/tenants/${otherTenant}/status`, {
      data: { status: 'active' },
      headers: { Authorization: `Bearer ${platformToken}` },
    });
    const now = new Date().toISOString();
    const seedResp = await request.post(INGEST_URL, {
      data: [{
        message_id: `<edc-iso-${Date.now()}@test.local>`,
        message_uuid: crypto.randomUUID(),
        queue_id: `EDCISO${Date.now()}`,
        client_ip: '203.0.113.77',
        sender: 'edc-iso@test.local',
        sender_domain: 'test.local',
        recipients: ['edc-iso@testdomain.local'],
        subject: 'EDC ISO probe',
        action: 'quarantine',
        status: 'quarantined',
        direction: 'receive',
        delivery_status_summary: 'delivered',
        received_at: now,
        timestamp: now,
        tenant_id: otherTenant,
      }],
      headers: { 'Content-Type': 'application/json' },
    });
    expect(seedResp.status()).toBeLessThan(300);

    // Look up the seeded row id via the platform admin (tenant-scoped).
    const foreignList = await request.get(
      `${API_BASE}/mail-logs?page=1&page_size=1&tenant_id=${otherTenant}`,
      { headers: { Authorization: `Bearer ${platformToken}`, 'X-Tenant-ID': String(otherTenant) } },
    );
    const foreignJson = await foreignList.json();
    const foreignId = foreignJson?.items?.[0]?.id;
    if (!foreignId) {
      test.skip(true, 'seeded foreign row not visible to platform admin; cannot probe isolation');
    }

    if (foreignId) {
      // (a) List with foreign tenant_id as tenant admin → must NOT leak the row.
      const silentList = await page.request.get(
        `${API_BASE}/mail-logs?page=1&page_size=50&tenant_id=${otherTenant}`,
      );
      expect(silentList.status()).toBe(200);
      const silentJson = await silentList.json();
      const leaked = (silentJson?.items ?? []).some((it: { id?: number }) => it.id === foreignId);
      expect(leaked).toBeFalsy();

      // (b) Detail GET on the foreign row → 403.
      const detail = await page.request.get(`${API_BASE}/mail-logs/${foreignId}`);
      expect(detail.status()).toBe(403);
    }
  });
});

test.describe('Email Disposal Center — mocked legacy-single form (no AI, single tenant)', () => {
  test('TC-O02: AI parse button hidden, no tenant selector', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'legacy-single', { ai: false, multiTenant: false, saas: false });
    await expect(authenticatedPage.getByRole('button', { name: /AI\s*解析/ })).toHaveCount(0);
    // Expand the structured filters first — asserting "no selector" against a
    // COLLAPSED section would pass on every form and prove nothing.
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    const tenantTrigger = authenticatedPage
      .locator('main [data-slot="select-trigger"]')
      .filter({ hasText: /all|全部租户|所有租户|租户/i });
    await expect(tenantTrigger).toHaveCount(0);
  });

  // Review G3: TC-O02 must also cover the detail modal — legacy form should
  // hide the bottom "Find Similar" button (aiEnabled=false) and the Overview
  // tab's "AI Reasoning" panel, and the Analysis tab must not show the AI stage.
  test('TC-O02: detail modal hides Find-Similar button and AI reasoning (legacy-single)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'legacy-single', { ai: false, multiTenant: false, saas: false });
    await authenticatedPage.waitForLoadState('networkidle');

    const row = await waitForDataRow(authenticatedPage);
    if (!row) {
      test.skip(true, 'no data rows available to open the detail modal');
      return;
    }
    await row.click();
    const dialog = authenticatedPage.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Bottom "Find Similar" button is gated on aiEnabled && onFindSimilar.
    await expect(dialog.getByRole('button', { name: /查找相似|Find Similar/ })).toHaveCount(0);

    // Overview tab's "AI Reasoning" panel is gated on aiEnabled.
    await expect(dialog.getByText(/AI\s*深度推理|AI Reasoning/)).toHaveCount(0);

    // Analysis tab must not render the AI stage (stage 5).
    const analysisTab = dialog.locator('[role="tab"]').filter({ hasText: /安全分析|Security Analysis/ }).first();
    if (await analysisTab.count() > 0) {
      await analysisTab.click();
      await authenticatedPage.waitForTimeout(300);
      await expect(dialog.getByText(/阶段\s*5|Stage\s*5/)).toHaveCount(0);
    }

    await authenticatedPage.keyboard.press('Escape');
  });
});

test.describe('Email Disposal Center — mocked ai-single form (AI, single tenant)', () => {
  // Review G4 (TC-O01): AI form, single tenant → AI parse button visible,
  // no tenant selector, detail modal exposes the Find-Similar button.
  test('TC-O01: AI parse button visible, no tenant selector, detail modal has Find-Similar', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'ai-single', { ai: true, multiTenant: false, saas: false });

    await expect(authenticatedPage.getByRole('button', { name: /AI\s*解析/ }).first()).toBeVisible({ timeout: 10000 });
    // Expand the structured filters first — a collapsed section would make
    // this "no selector" assertion vacuously true on every form.
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    const tenantTrigger = authenticatedPage
      .locator('main [data-slot="select-trigger"]')
      .filter({ hasText: /all|全部租户|所有租户|租户/i });
    await expect(tenantTrigger).toHaveCount(0);

    const row = await waitForDataRow(authenticatedPage);
    if (!row) {
      test.skip(true, 'no data rows available to open the detail modal');
      return;
    }
    await row.click();
    const dialog = authenticatedPage.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByRole('button', { name: /查找相似|Find Similar/ })).toBeVisible({ timeout: 10000 });
    await authenticatedPage.keyboard.press('Escape');
  });
});

test.describe('Email Disposal Center — ai-single form with log-interpret disabled (F1 decoupling)', () => {
  // Review F1 regression: the AI dimensions (相似搜索/相似度列/找相似/AI 解析/钓鱼智能体研判)
  // are gated by capabilities.ai ONLY (spec §3.2). Only the "AI 解读"/"AI 深度推理" panel
  // (log-interpret SSE) additionally requires features.ai_interpret. Turning the
  // log-interpret service OFF on an AI form must NOT hide the similarity / find-similar /
  // AI-parse dimensions — it must hide only the AI-reasoning panel.
  test('TC-O11: ai_interpret disabled keeps AI dims, hides only AI reasoning panel', async ({ authenticatedPage }) => {
    // Force features.ai_interpret=false (log-interpret service off) before the auth context
    // reads it from localStorage; runs on every navigation incl. mockProductForm's reload.
    await authenticatedPage.addInitScript(() => {
      window.localStorage.setItem('osgateway_features', JSON.stringify({ aiInterpret: false }));
    });
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'ai-single', { ai: true, multiTenant: false, saas: false });
    await authenticatedPage.waitForLoadState('networkidle');

    // capabilities.ai=true → AI parse button stays visible despite log-interpret being off.
    await expect(authenticatedPage.getByRole('button', { name: /AI\s*解析/ }).first()).toBeVisible({ timeout: 10000 });

    const row = await waitForDataRow(authenticatedPage);
    if (!row) {
      test.skip(true, 'no data rows available to open the detail modal');
      return;
    }
    await row.click();
    const dialog = authenticatedPage.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Find-Similar (capabilities.ai) stays visible.
    await expect(dialog.getByRole('button', { name: /查找相似|Find Similar/ })).toBeVisible({ timeout: 10000 });

    // AI Reasoning panel (log-interpret) is hidden because features.ai_interpret=false.
    await expect(dialog.getByText(/AI\s*深度推理|AI Reasoning/)).toHaveCount(0);

    await authenticatedPage.keyboard.press('Escape');
  });
});

test.describe('Email Disposal Center — mocked legacy-multi form (tenants, no AI)', () => {
  test('TC-O07: tenant selector visible, AI parse hidden', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await mockProductForm(authenticatedPage, 'legacy-multi', { ai: false, multiTenant: true, saas: false });
    // 09ee6b4cdd: expand the collapsed structured filters first.
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    // Locate by testid, not by the trigger's TEXT: filtering on
    // /all|全部租户|所有租户|租户/ is self-defeating once a tenant is picked --
    // the trigger then renders the tenant's NAME (e.g. "audit-rcpt-test"), the
    // filter stops matching, and the locator resolves to nothing. Playwright
    // locators are lazy, so the re-use after selection fails with
    // "element(s) not found" rather than a text mismatch.
    const tenantTrigger = authenticatedPage
      .locator('main')
      .getByTestId('tenant-selector')
      .first();
    await expect(tenantTrigger).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByRole('button', { name: /AI\s*解析/ })).toHaveCount(0);
  });
});

test.describe('Email Disposal Center — recall cap', () => {
  test('TC-O08: bulk recall is capped at 10 selections', async ({ authenticatedPage, request }) => {
    await seedDisposalRows(request, 12);
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');

    const checkboxes = authenticatedPage.locator('tbody tr').getByRole('checkbox');
    const count = await checkboxes.count();
    if (count < 11) {
      test.skip(true, 'less than 11 rows visible after seeding');
    }
    const recallBtn = authenticatedPage.getByRole('button', { name: /^召回$/ }).first();

    // Select exactly the cap (10) first: the button MUST be enabled here.
    // Without this the test passes whenever the button is disabled for any
    // unrelated reason (e.g. non-recallable rows), and would keep passing even
    // if the cap check were deleted entirely.
    for (let i = 0; i < 10; i++) {
      await checkboxes.nth(i).click();
    }
    await expect(recallBtn).toBeEnabled({ timeout: 5000 });

    // The 11th selection crosses the cap and must disable it.
    await checkboxes.nth(10).click();
    await expect(recallBtn).toBeDisabled({ timeout: 5000 });
  });

  // TEST-5 (review): the recall dialog is a heavy interactive component with
  // no prior E2E coverage — and it is where BUG-2 (no list refresh) and BUG-3
  // (hardcoded Chinese) lived. This test pins the i18n fix: opening the dialog
  // in zh must show the translated title, and switching to en must NOT show
  // Chinese literals (regression guard for BUG-3).
  test('TC-O10: recall dialog renders via i18n (zh + en)', async ({ authenticatedPage, request }) => {
    await seedDisposalRows(request, 2);
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');

    const checkbox = authenticatedPage.locator('tbody tr').first().getByRole('checkbox');
    if ((await checkbox.count()) === 0) {
      test.skip(true, 'no rows available to open recall dialog');
    }
    await checkbox.click();

    const recallBtn = authenticatedPage.getByRole('button', { name: /^召回$/ }).first();
    await recallBtn.click();

    // GT-11780 (Task E5): batch recall opens a confirm dialog that also lets the
    // operator correct email_type — it no longer opens the standalone 邮件召回
    // dialog. Its strings come from emailDisposal.batch.* (title `recall`, body
    // `recallDescription`), NOT detail.overview.reclassify.title: asserting the
    // latter only ever passed in zh because "改判邮件类型" happens to appear inside
    // the zh body, and had no counterpart at all in en.
    const zhDialog = authenticatedPage.locator('[role="alertdialog"], [role="dialog"]').first();
    await expect(zhDialog).toBeVisible({ timeout: 5000 });
    await expect(zhDialog).toContainText('改判邮件类型');

    // Switch to English locale and reopen — must not contain Chinese literals.
    await authenticatedPage.goto('/en/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
    const enCheckbox = authenticatedPage.locator('tbody tr').first().getByRole('checkbox');
    if ((await enCheckbox.count()) === 0) {
      test.skip(true, 'no rows available on en locale');
    }
    await enCheckbox.click();
    const enRecallBtn = authenticatedPage.getByRole('button', { name: /^Recall$/ }).first();
    await enRecallBtn.click();
    const dialog = authenticatedPage.locator('[role="alertdialog"], [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText('correct their mail type');
    // BUG-3 guard: no Chinese literal may leak into the en dialog. Match ANY CJK
    // codepoint rather than a handful of words — an enumerated list silently
    // stops covering whatever string is hardcoded next.
    await expect(dialog).not.toContainText(/[一-鿿]/);
  });
});
