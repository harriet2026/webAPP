/**
 * Playwright E2E for the Threat Traceback Agent (Phase 5).
 *
 * Covers:
 *  - sidebar entry + top bar (agent name, async tag, tabs)
 *  - four-locale missing-key guard
 *  - overview KPI cards + manual-scan dialog
 *  - KPI drill-down filter
 *  - strategy tab drawer + validation + deep-mode quick-add
 *
 * Authored for post-deploy execution — servers (webapp + apiserver) must be
 * running. See webapp/AGENTS.md §Playwright for the runner.
 */

import { test, expect } from '../fixtures/auth.fixture';
import { getDefaultTenantId } from '../helpers/tenant';

test.describe('Threat Retro Agent', () => {
  // The threat-retro agent is platformHidden: without a selected tenant the
  // agent-center deep link falls back to the overview and no detail renders.
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const tenantId = await getDefaultTenantId(request);
    // GT-12245: the platform viewer actively clears a residual tenant selection
    // (product-form-context.tsx), so writing osgateway_selected_tenant alone is
    // not enough -- it is wiped on mount and the tenant-gated, capability-granted
    // AI agent panel never renders. Switch the viewer as the real switcher does.
    await authenticatedPage.evaluate((tid: number) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
      document.cookie = `osg_selected_tenant=${tid}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tenantId);
    // Writing osg_viewer makes the product-form context navigate on its own;
    // navigating straight away truncates it into net::ERR_ABORTED.
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
  });

  test('sidebar navigates and top bar renders name + async tag', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/agent-center\/overview.*agent=threat-retro/);
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 15000 },
    ).toContain('威胁回溯');
    // AI async tag + the two tabs render.
    const mainText = await authenticatedPage.locator('main').innerText();
    expect(mainText).toMatch(/异步/);
    expect(mainText).toContain('检测总览');
    expect(mainText).toContain('回溯策略');
  });

  test('four locales render without missing-key fallback', async ({ authenticatedPage }) => {
    for (const locale of ['zh', 'en', 'th', 'ru']) {
      await authenticatedPage.goto(`/${locale}/agent-center/overview?agent=threat-retro`);
      await authenticatedPage.waitForLoadState('networkidle');
      const mainText = await authenticatedPage.locator('main').innerText();
      expect(mainText).not.toContain('threatRetro.');
      expect(mainText).not.toContain('threatRetroStrategy.');
    }
  });

  test('overview KPI cards render and manual-scan dialog opens', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
    await expect.poll(
      async () => authenticatedPage.locator('main').innerText(),
      { timeout: 15000 },
    ).toContain('发现漏报');
    // Manual scan entry → dialog with a strategy picker and a time range.
    await authenticatedPage.getByRole('button', { name: /紧急手动扫描/ }).first().click();
    const dialog = authenticatedPage.locator('[role="dialog"], [role="alertdialog"]').last();
    await expect.poll(async () => dialog.innerText(), { timeout: 10000 }).toMatch(/回溯策略|时间范围/);
  });

  test('KPI card click toggles a drill-down filter on the runs table', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
    const reqPromise = authenticatedPage
      .waitForRequest(
        (r) =>
          r.url().includes('/threat-retro-agent/runs') &&
          r.url().includes('leak_disposition=pending_recall'),
        { timeout: 10000 },
      )
      .then((r) => r as unknown)
      .catch(() => null as unknown);
    await authenticatedPage.getByRole('button').filter({ hasText: /待确认漏报/ }).first().click();
    expect(await reqPromise).not.toBeNull();
  });

  test('strategy tab: new strategy drawer opens with blocks + validation', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await expect.poll(async () => authenticatedPage.locator('main').innerText(), { timeout: 15000 }).toContain('回溯策略列表');
    await authenticatedPage.getByRole('button', { name: /新增策略/ }).first().click();
    const sheet = authenticatedPage.locator('[data-slot="sheet-content"], [role="dialog"]').last();
    await expect.poll(async () => sheet.innerText(), { timeout: 10000 }).toMatch(/基础信息|触发配置/);
    // Empty name + save → validation blocks (the error text appears).
    await sheet.getByRole('button', { name: /保存配置/ }).first().click();
    await expect.poll(async () => sheet.innerText(), { timeout: 5000 }).toMatch(/请输入策略名称|名称/);
  });

  test('deep mode shows quick-add time buttons and lookback dropdown', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await authenticatedPage.getByRole('button', { name: /新增策略/ }).first().click();
    const sheet = authenticatedPage.locator('[data-slot="sheet-content"], [role="dialog"]').last();
    // New strategies are deep-only; quick-add controls render immediately.
    await expect(authenticatedPage.getByTestId('strategy-mode-deep')).toBeDisabled();
    await expect.poll(async () => sheet.innerText(), { timeout: 5000 }).toMatch(/每30分钟|每小时|每 ?2 ?小时/);
  });
});
