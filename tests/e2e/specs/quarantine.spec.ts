import { test, expect } from '../fixtures/auth.fixture';
import { QuarantinePage } from '../pages/quarantine.page';

test.describe('Quarantine', () => {
  let quarantinePage: QuarantinePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    quarantinePage = new QuarantinePage(authenticatedPage);
    await quarantinePage.goto();
    await quarantinePage.expectLoaded();
  });

  test('page loads with data table or empty state', async () => {
    const dataCount = await quarantinePage.getDataRowCount();
    if (dataCount === 0) {
      expect(await quarantinePage.hasEmptyState()).toBeTruthy();
    }
  });

  test('released select changes filter value', async () => {
    await quarantinePage.selectReleased('是');

    const trigger = quarantinePage.page.locator('main button[data-slot="select-trigger"]');
    const text = await trigger.innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('reset button clears all filters', async () => {
    await quarantinePage.fillSender('test');
    await quarantinePage.fillSubject('test');

    expect(await quarantinePage.getSenderInput().inputValue()).toBe('test');
    expect(await quarantinePage.getSubjectInput().inputValue()).toBe('test');

    await quarantinePage.clickReset();

    expect(await quarantinePage.getSenderInput().inputValue()).toBe('');
    expect(await quarantinePage.getSubjectInput().inputValue()).toBe('');
  });

  test('pagination works', async () => {
    const pageInfo = await quarantinePage.getPaginationPageInfo();
    if (!pageInfo) return;

    expect(pageInfo).toMatch(/1\s*\/\s*\d+/);

    await quarantinePage.clickNextPage();

    const afterNext = await quarantinePage.getPaginationPageInfo();
    expect(afterNext).toMatch(/2\s*\/\s*\d+/);

    await quarantinePage.clickPrevPage();

    const afterPrev = await quarantinePage.getPaginationPageInfo();
    expect(afterPrev).toMatch(/1\s*\/\s*\d+/);
  });
});
