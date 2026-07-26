/**
 * E2E spec: Advanced Filter Rules — editor drawer CRUD + conditions
 * (OR/AND groups + expression preview) + disposition (primary action +
 * addon-only save) + rule test (EML upload) + list CRUD wiring.
 *
 * Rewritten for the html_spec F1-F12 rewrite. Dropped vs. the pre-rewrite
 * spec (features deliberately cut from the new UI, confirmed absent from the
 * rewritten components):
 *   - "observe mode" (dry-run) toggle — RuleForm/ActionsTab/BasicSettingsTab
 *     have no UI for it; only the backend Rule type still carries the field.
 *   - "outgoing scope disables quarantine/review primary actions" — ActionsTab
 *     renders a static PRIMARY_ACTIONS list with no scope-based gating.
 *   - JSON test_attributes textarea test tab — TestAnalysisTab only offers
 *     EML-file upload/drag-drop testing now (see advanced-filter-rules-phase2
 *     and the eml-based test below).
 */
import { test, expect } from '../fixtures/auth.fixture';


import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


const RULE_PREFIX = 'pw-v3-';

async function openDrawer(page: import('@playwright/test').Page) {
  await page.goto('/zh/security/pipeline');
  await page.waitForLoadState('networkidle');

  const card = page.locator('[data-testid="pipeline-policy-card-advancedRules"]').first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();

  const drawer = page.locator('[data-slot="sheet-content"]').first();
  await expect(drawer).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="advanced-rules-module-card"]')).toBeVisible({ timeout: 10000 });
}

async function openEditor(page: import('@playwright/test').Page) {
  await openDrawer(page);
  const newBtn = page.locator('[data-testid="rules-new-btn"]');
  await expect(newBtn).toBeVisible({ timeout: 5000 });
  await newBtn.click();
  const editor = page.locator('[data-testid="rule-editor-drawer"]');
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

function selectByValue(page: import('@playwright/test').Page, value: string) {
  return page.locator(`[data-slot="select-item"][data-value="${value}"]`);
}

async function createRule(
  request: import('@playwright/test').APIRequestContext,
  name: string,
  conditionValue: string,
) {
  const api = await createAuthenticatedClient(request);
  const resp = await api.post('/unified-rules', {
    name,
    rule_class: 'action',
    stage: 'data',
    action: 'reject',
    page: 'advanced_rules',
    // In [100, 1000] so a tenant_admin edit/re-save of this rule is accepted.
    priority: 500,
    condition_tree: {
      type: 'condition',
      field: 'subject',
      operator: 'contain',
      value: conditionValue,
    },
    metadata: {
      feature: 'advanced_rules',
      scope: ['incoming'],
      primary_action: 'block',
    },
    is_active: true,
  });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  return data.id as number;
}

function sampleEml(subject: string): Buffer {
  const raw =
    `From: sender@example.com\r\n` +
    `To: recipient@example.com\r\n` +
    `Subject: ${subject}\r\n` +
    `Date: Mon, 1 Jan 2024 00:00:00 +0000\r\n` +
    `Message-ID: <${uniqueSuffix()}@example.com>\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    `This is a Playwright-generated test email body.\r\n`;
  return Buffer.from(raw, 'utf-8');
}

test.describe('Advanced Filter Rules V3 — editor CRUD & conditions', () => {
  // Serial: the afterAll below deletes EVERY rule named `pw-v3-*`, and Playwright
  // runs afterAll once per WORKER, not once per file. Under the repo-wide
  // `fullyParallel: true` the first worker to finish its share therefore wipes the
  // shared prefix out from under the workers still running — their freshly created
  // rule vanishes mid-test and the list assertion sees "暂无数据". Which test loses
  // the race is arbitrary (an earlier run lost 'delete a rule from the list'
  // instead). Running the file in one worker makes afterAll fire once, after every
  // test, which is what this prefix-wide cleanup already assumes.
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async ({ request }) => {
    const api = await createAuthenticatedClient(request);
    const resp = await api.get('/unified-rules?rule_page=advanced_rules&page_size=10000');
    if (!resp.ok()) return;
    const data = await resp.json();
    for (const r of data.items || []) {
      if (typeof r.name === 'string' && r.name.startsWith(RULE_PREFIX)) {
        await api.delete(`/unified-rules/${r.id}`).catch(() => {});
      }
    }
  });

  test('create rule with OR + AND conditions and a primary action', async ({ authenticatedPage }) => {
    const name = `${RULE_PREFIX}or-and-${uniqueSuffix()}`;
    const editor = await openEditor(authenticatedPage);

    await editor.locator('[data-testid="basic-name"]').fill(name);
    // The editor defaults priority to 50, but a tenant_admin may only use
    // [100, 1000] (GT-11507); set a valid value so the save is accepted.
    await editor.locator('[data-testid="basic-priority"]').fill('500');

    await editor.locator('[data-testid="tab-conditions"]').click();
    await expect(editor.locator('[data-testid="conditions-tab"]')).toBeVisible();

    // OR group (default active) gets the "sender" condition.
    await editor.locator('[data-testid="condition-button-sender"]').click();
    await editor.locator('[data-testid="config-text-values"]').fill('spoof@example.com');

    // Switch to AND group and add "subject".
    await editor.locator('[data-testid="group-button-all"]').click();
    await editor.locator('[data-testid="condition-button-subject"]').click();
    await editor.locator('[data-testid="config-text-values"]').fill('urgent-invoice');

    const expr = editor.locator('[data-testid="expression-text"]');
    await expect(expr).toContainText('spoof@example.com');
    await expect(expr).toContainText('urgent-invoice');

    await editor.locator('[data-testid="tab-disposition"]').click();
    await editor.locator('[data-testid="primary-action-select"]').click();
    await selectByValue(authenticatedPage, 'deliver').click();

    await editor.locator('[data-testid="editor-confirm"]').click();
    await expect(editor).not.toBeVisible({ timeout: 10000 });

    await openDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(name);
    await authenticatedPage.waitForTimeout(800);
    await expect(authenticatedPage.locator('table').first()).toContainText(name);
  });

  test('addon-only rule with none primary action saves', async ({ authenticatedPage }) => {
    const name = `${RULE_PREFIX}addon-only-${uniqueSuffix()}`;
    const editor = await openEditor(authenticatedPage);

    await editor.locator('[data-testid="basic-name"]').fill(name);
    // tenant_admin priority range is [100, 1000] (editor defaults to 50).
    await editor.locator('[data-testid="basic-priority"]').fill('500');

    await editor.locator('[data-testid="tab-conditions"]').click();
    await editor.locator('[data-testid="condition-button-sender"]').click();
    await editor.locator('[data-testid="config-text-values"]').fill('tagall@example.com');

    await editor.locator('[data-testid="tab-disposition"]').click();
    // Default primary action is 'none'; the confirm button must stay disabled
    // until an addon is enabled (canSaveActions).
    await expect(editor.locator('[data-testid="editor-confirm"]')).toBeDisabled();

    await editor.locator('[data-testid="addon-row-modifyHeader"]').getByRole('checkbox').click();
    await authenticatedPage.waitForTimeout(300);

    await expect(editor.locator('[data-testid="editor-confirm"]')).toBeEnabled();
    await editor.locator('[data-testid="editor-confirm"]').click();
    await expect(editor).not.toBeVisible({ timeout: 10000 });

    await openDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(name);
    await authenticatedPage.waitForTimeout(800);
    await expect(authenticatedPage.locator('table').first()).toContainText(name);
  });

  test('list search filters by rule name and keyword', async ({ authenticatedPage, request }) => {
    const suffix = uniqueSuffix();
    const nameA = `${RULE_PREFIX}orange-${suffix}`;
    const nameB = `${RULE_PREFIX}purple-${suffix}`;
    const keywordB = `grapeSoda-${suffix}`;
    const idA = await createRule(request, nameA, 'citrusDummy');
    const idB = await createRule(request, nameB, keywordB);

    try {
      await openDrawer(authenticatedPage);

      const search = authenticatedPage.locator('[data-testid="rules-search-input"]');
      const table = authenticatedPage.locator('table').first();

      await search.fill(nameA);
      await authenticatedPage.waitForTimeout(800);
      await expect(table).toContainText(nameA);
      await expect(table).not.toContainText(nameB);

      await search.fill(keywordB);
      await authenticatedPage.waitForTimeout(800);
      await expect(table).toContainText(nameB);
      await expect(table).not.toContainText(nameA);

      await search.fill('');
      await authenticatedPage.waitForTimeout(500);
      await expect(table).toContainText(nameA);
      await expect(table).toContainText(nameB);
    } finally {
      const api = await createAuthenticatedClient(request);
      await api.delete(`/unified-rules/${idA}`).catch(() => {});
      await api.delete(`/unified-rules/${idB}`).catch(() => {});
    }
  });

  test('Thai locale renders translated labels without raw keys', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/th/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');

    const card = authenticatedPage.locator('[data-testid="pipeline-policy-card-advancedRules"]').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    const drawer = authenticatedPage.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await expect(drawer).not.toContainText('advancedRulesFeature.');

    const newBtn = authenticatedPage.locator('[data-testid="rules-new-btn"]');
    await expect(newBtn).toBeVisible({ timeout: 5000 });
    await newBtn.click();

    const editor = authenticatedPage.locator('[data-testid="rule-editor-drawer"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(editor).not.toContainText('advancedRulesFeature.');

    await editor.locator('[data-testid="tab-conditions"]').click();
    const orButton = editor.locator('[data-testid="group-button-any"]');
    await expect(orButton).toBeVisible({ timeout: 5000 });
    await expect(editor).not.toContainText('advancedRulesFeature.');
  });

  // Acceptance §11.1: edit flow — open an existing rule, modify it, re-save.
  test('edit an existing rule and re-save', async ({ authenticatedPage, request }) => {
    const suffix = uniqueSuffix();
    const original = `${RULE_PREFIX}edit-before-${suffix}`;
    const edited = `${RULE_PREFIX}edit-after-${suffix}`;
    const id = await createRule(request, original, `edit-marker-${suffix}`);

    try {
      await openDrawer(authenticatedPage);
      await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(original);
      await authenticatedPage.waitForTimeout(800);

      await authenticatedPage.locator(`[data-testid="rule-row-edit-${id}"]`).click();
      const editor = authenticatedPage.locator('[data-testid="rule-editor-drawer"]');
      await expect(editor).toBeVisible({ timeout: 10000 });

      await editor.locator('[data-testid="basic-name"]').fill(edited);
      await editor.locator('[data-testid="editor-confirm"]').click();
      await expect(editor).not.toBeVisible({ timeout: 10000 });

      // The list search still holds the pre-rename term, which no longer
      // matches; update it to the new name before asserting the row shows.
      await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(edited);
      await authenticatedPage.waitForTimeout(800);

      await expect(authenticatedPage.locator('table').first()).toContainText(edited);
    } finally {
      const api = await createAuthenticatedClient(request);
      await api.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });

  // Acceptance §11.1: enable/disable toggle.
  test('toggle a rule enable/disable', async ({ authenticatedPage, request }) => {
    const name = `${RULE_PREFIX}toggle-${uniqueSuffix()}`;
    const id = await createRule(request, name, `toggle-marker-${uniqueSuffix()}`);

    try {
      await openDrawer(authenticatedPage);
      await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(name);
      await authenticatedPage.waitForTimeout(800);

      const toggleBtn = authenticatedPage.locator(`[data-testid="rule-row-toggle-btn-${id}"]`);
      const statusBadge = authenticatedPage.locator(`[data-testid="rule-row-toggle-${id}"]`);

      // Initially enabled (createRule sets is_active:true).
      await expect(statusBadge).toContainText('已启用');
      await toggleBtn.click();
      await authenticatedPage.waitForTimeout(800);
      await expect(statusBadge).toContainText('已禁用');
      await toggleBtn.click();
      await authenticatedPage.waitForTimeout(800);
      await expect(statusBadge).toContainText('已启用');
    } finally {
      const api = await createAuthenticatedClient(request);
      await api.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });

  // Acceptance §11.1: delete flow — no confirmation dialog in the rewritten
  // UI (delete removes the row immediately).
  test('delete a rule from the list (no confirmation dialog)', async ({ authenticatedPage, request }) => {
    const name = `${RULE_PREFIX}delete-${uniqueSuffix()}`;
    const id = await createRule(request, name, `delete-marker-${uniqueSuffix()}`);

    await openDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(name);
    await authenticatedPage.waitForTimeout(800);

    const table = authenticatedPage.locator('table').first();
    await expect(table).toContainText(name);

    await authenticatedPage.locator(`[data-testid="rule-row-delete-${id}"]`).click();
    await authenticatedPage.waitForTimeout(1000);

    await expect(table).not.toContainText(name);
  });

  // Spec §10: rule test using an uploaded .eml file (TestAnalysisTab has no
  // JSON test_attributes textarea in the rewritten UI).
  test('EML rule test returns a verdict', async ({ authenticatedPage }) => {
    const editor = await openEditor(authenticatedPage);
    await editor.locator('[data-testid="basic-name"]').fill(`${RULE_PREFIX}test-${uniqueSuffix()}`);

    // Add a condition so the test can run (conditionTree must be non-empty).
    await editor.locator('[data-testid="tab-conditions"]').click();
    await editor.locator('[data-testid="condition-button-subject"]').click();
    await editor.locator('[data-testid="config-text-values"]').fill('invoice');

    await editor.locator('[data-testid="tab-test"]').click();
    await expect(editor.locator('[data-testid="test-analysis-tab"]')).toBeVisible();

    await editor.locator('[data-testid="eml-file-input"]').setInputFiles({
      name: 'test.eml',
      mimeType: 'message/rfc822',
      buffer: sampleEml('please pay this invoice now'),
    });
    await expect(editor.locator('[data-testid="eml-selected-file"]')).toBeVisible();

    await editor.locator('[data-testid="run-eml-test-button"]').click();
    await expect(editor.locator('[data-testid="eml-test-result"]')).toBeVisible({ timeout: 10000 });
    await expect(editor.locator('[data-testid="verdict-badge"]')).toContainText('命中');
  });

  // New-rule (no persisted rule.id yet) gates the analysis + history sections
  // to a "保存后可用" placeholder.
  test('new-rule editor shows saved-after placeholders for analysis and history', async ({ authenticatedPage }) => {
    const editor = await openEditor(authenticatedPage);
    await editor.locator('[data-testid="tab-test"]').click();

    await expect(editor.locator('[data-testid="analysis-placeholder"]')).toBeVisible();
    await expect(editor.locator('[data-testid="history-placeholder"]')).toBeVisible();
    await expect(editor.locator('[data-testid="analysis-placeholder"]')).toContainText('保存规则后可查看效果分析');
    await expect(editor.locator('[data-testid="history-placeholder"]')).toContainText('保存规则后可查看效果分析');
  });

  // Acceptance §11.6: pagination controls.
  test('pagination page-size selector is present', async ({ authenticatedPage, request }) => {
    // The pagination controls only render when the list is non-empty
    // (filteredRules.length > 0), so seed a rule to guarantee at least one row.
    const id = await createRule(request, `${RULE_PREFIX}page-${uniqueSuffix()}`, `page-marker-${uniqueSuffix()}`);

    try {
      await openDrawer(authenticatedPage);

      await expect(authenticatedPage.locator('[data-testid="rules-page-size"]')).toBeVisible({ timeout: 5000 });
      await expect(authenticatedPage.locator('[data-testid="rules-page-info"]')).toBeVisible({ timeout: 5000 });
      await expect(authenticatedPage.locator('[data-testid="rules-prev-page"]')).toBeVisible({ timeout: 5000 });
      await expect(authenticatedPage.locator('[data-testid="rules-next-page"]')).toBeVisible({ timeout: 5000 });
    } finally {
      const api = await createAuthenticatedClient(request);
      await api.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });
});
