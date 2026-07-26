import { test, expect } from '../fixtures/auth.fixture';

test.describe('Overflow Tooltip', () => {
  test('quarantine page - table loads correctly', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/quarantine');
    await authenticatedPage.waitForLoadState('networkidle');

    const table = authenticatedPage.locator('table');
    await expect(table).toBeVisible();

    const dataRows = table.locator('tbody tr');
    const count = await dataRows.count();
    if (count === 0) return;

    const firstCell = authenticatedPage.locator('td').first();
    await firstCell.scrollIntoViewIfNeeded();
    await expect(firstCell).toBeVisible();
  });
});
