import { test, expect } from '../fixtures/auth.fixture';
import { SecurityOverviewPage } from '../pages/security-overview.page';

// GT-11979 / GT-11930: the time filter shipped with only 5 preset buttons, so no
// arbitrary interval could be selected. PRD F1 requires "时间范围(今天/近7天/…/上月)、
// 自定义起止日期"; the landing spec simply omitted it (it is NOT in the §10 不做 list).
//
// The load-bearing assertion is NOT "the inputs render" — it is that the chosen
// interval actually DRIVES the query. A picker that renders but leaves the KPIs
// on the old range would sail through a render-only test while being useless.
//
// Ranges are derived from the current date, never hardcoded: a fixed 2026-07
// window would silently become "no data" on a fresh DB and fail for reasons that
// have nothing to do with this feature.
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test.describe('Security Overview — custom date range (GT-11979 / GT-11930)', () => {
  let page: SecurityOverviewPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    page = new SecurityOverviewPage(authenticatedPage);
    await page.goto();
    await page.expectLoaded();
  });

  test('自定义 sits alongside the five presets', async () => {
    await expect(page.customRangeButton).toBeVisible();
    await expect(page.timeRangeButtons).toHaveCount(6);
  });

  test('date inputs appear only after 自定义 is selected', async () => {
    await expect(page.customStartInput).toHaveCount(0);
    await page.selectCustomRange();
    await expect(page.customStartInput).toBeVisible();
    await expect(page.customEndInput).toBeVisible();
  });

  test('the chosen interval is what actually gets queried', async () => {
    const requested: string[] = [];
    await page.page.route('**/statistics/security-overview?**', (route) => {
      const u = new URL(route.request().url());
      requested.push(`${u.searchParams.get('start_date')}..${u.searchParams.get('end_date')}`);
      return route.continue();
    });

    await page.selectCustomRange();
    const start = daysAgo(20);
    const end = daysAgo(10);
    await page.setCustomRange(start, end);

    // The request must carry exactly the dates the user typed. If the picker were
    // cosmetic — inputs rendered but never fed into the query — no request would
    // carry this interval.
    expect(requested).toContain(`${start}..${end}`);
  });

  test('switching between two custom intervals re-queries each one', async () => {
    const requested: string[] = [];
    await page.page.route('**/statistics/security-overview?**', (route) => {
      const u = new URL(route.request().url());
      requested.push(`${u.searchParams.get('start_date')}..${u.searchParams.get('end_date')}`);
      return route.continue();
    });

    await page.selectCustomRange();
    await page.setCustomRange(daysAgo(30), daysAgo(25));
    await page.setCustomRange(daysAgo(5), daysAgo(1));

    expect(requested).toContain(`${daysAgo(30)}..${daysAgo(25)}`);
    expect(requested).toContain(`${daysAgo(5)}..${daysAgo(1)}`);
  });

  test('an end-before-start range is rejected in the UI and never queried', async () => {
    await page.selectCustomRange();
    await page.setCustomRange(daysAgo(20), daysAgo(10));

    // PRD §4.1: start <= end. Fire an inverted range and assert nothing goes out.
    let requested = false;
    await page.page.route('**/statistics/security-overview?**', (route) => {
      requested = true;
      return route.continue();
    });
    await page.customEndInput.fill(daysAgo(40));
    await page.page.waitForTimeout(2000); // > the FilterBar debounce

    await expect(page.customRangeError).toBeVisible();
    await expect(page.customRangeError).toContainText('结束日期不能早于开始日期');
    expect(requested).toBe(false);
  });

  test('a range beyond the 366-day cap is rejected in the UI and never queried', async () => {
    await page.selectCustomRange();
    await page.setCustomRange(daysAgo(20), daysAgo(10));

    let requested = false;
    await page.page.route('**/statistics/security-overview?**', (route) => {
      requested = true;
      return route.continue();
    });
    await page.customStartInput.fill(daysAgo(800)); // well past the cap
    await page.page.waitForTimeout(2000);

    await expect(page.customRangeError).toBeVisible();
    await expect(page.customRangeError).toContainText('366');
    expect(requested).toBe(false);
  });

  test('leaving 自定义 with a rejected draft and coming back shows a clean form', async () => {
    // Review finding: FilterBar is not unmounted when the user leaves 自定义, so a
    // rejected draft used to survive — the user came back to red-flagged dates
    // that contradicted the range the charts were actually showing.
    await page.selectCustomRange();
    const start = daysAgo(20);
    const end = daysAgo(10);
    await page.setCustomRange(start, end);

    await page.customEndInput.fill(daysAgo(40)); // invalid
    await page.page.waitForTimeout(1000);
    await expect(page.customRangeError).toBeVisible();

    await page.timeRangeButtons.nth(1).click(); // 近7天
    await page.page.waitForTimeout(500);
    await page.customRangeButton.click();
    await page.customStartInput.waitFor({ state: 'visible' });

    await expect(page.customRangeError).toHaveCount(0);
    await expect(page.customStartInput).toHaveValue(start);
    await expect(page.customEndInput).toHaveValue(end);
  });
});
