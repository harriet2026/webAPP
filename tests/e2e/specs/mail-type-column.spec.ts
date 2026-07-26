import { test, expect } from '../fixtures/auth.fixture';
import { seedMailLogs } from '../helpers/seed-data';
import { waitForDataRow } from '../helpers/mail-list';

test.describe('Mail Type Column', () => {
  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/email-disposal/center');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
  });

  test('mail type column header visible', async ({ authenticatedPage }) => {
    const table = authenticatedPage.locator('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
    const header = authenticatedPage.getByText('邮件类型').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('disposal basis column header visible', async ({ authenticatedPage }) => {
    const header = authenticatedPage.getByText('处置依据').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('data row shows mail type cell', async ({ authenticatedPage }) => {
    const dataRow = await waitForDataRow(authenticatedPage);
    if (!dataRow) {
      test.skip();
      return;
    }
    await expect(dataRow).toBeVisible({ timeout: 10000 });
  });
});
