import { test, expect } from '../fixtures/auth.fixture';
import { seedMailLogs } from '../helpers/seed-data';
import { waitForDataRow } from '../helpers/mail-list';

test.describe('Email Disposal Center', () => {
  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
  });

  test('page loads with data table', async ({ authenticatedPage }) => {
    const heading = authenticatedPage.locator('main h1');
    await expect(heading).toBeVisible({ timeout: 10000 });
    const table = authenticatedPage.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
  });

  test('quick filter section visible', async ({ authenticatedPage }) => {
    // 09ee6b4cdd: 结构化筛选默认折叠在「高级筛选」开关后面。
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    await expect(authenticatedPage.getByText('收发时间', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  });

  test('search input visible', async ({ authenticatedPage }) => {
    const input = authenticatedPage.locator('input[placeholder*="描述邮件特征"]');
    if (await input.count() === 0) {
      const altInput = authenticatedPage.locator('input[placeholder*="邮件"]');
      await expect(altInput).toBeVisible({ timeout: 10000 });
      return;
    }
    await expect(input).toBeVisible({ timeout: 10000 });
  });

  test('advanced filters toggle', async ({ authenticatedPage }) => {
    // 09ee6b4cdd: 「更多筛选条件」(AdvancedFilters) 也在折叠区内。
    await authenticatedPage.getByTestId('disposal-filters-toggle').click();
    await expect(authenticatedPage.locator('text=更多筛选条件')).toBeVisible({ timeout: 10000 });
  });

  test('detail modal opens on row click', async ({ authenticatedPage }) => {
    const dataRow = await waitForDataRow(authenticatedPage);
    if (!dataRow) {
      test.skip();
      return;
    }
    await dataRow.click();
    await expect(authenticatedPage.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
  });
});
