import { test, expect } from '../fixtures/auth.fixture';


import type { Page } from '@playwright/test';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


/**
 * 收信人检测（recipientCheck）—— 阶段2 收发信人策略抽屉里的独立配置页
 * (src/components/security/RecipientCheckPage.tsx)。
 *
 * 本 spec 走客户端 mock（localStorage `osgateway_mock_enabled=1`，见
 * src/lib/mock/{dispatcher,fixtures}.ts），把 `/behavior-control/recipient-limit-config`
 * 与 `/behavior-control/recipient-check-config` 全部由内存 fixture 提供，数据 1:1
 * 照抄 demo（接收 30/仅本域/阻断，外发 50/审核，域内 20/隔离；模块开、数量限制开、
 * 存在性开、失败动作 阻断）。真实后端/DB 持久化行为由 Go 测试覆盖（含 discard 动作、
 * -1 无限制、recipient_check 配置存储、模块 gate），不在此重复。
 */
// 返回抽屉 locator；所有断言都 scope 到抽屉内，避免命中抽屉背后流水线页的同名元素。
async function openRecipientCheckPage(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('osgateway_mock_enabled', '1'));
  await page.goto('/zh/security/pipeline');
  await page.waitForLoadState('networkidle');
  const rcButton = page.getByTestId('pipeline-policy-config-recipientCheck');
  await expect(rcButton).toBeVisible({ timeout: 15000 });
  await rcButton.click();
  await expect(page.getByTestId('pipeline-config-drawer-title')).toHaveText(/收信人检测|Recipient/, { timeout: 15000 });
  const dlg = page.locator('[role=dialog]').first();
  await expect(dlg.getByText('数量限制策略')).toBeVisible({ timeout: 15000 });
  return dlg;
}

test.describe('收信人检测 recipientCheck', () => {
  test('1024px 视口的配置抽屉不越过右侧边界，表单保持可操作（GT-12160）', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    const dlg = await openRecipientCheckPage(page);

    // Measure only AFTER the sheet's slide-in transform settles. Taken
    // immediately, boundingBox() catches the panel mid-flight (x≈504 on its way
    // to 464) and the right edge reads 1064 — a phantom overflow that looks
    // exactly like the GT-12160 regression this test guards. Poll until x stops
    // moving, then assert.
    let lastX = Number.NaN;
    let stable = 0;
    await expect
      .poll(async () => {
        const b = await dlg.boundingBox();
        const x = b ? Math.round(b.x) : Number.NaN;
        stable = x === lastX ? stable + 1 : 0;
        lastX = x;
        return stable;
      }, { timeout: 5000, intervals: [100] })
      .toBeGreaterThanOrEqual(3);

    const box = await dlg.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box!.width)).toBe(560);
    expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(1024);
    await expect(dlg.getByRole('spinbutton').first()).toBeVisible();
    await expect(dlg.getByRole('combobox').first()).toBeVisible();
  });

  test('重置为默认后恢复启用的详细模式和三方向默认值（GT-12159）', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    const switches = dlg.getByRole('switch');
    await switches.nth(1).click();
    await expect(dlg.getByText('配置模式')).toHaveCount(0);

    await dlg.getByRole('button', { name: '重置为默认' }).click();
    await expect(dlg.getByText('配置模式')).toBeVisible();
    const nums = dlg.getByRole('spinbutton');
    await expect(nums).toHaveCount(3);
    await expect(nums.nth(0)).toHaveValue('30');
    await expect(nums.nth(1)).toHaveValue('50');
    await expect(nums.nth(2)).toHaveValue('20');
    await expect(dlg.getByText('接收方向', { exact: true })).toBeVisible();
    await expect(dlg.getByText('外发方向', { exact: true })).toBeVisible();
    await expect(dlg.getByText('域内方向', { exact: true })).toBeVisible();
  });

  test('面板头(模块开关/已启用)、功能说明横幅、底部说明、保存/重置', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await expect(dlg.getByText('已启用')).toBeVisible();
    await expect(dlg.getByText(/在 RCPT TO 阶段检测收件人地址/)).toBeVisible();
    await expect(dlg.getByText(/收信人检测在 RCPT TO 阶段执行/)).toBeVisible();
    await expect(dlg.getByRole('button', { name: '保存' })).toBeVisible();
    await expect(dlg.getByText('重置为默认')).toBeVisible();
  });

  test('detailed 模式：三方向卡 + 默认值 30/50/20 + 计数范围仅接收方向', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await expect(dlg.getByText('接收方向', { exact: true })).toBeVisible();
    await expect(dlg.getByText('外发方向', { exact: true })).toBeVisible();
    await expect(dlg.getByText('域内方向', { exact: true })).toBeVisible();
    const nums = dlg.getByRole('spinbutton');
    await expect(nums).toHaveCount(3);
    await expect(nums.nth(0)).toHaveValue('30');
    await expect(nums.nth(1)).toHaveValue('50');
    await expect(nums.nth(2)).toHaveValue('20');
    // 计数范围仅接收方向：抽屉内只出现一次
    await expect(dlg.getByText('计数范围')).toHaveCount(1);
  });

  test('执行动作下拉含 4 项（隔离/审核/阻断/丢弃）', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await dlg.getByRole('combobox').first().click();
    await expect(page.getByRole('option', { name: '隔离' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: '审核' })).toBeVisible();
    await expect(page.getByRole('option', { name: '阻断' })).toBeVisible();
    await expect(page.getByRole('option', { name: '丢弃' })).toBeVisible();
  });

  test('配置模式 detailed↔merged：合并显示内部发信卡 + amber 提示', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await expect(dlg.getByText('接收方向', { exact: true })).toBeVisible();
    await dlg.getByText('外发+域内合并控制').click();
    await expect(dlg.getByText('内部发信', { exact: true })).toBeVisible();
    await expect(dlg.getByText(/合并模式下外发和域内方向使用统一配置/)).toBeVisible();
    await expect(dlg.getByText('外发方向', { exact: true })).toHaveCount(0);
    await expect(dlg.getByText('域内方向', { exact: true })).toHaveCount(0);
    // 接收方向仍独立
    await expect(dlg.getByText('接收方向', { exact: true })).toBeVisible();
    await dlg.getByText('精细化分方向配置').click();
    await expect(dlg.getByText('外发方向', { exact: true })).toBeVisible();
  });

  test('存在性验证块：严格模式 + 3 Badge + 方向说明', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await expect(dlg.getByText('存在性验证策略')).toBeVisible();
    await expect(dlg.getByText('严格模式')).toBeVisible();
    await expect(dlg.getByText('LDAP/AD验证')).toBeVisible();
    await expect(dlg.getByText('API实时校验')).toBeVisible();
    await expect(dlg.getByText('别名递归解析')).toBeVisible();
    await expect(dlg.getByText(/仅接收方向（外部→内部）生效/)).toBeVisible();
  });

  test('关闭数量限制 → 配置模式卸载；关闭存在性 → 严格模式卸载', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await expect(dlg.getByText('配置模式')).toBeVisible();
    // 开关顺序：模块 / 数量限制 / 存在性
    const switches = dlg.getByRole('switch');
    await switches.nth(1).click(); // 数量限制关
    await expect(dlg.getByText('配置模式')).toHaveCount(0);
    await switches.nth(2).click(); // 存在性关
    await expect(dlg.getByText('严格模式')).toHaveCount(0);
  });

  // SKIP x2 (product gap, GT-12149 — same stranded module master switch as
  // content-rules-html-spec.spec.ts and advanced-filter-rules.spec.ts):
  // `switch.nth(0)` in this drawer is ModuleMasterSwitch's toggle, which renders
  // aria-disabled for anyone who is not a true super admin (`disabled={!isSystemAdmin}`,
  // title 仅超级管理员可修改模块总开关). This spec must run as tenant_admin because
  // Module A blocks the platform admin (PRD §1.4), so no role can both open this
  // drawer and operate its master switch. Un-skip once that permission model is
  // reconciled; not worked around here because it is a product decision.
  test.skip('模块开关关闭 → 已禁用 + 内容区灰化', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await dlg.getByRole('switch').nth(0).click();
    await expect(dlg.getByText('已禁用')).toBeVisible();
    await expect(dlg.locator('.opacity-50.pointer-events-none')).toBeVisible();
  });

  test.skip('关闭模块后仍可保存禁用状态', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await dlg.getByRole('switch').nth(0).click();
    await expect(dlg.getByText('已禁用')).toBeVisible();
    const save = dlg.getByRole('button', { name: '保存' });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.locator('[data-sonner-toast], [role=status]').first()).toBeVisible({ timeout: 8000 });
  });

  test('保存 → 成功提示', async ({ authenticatedPage: page }) => {
    const dlg = await openRecipientCheckPage(page);
    await dlg.getByRole('button', { name: '保存' }).click();
    // sonner toast（mock PUT 返回 status=updated → behaviorControl.toast.saveOk）
    await expect(page.locator('[data-sonner-toast], [role=status]').first()).toBeVisible({ timeout: 8000 });
  });
});
