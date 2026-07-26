import { test, expect } from '../fixtures/auth.fixture';

// Product-form switcher e2e: verifies the UI dropdown, the React-context
// override, the sidebar brand text change, and the edge-middleware redirect
// all honour the osg_form_override cookie when OSGATEWAY_PRODUCT_FORM_SWITCHER=true.
//
// Pre-conditions (set in docker-compose / dev run):
//   - OSGATEWAY_PRODUCT_FORM_SWITCHER=true (switcher visible)
//   - OSG_PRODUCT_FORM=cloud               (initial form = cloud)

const FORM_LABELS = {
  cloud: '云网关',
  aiMulti: 'AI版·多租户',
  aiSingle: 'AI版·单租户',
  legacyMulti: '传统版·多租户',
  legacySingle: '传统版·单租户',
} as const;

test.describe('Product-form switcher (OSGATEWAY_PRODUCT_FORM_SWITCHER)', () => {
  // Stable trigger locator: the DropdownMenuTrigger is rendered as a single
  // <button aria-label="产品形态"> (base-ui renders the trigger as a plain
  // button; we use aria-label to disambiguate from other header buttons).
  const switcherTrigger = (page: import('@playwright/test').Page) =>
    page.getByRole('button', { name: /^产品形态/ });

  // Base-ui's Menu renders the popup via Portal and uses data-slot attributes
  // rather than role="menu" on the container. After opening, items live under
  // [data-slot="dropdown-menu-content"]. Click a form label to switch.
  async function switchTo(page: import('@playwright/test').Page, label: string) {
    await switcherTrigger(page).click();
    // The item text is unique; click it.
    await page.getByRole('menuitem', { name: label }).click();
    // Allow the React context + cookie write to settle.
    await page.waitForTimeout(400);
  }

  test('dropdown renders with 5 forms and current form checked', async ({ authenticatedPage }) => {
    // Trigger button shows "产品形态: 云网关".
    const trigger = switcherTrigger(authenticatedPage);
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(FORM_LABELS.cloud);

    // Open the dropdown.
    await trigger.click();
    // Wait for the popup to mount.
    await expect(authenticatedPage.getByRole('menuitem', { name: FORM_LABELS.cloud })).toBeVisible();

    // All 5 options are present as menu items.
    for (const label of Object.values(FORM_LABELS)) {
      await expect(authenticatedPage.getByRole('menuitem', { name: label })).toBeVisible();
    }

    // The current form (cloud) row carries a Check (svg) icon.
    const cloudItem = authenticatedPage.getByRole('menuitem', { name: FORM_LABELS.cloud });
    await expect(cloudItem.locator('svg')).toBeVisible();
  });

  test('selecting legacy-single updates sidebar brand text', async ({ authenticatedPage }) => {
    await switchTo(authenticatedPage, FORM_LABELS.legacySingle);

    // sidebar-nav 当前用二元品牌文案（capabilities?.saas ? saasName : selfHostedName），
    // legacy-single 非 saas → 显示「邮件安全网关」。若后续 sidebar 改回
    // 每形态独立文案，这里应同步改为「邮件安全网关（传统版·单租户）」。
    const sidebar = authenticatedPage.locator('aside').first();
    await expect(sidebar.getByText('邮件安全网关', { exact: true })).toBeVisible();
  });

  test('legacy-single hides the tenant nav item (multiTenant=false)', async ({ authenticatedPage }) => {
    await switchTo(authenticatedPage, FORM_LABELS.legacySingle);

    // The tenant-management entry is nested under "系统管理". In legacy-single
    // (multiTenant=false) it must be filtered out. Expand the group to verify.
    const nav = authenticatedPage.locator('aside nav').first();
    await nav.getByRole('button', { name: '系统管理' }).click();
    await expect(nav.getByRole('button', { name: '租户管理' })).toHaveCount(0);
  });

  test('cookie osg_form_override is written on switch', async ({ authenticatedPage }) => {
    await switchTo(authenticatedPage, FORM_LABELS.aiSingle);

    // Read document.cookie (non-HttpOnly cookie is visible to JS).
    const cookie = await authenticatedPage.evaluate(() => {
      const m = document.cookie.match(/(?:^|;\s*)osg_form_override=([a-z-]+)/);
      return m ? m[1] : null;
    });
    expect(cookie).toBe('ai-single');
  });

  test('edge middleware redirects direct /tenants URL when multiTenant=false', async ({ authenticatedPage }) => {
    await switchTo(authenticatedPage, FORM_LABELS.aiSingle);

    // Goto a MULTI_ONLY page directly. The middleware edge gate reads the
    // osg_form_override cookie and should redirect to /zh/dashboard.
    await authenticatedPage.goto('/zh/tenants');

    await expect(authenticatedPage).toHaveURL(/\/zh\/dashboard/);
  });

  test('switching to cloud restores tenant nav and brand', async ({ authenticatedPage }) => {
    // First flip to legacy-single to change state, then back to cloud.
    await switchTo(authenticatedPage, FORM_LABELS.legacySingle);
    await switchTo(authenticatedPage, FORM_LABELS.cloud);

    // Brand back to cloud.
    const sidebar = authenticatedPage.locator('aside').first();
    await expect(sidebar.getByText('云邮件安全网关', { exact: true })).toBeVisible();

    // The tenant nav is nested under "系统管理" as a MULTI_ONLY entry. Expand
    // that group to confirm tenant management reappears in cloud form.
    const nav = authenticatedPage.locator('aside nav').first();
    await nav.getByRole('button', { name: '系统管理' }).click();
    await expect(nav.getByRole('button', { name: '租户管理' })).toBeVisible();
  });
});
