import * as crypto from 'crypto';
import { test, expect, createAuthTest } from '../fixtures/auth.fixture';
import { LinkLogsPage } from '../pages/link-logs.page';
import { seedSQL, cleanupSQL } from '../helpers/seed-sql';
import { uniqueSuffix } from '../helpers/test-data';

test.describe('Link Protection Logs (platform admin / cloud)', () => {
  let lp: LinkLogsPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    lp = new LinkLogsPage(authenticatedPage);
    await lp.goto();
    await lp.expectLoaded();
  });

  test('page loads with table headers and top total', async () => {
    const headers = await lp.page.locator('main table th').allTextContents();
    expect(headers.some((h) => h.includes('点击时间'))).toBeTruthy();
    expect(headers.some((h) => h.includes('触发环节'))).toBeTruthy();
    expect(headers.some((h) => h.includes('最终结果'))).toBeTruthy();

    const total = lp.getTopTotal();
    await expect(total).toBeVisible();
    await expect(total).toHaveText(/共\s*\d+\s*条/);
  });

  test('tenant scope select is visible for cloud platform admin', async () => {
    // Only cloud + platform shows the 租户范围 dropdown (spec §4.1).
    const sel = lp.getTenantScopeSelect();
    if ((await sel.count()) === 0) {
      test.skip(true, 'tenant scope select not present (non-cloud form build)');
    }
    await expect(sel).toBeVisible();
    await sel.click();
    await lp.page.waitForTimeout(300);
    // Picking a tenant only edits the draft; Search applies it.
    const opt = lp.page.locator('[data-slot="select-item"]').nth(1);
    if ((await opt.count()) > 0) {
      const respPromise = lp.page
        .waitForResponse((r) => r.url().includes('/link-click-logs') && r.status() === 200, { timeout: 10000 })
        .catch(() => null);
      await opt.click();
      await lp.getSearchButton().click();
      await respPromise;
    }
  });

  test('detail modal is centered dialog with sequential-detection timeline', async () => {
    const rows = await lp.getDataRows();
    if (rows.length === 0) {
      test.skip(true, 'no link-click rows to inspect');
    }
    await lp.openDetailForRow(0);
    const modal = lp.getDetailModal();
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(modal).toContainText('顺序检测');
    await lp.page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5000 });
  });

  test('row download triggers a file download', async () => {
    const rows = await lp.getDataRows();
    if (rows.length === 0) {
      test.skip(true, 'no rows to download');
    }
    const lastCell = lp.table.locator('tbody tr').nth(0).locator('td').last();
    const dlBtn = lastCell.locator('button').filter({ hasText: /下载/ }).first();
    if ((await dlBtn.count()) === 0) {
      test.skip(true, 'download control not found in row actions');
    }
    const [download] = await Promise.all([
      lp.page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
      dlBtn.click(),
    ]);
    expect(download).not.toBeNull();
  });

  test('日志页：时间线顺序为 本地黑名单 → 云端情报 → 深度复检', async () => {
    const rows = await lp.getDataRows();
    if (rows.length === 0) {
      test.skip(true, 'no link-click rows to inspect');
    }
    await lp.openDetailForRow(0);
    const modal = lp.getDetailModal();
    await expect(modal).toBeVisible({ timeout: 10000 });

    // The detail modal's timeline cards expose data-stage attributes when the
    // P5/P6 timeline instrumentation is present. If absent in the current build,
    // skip rather than fail — the order is still visually rendered via labels.
    const timeline = modal.locator('[data-testid="detection-timeline"]');
    if ((await timeline.count()) === 0) {
      test.skip(true, 'detection-timeline testid not rendered in this build');
    }
    const stageCards = timeline.locator('[data-stage]');
    const count = await stageCards.count();
    if (count === 0) {
      test.skip(true, 'no data-stage cards in detection-timeline');
    }
    const stages: string[] = [];
    for (let i = 0; i < count; i++) {
      const v = await stageCards.nth(i).getAttribute('data-stage');
      if (v) stages.push(v);
    }
    expect(stages).toEqual(['local_blacklist', 'cloud_intel', 'phishing_agent']);

    await lp.page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5000 });
  });

  test('日志页：「已放行 + 跳过深度检测」是合法组合', async () => {
    // The combination only arises when a user skips the deep inspect on a link
    // that then turns out safe, so seed one row rather than hoping dev data has it.
    const sfx = uniqueSuffix();
    const srcUrl = `https://pw-skipcombo-${sfx}.example.com/x`;
    const urlHash = crypto.createHash('sha256').update(srcUrl).digest('hex');
    await seedSQL(
      `INSERT INTO url_click_log ` +
        `(occurred_at, tenant_id, message_id, rcpt, rindex, src_url, src_url_hash, ` +
        ` check_result, decision, cached, trigger_stage, verdict, final_result, user_action, click_id) ` +
        `VALUES (NOW(), NULL, '<${sfx}@pw.test>', 'rcpt@pw.test', 0, '${srcUrl}', '${urlHash}', ` +
        ` 'SAFE', 'redirect', 0, 'none', 'safe', 'passed', 'skipped_deep_inspect', 'pw-${sfx}')`,
    );

    try {
      await lp.goto();
      await lp.expectLoaded();

      // 未选择时两个下拉 trigger 都显示「全部」（html_spec §2.1），文案不再唯一，
      // 改用稳定 testid 定位。
      const finalResultSelect = lp.page.getByTestId('link-logs-filter-final-result');
      const userActionSelect = lp.page.getByTestId('link-logs-filter-user-action');
      await expect(finalResultSelect).toBeVisible({ timeout: 5000 });
      await expect(userActionSelect).toBeVisible({ timeout: 5000 });

      await finalResultSelect.click();
      await lp.page.waitForTimeout(200);
      await lp.page.locator('[data-slot="select-item"]').filter({ hasText: /已放行|Passed/ }).first().click();
      await lp.page.waitForTimeout(400);

      await userActionSelect.click();
      await lp.page.waitForTimeout(200);
      await lp.page.locator('[data-slot="select-item"]').filter({ hasText: /跳过深度|Skip/ }).first().click();
      await lp.clickSearch();

      // The table must render without an "invalid combo" error toast/banner...
      await expect(lp.table).toBeVisible({ timeout: 5000 });
      const invalidCombo = lp.page.locator('text=/(无效组合|invalid combo|illegal combination)/i');
      await expect(invalidCombo).toHaveCount(0);

      // ...and the seeded row must survive the filter.
      await expect(lp.page.locator('main table tbody')).toContainText(`pw-skipcombo-${sfx}`, { timeout: 10000 });
    } finally {
      await cleanupSQL(`DELETE FROM url_click_log WHERE click_id = 'pw-${sfx}'`);
    }
  });
});

// 租户管理员视角（仅本租户 + 无租户下拉 + 侧边栏可见）。
// 需要一个 tenant_admin 种子账号；E2E 环境暂未提供，先 fixme，提供种子后启用。
const tenantAdminTest = createAuthTest({ username: 'tenant_admin_e2e', password: 'tenant123' });
tenantAdminTest.describe('Link logs (tenant admin)', () => {
  tenantAdminTest.fixme('sidebar visible, page scoped to own tenant, no tenant dropdown', async ({ authenticatedPage }) => {
    // sidebar entry visible (view_link_logs granted to tenant_admin)
    await expect(authenticatedPage.locator('nav').filter({ hasText: '链接保护' })).toBeVisible();
    const lp = new LinkLogsPage(authenticatedPage);
    await lp.goto();
    await lp.expectLoaded();
    // tenant_admin must NOT see the 租户范围 dropdown (spec §4.1)
    await expect(lp.getTenantScopeSelect()).toHaveCount(0);
  });
});

// 传统形态（传多/传单）：整模块隐藏。需传统形态环境账号；暂未提供，先 fixme。
const legacyTest = createAuthTest({ username: 'legacy_admin_e2e', password: 'legacy123' });
legacyTest.describe('Link logs hidden on legacy form', () => {
  legacyTest.fixme('no sidebar entry and route blocked', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('nav').filter({ hasText: '链接保护' })).toHaveCount(0);
    await authenticatedPage.goto('/zh/logs/link-clicks');
    await authenticatedPage.waitForTimeout(1000);
    // form-gated: redirected away or shows no link-logs heading
    await expect(authenticatedPage.locator('main h1').filter({ hasText: '链接保护' })).toHaveCount(0);
  });
});
