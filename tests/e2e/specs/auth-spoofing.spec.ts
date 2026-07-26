import { test, expect } from '../fixtures/auth.fixture';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });

// The auth-spoofing config is per-tenant. API setup below must carry X-Tenant-ID
// for the tenant_admin's tenant (the global lowest id, matching globalSetup), or
// it reads/writes a different scope than the tenant_admin UI shows.
async function tenantScopedAdminHeaders(request: import('@playwright/test').APIRequestContext) {
  const loginRes = await request.post('http://localhost:18080/api/v1/auth/login', {
    data: { username: 'admin', password: 'admin123' },
  });
  const { token } = await loginRes.json();
  const tRes = await request.get('http://localhost:18080/api/v1/tenants?page_size=500', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const items = ((await tRes.json()).items ?? []) as Array<{ id: number }>;
  const lowest = items.slice().sort((a, b) => a.id - b.id)[0]?.id;
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Tenant-ID': String(lowest),
  };
}




test.describe('Auth Spoofing', () => {
  // Serial: every test here reads/writes ONE global singleton — the auth-spoofing
  // config (GET/PUT /api/v1/auth-spoofing/config). Under the repo-wide
  // `fullyParallel: true` these run concurrently in separate workers and clobber
  // each other: "observe mode toggle" PUTs a whole config (mailfrom_invalid.action
  // = 'reject', observe_mode = true) while "save a format-check action" is mid
  // save→reload→assert, so the reload shows the other test's value and the assert
  // fails. Narrowing the write window (as an earlier comment tried) cannot fix a
  // shared-singleton race — the writes simply must not overlap.
  test.describe.configure({ mode: 'serial' });

  async function openAuthSpoofingDrawer(page: import('@playwright/test').Page) {
    await page.goto('/zh/security/pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const card = page
      .locator('[class*="cursor-pointer"]')
      .filter({ hasText: /身份认证与仿冒检测|Auth Spoofing/ })
      .first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    await page.waitForTimeout(2000);

    const drawer = page.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
  }

  test('open auth-spoofing drawer from pipeline page', async ({ authenticatedPage }) => {
    await openAuthSpoofingDrawer(authenticatedPage);

    const drawer = authenticatedPage.locator('[data-slot="sheet-content"]').first();
    await expect(drawer.locator('text=基础格式检查').first()).toBeVisible({ timeout: 5000 });
    await expect(drawer.locator('text=认证协议检查').first()).toBeVisible({ timeout: 5000 });
    // The protocol-checks section carries the policy-template selector.
    await expect(drawer.locator('text=策略模板').first()).toBeVisible({ timeout: 5000 });
    // 相似域名检测 UI was removed (GT-11754). 显示名仿冒检测 + 相似域名检测 sections
    // are now gated behind !capabilities.ai (AuthSpoofingPage.tsx, 483aa98ee2 "按 demo
    // html_spec 落地对齐"); the E2E tenant is granted AI in global-setup.ts, so with AI
    // on the drawer shows format/protocol sections only and these are intentionally absent.
    await expect(drawer.locator('text=显示名仿冒检测')).toHaveCount(0);
  });

  test('switch protocol template to strict via confirm dialog', async ({ authenticatedPage }) => {
    // Note: saving moved to the pipeline page level (PolicyPipelinePage unsaved-changes
    // guard) — the demo-aligned drawer has no per-module save button (483aa98ee2). This
    // test exercises the template-switch confirmation flow instead.
    await openAuthSpoofingDrawer(authenticatedPage);
    const drawer = authenticatedPage.locator('[data-slot="sheet-content"]').first();

    const strictBtn = drawer.locator('button').filter({ hasText: /^严格$/ }).first();
    await expect(strictBtn).toBeVisible({ timeout: 5000 });
    await strictBtn.click();

    // Selecting a non-current template opens a confirm AlertDialog.
    const confirm = authenticatedPage.locator('[role="alertdialog"]').filter({ hasText: '确认切换模板' }).first();
    await expect(confirm).toBeVisible({ timeout: 5000 });
    await confirm.locator('button').filter({ hasText: '应用' }).first().click();
    await expect(confirm).toBeHidden({ timeout: 5000 });

    const saveBtn = authenticatedPage.locator('button').filter({ hasText: '保存' }).first();
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
  });

  test('save a format-check action and keep it after reload', async ({ authenticatedPage, request }) => {
    test.setTimeout(90_000);

    const headers = await tenantScopedAdminHeaders(request);

    const originalRes = await request.get('http://localhost:18080/api/v1/auth-spoofing/config', {
      headers,
    });
    expect(originalRes.ok()).toBeTruthy();
    const originalConfig = await originalRes.json();
    const originalAction = originalConfig.format_checks.mailfrom_invalid.action;
    const changedAction = originalAction === 'quarantine' ? 'reject' : 'quarantine';
    const changedLabel = changedAction === 'reject' ? '阻断并退信' : '隔离/审核';

    try {
      await openAuthSpoofingDrawer(authenticatedPage);

      const drawer = authenticatedPage.getByTestId('pipeline-config-drawer');
      const footer = authenticatedPage.getByTestId('auth-spoofing-footer');
      const saveBtn = authenticatedPage.getByTestId('auth-spoofing-save');
      await expect(footer).toBeVisible();
      const [drawerBox, footerBox, saveBox] = await Promise.all([
        drawer.boundingBox(),
        footer.boundingBox(),
        saveBtn.boundingBox(),
      ]);
      expect(drawerBox).not.toBeNull();
      expect(footerBox).not.toBeNull();
      expect(saveBox).not.toBeNull();
      expect(footerBox!.y).toBeGreaterThan(drawerBox!.y + drawerBox!.height * 0.75);
      expect(saveBox!.x).toBeGreaterThan(footerBox!.x + footerBox!.width * 0.5);

      const invalidMailFromCard = authenticatedPage
        .getByText('无效MAIL FROM', { exact: true })
        .locator('xpath=ancestor::div[contains(@class, "rounded-lg")][1]');
      const actionSelect = invalidMailFromCard.getByRole('combobox');
      await actionSelect.click();
      await authenticatedPage.getByRole('option', { name: changedLabel, exact: true }).click();

      await expect(saveBtn).toBeEnabled();
      const saveResponse = authenticatedPage.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/auth-spoofing/config') &&
          response.request().method() === 'PUT',
      );
      await saveBtn.click();
      expect((await saveResponse).ok()).toBeTruthy();
      await expect(authenticatedPage.getByText('保存成功', { exact: true })).toBeVisible();
      await expect(saveBtn).toBeDisabled();
      await authenticatedPage.screenshot({
        path: '/tmp/gt12116-browser/saved.png',
        fullPage: true,
      });

      await authenticatedPage.reload();
      await openAuthSpoofingDrawer(authenticatedPage);
      const reloadedCard = authenticatedPage
        .getByText('无效MAIL FROM', { exact: true })
        .locator('xpath=ancestor::div[contains(@class, "rounded-lg")][1]');
      await expect(reloadedCard.getByRole('combobox')).toContainText(changedLabel);
      await authenticatedPage.screenshot({
        path: '/tmp/gt12116-browser/reloaded.png',
        fullPage: true,
      });
    } finally {
      const restoreRes = await request.put(
        'http://localhost:18080/api/v1/auth-spoofing/config',
        { headers, data: originalConfig },
      );
      expect(restoreRes.ok()).toBeTruthy();
    }
  });

  // The "observe stats" / "probe" dialog tests were removed here: 483aa98e
  // ("按 demo html_spec 落地对齐") deliberately dropped the module action toolbar
  // (保存/观察统计/探针/恢复默认) so the page matches the demo, leaving no entry
  // point for either dialog. Only 保存 came back (962dcef2 / GT-12116, because
  // dropping it broke config persistence); 观察统计/探针 stayed out by design.
  // ObserveStatsDialog.tsx / AuthProbeDialog.tsx are now unreferenced dead code,
  // and GET /auth-spoofing/observe-stats survives only to feed the 预计丢弃 badge.
  // Do not re-add these tests unless the toolbar itself comes back.

  test('language switch spot check - English', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(2000);

    const card = authenticatedPage
      .locator('[class*="cursor-pointer"]')
      .filter({ hasText: /Auth Spoofing/ })
      .first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    await authenticatedPage.waitForTimeout(2000);

    const drawer = authenticatedPage.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });

    await expect(authenticatedPage.locator('text=Format Checks').first()).toBeVisible({ timeout: 5000 });
    // Similar Domain Detection UI was removed (GT-11754); assert another
    // still-present English section title instead.
    await expect(authenticatedPage.locator('text=Protocol Authentication Checks').first()).toBeVisible({ timeout: 5000 });
  });

  test('observe mode toggle shows observing badge', async ({ authenticatedPage, request }) => {
    const observeConfig = {
      format_checks: {
        // action:'accept' means "allow" = disabled (enabled round-trips to false),
        // so the observing badge would not render on this item. Put observe_mode
        // on a non-accept (still-enabled) item so the badge shows in the
        // default-open Format Checks section (相似域名检测 section was removed).
        mailfrom_empty: { enabled: true, action: 'accept', observe_mode: false },
        mailfrom_invalid: { enabled: true, action: 'reject', observe_mode: true },
        envelope_header_mismatch: { enabled: true, action: 'quarantine', observe_mode: false },
      },
      protocol_checks: {
        template: 'standard',
        spf: { fail: { enabled: true, action: 'quarantine', observe_mode: false }, softfail: { enabled: true, action: 'quarantine', observe_mode: false }, permerror: { enabled: true, action: 'quarantine', observe_mode: false } },
        dkim: { fail: { enabled: true, action: 'quarantine', observe_mode: false } },
        dmarc: { fail: { enabled: true, action: 'quarantine', observe_mode: false } },
        ptr: { nomatch: { enabled: true, action: 'accept', observe_mode: false }, noptr: { enabled: true, action: 'accept', observe_mode: false }, ehlo_mismatch: { enabled: true, action: 'accept', observe_mode: false } },
      },
      similar_domain: { enabled: true, action: 'quarantine', observe_mode: true, threshold: 2, protected_domains: [] },
      display_name_spoof: { inbound: { enabled: true, action: 'quarantine', observe_mode: false }, outbound: { enabled: true, action: 'quarantine', observe_mode: false }, internal: { enabled: true, action: 'quarantine', observe_mode: false }, internal_users: [] },
    };

    const headers = await tenantScopedAdminHeaders(request);

    // Snapshot the config so it can be put back: auth-spoofing config is a single
    // global singleton shared by every test here, and this test overwrites ALL of
    // it. Without the restore below it left mailfrom_invalid.observe_mode=true
    // behind for good — and an item in observe mode renders its action as static
    // "允许（仅记录）" text instead of a <combobox>, so the sibling
    // "save a format-check action and keep it after reload" test then hung until
    // its 90s timeout waiting for a combobox that can no longer exist.
    const originalRes = await request.get('http://localhost:18080/api/v1/auth-spoofing/config', {
      headers,
    });
    expect(originalRes.ok()).toBeTruthy();
    const originalConfig = await originalRes.json();

    try {
      await authenticatedPage.goto('/zh/security/pipeline');
      await authenticatedPage.waitForLoadState('networkidle');
      await authenticatedPage.waitForTimeout(2000);

      const card = authenticatedPage
        .locator('[class*="cursor-pointer"]')
        .filter({ hasText: /身份认证与仿冒检测|Auth Spoofing/ })
        .first();
      await expect(card).toBeVisible({ timeout: 10000 });

      // PUT config immediately before clicking to minimize race window with concurrent tests
      const putRes = await request.put('http://localhost:18080/api/v1/auth-spoofing/config', {
        headers,
        data: observeConfig,
      });
      expect(putRes.ok()).toBeTruthy();

      await card.click();
      await authenticatedPage.waitForTimeout(2000);

      const drawer = authenticatedPage.locator('[data-slot="sheet-content"]').first();
      await expect(drawer).toBeVisible({ timeout: 15000 });
      await authenticatedPage.waitForTimeout(1000);

      // 相似域名检测 section was removed (GT-11754). The observing badge is now
      // asserted via the Format Checks section, whose mailfrom_empty item is
      // configured with observe_mode: true above.
      await expect(authenticatedPage.locator('text=基础格式检查').first()).toBeVisible({ timeout: 10000 });
      await authenticatedPage.waitForTimeout(2000);

      const badge = authenticatedPage.locator('text=观察中').first();
      await expect(badge).toBeVisible({ timeout: 5000 });
    } finally {
      const restoreRes = await request.put('http://localhost:18080/api/v1/auth-spoofing/config', {
        headers,
        data: originalConfig,
      });
      expect(restoreRes.ok()).toBeTruthy();
    }
  });

  test('PTR tab content renders its rule rows', async ({ authenticatedPage }) => {
    await openAuthSpoofingDrawer(authenticatedPage);
    const drawer = authenticatedPage.locator('[data-slot="sheet-content"]').first();

    const ptrTab = drawer.locator('[data-slot="tabs-trigger"]').filter({ hasText: 'PTR' }).first();
    await expect(ptrTab).toBeVisible({ timeout: 5000 });
    await ptrTab.click();
    await authenticatedPage.waitForTimeout(500);

    // PTR keys are norecord/temperror/ehlomismatch/amismatch (ProtocolChecksSection.tsx).
    await expect(drawer.locator('text=记录不存在').first()).toBeVisible({ timeout: 3000 });
    await expect(drawer.locator('text=与EHLO不匹配').first()).toBeVisible({ timeout: 3000 });
    await expect(drawer.locator('text=与A记录不匹配').first()).toBeVisible({ timeout: 3000 });
  });

});
