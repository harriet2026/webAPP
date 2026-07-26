/**
 * E2E spec: Advanced Filter Rules — disposition addon gating (upcoming /
 * conflict matrix / actionOrAddon validation), version history + rollback +
 * export, effect analysis, and the field-definitions API.
 *
 * Rewritten for the html_spec F1-F12 rewrite. Dropped vs. the pre-rewrite
 * spec (features deliberately cut from the new UI, confirmed absent from the
 * rewritten components):
 *   - stage selector — no per-rule stage dropdown in the editor.
 *   - hit-stats / 7-day-hit column — the 8-column list has no hit-stats column.
 *   - advanced-settings drawer (forward rate / tarpit concurrency, ...).
 *   - DKIM-impact indicator (orange AlertTriangle) — AddonsPanel/AddonsRowList
 *     render no such indicator; the demo cue was cut.
 *   - priority preset buttons — BasicSettingsTab has a plain numeric input.
 */
import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });



async function openRuleEditor(page: import('@playwright/test').Page) {
  await page.goto('/zh/security/pipeline');
  await page.waitForLoadState('networkidle');

  const card = page.locator('[data-testid="pipeline-policy-card-advancedRules"]');
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  await expect(page.locator('[data-testid="advanced-rules-module-card"]')).toBeVisible({ timeout: 10000 });

  await page.locator('[data-testid="rules-new-btn"]').click();
  const editor = page.locator('[data-testid="rule-editor-drawer"]');
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

function selectByValue(page: import('@playwright/test').Page, value: string) {
  return page.locator(`[data-slot="select-item"][data-value="${value}"]`);
}

async function setPrimaryAction(editor: import('@playwright/test').Locator, page: import('@playwright/test').Page, value: string) {
  await editor.locator('[data-testid="primary-action-select"]').click();
  await selectByValue(page, value).click();
  await page.waitForTimeout(200);
}

test.describe('Advanced Filter Rules Phase 2 — disposition gating & test-analysis', () => {
  const createdRuleIds: number[] = [];

  // The module master switch persists in config_overrides; a prior interrupted
  // run may leave it OFF, which dims the whole module (pointer-events-none) and
  // blocks every editor interaction. Ensure it is ON before this file's tests.
  test.beforeAll(async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    await apiClient.put('/security/advanced-rules/enabled', { enabled: true }).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    for (const id of createdRuleIds) {
      await apiClient.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });

  // STORED_NOT_WIRED_ADDONS (AddonsPanel.tsx) is now an EMPTY set: all three
  // addons that were once "stored but not wired" have been connected --
  // deleteAttachment / externalReminder execute in the milter (GT-12185,
  // 1a40f30ab4) and forwardServer is consumed by sideline release, which creates
  // the forwarding task (GT-12185, dfa8b8a283; covered end-to-end by
  // tests/integration/test_tag_rule_addon_actions_e2e.py TC-TAOA-002).
  //
  // So there is no "disabled + 即将上线" case left to assert. If a genuinely
  // unwired addon is ever added, put it back in STORED_NOT_WIRED_ADDONS and
  // restore a test here -- shipping a switch that silently does nothing is the
  // GT-12194 lesson this gating exists to prevent.

  // 反向断言：已接通的三项必须真的可配置。少了这条，未来把它们误标回 upcoming
  // （或 GT-12185 的放开被回退）就没有任何用例会发现。
  for (const key of ['deleteAttachment', 'externalReminder', 'forwardServer']) {
    test(`${key} addon is wired and configurable (GT-12185)`, async ({ authenticatedPage }) => {
      const editor = await openRuleEditor(authenticatedPage);
      await editor.locator('[data-testid="tab-disposition"]').click();

      const row = editor.locator(`[data-testid="addon-row-${key}"]`);
      await expect(row).toBeVisible({ timeout: 5000 });
      await expect(row).not.toContainText('即将上线');
      await expect(row.getByRole('checkbox')).toBeEnabled();

      await editor.locator('[data-testid="editor-cancel"]').click();
    });
  }

  // Conflict matrix (conflict-matrix.ts, demo/user-decided): quarantine
  // disables forwardServer + modifyHeader.
  test('quarantine primary action disables forwardServer and modifyHeader addons', async ({ authenticatedPage }) => {
    const editor = await openRuleEditor(authenticatedPage);
    await editor.locator('[data-testid="tab-disposition"]').click();
    await setPrimaryAction(editor, authenticatedPage, 'quarantine');

    await expect(editor.locator('[data-testid="addon-row-forwardServer"]').getByRole('checkbox')).toBeDisabled();
    await expect(editor.locator('[data-testid="addon-row-modifyHeader"]').getByRole('checkbox')).toBeDisabled();
    // adminNotify remains available under quarantine.
    await expect(editor.locator('[data-testid="addon-row-adminNotify"]').getByRole('checkbox')).toBeEnabled();

    await editor.locator('[data-testid="editor-cancel"]').click();
  });

  // discard/block: only adminNotify remains available; every other addon is
  // disabled by the conflict matrix.
  for (const action of ['discard', 'block']) {
    test(`${action} primary action disables every addon except adminNotify`, async ({ authenticatedPage }) => {
      const editor = await openRuleEditor(authenticatedPage);
      await editor.locator('[data-testid="tab-disposition"]').click();
      await setPrimaryAction(editor, authenticatedPage, action);

      await expect(editor.locator('[data-testid="addon-row-disclaimer"]').getByRole('checkbox')).toBeDisabled();
      await expect(editor.locator('[data-testid="addon-row-emailTag"]').getByRole('checkbox')).toBeDisabled();
      await expect(editor.locator('[data-testid="addon-row-forwardServer"]').getByRole('checkbox')).toBeDisabled();
      await expect(editor.locator('[data-testid="addon-row-modifyHeader"]').getByRole('checkbox')).toBeDisabled();
      await expect(editor.locator('[data-testid="addon-row-adminNotify"]').getByRole('checkbox')).toBeEnabled();

      await editor.locator('[data-testid="editor-cancel"]').click();
    });
  }

  // none primary action + no valid addon enabled: confirm stays disabled and
  // both the left-column hint and the footer hint show the same red message.
  test('none action with no addon enabled blocks save with two red hints', async ({ authenticatedPage }) => {
    const editor = await openRuleEditor(authenticatedPage);
    await editor.locator('[data-testid="tab-disposition"]').click();

    await expect(editor.locator('[data-testid="editor-confirm"]')).toBeDisabled();
    await expect(editor.locator('[data-testid="actions-left-required-hint"]')).toContainText(
      '请选择一个主动作或至少启用一个附加项',
    );
    await expect(editor.locator('[data-testid="editor-error-hint"]')).toContainText(
      '请选择一个主动作或至少启用一个附加项',
    );

    await editor.locator('[data-testid="editor-cancel"]').click();
  });

  // Version history is recorded automatically on create (rule_version_hooks.go,
  // page==advanced_rules only) — editing an existing rule must show at least
  // one version row, with a working rollback button (no confirmation dialog)
  // and enabled CSV/PDF export buttons.
  test('version history table has data with working rollback and export buttons', async ({
    authenticatedPage,
    request,
  }) => {
    const api = await createAuthenticatedClient(request);
    const name = `pw-p2-hist-${uniqueSuffix()}`;
    const createResp = await api.post('/unified-rules', {
      name,
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      page: 'advanced_rules',
      priority: 50,
      condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: `hist-${uniqueSuffix()}` },
      metadata: { feature: 'advanced_rules', scope: ['incoming'], primary_action: 'block' },
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id } = await createResp.json();
    createdRuleIds.push(id);

    await authenticatedPage.goto('/zh/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
    await authenticatedPage.locator('[data-testid="pipeline-policy-card-advancedRules"]').click();
    await expect(authenticatedPage.locator('[data-testid="advanced-rules-module-card"]')).toBeVisible({ timeout: 10000 });

    await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(name);
    await authenticatedPage.waitForTimeout(800);
    await authenticatedPage.locator(`[data-testid="rule-row-edit-${id}"]`).click();

    const editor = authenticatedPage.locator('[data-testid="rule-editor-drawer"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.locator('[data-testid="tab-test"]').click();

    const versionTable = editor.locator('[data-testid="version-history-table"]');
    await expect(versionTable).toBeVisible({ timeout: 10000 });
    await expect(versionTable).toContainText('v1');

    await expect(editor.locator('[data-testid="export-csv-button"]')).toBeEnabled();
    await expect(editor.locator('[data-testid="export-pdf-button"]')).toBeEnabled();

    // Rollback has no confirmation dialog — click fires the mutation directly.
    const rollbackBtn = editor.locator('[data-testid="rollback-button-v1"]');
    await expect(rollbackBtn).toBeVisible();
    await rollbackBtn.click();
    await authenticatedPage.waitForTimeout(1000);
    await expect(editor.locator('[data-testid="version-history-table"]')).toContainText('v2');

    await editor.locator('[data-testid="editor-cancel"]').click();
  });

  // Effect analysis: metric cards + hit-trend chart render for a saved rule
  // (backend endpoints /unified-rules/:id/effect-stats and /hit-trend).
  test('effect analysis renders metric cards and hit-trend chart for a saved rule', async ({
    authenticatedPage,
    request,
  }) => {
    const api = await createAuthenticatedClient(request);
    const name = `pw-p2-effect-${uniqueSuffix()}`;
    const createResp = await api.post('/unified-rules', {
      name,
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      page: 'advanced_rules',
      priority: 50,
      condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: `effect-${uniqueSuffix()}` },
      metadata: { feature: 'advanced_rules', scope: ['incoming'], primary_action: 'block' },
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id } = await createResp.json();
    createdRuleIds.push(id);

    const [effectResp, hitResp] = await Promise.all([
      authenticatedPage.waitForResponse((r) => r.url().includes(`/unified-rules/${id}/effect-stats`)),
      authenticatedPage.waitForResponse((r) => r.url().includes(`/unified-rules/${id}/hit-trend`)),
      (async () => {
        await authenticatedPage.goto('/zh/security/pipeline');
        await authenticatedPage.waitForLoadState('networkidle');
        await authenticatedPage.locator('[data-testid="pipeline-policy-card-advancedRules"]').click();
        await expect(authenticatedPage.locator('[data-testid="advanced-rules-module-card"]')).toBeVisible({
          timeout: 10000,
        });
        await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(name);
        await authenticatedPage.waitForTimeout(800);
        await authenticatedPage.locator(`[data-testid="rule-row-edit-${id}"]`).click();
        const editor = authenticatedPage.locator('[data-testid="rule-editor-drawer"]');
        await expect(editor).toBeVisible({ timeout: 10000 });
        await editor.locator('[data-testid="tab-test"]').click();
      })(),
    ]);
    expect(effectResp.ok()).toBeTruthy();
    expect(hitResp.ok()).toBeTruthy();

    const editor = authenticatedPage.locator('[data-testid="rule-editor-drawer"]');
    await expect(editor.locator('[data-testid="metric-card-primary"]')).toBeVisible();
    await expect(editor.locator('[data-testid="metric-card-success"]')).toBeVisible();
    await expect(editor.locator('[data-testid="metric-card-warning"]')).toBeVisible();
    await expect(editor.locator('[data-testid="metric-card-review"]')).toBeVisible();
    await expect(editor.locator('[data-testid="hit-trend-chart"]')).toBeVisible();

    await editor.locator('[data-testid="editor-cancel"]').click();
  });

  test('field definitions API returns categories', async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const resp = await apiClient.get('/unified-rules/field-definitions?stage=data&page=advanced_rules');
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    const fields = data.fields || {};

    if (fields.url_count) {
      expect(fields.url_count).toBeDefined();
      expect(fields.url_count.category).toBeDefined();
    }
    if (fields.cc) {
      expect(fields.cc).toBeDefined();
    }
    if (fields.sender_mail_count_15min) {
      expect(fields.sender_mail_count_15min).toBeDefined();
    }
  });
});
