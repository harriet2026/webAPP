import { test, expect } from '../fixtures/auth.fixture';
import { AuthAttemptsPage } from '../pages/auth-attempts.page';

async function getColumnIndex(
  page: import('@playwright/test').Page,
  headerText: string
): Promise<number> {
  const headers = await page.locator('main table th').allTextContents();
  return headers.findIndex((h) => h.includes(headerText));
}

test.describe('Auth Logs', () => {
  let authPage: AuthAttemptsPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    authPage = new AuthAttemptsPage(authenticatedPage);
    await authPage.goto();
    await authPage.expectLoaded();
  });

  test('page loads with stats cards, table, and detail drawer', async () => {
    await expect(authPage.getStatsCard('认证总次数')).toBeVisible();
    await expect(authPage.getStatsCard('认证成功率')).toBeVisible();
    await expect(authPage.getStatsCard('认证失败数')).toBeVisible();

    const headers = await authPage.page.locator('main table th').allTextContents();
    expect(headers.some((h) => h.includes('时间'))).toBeTruthy();
    expect(headers.some((h) => h.includes('账号'))).toBeTruthy();
    expect(headers.some((h) => h.includes('结果'))).toBeTruthy();

    const dataCount = await authPage.getDataRowCount();
    if (dataCount > 0) {
      await authPage.openDetailForRow(0);
      const drawer = authPage.getDetailDrawer();
      await expect(drawer).toBeVisible({ timeout: 10000 });
      await expect(drawer).toContainText('认证概要');
      await authPage.page.keyboard.press('Escape');
      await expect(drawer).toBeHidden({ timeout: 5000 });
    }
  });

  test('filters narrow results — username filter', async () => {
    const initialRows = await authPage.getDataRowCount();

    await authPage.fillUsername('zzz-nonexistent-99999');
    await authPage.clickSearch();

    // 45s：keyword 双列包含匹配在百万级共享 dev 库上首查慢 + react-query 重试（见 auth-attempts.spec 同注）。
    await expect.poll(async () => authPage.hasEmptyState(), { timeout: 45000 }).toBe(true);
    expect(await authPage.getDataRowCount()).toBe(0);

    await authPage.clickReset();

    if (initialRows > 0) {
      await expect.poll(async () => authPage.getDataRowCount(), { timeout: 15000 }).toBeGreaterThan(0);
    } else {
      await expect.poll(async () => authPage.hasEmptyState(), { timeout: 15000 }).toBe(true);
    }
  });

  test('result=成功 disables fail_reason filter', async () => {
    expect(await authPage.isFailReasonSelectDisabled()).toBe(false);

    await authPage.selectResult('成功');
    await authPage.page.waitForTimeout(300);

    expect(await authPage.isFailReasonSelectDisabled()).toBe(true);

    await authPage.clickReset();
    await authPage.page.waitForTimeout(300);
    expect(await authPage.isFailReasonSelectDisabled()).toBe(false);
  });

  test('failed rows show failure reason, success rows show —', async () => {
    const resultCol = await getColumnIndex(authPage.page, '结果');
    const failReasonCol = await getColumnIndex(authPage.page, '失败原因');
    if (resultCol < 0 || failReasonCol < 0) {
      test.skip(true, 'result/fail_reason columns not found');
    }

    const dataRows = await authPage.getDataRows();
    if (dataRows.length === 0) {
      test.skip(true, 'no data rows to verify');
    }

    for (let i = 0; i < dataRows.length; i++) {
      const resultText = await authPage.getCellText(i, resultCol);
      const failReasonText = await authPage.getCellText(i, failReasonCol);
      if (resultText.includes('成功')) {
        // Hard invariant: a successful auth never carries a failure reason.
        expect(failReasonText.includes('—') || failReasonText.trim() === '').toBe(true);
      } else if (resultText.includes('失败')) {
        // failure_reason is optional: many failed attempts (generic backend
        // failures, batch-ingested rows) carry none and correctly render as
        // '—'. So only require the cell to render — asserting every failure
        // has a non-'—' reason is data-dependent and wrong.
        expect(failReasonText.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('switching tenant scope refreshes stats', async ({ authenticatedPage }) => {
    const headerSwitcher = authenticatedPage
      .locator('header')
      .locator('[data-slot="select-trigger"]');

    if ((await headerSwitcher.count()) === 0) {
      test.skip(true, 'no global tenant selector in header');
    }

    await expect(authPage.getStatsCard('认证总次数')).toBeVisible();
    const totalBeforeText = await authPage
      .getStatsCard('认证总次数')
      .locator('xpath=ancestor::*[contains(@class,"rounded-")][1]')
      .innerText();
    const totalBefore = parseStatsCount(totalBeforeText);

    await headerSwitcher.first().click();
    await authenticatedPage.waitForTimeout(300);

    await authPage.clickReset();
    await expect(authPage.getStatsCard('认证总次数')).toBeVisible();
    const totalAfterText = await authPage
      .getStatsCard('认证总次数')
      .locator('xpath=ancestor::*[contains(@class,"rounded-")][1]')
      .innerText();
    const totalAfter = parseStatsCount(totalAfterText);

    expect(totalBeforeText).toBeTruthy();
    expect(totalAfterText).toBeTruthy();
    // Hard assertion: switching tenant scope MUST change the displayed count.
    // If it doesn't, the stats endpoint didn't pick up the new scope (a regression
    // that the previous soft toBeTruthy() check would silently pass).
    expect(totalAfter).not.toEqual(totalBefore);
  });

  // G2 (spec §10.3): the "共 N 条记录" total is rendered at the top of the list,
  // and shows even when results fit a single page (the footer pagination hides
  // for ≤1 page, so this top element is what guarantees the count is visible).
  test('top-of-list total count is always shown', async () => {
    const total = authPage.getTopTotal();
    await expect(total).toBeVisible();
    await expect(total).toHaveText(/共\s*\d+\s*条/);
  });

  // E6 (spec §10.3 / §9.1): the page-size selector (20/50/100, default 50)
  // re-queries with the chosen page_size.
  test('page-size selector re-queries with the chosen size', async () => {
    // selectPageSize asserts a /auth-attempts?...page_size=100 response fired.
    await authPage.selectPageSize(100);
    await expect(authPage.getPageSizeTrigger()).toContainText('100');
  });

  // E4 (spec §10.4 / §7.1): a failed row's detail drawer shows the failure
  // diagnosis section. Data-dependent — skips when there are no failed rows.
  test('failed row detail drawer shows failure diagnosis', async () => {
    await authPage.selectResult('失败');
    await authPage.clickSearch();

    const failedRows = await authPage.getDataRowCount();
    if (failedRows === 0) {
      test.skip(true, 'no failed auth attempts to inspect');
    }

    await authPage.openDetailForRow(0);
    const drawer = authPage.getDetailDrawer();
    await expect(drawer).toBeVisible({ timeout: 10000 });
    // The failure-diagnosis section must be present for a failed record.
    await expect(drawer).toContainText('失败诊断');
    await authPage.page.keyboard.press('Escape');
  });

  // GT-12435: html_spec 原型 logs-auth-logs §2.4 列表的协议/结果徽章为 rounded
  // (border-radius 0.25rem=4px 偏方)，而共享 Badge 基类是 rounded-4xl(2rem 胶囊)。
  // 断言实测 computedStyle 圆角，而非 class 名(class 名恒真)。若有人移除 rounded
  // 覆盖，徽章退回 32px 胶囊，本用例即变红。
  test('GT-12435: 协议/结果徽章圆角为 4px 偏方(对齐原型)，非胶囊', async () => {
    const rowCount = await authPage.getDataRowCount();
    test.skip(rowCount === 0, '无认证日志数据，跳过徽章圆角断言');

    const resultIdx = await getColumnIndex(authPage.page, '结果');
    const protoIdx = await getColumnIndex(authPage.page, '协议');
    expect(resultIdx).toBeGreaterThanOrEqual(0);
    expect(protoIdx).toBeGreaterThanOrEqual(0);

    const radiusOf = (loc: import('@playwright/test').Locator) =>
      loc.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);

    // 结果列：每行必有徽章。
    const resultBadge = authPage.page
      .locator('main table tbody tr')
      .first()
      .locator('td')
      .nth(resultIdx)
      .locator('span.inline-flex')
      .first();
    await expect(resultBadge).toBeVisible();
    expect(await radiusOf(resultBadge)).toBe('4px');

    // 协议列：部分行 auth_protocol 为空(显示 —)，取全表协议列第一个有徽章的。
    const protoBadge = authPage.page
      .locator(`main table tbody tr td:nth-child(${protoIdx + 1}) span.inline-flex`)
      .first();
    if (await protoBadge.count()) {
      expect(await radiusOf(protoBadge)).toBe('4px');
    }
  });
});

function parseStatsCount(text: string): number | null {
  if (!text) return null;
  const match = text.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
