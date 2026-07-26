import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

const PAGE_URL = '/zh/rules/pipeline';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Click a stage node box identified by its data-testid attribute.
 * stage is one of: onconnect, mail, rcpt, header, data, sideline
 */
async function clickStageNode(page: import('@playwright/test').Page, stage: string) {
  const node = page.locator(`[data-testid="stage-node-${stage}"]`);
  await node.click();
}

async function createActionRule(
  request: Parameters<typeof createAuthenticatedClient>[0],
  overrides: Record<string, unknown> = {},
) {
  const api = await createAuthenticatedClient(request);
  const name = `PW-Pipeline-${uniqueSuffix()}`;
  const resp = await api.post('/unified-rules', {
    name,
    rule_class: 'action',
    stage: 'mail',
    page: 'pipeline_test',
    priority: 600,
    condition_tree: {
      type: 'condition',
      field: 'sender',
      operator: 'suffix',
      value: `@pw-pipeline-${uniqueSuffix()}.test`,
    },
    action: 'reject',
    is_active: true,
    metadata: {},
    ...overrides,
  });
  expect(resp.ok()).toBeTruthy();
  const rule = await resp.json();
  return { api, rule, name };
}

async function createTagRule(
  request: Parameters<typeof createAuthenticatedClient>[0],
) {
  const api = await createAuthenticatedClient(request);
  const name = `PW-PipelineTag-${uniqueSuffix()}`;
  const tag = `pw-pipe-${uniqueSuffix()}`;
  const resp = await api.post('/unified-rules', {
    name,
    rule_class: 'tag',
    stage: 'data',
    page: 'pipeline_test',
    priority: 500,
    condition_tree: {
      type: 'condition',
      field: 'sender',
      operator: 'suffix',
      value: `@pw-tag-${uniqueSuffix()}.test`,
    },
    tags: [tag],
    is_active: true,
    metadata: {},
  });
  expect(resp.ok()).toBeTruthy();
  const rule = await resp.json();
  return { api, rule, name, tag };
}

// ─── Page structure ───────────────────────────────────────────────────────────

test.describe('Rule Pipeline Overview — page structure', () => {
  test('page loads and shows pipeline title', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await expect(authenticatedPage.getByText('规则流水线总览')).toBeVisible({ timeout: 10000 });
  });

  test('shows priority explanation banner', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await expect(authenticatedPage.getByText('规则优先级与阶段执行说明')).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText(/邮件按阶段顺序处理/)).toBeVisible();
  });

  test('all 6 stages visible as compact boxes', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    // Stage boxes use data-testid for reliable targeting
    await expect(authenticatedPage.locator('[data-testid="stage-node-onconnect"]')).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.locator('[data-testid="stage-node-mail"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="stage-node-rcpt"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="stage-node-header"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="stage-node-data"]')).toBeVisible();
    await expect(authenticatedPage.locator('[data-testid="stage-node-sideline"]')).toBeVisible();
  });

  test('stage labels visible: CONNECT, MAIL FROM, RCPT TO, HEADER, DATA, 旁路阶段', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    const stageLabels = ['CONNECT', 'MAIL FROM', 'RCPT TO', 'HEADER', 'DATA', '旁路阶段'];
    for (const label of stageLabels) {
      await expect(
        authenticatedPage.locator('[data-testid^="stage-node-"]').filter({ hasText: label }).first()
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('dashed arrow with default sideline label is visible', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await expect(authenticatedPage.getByText('无命中入站邮件（默认旁路）')).toBeVisible({ timeout: 10000 });
  });

  test('audit queue nodes visible', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await expect(authenticatedPage.getByText('入站审核队列')).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText('外发审核队列')).toBeVisible();
  });

  test('legend section visible', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await expect(authenticatedPage.getByText(/×N = 当前启用规则数量/)).toBeVisible({ timeout: 10000 });
  });

  test('no collapse/expand buttons (new design is always-visible)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await expect(authenticatedPage.getByRole('button', { name: '全部展开' })).not.toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: '全部折叠' })).not.toBeVisible();
  });
});

// ─── Stage interaction (StageSheet) ──────────────────────────────────────────

test.describe('Rule Pipeline Overview — stage interaction', () => {
  test('clicking stage node opens StageSheet with stage label', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await clickStageNode(authenticatedPage, 'mail');

    const sheet = authenticatedPage.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText('MAIL FROM 阶段规则')).toBeVisible();
  });

  test('StageSheet has 前往详情页 link', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await clickStageNode(authenticatedPage, 'header');

    const sheet = authenticatedPage.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText('前往详情页')).toBeVisible();
  });

  test('StageSheet has 标签规则页 link', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await clickStageNode(authenticatedPage, 'data');

    const sheet = authenticatedPage.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText('标签规则页')).toBeVisible();
  });

  test('StageSheet shows 标签规则 and 动作规则 sections', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await clickStageNode(authenticatedPage, 'rcpt');

    const sheet = authenticatedPage.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText('标签规则', { exact: true })).toBeVisible();
    await expect(sheet.getByText('动作规则', { exact: true })).toBeVisible();
  });

  test('StageSheet closes on Escape', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await clickStageNode(authenticatedPage, 'mail');

    await expect(authenticatedPage.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    await authenticatedPage.keyboard.press('Escape');
    await expect(authenticatedPage.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('sideline stage opens StageSheet with 旁路阶段 label', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await clickStageNode(authenticatedPage, 'sideline');

    const sheet = authenticatedPage.locator('[role="dialog"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText('旁路阶段 阶段规则')).toBeVisible();
  });
});

// ─── Rules in StageSheet ──────────────────────────────────────────────────────

test.describe('Rule Pipeline Overview — rules in StageSheet', () => {
  test('action rule appears in 动作规则 section after creation', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'rcpt', action: 'reject' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'rcpt');

      const sheet = authenticatedPage.locator('[role="dialog"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await expect(sheet.getByText(name)).toBeVisible({ timeout: 10000 });
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('tag rule appears in 标签规则 section after creation', async ({ authenticatedPage, request }) => {
    const { api, rule, name, tag } = await createTagRule(request);

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'data');

      const sheet = authenticatedPage.locator('[role="dialog"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await expect(sheet.getByText(name)).toBeVisible({ timeout: 10000 });
      await expect(sheet.getByText(tag).first()).toBeVisible();
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('disabled rule shows 禁用 badge in sheet', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, {
      stage: 'mail', action: 'reject', is_active: false,
    });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'mail');

      const sheet = authenticatedPage.locator('[role="dialog"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await expect(sheet.getByText(name)).toBeVisible({ timeout: 10000 });
      await expect(sheet.getByText('禁用').first()).toBeVisible();
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('sideline action rule shows → 旁路 badge', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'data', action: 'sideline' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'data');

      const sheet = authenticatedPage.locator('[role="dialog"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await expect(sheet.getByText(name)).toBeVisible({ timeout: 10000 });
      await expect(sheet.getByText('→ 旁路').first()).toBeVisible();
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('reject rule shows → EXIT badge', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'rcpt', action: 'reject' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'rcpt');

      const sheet = authenticatedPage.locator('[role="dialog"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await expect(sheet.getByText(name)).toBeVisible({ timeout: 10000 });
      await expect(sheet.getByText('→ EXIT').first()).toBeVisible();
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('accept rule shows accept badge (no → EXIT badge on its row)', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'mail', action: 'accept' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'mail');

      const sheet = authenticatedPage.locator('[role="dialog"]');
      await expect(sheet).toBeVisible({ timeout: 5000 });
      await expect(sheet.getByText(name)).toBeVisible({ timeout: 10000 });
      // Scope to the specific accept rule row: it should show the accept badge, not an EXIT badge
      const acceptRow = sheet.locator('button').filter({ hasText: name });
      await expect(acceptRow.getByText('accept')).toBeVisible();
      await expect(acceptRow.locator('text=→ EXIT')).not.toBeVisible();
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });
});

// ─── ActionCountBadges ────────────────────────────────────────────────────────

test.describe('Rule Pipeline Overview — ActionCountBadges on stage boxes', () => {
  test('stage box shows reject count badge after creating reject rule', async ({ authenticatedPage, request }) => {
    const { api, rule } = await createActionRule(request, { stage: 'rcpt', action: 'reject' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      const node = authenticatedPage.locator('[data-testid="stage-node-rcpt"]');
      await expect(node).toBeVisible({ timeout: 10000 });
      // Badge shows "reject ×N" where N >= 1
      await expect(node.getByText(/reject ×\d+/)).toBeVisible({ timeout: 10000 });
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('stage box shows tag count badge after creating tag rule', async ({ authenticatedPage, request }) => {
    const { api, rule } = await createTagRule(request);

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      const node = authenticatedPage.locator('[data-testid="stage-node-data"]');
      await expect(node).toBeVisible({ timeout: 10000 });
      // Tag badge shows "🏷 标签 ×N"
      await expect(node.getByText(/标签 ×\d+/)).toBeVisible({ timeout: 10000 });
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });
});

// ─── Rule detail flow ─────────────────────────────────────────────────────────

test.describe('Rule Pipeline Overview — rule detail flow', () => {
  test('click stage → sheet opens → click rule → RuleDetailSheet opens with ID and priority', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'mail', action: 'reject' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });

      // Step 1: click stage node → StageSheet opens
      await clickStageNode(authenticatedPage, 'mail');
      const stageSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(stageSheet).toBeVisible({ timeout: 5000 });
      await expect(stageSheet.getByText('MAIL FROM 阶段规则')).toBeVisible();

      // Step 2: click rule row → StageSheet closes, RuleDetailSheet opens
      await stageSheet.getByText(name).click();
      await authenticatedPage.waitForTimeout(300); // allow sheet animation

      const detailSheet = authenticatedPage.locator('[role="dialog"]').filter({ hasText: `ID: ${rule.id}` });
      await expect(detailSheet).toBeVisible({ timeout: 5000 });
      await expect(detailSheet.getByText(/优先级 600/)).toBeVisible();
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('RuleDetailSheet 在原页面编辑 link points to correct stage page', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'header', action: 'reject' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'header');

      const stageSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(stageSheet).toBeVisible({ timeout: 5000 });
      await expect(stageSheet.getByText(name)).toBeVisible({ timeout: 10000 });
      await stageSheet.getByText(name).click();
      await authenticatedPage.waitForTimeout(300);

      const detailSheet = authenticatedPage.locator('[role="dialog"]').filter({ hasText: `ID: ${rule.id}` });
      await expect(detailSheet).toBeVisible({ timeout: 5000 });

      const editLink = detailSheet.getByText('在原页面编辑').locator('..');
      const href = await editLink.getAttribute('href') ?? '';
      expect(href).toContain('/rules/header');
      expect(href).toContain(`edit_rule_id=${rule.id}`);
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('RuleDetailSheet closes on Escape', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'mail', action: 'reject' });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'mail');

      const stageSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(stageSheet).toBeVisible({ timeout: 5000 });
      await stageSheet.getByText(name).click();
      await authenticatedPage.waitForTimeout(300);

      const detailSheet = authenticatedPage.locator('[role="dialog"]').filter({ hasText: name });
      await expect(detailSheet).toBeVisible({ timeout: 5000 });
      await authenticatedPage.keyboard.press('Escape');
      await expect(detailSheet).not.toBeVisible({ timeout: 3000 });
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });
});

// ─── Enable / disable from RuleDetailSheet ───────────────────────────────────

test.describe('Rule Pipeline Overview — enable/disable from RuleDetailSheet', () => {
  test('disabling rule from RuleDetailSheet updates API state', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'mail', action: 'reject', is_active: true });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'mail');

      const stageSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(stageSheet).toBeVisible({ timeout: 5000 });
      await expect(stageSheet.getByText(name)).toBeVisible({ timeout: 10000 });
      await stageSheet.getByText(name).click();
      await authenticatedPage.waitForTimeout(300);

      const detailSheet = authenticatedPage.locator('[role="dialog"]').filter({ hasText: name });
      await expect(detailSheet).toBeVisible({ timeout: 5000 });

      await detailSheet.getByRole('button', { name: /禁用/ }).click();
      await expect(detailSheet.getByRole('button', { name: /启用/ })).toBeVisible({ timeout: 5000 });

      const checkResp = await api.get(`/unified-rules/${rule.id}`);
      const updated = await checkResp.json();
      expect(updated.is_active).toBe(false);
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });

  test('re-enabling rule from RuleDetailSheet updates API state', async ({ authenticatedPage, request }) => {
    const { api, rule, name } = await createActionRule(request, { stage: 'mail', action: 'reject', is_active: false });

    try {
      await authenticatedPage.goto(PAGE_URL, { waitUntil: 'networkidle' });
      await clickStageNode(authenticatedPage, 'mail');

      const stageSheet = authenticatedPage.locator('[role="dialog"]');
      await expect(stageSheet).toBeVisible({ timeout: 5000 });
      await expect(stageSheet.getByText(name)).toBeVisible({ timeout: 10000 });
      await stageSheet.getByText(name).click();
      await authenticatedPage.waitForTimeout(300);

      const detailSheet = authenticatedPage.locator('[role="dialog"]').filter({ hasText: name });
      await expect(detailSheet).toBeVisible({ timeout: 5000 });

      await detailSheet.getByRole('button', { name: /启用/ }).click();
      await expect(detailSheet.getByRole('button', { name: /禁用/ })).toBeVisible({ timeout: 5000 });

      const checkResp = await api.get(`/unified-rules/${rule.id}`);
      const updated = await checkResp.json();
      expect(updated.is_active).toBe(true);
    } finally {
      await api.delete(`/unified-rules/${rule.id}`);
    }
  });
});

// ─── Sidebar navigation ───────────────────────────────────────────────────────

test.describe('Rule Pipeline Overview — sidebar navigation', () => {
  test('规则总览 is visible under 规则管理 sidebar group', async ({ page }) => {
    // 规则管理 is a requiresAdvancedRules group; ?advance opts into it (the
    // login checkbox was dropped in the 2FA refactor; see login/page.tsx).
    await page.goto('/zh/login?advance');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('admin123');
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    await page.goto(PAGE_URL, { waitUntil: 'networkidle' });
    await expect(page.locator('text=规则管理').first()).toBeVisible({ timeout: 10000 });

    await expect(page.locator('nav').filter({ hasText: '规则总览' }).getByText('规则总览').first()).toBeVisible({ timeout: 5000 });
    // Individual stage pages (mail, rcpt, tag) are NOT in the sidebar nav
    // (nav items render as <button>, not <a>, so we check by text absence)
    await expect(page.locator('nav').getByText('MAIL FROM')).not.toBeVisible();
    await expect(page.locator('nav').getByText('RCPT TO')).not.toBeVisible();
    await expect(page.locator('nav').getByText('标签规则')).not.toBeVisible();
    // Route rules IS now a first-class sidebar entry — "投递路由" button should be visible
    await expect(page.locator('nav').getByText('投递路由').first()).toBeVisible({ timeout: 5000 });
  });

  test('stage detail pages are still accessible by direct URL', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/rules/mail', { waitUntil: 'networkidle' });
    await expect(authenticatedPage).not.toHaveURL(/login/, { timeout: 5000 });
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
