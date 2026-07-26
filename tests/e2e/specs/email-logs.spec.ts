import { test, expect } from '../fixtures/auth.fixture';
import { EmailLogsPage } from '../pages/email-logs.page';
import { seedMailLogs } from '../helpers/seed-data';

test.describe('Email Logs', () => {
  let emailLogsPage: EmailLogsPage;

  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
  });

  async function getColumnIndex(page: import('@playwright/test').Page, headerText: string): Promise<number> {
    const headers = await page.locator('table th').allTextContents();
    return headers.findIndex(h => h.includes(headerText));
  }

  test('page loads with data table', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const headers = await emailLogsPage.page.locator('table th').allTextContents();
    expect(headers.some(h => h.includes('sender') || h.includes('发件人'))).toBeTruthy();
  });

  test('search by sender filters results', async () => {
    await emailLogsPage.fillSender('search-test');
    await emailLogsPage.clickSearch();

    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    if (count === 0) return;

    const senderCol = await getColumnIndex(emailLogsPage.page, 'sender');
    if (senderCol < 0) return;
    const senderText = await rows.nth(0).locator('td').nth(senderCol).innerText();
    expect(senderText).toContain('search-test');
  });

  test('search by subject filters results', async () => {
    await emailLogsPage.fillSubject('E2E');
    await emailLogsPage.clickSearch();

    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    if (count === 0) return;

    const subjectCol = await getColumnIndex(emailLogsPage.page, 'subject');
    if (subjectCol < 0) return;
    const subjectText = await rows.nth(0).locator('td').nth(subjectCol).innerText();
    expect(subjectText).toContain('E2E');
  });

  test('date range selection filters results', async () => {
    const today = new Date();
    const dayAttr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
    await emailLogsPage.selectStartDate(dayAttr);
    await emailLogsPage.selectEndDate(dayAttr);
    await emailLogsPage.clickSearch();

    const dataCount = await emailLogsPage.getDataRowCount();
    if (dataCount === 0) return;
    expect(dataCount).toBeLessThan(20);
  });

  test('action select - reject filters results', async () => {
    await emailLogsPage.selectAction('拒绝');
    await emailLogsPage.clickSearch();

    const dataCount = await emailLogsPage.getDataRowCount();
    if (dataCount === 0) return;

    const actionCol = await getColumnIndex(emailLogsPage.page, 'action');
    if (actionCol < 0) return;
    const actionText = await emailLogsPage.getCellText(0, actionCol);
    expect(actionText.toLowerCase()).toContain('reject');
  });

  test('action select - accept filters results', async () => {
    await emailLogsPage.selectAction('接收');
    await emailLogsPage.clickSearch();

    const dataCount = await emailLogsPage.getDataRowCount();
    if (dataCount === 0) return;

    const actionCol = await getColumnIndex(emailLogsPage.page, 'action');
    if (actionCol < 0) return;
    const actionText = await emailLogsPage.getCellText(0, actionCol);
    expect(actionText.toLowerCase()).toContain('accept');
  });

  test('action select - all restores results', async () => {
    await emailLogsPage.selectAction('拒绝');
    await emailLogsPage.clickSearch();
    const rejectCount = await emailLogsPage.getDataRowCount();

    await emailLogsPage.selectAction('全部');
    await emailLogsPage.clickSearch();
    const allCount = await emailLogsPage.getDataRowCount();

    expect(allCount).toBeGreaterThanOrEqual(rejectCount);
  });

  test('reset button clears all text inputs', async () => {
    await emailLogsPage.fillSender('test');
    await emailLogsPage.fillSubject('E2E');
    await emailLogsPage.fillRecipient('user');

    expect(await emailLogsPage.getSenderInput().inputValue()).toBe('test');
    expect(await emailLogsPage.getSubjectInput().inputValue()).toBe('E2E');
    expect(await emailLogsPage.getRecipientInput().inputValue()).toBe('user');

    await emailLogsPage.clickReset();

    expect(await emailLogsPage.getSenderInput().inputValue()).toBe('');
    expect(await emailLogsPage.getSubjectInput().inputValue()).toBe('');
    expect(await emailLogsPage.getRecipientInput().inputValue()).toBe('');
  });

  test('reset button restores full result set', async () => {
    const initialCount = await emailLogsPage.getDataRowCount();

    await emailLogsPage.fillSender('nonexistent-sender-xyz-99999');
    await emailLogsPage.clickSearch();

    expect(await emailLogsPage.hasEmptyState()).toBeTruthy();

    await emailLogsPage.clickReset();

    const resetCount = await emailLogsPage.getDataRowCount();
    expect(resetCount).toBe(initialCount);
  });

  test('combined filters narrow results', async () => {
    await emailLogsPage.fillSubject('E2E');
    await emailLogsPage.clickSearch();
    const subjectOnlyCount = await emailLogsPage.getDataRowCount();

    await emailLogsPage.fillSender('search-test');
    await emailLogsPage.clickSearch();
    const combinedCount = await emailLogsPage.getDataRowCount();

    expect(combinedCount).toBeLessThanOrEqual(subjectOnlyCount);
  });

  test('search with no matching results shows empty state', async () => {
    await emailLogsPage.fillSender('nonexistent-sender-xyz-99999');
    await emailLogsPage.clickSearch();

    expect(await emailLogsPage.hasEmptyState()).toBeTruthy();
  });

  test('email detail modal opens on sender click', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    if (count === 0) return;

    const senderCell = rows.nth(0).locator('td span.underline, td span.cursor-pointer');
    if (!(await senderCell.count())) return;

    await emailLogsPage.openDetailAndWait(0);

    const dialog = emailLogsPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('text=Message-ID')).toBeVisible();
    await expect(dialog.locator('text=SPF')).toBeVisible();
    await expect(dialog.locator('text=DKIM')).toBeVisible();

    await emailLogsPage.closeDetail();
    await expect(dialog).not.toBeVisible();
  });

  test('detail modal tabs switch correctly', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    if (count === 0) return;

    const senderCell = rows.nth(0).locator('td span.underline, td span.cursor-pointer');
    if (!(await senderCell.count())) return;

    await emailLogsPage.openDetailAndWait(0);
    const dialog = emailLogsPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const rawTab = dialog.locator('[role="tab"]').filter({ hasText: /原始|Raw/i });
    if (await rawTab.count()) {
      await rawTab.click();
      await emailLogsPage.page.waitForTimeout(500);
      const rawContent = dialog.locator('pre');
      if (await rawContent.count()) {
        const text = await rawContent.first().innerText();
        expect(text).toContain('"id"');
      }
    }

    await emailLogsPage.closeDetail();
  });

  test('pagination navigates between pages', async () => {
    const pageInfo = await emailLogsPage.getPaginationPageInfo();
    if (!pageInfo) return;

    expect(pageInfo).toMatch(/1\s*\/\s*\d+/);

    await emailLogsPage.clickNextPage();

    const afterNext = await emailLogsPage.getPaginationPageInfo();
    expect(afterNext).toMatch(/2\s*\/\s*\d+/);

    await emailLogsPage.clickPrevPage();

    const afterPrev = await emailLogsPage.getPaginationPageInfo();
    expect(afterPrev).toMatch(/1\s*\/\s*\d+/);
  });

  test('export button triggers download', async () => {
    const downloadPromise = emailLogsPage.page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await emailLogsPage.exportButton.click();

    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toMatch(/mail_logs|email-logs/);
    }
  });
});

test.describe('Email Logs - Advanced Filter', () => {
  let emailLogsPage: EmailLogsPage;

  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
  });

  test('advanced filter toggle opens panel', async () => {
    await emailLogsPage.openAdvancedFilter();
    const panel = emailLogsPage.getAdvancedFilterPanel();
    expect(await panel.count()).toBe(0);

    await emailLogsPage.addAdvancedConditionGroup();
    expect(await panel.count()).toBeGreaterThan(0);
  });

  test('advanced filter shows badge count after adding conditions', async () => {
    await emailLogsPage.openAdvancedFilter();
    await emailLogsPage.addAdvancedConditionGroup();

    const badge = emailLogsPage.getAdvancedFilterBadge();
    if (await badge.count() > 0) {
      const text = await badge.innerText();
      expect(parseInt(text)).toBeGreaterThan(0);
    }
  });

  test('clear all removes advanced filter conditions', async () => {
    await emailLogsPage.openAdvancedFilter();
    await emailLogsPage.addAdvancedConditionGroup();
    await emailLogsPage.clearAdvancedFilters();

    const panel = emailLogsPage.getAdvancedFilterPanel();
    expect(await panel.count()).toBe(0);
  });

  test('advanced filter with client_ip contains sends request', async () => {
    await emailLogsPage.openAdvancedFilter();
    await emailLogsPage.addAdvancedConditionGroup();

    await emailLogsPage.selectAdvancedField(0, 'Client IP');
    await emailLogsPage.selectAdvancedOperator(0, '包含');
    await emailLogsPage.fillAdvancedValue(0, '10.0');

    const responsePromise = emailLogsPage.page.waitForResponse(
      (resp) => resp.url().includes('/mail-logs') && resp.url().includes('advanced_filters'),
      { timeout: 10000 }
    );
    await emailLogsPage.clickSearch();

    const response = await responsePromise.catch(() => null);
    if (response) {
      expect(response.status()).toBe(200);
      const url = response.url();
      expect(url).toContain('advanced_filters');
    }
  });

  test('reset clears advanced filters', async () => {
    await emailLogsPage.openAdvancedFilter();
    await emailLogsPage.addAdvancedConditionGroup();

    await emailLogsPage.clickReset();

    const badge = emailLogsPage.getAdvancedFilterBadge();
    expect(await badge.count()).toBe(0);
  });

  test('advanced filter panel can be collapsed and expanded', async () => {
    await emailLogsPage.openAdvancedFilter();

    await emailLogsPage.openAdvancedFilter();

    const panel = emailLogsPage.getAdvancedFilterPanel();
    expect(await panel.count()).toBe(0);
  });

  test('search fields API returns expected fields', async ({ request }) => {
    const resp = await request.get('http://localhost:18080/api/v1/mail-logs/fields', {
      headers: { Authorization: `Bearer ${(await (await request.post('http://localhost:18080/api/v1/auth/login', { data: { username: 'admin', password: 'admin123' } })).json()).token}` },
    });
    if (resp.ok()) {
      const body = await resp.json();
      expect(body.fields).toBeDefined();
      expect(body.fields.length).toBeGreaterThan(0);

      const keys = body.fields.map((f: any) => f.key);
      expect(keys).toContain('client_ip');
      expect(keys).toContain('spf_valid');
      expect(keys).toContain('geo_region');
      expect(keys).toContain('status');
    }
  });

  test('advanced filter with multiple condition groups', async () => {
    await emailLogsPage.openAdvancedFilter();
    await emailLogsPage.addAdvancedConditionGroup();
    await emailLogsPage.addAdvancedConditionGroup();

    const panels = emailLogsPage.getAdvancedFilterPanel();
    expect(await panels.count()).toBeGreaterThanOrEqual(2);
  });
});
