import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/login.page';

// The advanced-rules sidebar menu is opt-in. The login-form checkbox was
// dropped in the 2FA login refactor; it is now enabled by adding `?advance` to
// the login URL (see login/page.tsx advancedRulesFromUrl). The choice is
// persisted to localStorage ('osgateway_show_advanced_rules') until logout.

test.describe('Advanced Rules Menu', () => {
  test('advanced rules menu hidden without ?advance', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin123');
    // No `?advance` on the login URL → advanced rules stay hidden.
    await page.locator('button[type="submit"]').click();
    await loginPage.expectRedirect();

    await expect(page.locator('text=高级规则设置')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=规则管理').first()).not.toBeVisible();
    await expect(page.locator('text=检测设置').first()).not.toBeVisible();
  });

  test('advanced rules menu visible with ?advance', async ({ page }) => {
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    await expect(page.locator('text=高级规则设置')).toBeVisible({ timeout: 10000 });
  });

  test('advanced rules children visible after expanding', async ({ page }) => {
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    await expect(page.locator('text=高级规则设置')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('text=规则管理').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=检测设置').first()).toBeVisible({ timeout: 5000 });
  });

  test('can navigate to rules sub-pages from advanced rules menu', async ({ page }) => {
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Sidebar leaves render as <button> (router.push on click), and the
    // 'detection' group is expanded by default, so the RBL entry is reachable
    // without expanding anything first.
    await page.getByRole('button', { name: 'RBL 过滤', exact: true }).first().click();
    await expect(page).toHaveURL(/\/rules\/rbl/, { timeout: 10000 });
  });

  test('switches language on advanced rules label', async ({ page }) => {
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    await expect(page.locator('text=高级规则设置')).toBeVisible({ timeout: 10000 });

    const langBtn = page.locator('[data-slot="dropdown-trigger"], button').filter({ hasText: /中文|EN|ไทย|Рус/ }).first();
    if (await langBtn.isVisible()) {
      await langBtn.click();
      const enOption = page.locator('text=English').first();
      if (await enOption.isVisible()) {
        await enOption.click();
        await expect(page.locator('text=Advanced Rules')).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Advanced Rules Menu - logout clears preference', () => {
  test('localStorage cleared on logout', async ({ page }) => {
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    await expect(page.locator('text=高级规则设置')).toBeVisible({ timeout: 10000 });

    expect(await page.evaluate(() => localStorage.getItem('osgateway_show_advanced_rules'))).toBe('1');
  });
});
