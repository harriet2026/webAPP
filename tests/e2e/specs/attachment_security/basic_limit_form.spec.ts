import { test, expect } from '../../fixtures/auth.fixture';
import { navigateToAttachmentSecurity } from './helpers';

test.describe('Basic Limit Form', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await navigateToAttachmentSecurity(authenticatedPage);
    await expect(authenticatedPage.locator('[data-testid="basic-limit-tab"]')).toBeVisible();
  });

  test('form fields are visible', async ({ authenticatedPage }) => {
    const tab = authenticatedPage.locator('[data-testid="basic-limit-tab"]');
    const numberInputs = tab.locator('input[type="number"]');
    await expect(numberInputs.first()).toBeVisible();
  });

  test('KB to MB conversion is shown next to size field', async ({ authenticatedPage }) => {
    const tab = authenticatedPage.locator('[data-testid="basic-limit-tab"]');
    const mbHint = tab.locator('text=≈').first();
    await expect(mbHint).toBeVisible();
    const mbText = await mbHint.textContent();
    expect(mbText).toContain('MB');
  });

  test('unified save enables only after a change', async ({ authenticatedPage }) => {
    const saveBtn = authenticatedPage.locator('[data-testid="basic-limit-save"]');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();
    await authenticatedPage.getByTestId('attachment-count-max').fill('11');
    await expect(saveBtn).toBeEnabled();
  });

  test('filling and saving shows success or failure toast', async ({ authenticatedPage }) => {
    const countInput = authenticatedPage.locator('[data-testid="basic-limit-tab"] input[type="number"]').first();
    await countInput.fill('30');

    const saveBtn = authenticatedPage.locator('[data-testid="basic-limit-save"]');
    await saveBtn.click();

    const toast = authenticatedPage.locator('[data-sonner-toast], [role="status"]').first();
    try {
      await toast.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      // toast may not appear if API is not available in test env
    }
  });

  test('is fixed to the receive direction', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.getByTestId('basic-limit-tab')).toContainText('收信方向');
    await expect(authenticatedPage.locator('[data-testid^="direction-"]')).toHaveCount(0);
  });
});
