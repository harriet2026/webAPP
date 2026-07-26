import { test, expect } from '../fixtures/auth.fixture';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/dashboard');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.locator('main h1').waitFor({ state: 'visible' });
  });

  test('all sidebar menu items are visible', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');

    await expect(sidebar.locator('button').filter({ hasText: /^系统状态$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^高级规则设置$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^邮件管理$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^日志审计$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^系统管理$/ })).toBeVisible();

    await expect(sidebar.locator('button').filter({ hasText: /^规则管理$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^检测设置$/ })).toBeVisible();

    // 邮件日志 (/logs/email) is deliberately NOT in the sidebar: 86a67cda moved it
    // to offNavRouteTitles ("已从导航移除（页面保留）") — it stays reachable only via
    // deep links from mailflow / attachment-security cards / StageRulesPage. The
    // page itself is covered by email-logs.spec.ts, not by this nav spec.
    await expect(sidebar.locator('button').filter({ hasText: /^出站审核$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^隔离区$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^旁路队列$/ })).toBeVisible();

    await sidebar.locator('button').filter({ hasText: /^日志审计$/ }).click();
    await authenticatedPage.waitForTimeout(300);
    await expect(sidebar.locator('button').filter({ hasText: /^认证日志$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^操作日志$/ })).toBeVisible();
    await sidebar.locator('button').filter({ hasText: /^日志审计$/ }).click();

    await sidebar.locator('button').filter({ hasText: /^系统管理$/ }).click();
    await authenticatedPage.waitForTimeout(300);
    await expect(sidebar.locator('button').filter({ hasText: /^租户管理$/ })).toBeVisible();
    // sidebar.users was renamed 用户管理 -> 管理员与权限 in 807a63f3f2
    // (messages/zh.json is the source of truth for these labels).
    await expect(sidebar.locator('button').filter({ hasText: /^管理员与权限$/ })).toBeVisible();
    await expect(sidebar.locator('button').filter({ hasText: /^SMTP 凭证$/ })).toBeVisible();
    await sidebar.locator('button').filter({ hasText: /^系统管理$/ }).click();
  });

  test('click Dashboard navigates to dashboard page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    await sidebar.locator('button').filter({ hasText: /^系统状态$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/dashboard/);
    await expect(authenticatedPage.locator('main h1')).toHaveText('系统状态');
  });

  test('click Rule Pipeline Overview navigates to pipeline page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    await sidebar.locator('button').filter({ hasText: /^规则总览$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/rules\/pipeline/);
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
  });

  test('click Audit Queue navigates to audit queue page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    await sidebar.locator('button').filter({ hasText: /^出站审核$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/audit-queue/);
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
  });

  test('click Quarantine navigates to quarantine page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    await sidebar.locator('button').filter({ hasText: /^隔离区$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/quarantine/);
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
  });

  test('click Sideline navigates to sideline page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    await sidebar.locator('button').filter({ hasText: /^旁路队列$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/sideline/);
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
  });

  test('click Tenants navigates to tenants page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    await sidebar.locator('button').filter({ hasText: /^系统管理$/ }).click();
    await authenticatedPage.waitForTimeout(300);
    await sidebar.locator('button').filter({ hasText: /^租户管理$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/tenants/);
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
  });

  test('click Users navigates to users page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    const sysBtn = sidebar.locator('button').filter({ hasText: /^系统管理$/ });
    const tenantsBtn = sidebar.locator('button').filter({ hasText: /^租户管理$/ });
    if (!(await tenantsBtn.isVisible())) {
      await sysBtn.click();
      await authenticatedPage.waitForTimeout(300);
    }
    await sidebar.locator('button').filter({ hasText: /^管理员与权限$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/users/);
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
  });

  test('click SMTP Credentials navigates to smtp credentials page', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    const sysBtn = sidebar.locator('button').filter({ hasText: /^系统管理$/ });
    const tenantsBtn = sidebar.locator('button').filter({ hasText: /^租户管理$/ });
    if (!(await tenantsBtn.isVisible())) {
      await sysBtn.click();
      await authenticatedPage.waitForTimeout(300);
    }
    await sidebar.locator('button').filter({ hasText: /^SMTP 凭证$/ }).click();

    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage).toHaveURL(/\/smtp-credentials/);
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
  });

  test('collapsible Advanced Rules group can be collapsed and expanded', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    const advancedButton = sidebar.locator('button').filter({ hasText: /^高级规则设置$/ });
    const rulesButton = sidebar.locator('button').filter({ hasText: /^规则管理$/ });

    await expect(rulesButton).toBeVisible();

    await advancedButton.click();
    await expect(rulesButton).not.toBeVisible();

    await advancedButton.click();
    await expect(rulesButton).toBeVisible();
  });

  test('collapsible Mail group can be collapsed and expanded', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    const mailButton = sidebar.locator('button').filter({ hasText: /^邮件管理$/ });
    // Probe the group with a child it still has: 邮件日志 left the nav in 86a67cda,
    // so it can no longer witness the group's expand/collapse. sidebarNavItems'
    // mail group is now audit-queue / inbound-audit / quarantine / sideline.
    const mailChildButton = sidebar.locator('button').filter({ hasText: /^出站审核$/ });

    await expect(mailChildButton).toBeVisible();

    await mailButton.click();
    await expect(mailChildButton).not.toBeVisible();

    await mailButton.click();
    await expect(mailChildButton).toBeVisible();
  });

  test('collapsible Logs group can be collapsed and expanded', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    const logsButton = sidebar.locator('button').filter({ hasText: /^日志审计$/ });
    const authAttemptsButton = sidebar.locator('button').filter({ hasText: /^认证日志$/ });

    await logsButton.click();
    await expect(authAttemptsButton).toBeVisible();

    await logsButton.click();
    await expect(authAttemptsButton).not.toBeVisible();

    await logsButton.click();
    await expect(authAttemptsButton).toBeVisible();
  });

  test('collapsible System group can be collapsed and expanded', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');
    const systemButton = sidebar.locator('button').filter({ hasText: /^系统管理$/ });
    const tenantsButton = sidebar.locator('button').filter({ hasText: /^租户管理$/ });

    await systemButton.click();
    await expect(tenantsButton).toBeVisible();

    await systemButton.click();
    await expect(tenantsButton).not.toBeVisible();

    await systemButton.click();
    await expect(tenantsButton).toBeVisible();
  });

  test('active menu item is highlighted on current page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.locator('main h1').waitFor({ state: 'visible' });

    const sidebar = authenticatedPage.locator('aside');
    const pipelineButton = sidebar.locator('button').filter({ hasText: /^规则总览$/ });

    // Active nav buttons are marked with data-active="true" (sidebar-nav.tsx);
    // the visual treatment is bg-primary/15, not a shadow class anymore.
    await expect(pipelineButton).toHaveAttribute('data-active', 'true');
  });

  test('navigating between pages updates active highlight', async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator('aside');

    await sidebar.locator('button').filter({ hasText: /^规则总览$/ }).click();
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.locator('main h1').waitFor({ state: 'visible' });

    const pipelineButton = sidebar.locator('button').filter({ hasText: /^规则总览$/ });
    await expect(pipelineButton).toHaveAttribute('data-active', 'true');

    const dashboardButton = sidebar.locator('button').filter({ hasText: /^系统状态$/ });
    await expect(dashboardButton).not.toHaveAttribute('data-active', 'true');
  });

  test('sidebar collapse toggle reduces sidebar width', async ({ authenticatedPage }) => {
    const aside = authenticatedPage.locator('aside');
    const collapseButton = aside.locator('button').filter({ has: authenticatedPage.locator('svg.lucide-chevron-left') });

    if (await collapseButton.count() === 0) return;

    const widthBefore = await aside.evaluate((el) => (el as HTMLElement).offsetWidth);

    await collapseButton.click();
    await authenticatedPage.waitForTimeout(400);

    const widthAfter = await aside.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(widthAfter).toBeLessThan(widthBefore);
  });
});
