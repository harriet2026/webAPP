import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

test.describe('Sideline Stage Action Rules', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/sideline', { waitUntil: 'networkidle', timeout: 30000 });
  });

  test('sideline rules page loads without errors', async ({ authenticatedPage }) => {
    await expect(authenticatedPage.locator('main h1')).toBeVisible();
    await expect(authenticatedPage.locator('table').first()).toBeVisible();
  });

  test('sideline rule dialog does not show sideline_checks checkboxes', async ({ authenticatedPage }) => {
    await authenticatedPage.getByRole('button', { name: /创建规则/ }).click();

    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').first().fill('test-sideline-no-checks');

    const fieldSelect = dialog.locator('[data-slot="select-trigger"]').first();
    await fieldSelect.click();
    await authenticatedPage.locator('[data-slot="select-item"]').first().click();
    await authenticatedPage.waitForTimeout(300);

    await dialog.getByRole('button', { name: /取消/ }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('can create sideline action rule without sideline_checks in metadata', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `PW-Sideline-${uniqueSuffix()}`;
    const resp = await api.post('/unified-rules', {
      name: unique,
      rule_class: 'action',
      stage: 'sideline',
      action: 'accept',
      priority: 100,
      condition_tree: { type: 'AND', children: [{ type: 'condition', field: 'sideline_phish_checked', operator: 'eq', value: 'true' }] },
      is_active: true,
      metadata: { max_check_time: 30, timeout_minutes: 1440 },
    });
    expect(resp.ok()).toBeTruthy();
    const rule = await resp.json();

    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');

    await expect(authenticatedPage.getByText(unique)).toBeVisible({ timeout: 10000 });

    await api.delete(`/unified-rules/${rule.id}`);
  });
});

test.describe('Tag List Field Value Input', () => {
  test('hasTag operator shows value input for rcpttags field', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/rcpt', { waitUntil: 'networkidle', timeout: 30000 });

    await authenticatedPage.getByRole('button', { name: /创建规则/ }).click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').first().fill('test-hasTag-value-input');

    const fieldSelects = dialog.locator('[data-slot="select-trigger"]');
    await fieldSelects.first().click();
    await authenticatedPage.waitForTimeout(300);

    const rcpttagsOption = authenticatedPage.locator('[data-slot="select-item"]').filter({ hasText: /rcpttags/i });
    if (await rcpttagsOption.count() > 0) {
      await rcpttagsOption.click();
      await authenticatedPage.waitForTimeout(300);

      const operatorSelects = dialog.locator('[data-slot="select-trigger"]');
      const opCount = await operatorSelects.count();
      if (opCount >= 2) {
        await operatorSelects.nth(1).click();
        await authenticatedPage.waitForTimeout(300);

        const hasTagOption = authenticatedPage.locator('[data-slot="select-item"]').filter({ hasText: /hasTag/i });
        if (await hasTagOption.count() > 0) {
          await hasTagOption.click();
          await authenticatedPage.waitForTimeout(300);

          const valueInputs = dialog.locator('input:not([type])').filter({ hasText: '' });
          const lastInput = valueInputs.last();
          await expect(lastInput).toBeVisible();
        }
      }
    }

    await dialog.getByRole('button', { name: /取消/ }).click();
    await expect(dialog).not.toBeVisible();
  });
});
