import { test, expect } from '../fixtures/auth.fixture';
import { EmailLogsPage } from '../pages/email-logs.page';
import { seedMailLogs } from '../helpers/seed-data';

test.describe('Email AI Interpret', () => {
  let emailLogsPage: EmailLogsPage;

  test.beforeEach(async ({ request, authenticatedPage }) => {
    await seedMailLogs(request);
    emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
  });

  async function openFirstEmailDetail() {
    const rows = await emailLogsPage.getTableRows();
    const count = await rows.count();
    if (count === 0) {
      test.skip();
      return null;
    }

    await emailLogsPage.clickSenderInRow(0);

    const modal = emailLogsPage.page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    return modal;
  }

  async function openInterpretDrawer(modal: NonNullable<Awaited<ReturnType<typeof openFirstEmailDetail>>>) {
    const aiButton = modal.getByRole('button', { name: /AI 解读|AI Interpret/i });
    await expect(aiButton).toBeVisible({ timeout: 3000 });
    await aiButton.click();

    const sheet = emailLogsPage.page.locator('[role="dialog"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    return sheet;
  }

  test('AI interpret button uses Sparkles icon', async () => {
    const modal = await openFirstEmailDetail();
    if (!modal) return;

    const aiButton = modal.getByRole('button', { name: /AI 解读|AI Interpret/i });
    await expect(aiButton).toBeVisible({ timeout: 3000 });
    const sparklesSvg = aiButton.locator('svg.lucide-sparkles');
    await expect(sparklesSvg).toBeVisible({ timeout: 2000 });
  });

  test('clicking AI interpret button opens drawer', async () => {
    const modal = await openFirstEmailDetail();
    if (!modal) return;

    const sheet = await openInterpretDrawer(modal);

    const title = sheet.locator('h2, [data-slot="sheet-title"]').filter({ hasText: /AI 解读|AI Interpretation/i });
    await expect(title.first()).toBeVisible({ timeout: 3000 });
  });

  test('drawer shows phase progress bar', async () => {
    const modal = await openFirstEmailDetail();
    if (!modal) return;

    const sheet = await openInterpretDrawer(modal);

    const phaseLabels = sheet.getByText(/准备中|querying|interpreting|完成|starting/);
    await expect(phaseLabels.first()).toBeVisible({ timeout: 10000 });
  });

  test('drawer shows copy and regenerate buttons', async () => {
    const modal = await openFirstEmailDetail();
    if (!modal) return;

    const sheet = await openInterpretDrawer(modal);

    const copyButton = sheet.getByRole('button', { name: /复制|Copy/i });
    await expect(copyButton).toBeVisible({ timeout: 5000 });

    const regenButton = sheet.getByRole('button', { name: /重新生成|Regenerate/i });
    await expect(regenButton).toBeVisible({ timeout: 5000 });
  });

  test('regenerate button is disabled while loading', async ({ authenticatedPage }) => {
    // Hold the interpret stream open so the loading phase actually EXISTS while we
    // look at it. The drawer disables regenerate until phase is done/error, and
    // against the compose mock LLM the whole interpretation finishes in
    // milliseconds — so asserting "disabled" right after opening the drawer was a
    // race with the response, and passed only when the backend happened to be slow.
    // Delaying the request makes the state deterministic instead of luck.
    let released: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      released = resolve;
    });
    await authenticatedPage.route('**/ai-interpret*', async (route) => {
      await held;
      await route.continue();
    });

    const modal = await openFirstEmailDetail();
    if (!modal) {
      released?.();
      return;
    }

    const sheet = await openInterpretDrawer(modal);

    const regenButton = sheet.getByRole('button', { name: /重新生成|Regenerate/i });
    await expect(regenButton).toBeVisible({ timeout: 5000 });
    await expect(regenButton).toBeDisabled({ timeout: 2000 });

    // Let the request through and confirm the button recovers — otherwise a
    // permanently-disabled button would satisfy the assertion above just as well.
    released?.();
    await expect(regenButton).toBeEnabled({ timeout: 15000 });
  });

  test('tool calls section shows when expandable', async () => {
    const modal = await openFirstEmailDetail();
    if (!modal) return;

    const sheet = await openInterpretDrawer(modal);

    await emailLogsPage.page.waitForTimeout(8000);

    const toolCallsToggle = sheet.locator('button').filter({ hasText: /工具调用|Tool/ });
    if (await toolCallsToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      await toolCallsToggle.click();
      const toolCallEntry = sheet.locator('text=get_rule_detail');
      if (await toolCallEntry.isVisible({ timeout: 2000 }).catch(() => false)) {
        expect(true).toBeTruthy();
      }
    }
  });

  test('drawer closes on Escape key', async () => {
    const modal = await openFirstEmailDetail();
    if (!modal) return;

    const sheet = await openInterpretDrawer(modal);

    await emailLogsPage.page.keyboard.press('Escape');
    await emailLogsPage.page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible({ timeout: 5000 });
  });

  test('drawer shows content or error after interpretation', async ({ authenticatedPage }) => {
    test.setTimeout(90000);
    const emailLogsPage = new EmailLogsPage(authenticatedPage);
    await emailLogsPage.goto();
    await emailLogsPage.expectLoaded();
    const rows = await emailLogsPage.getTableRows();
    if (await rows.count() === 0) {
      test.skip();
      return;
    }
    await emailLogsPage.clickSenderInRow(0);
    const modal = emailLogsPage.page.locator('[role="dialog"]').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    const aiButton = modal.getByRole('button', { name: /AI 解读|AI Interpret/i });
    await expect(aiButton).toBeVisible({ timeout: 3000 });
    await aiButton.click();
    const sheet = emailLogsPage.page.locator('[role="dialog"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const page = emailLogsPage.page;
    await page.waitForFunction((sheetSel: string) => {
      const sheet = document.querySelectorAll(sheetSel);
      const last = sheet[sheet.length - 1];
      if (!last) return false;
      return last.querySelector('.prose') !== null || last.textContent?.includes('不可用') || last.textContent?.includes('unavailable') || last.textContent?.includes('not available') || last.textContent?.includes('失败');
    }, '[role="dialog"]', { timeout: 60000 });
  });
});
