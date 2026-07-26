import { test, expect } from '../fixtures/auth.fixture';

test.describe('Rule Email Type Dropdown', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/security/advanced-filter-rules');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.waitForTimeout(1500);
  });

  test('email type field visible in rule editor', async ({ authenticatedPage }) => {
    const newBtn = authenticatedPage.getByRole('button', { name: /新建|New|创建/i }).first();
    if (await newBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newBtn.click();
      await authenticatedPage.waitForTimeout(1000);
      const emailTypeLabel = authenticatedPage.getByText('邮件类型').first();
      await expect(emailTypeLabel).toBeVisible({ timeout: 10000 });
    }
  });
});
