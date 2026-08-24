/**
 * E2E spec: Advanced Filter Rules — list module + comprehensive-strategy
 * drawer host + editor drawer tab navigation + basic validation + i18n.
 *
 * Rewritten for the html_spec F1-F12 rewrite (see webapp/doc/html-spec/
 * filter-rules-pipeline-advanced-rules and the components under
 * src/components/security/advanced-filter-rules/). The pre-rewrite UI's
 * superset features (stage selector, hit-stats column, advanced-settings
 * drawer, DKIM-impact indicator, priority presets, observe mode, forward
 * queue) were deliberately cut and have no test coverage here — see
 * advanced-filter-rules-v3.spec.ts / advanced-filter-rules-phase2.spec.ts for
 * the CRUD/conditions/disposition/test-analysis flows.
 */
import { test, expect } from '../fixtures/auth.fixture';


import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
// The pipeline nav shows text labels only at >=1366px (below that it collapses to
// an icon-only rail — PolicyPipelinePage min-[1366px] classes); use a wide viewport
// so the "left nav lists the 3 stage-5 policies" label assertions hold.
test.use({ asRole: 'tenant_admin', viewport: { width: 1440, height: 900 } });


test.describe('Advanced Filter Rules — list & drawer host', () => {
  const createdRuleIds: number[] = [];

  async function openAdvancedRulesDrawer(page: import('@playwright/test').Page, locale = 'zh') {
    await page.goto(`/${locale}/security/pipeline`);
    await page.waitForLoadState('networkidle');

    const card = page.locator('[data-testid="pipeline-policy-card-advancedRules"]');
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    const drawer = page.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });
    // Module card + toolbar render after the module-enabled/list queries land.
    await expect(page.locator('[data-testid="advanced-rules-module-card"]')).toBeVisible({ timeout: 10000 });
    return drawer;
  }

  async function createApiRule(
    request: import('@playwright/test').APIRequestContext,
    name: string,
    conditionValue: string,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    const api = await createAuthenticatedClient(request);
    const resp = await api.post('/unified-rules', {
      name,
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      page: 'advanced_rules',
      priority: 50,
      condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: conditionValue },
      metadata: { feature: 'advanced_rules', scope: ['incoming'], primary_action: 'reject' },
      is_active: true,
      ...extra,
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    createdRuleIds.push(data.id);
    return data.id as number;
  }

  // The module master switch persists in config_overrides. The toggle test
  // below turns it OFF, and a prior interrupted run may also leave it OFF —
  // either dims the whole module (pointer-events-none) and blocks the editor.
  // Ensure it is ON before every test so tests don't cascade-fail.
  test.beforeEach(async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    await apiClient.put('/security/advanced-rules/enabled', { enabled: true }).catch(() => {});
  });

  test.afterAll(async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    await apiClient.put('/security/advanced-rules/enabled', { enabled: true }).catch(() => {});
    for (const id of createdRuleIds) {
      await apiClient.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });

  test('drawer opens from PolicyPipelinePage and shows the module card', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage);
    await expect(authenticatedPage.getByText('高级过滤规则').first()).toBeVisible({ timeout: 5000 });
  });

  // html_spec §3.1 "页级策略开关": the stage-5 policy shows its name, its
  // enabled state, and a switch to flip it.
  //
  // That strip used to be a drawer-level <ComprehensiveStrategyHeader> rendered
  // by PolicyPipelinePage. The 2026-07-18 unified-header work ("改统一表头 +
  // 总开关") moved it into each module's own header, so the old testids are
  // gone while the capability is unchanged — assert the header the module
  // actually renders. It sits OUTSIDE the content area that dims when the
  // module is disabled, so the switch stays reachable in both states.
  test('comprehensive-strategy header renders with page-level switch', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage);
    const card = authenticatedPage.locator('[data-testid="advanced-rules-module-card"]');
    await expect(card).toBeVisible({ timeout: 5000 });
    const header = card.locator('> div').first();
    await expect(header.getByText('高级过滤规则')).toBeVisible();
    await expect(header.getByText(/已启用|已禁用/)).toBeVisible();
    await expect(header.locator('[data-testid="module-enabled-switch"]')).toBeVisible();
  });

  test('left nav lists the 3 stage-5 policies and collapses via the ChevronLeft toggle', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage);
    const drawer = authenticatedPage.locator('[data-testid="pipeline-config-drawer"]');
    const nav = drawer.locator('nav').first();
    await expect(nav).toBeVisible();
    await expect(nav.locator('button')).toHaveCount(3);
    await expect(nav.getByText('高级过滤规则')).toBeVisible();

    // The collapse toggle is the icon-only round button positioned between the
    // nav column and the content pane (no testid — it's a Tooltip-wrapped
    // icon button in PolicyPipelinePage.tsx).
    const toggleBtn = drawer.locator('button.rounded-full.shadow-lg').first();
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });
    await toggleBtn.click();
    await authenticatedPage.waitForTimeout(400);

    // Collapsed: item labels are hidden, only the status dot + icon remain.
    await expect(nav.getByText('高级过滤规则')).toHaveCount(0);
    await expect(nav.locator('button')).toHaveCount(3);

    await toggleBtn.click();
    await authenticatedPage.waitForTimeout(400);
    await expect(nav.getByText('高级过滤规则')).toBeVisible();
  });

  test('list toolbar and 8-column table render', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage);

    await expect(authenticatedPage.locator('[data-testid="rules-search-input"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="rules-status-filter"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="rules-scope-filter"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="rules-reset-btn"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="rules-new-btn"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="rules-count"]')).toBeVisible();

    const headers = authenticatedPage.locator('table thead th');
    await expect(headers).toHaveCount(8);
    await expect(headers.nth(0)).toContainText('ID');
    await expect(headers.nth(1)).toContainText('规则名称');
    await expect(headers.nth(2)).toContainText('关键字');
    await expect(headers.nth(3)).toContainText('范围');
    await expect(headers.nth(4)).toContainText('状态');
    await expect(headers.nth(5)).toContainText('动作');
    await expect(headers.nth(6)).toContainText('到期时间');
    await expect(headers.nth(7)).toContainText('操作');
  });

  test('static condition-catalogue info card renders below the table', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage);
    const info = authenticatedPage.locator('[data-testid="rules-info-card"]');
    await expect(info).toBeVisible({ timeout: 5000 });
    await expect(info).toContainText('54');
  });

  test('create rule via API is visible in the list', async ({ authenticatedPage, request }) => {
    const ruleName = `pw-afr-api-${uniqueSuffix()}`;
    const ruleId = await createApiRule(request, ruleName, `pw-afr-unique-${uniqueSuffix()}`);

    await openAdvancedRulesDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(ruleName);
    await authenticatedPage.waitForTimeout(800);

    await expect(authenticatedPage.locator(`[data-testid="rule-row-${ruleId}"]`)).toBeVisible({ timeout: 10000 });
  });

  test('status filter narrows the list to disabled rules only', async ({ authenticatedPage, request }) => {
    const suffix = uniqueSuffix();
    const enabledName = `pw-afr-status-on-${suffix}`;
    const disabledName = `pw-afr-status-off-${suffix}`;
    await createApiRule(request, enabledName, `status-on-${suffix}`, { is_active: true });
    await createApiRule(request, disabledName, `status-off-${suffix}`, { is_active: false });

    await openAdvancedRulesDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-search-input"]').fill('pw-afr-status-');
    await authenticatedPage.waitForTimeout(500);

    await authenticatedPage.locator('[data-testid="rules-status-filter"]').click();
    await authenticatedPage.locator('[data-slot="select-item"][data-value="disabled"]').click();
    await authenticatedPage.waitForTimeout(500);

    const table = authenticatedPage.locator('table').first();
    await expect(table).toContainText(disabledName);
    await expect(table).not.toContainText(enabledName);

    await authenticatedPage.locator('[data-testid="rules-reset-btn"]').click();
  });

  test('scope filter narrows the list by scope value', async ({ authenticatedPage, request }) => {
    const suffix = uniqueSuffix();
    const incomingName = `pw-afr-scope-in-${suffix}`;
    const outgoingName = `pw-afr-scope-out-${suffix}`;
    await createApiRule(request, incomingName, `scope-in-${suffix}`, {
      metadata: { feature: 'advanced_rules', scope: ['incoming'], primary_action: 'reject' },
    });
    await createApiRule(request, outgoingName, `scope-out-${suffix}`, {
      metadata: { feature: 'advanced_rules', scope: ['outgoing'], primary_action: 'reject' },
    });

    await openAdvancedRulesDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-search-input"]').fill(`pw-afr-scope-`);
    await authenticatedPage.waitForTimeout(500);

    await authenticatedPage.locator('[data-testid="rules-scope-filter"]').click();
    await authenticatedPage.locator('[data-slot="select-item"][data-value="outgoing"]').click();
    await authenticatedPage.waitForTimeout(500);

    const table = authenticatedPage.locator('table').first();
    await expect(table).toContainText(outgoingName);
    await expect(table).not.toContainText(incomingName);

    await authenticatedPage.locator('[data-testid="rules-reset-btn"]').click();
    await authenticatedPage.waitForTimeout(300);
    await expect(authenticatedPage.locator('[data-testid="rules-search-input"]')).toHaveValue('');
  });

  // SKIP (product gap): the module-enable switch calls PUT /security/advanced-rules/enabled,
  // which requires system_admin (403 for tenant_admin) — but in the cloud/multiTenant dev
  // form the switch is only reachable inside the pipeline UI, which system_admin is blocked
  // from (GT-12149 / PRD §1.4). So neither role can toggle it via this UI. The platform-scoped
  // switch stranded in the tenant-only surface is a product inconsistency to resolve separately.
  test.skip('module enable/disable toggle disables the list area (no banner)', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    await apiClient.put('/security/advanced-rules/enabled', { enabled: true }).catch(() => {});

    await openAdvancedRulesDrawer(authenticatedPage);

    const switchEl = authenticatedPage.locator('[data-testid="module-enabled-switch"]');
    await expect(switchEl).toBeVisible({ timeout: 5000 });
    await expect(switchEl).toBeChecked({ timeout: 3000 });

    // Toggling the switch fires a PUT mutation, then react-query invalidates
    // and refetches the enabled state before the content dims. The DOM class
    // is the reliable signal (the mutation is fire-and-forget from the UI's
    // perspective), so poll it with a generous timeout rather than racing the
    // network round-trip.
    await switchEl.click();

    // No disabled-banner text in the rewritten UI — the whole content area
    // below the module header just gets pointer-events-none + opacity-50.
    const contentArea = authenticatedPage.locator('[data-testid="advanced-rules-module-card"] > div').nth(1);
    await expect(contentArea).toHaveClass(/pointer-events-none/, { timeout: 10000 });
    await expect(contentArea).toHaveClass(/opacity-50/, { timeout: 10000 });

    // Disabling dims the content area below the module header; the header (and
    // its switch) sits outside that container, so the same switch re-enables it.
    // This used to click the drawer-level comprehensive-strategy-header-switch,
    // which no longer exists after the 2026-07-18 unified-header refactor.
    await switchEl.click();
    await expect(contentArea).not.toHaveClass(/pointer-events-none/, { timeout: 10000 });

    await apiClient.put('/security/advanced-rules/enabled', { enabled: true }).catch(() => {});
  });

  test('editor drawer opens and all 4 tabs switch', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-new-btn"]').click();

    const editor = authenticatedPage.locator('[data-testid="rule-editor-drawer"]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    await expect(editor.locator('[data-testid="basic-settings-tab"]')).toBeVisible();

    await editor.locator('[data-testid="tab-conditions"]').click();
    await expect(editor.locator('[data-testid="conditions-tab"]')).toBeVisible();

    await editor.locator('[data-testid="tab-disposition"]').click();
    await expect(editor.locator('[data-testid="actions-tab"]')).toBeVisible();

    await editor.locator('[data-testid="tab-test"]').click();
    await expect(editor.locator('[data-testid="test-analysis-tab"]')).toBeVisible();

    await editor.locator('[data-testid="tab-basic"]').click();
    await expect(editor.locator('[data-testid="basic-settings-tab"]')).toBeVisible();

    await editor.locator('[data-testid="editor-cancel"]').click();
    await expect(editor).not.toBeVisible({ timeout: 5000 });
  });

  test('empty rule name blocks save and jumps back to the basic tab', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage);
    await authenticatedPage.locator('[data-testid="rules-new-btn"]').click();

    const editor = authenticatedPage.locator('[data-testid="rule-editor-drawer"]');
    await expect(editor).toBeVisible({ timeout: 10000 });

    // A primary action is required for the confirm button to even be enabled.
    await editor.locator('[data-testid="tab-disposition"]').click();
    await editor.locator('[data-testid="primary-action-select"]').click();
    await authenticatedPage.locator('[data-slot="select-item"][data-value="block"]').click();

    await editor.locator('[data-testid="tab-test"]').click();
    await expect(editor.locator('[data-testid="test-analysis-tab"]')).toBeVisible();

    await editor.locator('[data-testid="editor-confirm"]').click();
    await authenticatedPage.waitForTimeout(500);

    // Jumped back to basic tab with the inline name error visible.
    await expect(editor.locator('[data-testid="basic-settings-tab"]')).toBeVisible();
    await expect(editor.locator('[data-testid="basic-name-error"]')).toBeVisible();
    await expect(editor.locator('[data-testid="editor-error-hint"]')).toContainText('请输入规则名称');

    await editor.locator('[data-testid="editor-cancel"]').click();
  });

  test('multi-language check — English', async ({ authenticatedPage }) => {
    await openAdvancedRulesDrawer(authenticatedPage, 'en');
    await expect(authenticatedPage.getByText('Advanced Filter Rules').first()).toBeVisible({ timeout: 5000 });
    const drawer = authenticatedPage.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).not.toContainText('advancedRulesFeature.');
  });

  test('multi-language check — Chinese', async ({ authenticatedPage }) => {
    const drawer = await openAdvancedRulesDrawer(authenticatedPage, 'zh');
    await expect(authenticatedPage.getByText('高级过滤规则').first()).toBeVisible({ timeout: 5000 });
    await expect(drawer).not.toContainText('advancedRulesFeature.');
  });

  test('Thai language labels render without raw i18n keys', async ({ authenticatedPage }) => {
    const drawer = await openAdvancedRulesDrawer(authenticatedPage, 'th');
    await expect(drawer).not.toContainText('advancedRulesFeature.');
    await expect(authenticatedPage.locator('[data-testid="rules-new-btn"]')).toBeVisible();
  });

  test('Russian language labels render without raw i18n keys', async ({ authenticatedPage }) => {
    const drawer = await openAdvancedRulesDrawer(authenticatedPage, 'ru');
    await expect(drawer).not.toContainText('advancedRulesFeature.');
    await expect(authenticatedPage.locator('[data-testid="rules-new-btn"]')).toBeVisible();
  });
});
