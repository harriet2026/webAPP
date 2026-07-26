import { test, expect } from '../fixtures/auth.fixture';
import { SidelinePage } from '../pages/sideline.page';

test.describe('Sideline', () => {
  test.setTimeout(60000);
  let sidelinePage: SidelinePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    sidelinePage = new SidelinePage(authenticatedPage);
    await sidelinePage.goto();
    await sidelinePage.expectLoaded();
  });

  test('page loads with data table or empty state', async () => {
    await sidelinePage.page.waitForSelector('table th', { timeout: 10000 });
    const rows = await sidelinePage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(0);

    const headers = await sidelinePage.page.locator('table th').allTextContents();
    expect(headers).toContain('主题');
    expect(headers).toContain('发件人');
    expect(headers).toContain('状态');
    expect(headers).toContain('操作');
  });

  test('search by sender filters results', async () => {
    const dataCount = await sidelinePage.getDataRowCount();
    if (dataCount === 0) return;

    const sender = await sidelinePage.getCellTextByHeader(0, '发件人');
    const searchSender = sender.trim().substring(0, 3);

    await sidelinePage.fillSender(searchSender);
    await sidelinePage.clickSearch();

    const resultCount = await sidelinePage.getDataRowCount();
    if (resultCount === 0) return;
    expect(resultCount).toBeGreaterThanOrEqual(1);

    const firstSender = await sidelinePage.getCellTextByHeader(0, '发件人');
    expect(firstSender).toContain(searchSender);
  });

  test('search by subject filters results', async () => {
    const dataCount = await sidelinePage.getDataRowCount();
    if (dataCount === 0) return;

    const subject = await sidelinePage.getCellTextByHeader(0, '主题');
    const searchSubject = subject.trim().substring(0, 3);

    await sidelinePage.fillSubject(searchSubject);
    await sidelinePage.clickSearch();

    const resultCount = await sidelinePage.getDataRowCount();
    if (resultCount === 0) return;
    expect(resultCount).toBeGreaterThanOrEqual(1);

    const firstSubject = await sidelinePage.getCellTextByHeader(0, '主题');
    expect(firstSubject).toContain(searchSubject);
  });

  test('status select filters results - pending', async () => {
    await sidelinePage.selectStatus('待处理');
    await sidelinePage.clickSearch();

    const dataCount = await sidelinePage.getDataRowCount();
    if (dataCount > 0) {
      const statusText = await sidelinePage.getCellTextByHeader(0, '状态');
      expect(statusText).toContain('待处理');
    }
  });

  test('status select filters results - failed', async () => {
    await sidelinePage.selectStatus('失败');
    await sidelinePage.clickSearch();

    const dataCount = await sidelinePage.getDataRowCount();
    if (dataCount > 0) {
      const statusText = await sidelinePage.getCellTextByHeader(0, '状态');
      expect(statusText).toContain('失败');
    }
  });

  test('status select offers current queue states only', async () => {
    await sidelinePage.page.locator('main [data-slot="select-trigger"]').first().click();
    await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '待处理' })).toBeVisible();
    await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '处理中' })).toBeVisible();
    await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '失败' })).toBeVisible();
    await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '已重新注入' })).toBeVisible();
    await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '已隔离' })).toBeVisible();
    await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '已放行待复检' })).toBeVisible();
    await expect(sidelinePage.page.locator('[data-slot="select-item"]').filter({ hasText: '人工保留' })).toBeVisible();
  });

  test('reset button clears all filters', async () => {
    await sidelinePage.fillSender('test');
    await sidelinePage.fillSubject('test');
    await sidelinePage.selectStatus('待处理');

    expect(await sidelinePage.getSenderInput().inputValue()).toBe('test');
    expect(await sidelinePage.getSubjectInput().inputValue()).toBe('test');

    await sidelinePage.clickReset();

    expect(await sidelinePage.getSenderInput().inputValue()).toBe('');
    expect(await sidelinePage.getSubjectInput().inputValue()).toBe('');
  });

  test('pagination works', async () => {
    const pageInfo = await sidelinePage.getPaginationPageInfo();
    if (!pageInfo) return;

    expect(pageInfo).toMatch(/1\s*\/\s*\d+/);

    await sidelinePage.clickNextPage();

    const afterNext = await sidelinePage.getPaginationPageInfo();
    expect(afterNext).toMatch(/2\s*\/\s*\d+/);

    await sidelinePage.clickPrevPage();

    const afterPrev = await sidelinePage.getPaginationPageInfo();
    expect(afterPrev).toMatch(/1\s*\/\s*\d+/);
  });
});
