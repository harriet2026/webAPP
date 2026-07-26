import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

test.describe('Tag Rules', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/tag');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('can create a tag rule', async ({ authenticatedPage, request }) => {
    const unique = `PW-Tag-${uniqueSuffix()}`;

    await authenticatedPage.getByRole('button', { name: /创建规则/ }).click();

    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').first().fill(unique);

    const valueInput = dialog.locator('input[placeholder*="值"]');
    if (await valueInput.count() > 0) {
      await valueInput.fill('1.2.3.4');
    }

    const customTagInput = dialog.locator('input[placeholder*="输入后按回车"]');
    await customTagInput.fill('pw-test-tag');
    await customTagInput.press('Enter');

    await dialog.getByRole('button', { name: /保存/ }).click();

    await expect(authenticatedPage.getByText(unique)).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.locator('table').getByText('pw-test-tag').first()).toBeVisible();
  });

  test('tag rule appears in list after creation via API', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `PW-List-${uniqueSuffix()}`;
    const resp = await api.post('/unified-rules', {
      name: unique,
      description: 'playwright test',
      rule_class: 'tag',
      stage: 'data',
      priority: 100,
      condition_tree: { type: 'AND', children: [{ type: 'condition', field: 'sender', operator: 'suffix', value: '@test.com' }] },
      tags: [`pw-list-tag-${uniqueSuffix()}`],
      is_active: true,
      metadata: {},
    });
    expect(resp.ok()).toBeTruthy();
    const rule = await resp.json();
    const tagName = rule.tags?.[0] || rule.condition_tree;

    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');

    await expect(authenticatedPage.getByText(unique)).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText(tagName)).toBeVisible();

    await api.delete(`/unified-rules/${rule.id}`);
  });

  test('can delete a tag rule', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const unique = `PW-Del-${uniqueSuffix()}`;
    const resp = await api.post('/unified-rules', {
      name: unique,
      rule_class: 'tag',
      stage: 'data',
      priority: 100,
      condition_tree: { type: 'AND', children: [{ type: 'condition', field: 'sender', operator: 'suffix', value: '@test.com' }] },
      tags: ['del-tag'],
      is_active: true,
      metadata: {},
    });
    expect(resp.ok()).toBeTruthy();
    const rule = await resp.json();

    await authenticatedPage.reload();
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(authenticatedPage.getByText(unique)).toBeVisible({ timeout: 10000 });

    const row = authenticatedPage.locator('tr').filter({ hasText: unique });
    await row.locator('button').last().click();

    const confirmDialog = authenticatedPage.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible({ timeout: 3000 });
    await confirmDialog.getByRole('button', { name: /确认|删除/ }).click();

    await expect(authenticatedPage.getByText(unique)).not.toBeVisible({ timeout: 10000 });
  });

  test('shows error when creating tag rule without tags', async ({ authenticatedPage }) => {
    await authenticatedPage.getByRole('button', { name: /创建规则/ }).click();

    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input').first().fill('no-tags-rule');

    const valueInput = dialog.locator('input[placeholder*="值"]');
    if (await valueInput.count() > 0) {
      await valueInput.fill('1.2.3.4');
    }

    await dialog.getByRole('button', { name: /保存/ }).click();

    await expect(authenticatedPage.getByText(/标签.*必填|at least one tag/i)).toBeVisible({ timeout: 5000 });
  });
});
