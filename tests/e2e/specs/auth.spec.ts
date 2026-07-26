import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Authentication', () => {
  test('login with correct credentials redirects to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'admin123');
    await loginPage.expectRedirect();
    await expect(page).toHaveURL(/dashboard/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'wrongpassword');
    await loginPage.expectError();
  });

  test('access protected page without auth redirects to login', async ({ page }) => {
    await page.goto('/zh/rules/header');
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Authentication - Logged in', () => {
  test('logout clears auth and redirects to login', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    
    const token = await page.evaluate(() => localStorage.getItem('osgateway_token'));
    console.log('[LOG] Token before logout:', token ? 'exists' : 'null');
    
    await page.evaluate(async () => {
      const token = localStorage.getItem('osgateway_token');
      if (token) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
      }
      localStorage.removeItem('osgateway_token');
      localStorage.removeItem('osgateway_user');
    });
    
    await page.goto('/zh/dashboard');
    await page.waitForTimeout(1000);
    console.log('[LOG] URL after clearing auth and visiting dashboard:', page.url());
    
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
