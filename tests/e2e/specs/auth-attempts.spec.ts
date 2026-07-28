import { test, expect } from '../fixtures/auth.fixture';
import { AuthAttemptsPage } from '../pages/auth-attempts.page';

test.describe('Auth Attempts', () => {
  let authAttemptsPage: AuthAttemptsPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    authAttemptsPage = new AuthAttemptsPage(authenticatedPage);
    await authAttemptsPage.goto();
    await authAttemptsPage.expectLoaded();
  });

  test('page loads with data table or empty state', async () => {
    const headers = await authAttemptsPage.page.locator('table th').allTextContents();
    expect(headers).toContain('\u65F6\u95F4');
    expect(headers).toContain('账号');
    expect(headers).toContain('来源 IP');
    expect(headers).toContain('\u7ED3\u679C');

    const dataCount = await authAttemptsPage.getDataRowCount();
    if (dataCount === 0) {
      expect(await authAttemptsPage.hasEmptyState()).toBeTruthy();
    }
  });

  test('search by username filters results', async () => {
    const dataCount = await authAttemptsPage.getDataRowCount();
    if (dataCount === 0) return;

    const username = await authAttemptsPage.getCellTextByHeader(0, '账号');
    const searchName = username.trim();

    await authAttemptsPage.fillUsername(searchName);
    await authAttemptsPage.clickSearch();

    const filteredCount = await authAttemptsPage.getDataRowCount();
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const firstUsername = await authAttemptsPage.getCellTextByHeader(0, '账号');
    expect(firstUsername.trim()).toContain(searchName);
  });

  test('search by client IP filters results', async () => {
    const dataCount = await authAttemptsPage.getDataRowCount();
    if (dataCount === 0) return;

    // The 来源 IP cell renders the IP plus a location line (内网/境外 · xx),
    // e.g. "172.18.0.1 内网" — take just the IP (first token) to search by.
    const ip = await authAttemptsPage.getCellTextByHeader(0, '来源 IP');
    const searchIp = ip.trim().split(/\s+/)[0];

    await authAttemptsPage.fillClientIp(searchIp);
    await authAttemptsPage.pressEnterToSearch();

    const filteredCount = await authAttemptsPage.getDataRowCount();
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const firstClientIp = await authAttemptsPage.getCellTextByHeader(0, '来源 IP');
    expect(firstClientIp.trim().split(/\s+/)[0]).toBe(searchIp);
  });

  test('result select filters - success', async () => {
    await authAttemptsPage.selectResult('\u6210\u529F');
    await authAttemptsPage.clickSearch();

    const dataCount = await authAttemptsPage.getDataRowCount();
    if (dataCount > 0) {
      const resultText = await authAttemptsPage.getCellTextByHeader(0, '结果');
      expect(resultText).toContain('\u6210\u529F');
    }
  });

  test('result select filters - failed', async () => {
    await authAttemptsPage.selectResult('\u5931\u8D25');
    await authAttemptsPage.clickSearch();

    const dataCount = await authAttemptsPage.getDataRowCount();
    if (dataCount > 0) {
      const resultText = await authAttemptsPage.getCellTextByHeader(0, '结果');
      expect(resultText).toContain('\u5931\u8D25');
    }
  });

  test('reset button clears all filters', async () => {
    // 「账号 / 来源 IP」为合并后的单一 keyword 输入框（对齐 demo）。
    await authAttemptsPage.fillUsername('test');
    await authAttemptsPage.fillDomain('example.cn');
    await authAttemptsPage.selectResult('\u6210\u529F');

    expect(await authAttemptsPage.getKeywordInput().inputValue()).toBe('test');
    expect(await authAttemptsPage.getDomainInput().inputValue()).toBe('example.cn');

    await authAttemptsPage.clickReset();

    expect(await authAttemptsPage.getKeywordInput().inputValue()).toBe('');
    expect(await authAttemptsPage.getDomainInput().inputValue()).toBe('');
  });

  test('empty results after filtering show empty state', async () => {
    await authAttemptsPage.fillUsername('nonexistent-user-xyz-99999');
    await authAttemptsPage.clickSearch();

    // keyword 是 username/client_ip 双列包含匹配（无索引加速，设计如实口径）；
    // 共享 dev 库百万级残留行下首查可能贴近后端 10s 超时并被 react-query 重试，
    // 因此轮询窗口放宽到 45s —— 断言语义不变：最终必须出现空态。
    await expect
      .poll(async () => authAttemptsPage.hasEmptyState(), { timeout: 45000 })
      .toBe(true);
  });

  test('failed rows are highlighted with rose background (spec §10.3)', async () => {
    // Filter to failed-only so the first data row is guaranteed to be a failed row.
    await authAttemptsPage.selectResult('\u5931\u8D25');
    await authAttemptsPage.clickSearch();

    const rows = await authAttemptsPage.getDataRows();
    if (rows.length === 0) return; // no failed rows seeded — nothing to assert

    const firstRow = rows[0];
    const className = await firstRow.getAttribute('class');
    // DataTable applies the page-supplied rowClassName for success===false rows
    // (bg-rose-50 ...). A missing/empty class is a regression.
    expect(className ?? '').toMatch(/bg-rose-/);
  });
});
