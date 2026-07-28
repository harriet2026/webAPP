import type { Page, Locator } from '@playwright/test';

// The email-disposal mail list always renders a <table> (loading/empty states
// show a placeholder row spanning all 8 columns). Real data rows have one cell
// per column, so "has td:nth-child(8)" distinguishes them from the placeholder.
// waitForDataRow waits for a real data row to attach within `timeoutMs` and
// returns its locator, or null if no data arrives — letting data-dependent
// specs (open-detail-modal, ...) skip gracefully instead of clicking the
// placeholder row.
export async function waitForDataRow(
  page: Page,
  timeoutMs = 8000,
): Promise<Locator | null> {
  const dataRow = page.locator('table tbody tr').filter({
    has: page.locator('td:nth-child(8)'),
  }).first();
  try {
    await dataRow.waitFor({ state: 'attached', timeout: timeoutMs });
    return dataRow;
  } catch {
    return null;
  }
}

// Finds a specific data row by its (uniquely-seeded) subject text, rather than
// "whatever's first" — waitForDataRow's only mode. Lets multi-scenario specs
// seed their own uniquely-subjected row and reliably reopen THAT row's detail
// instead of depending on list ordering (see DD-14's email-disposal-detail.spec.ts).
export async function findRowBySubject(
  page: Page,
  subject: string,
  timeoutMs = 8000,
): Promise<Locator | null> {
  const row = page.locator('table tbody tr').filter({ hasText: subject }).first();
  try {
    await row.waitFor({ state: 'attached', timeout: timeoutMs });
    return row;
  } catch {
    return null;
  }
}

// GT-12423 起高级筛选默认展开；本 helper 兼容两种初始态：仅在筛选区
// 未展开时点击「高级筛选」开关，幂等地保证展开。
export async function ensureFiltersExpanded(page: Page): Promise<void> {
  const quick = page.getByTestId('disposal-quick-filters');
  if (await quick.isVisible().catch(() => false)) return;
  await page.getByTestId('disposal-filters-toggle').click();
  await quick.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}
