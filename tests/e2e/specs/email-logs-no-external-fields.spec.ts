import { test, expect } from '../fixtures/auth.fixture';
import { EmailLogsPage } from '../pages/email-logs.page';
import { seedMailLogs } from '../helpers/seed-data';

test.describe('Email Logs - No External Parser Fields', () => {
  let emailLogsPage: EmailLogsPage;

  test.beforeAll(async ({ request }) => {
    await seedMailLogs(request);
  });

  test.beforeEach(async ({ authenticatedPage }) => {
    emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
  });

  test('page loads and shows table data', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should not show external_urls column in table headers', async () => {
    const headers = await emailLogsPage.page.locator('table th').allTextContents();
    const hasExternalUrls = headers.some(h =>
      h.includes('external_urls') || h.includes('外部URL') || h.includes('External URLs')
    );
    expect(hasExternalUrls).toBeFalsy();
  });

  test('should not show parse_rules column in table headers', async () => {
    const headers = await emailLogsPage.page.locator('table th').allTextContents();
    const hasParseRules = headers.some(h =>
      h.includes('parse_rules') || h.includes('解析规则')
    );
    expect(hasParseRules).toBeFalsy();
  });

  test('column visibility menu should not contain external_urls or parse_rules', async () => {
    const colToggle = emailLogsPage.page.locator('button').filter({
      hasText: /列|Columns|视图|View/
    }).first();

    if (await colToggle.count() > 0) {
      await colToggle.click();
      await emailLogsPage.page.waitForTimeout(500);

      const menuItems = await emailLogsPage.page.locator('[role="menuitem"], [role="menuitemcheckbox"], [role="option"]').allTextContents();
      const allText = menuItems.join(' ');

      expect(allText).not.toContain('external_urls');
      expect(allText).not.toContain('parse_rules');

      await emailLogsPage.page.keyboard.press('Escape');
    }
  });

  test('email detail dialog should not show external_urls or parse_rules fields', async () => {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    if (count === 0) return;

    const senderCell = rows.nth(0).locator('td span.underline, td span.cursor-pointer');
    if (!(await senderCell.count())) return;

    await emailLogsPage.openDetailAndWait(0);

    const dialog = emailLogsPage.page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    const dialogText = await dialog.innerText();
    expect(dialogText).not.toContain('external_urls');
    expect(dialogText).not.toContain('parse_rules');

    await emailLogsPage.closeDetail();
  });

  test('detail dialog raw tab should not show external_urls or parse_rules keys', async () => {
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

        expect(text).not.toContain('"external_urls"');
        expect(text).not.toContain('"parse_rules"');
      }
    }

    await emailLogsPage.closeDetail();
  });
});
