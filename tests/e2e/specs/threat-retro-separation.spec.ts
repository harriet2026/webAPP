/**
 * Playwright E2E: investigations / threat-retro agent-center view separation (spec §6.1–§6.4).
 *
 * Verifies:
 *   a) /investigations create dialog never exposes threat_traceback (§6.2)
 *   b) the threat-retro agent-center view is accessible and renders (§6.1, §6.4)
 */

import { test, expect } from '../fixtures/auth.fixture';

test.describe('Page separation: investigations vs threat-retro', () => {
  test('investigations console excludes threat_traceback from agent type selector', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/en/investigations');
    await page.waitForSelector('body');

    // Open the create investigation dialog
    const createBtn = page.getByRole('button', { name: /create|新建|launch|investigation/i }).first();
    await createBtn.click();

    // Wait for dialog to appear
    await page.waitForTimeout(500);

    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).not.toContain('threat_traceback');
  });

  test('threat-retro agent-center view is accessible and URL matches', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await page.goto('/en/agent-center/overview?agent=threat-retro');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/agent-center\/overview.*agent=threat-retro/);
    // Page must render something (not a blank error)
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(0);
  });
});
