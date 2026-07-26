import { test, expect } from '../fixtures/auth.fixture';


import type { Page } from '@playwright/test';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


/**
 * 用户黑白名单（userList）—— 阶段2 收发信人策略卡，Task 6 把它接入
 * PolicyPipelinePage.tsx（替换原 personalList 卡，design/implement/spec/
 * user-list-html-spec-alignment.md D-001）。抽屉渲染 `<UserListPage embedded />`
 * (src/components/security/UserListPage.tsx)。
 *
 * 走客户端 mock（localStorage `osgateway_mock_enabled=1`，见
 * src/lib/mock/{dispatcher,fixtures}.ts）：`mockUserListRulesList()` 提供 21 条
 * 黑名单 + 15 条白名单，与 demo 逐字段对齐；黑名单首行 id=1（created_at
 * 2026-03-20）→ ruleId `UB-20260320-001`，白名单首行同理 → `UW-20260320-001`。
 */
async function openUserListDrawer(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('osgateway_mock_enabled', '1'));
  // 流水线页较重（dev server 冷编译 + 共享单实例易被并发挤爆），给足导航/断言超时，
  // 避免把 infra 延迟误判为产品缺陷（见 webapp/AGENTS.md：权威 e2e 走镜像回归）。
  await page.goto('/zh/security/pipeline', { waitUntil: 'networkidle', timeout: 60000 });
  const card = page.getByTestId('pipeline-policy-card-userList');
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.click();
  await expect(page.getByTestId('pipeline-config-drawer-title')).toHaveText('用户黑白名单', { timeout: 30000 });
  return page.locator('[role=dialog]').first();
}

test.describe('用户黑白名单 userList (Task 6 stage-2 pipeline wiring)', () => {
  test('抽屉标题为「用户黑白名单」，黑名单首行为 UB-20260320-001', async ({ authenticatedPage: page }) => {
    const dlg = await openUserListDrawer(page);

    const firstRow = dlg.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await expect(firstRow).toContainText('UB-20260320-001');
  });

  test('切换到白名单 tab 后首行为 UW- 前缀', async ({ authenticatedPage: page }) => {
    const dlg = await openUserListDrawer(page);

    await dlg.getByRole('tab', { name: /白名单/ }).click();

    const firstRow = dlg.locator('tbody tr').first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await expect(firstRow.locator('td').nth(1)).toContainText(/^UW-/);
  });
});
