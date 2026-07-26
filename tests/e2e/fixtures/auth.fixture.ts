import { test as base, Page, BrowserContext } from '@playwright/test';
import { TENANT_ADMIN_USERNAME, TENANT_ADMIN_PASSWORD } from '../helpers/roles';

type TestUser = {
  username: string;
  password: string;
};

type AuthRole = 'system_admin' | 'tenant_admin';

type AuthFixtures = {
  authenticatedPage: Page;
  testUser: TestUser;
  // Which role authenticatedPage logs in as. Module-A specs set
  // `test.use({ asRole: 'tenant_admin' })` because the platform admin is blocked
  // from the policy pipeline in the multi-tenant dev form (GT-12149 / PRD §1.4).
  asRole: AuthRole;
};

const DEFAULT_USER: TestUser = {
  username: 'admin',
  password: 'admin123',
};

const TENANT_ADMIN_USER: TestUser = {
  username: TENANT_ADMIN_USERNAME,
  password: TENANT_ADMIN_PASSWORD,
};

async function login(page: Page, user: TestUser) {
  // Advanced rules are opt-in and hide every requiresAdvancedRules-gated nav
  // group (mail/logs/rules/security/assistant…) when off. The login-form
  // checkbox was dropped in the 2FA refactor; the opt-in is now the `?advance`
  // URL param (see login/page.tsx advancedRulesFromUrl). Fixture-based tests
  // expect the full admin sidebar, so log in with it. Specs that verify the
  // OFF behavior navigate to /zh/login (no param) via LoginPage directly.
  // 等 React hydration 完成再交互：登录页挂载后必发 /auth/password-policy 请求，
  // 以它为就绪信号。冷编译/高负载下过早 click 会触发表单的原生 GET 提交
  // （?username=... 泄漏进 URL、永远停在登录页），这是 dev server 上整个
  // spec 连锁失败的常见根因。监听必须先于 goto 挂上，否则响应可能在
  // 监听之前就返回而永远等不到。
  const hydrated = page
    .waitForResponse((r) => r.url().includes('/auth/password-policy'), { timeout: 60000 })
    .catch(() => {});
  await page.goto('/zh/login?advance');
  await hydrated;
  await page.locator('input[name="username"]').fill(user.username);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 30000 });
}

export const test = base.extend<AuthFixtures>({
  testUser: [DEFAULT_USER, { option: true }],
  asRole: ['system_admin', { option: true }],

  authenticatedPage: async ({ page, testUser, asRole }, use) => {
    const user = asRole === 'tenant_admin' ? TENANT_ADMIN_USER : testUser;
    await login(page, user);
    await use(page);
  },
});

export const { expect, describe } = test;

export function createAuthTest(user: TestUser) {
  return base.extend<AuthFixtures>({
    testUser: [user, { option: true }],
    authenticatedPage: async ({ page, testUser }, use) => {
      await login(page, testUser);
      await use(page);
    },
  });
}
