import { test, expect } from '../fixtures/auth.fixture';
import { uniqueSuffix } from '../helpers/test-data';
import { waitForToast, waitForDialog } from '../helpers/wait';

test.describe('Tag Rules System Tags UI', () => {
  test('tag rules page shows system tags in create dialog', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/tag', { waitUntil: 'networkidle', timeout: 30000 });

    await authenticatedPage.click('button:has-text("创建规则")');
    await waitForDialog(authenticatedPage);

    const dialog = authenticatedPage.locator('[role="dialog"]');

    await expect(dialog.locator('text=sys:nocac')).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('text=sys:noattachscan')).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('text=sys:phishagent')).toBeVisible({ timeout: 5000 });

    await expect(dialog.locator('text=系统标签')).toBeVisible();
    await expect(dialog.locator('text=自定义标签')).toBeVisible();

    const customInput = dialog.locator('input[placeholder*="回车"]').first();
    await expect(customInput).toBeVisible();

    await dialog.locator('[class*="cursor-pointer"]:has-text("sys:nocac")').first().click();

    const selectedBadge = dialog.locator('[class*="group"]:has-text("sys:nocac")');
    await expect(selectedBadge.first()).toBeVisible({ timeout: 3000 });

    await dialog.locator('button:has-text("取消")').click();
    await expect(dialog).not.toBeVisible();
  });

  test('system tags toggle on click and show as selected', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/tag', { waitUntil: 'networkidle', timeout: 30000 });

    await authenticatedPage.click('button:has-text("创建规则")');
    await waitForDialog(authenticatedPage);

    const dialog = authenticatedPage.locator('[role="dialog"]');

    const nocacBadge = dialog.locator('[class*="cursor-pointer"]:has-text("sys:nocac")').first();
    await nocacBadge.click();

    const selectedBadges = dialog.locator('[class*="group"]:has-text("sys:nocac")');
    const count = await selectedBadges.count();
    expect(count).toBeGreaterThan(0);

    await nocacBadge.click();

    await authenticatedPage.waitForTimeout(500);

    const afterDeselect = dialog.locator('[class*="group"]:has-text("sys:nocac")');
    const afterCount = await afterDeselect.count();
    expect(afterCount).toBeLessThan(count);
  });

  test('custom tag input adds and removes tags', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/tag', { waitUntil: 'networkidle', timeout: 30000 });

    await authenticatedPage.click('button:has-text("创建规则")');
    await waitForDialog(authenticatedPage);

    const dialog = authenticatedPage.locator('[role="dialog"]');
    const customTag = `test_${uniqueSuffix()}`;

    const customInput = dialog.locator('input[placeholder*="回车"]').first();
    await customInput.fill(customTag);
    await customInput.press('Enter');

    const tagBadge = dialog.locator(`[class*="group"]:has-text("${customTag}")`);
    await expect(tagBadge.first()).toBeVisible({ timeout: 3000 });

    await tagBadge.first().click();
    await expect(tagBadge.first()).not.toBeVisible({ timeout: 3000 });
  });
});
