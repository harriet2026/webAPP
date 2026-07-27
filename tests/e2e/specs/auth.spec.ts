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

    // 认证 token 是后端下发的 HttpOnly cookie（osgateway_token），localStorage 里
    // 从来没有它——旧写法「从 localStorage 取 token、取不到就跳过登出调用」等于
    // 从未真正登出，用例实际只在验证「localStorage 无用户 → 客户端守卫跳转」。
    // 演示绕过开启（OSGATEWAY_PRODUCT_FORM_SWITCHER=true，dev 栈默认）时该守卫被
    // DEMO_SUPER_ADMIN 顶掉，用例就误失败了。改为真登出：同源 fetch 自动携带
    // cookie，后端 revoke 会话并作废 cookie，此后访问受保护页无论绕过开关与否都
    // 会回到登录页（绕过开时由 401 兜底跳转，关时由中间件/客户端守卫跳转）。
    const logoutStatus = await page.evaluate(async () => {
      const resp = await fetch('/api/v1/auth/logout', { method: 'POST' });
      return resp.status;
    });
    expect(logoutStatus).toBe(204);

    await page.evaluate(() => {
      localStorage.removeItem('osgateway_user');
    });

    // 401 兜底用 window.location.href 跳转，会在文档加载中途打断本次导航，
    // goto 因此可能抛 ERR_ABORTED——跳转本身正是期望结果，吞掉错误，
    // 以下面的 toHaveURL 断言为准。
    await page.goto('/zh/dashboard').catch(() => {});
    console.log('[LOG] URL after logout and visiting dashboard:', page.url());

    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});
