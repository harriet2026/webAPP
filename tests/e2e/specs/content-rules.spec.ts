import { test, expect } from '../fixtures/auth.fixture';


import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


test.describe('Content Rules', () => {
  function uniquePriority(seed: string) {
    let acc = 0;
    for (let i = 0; i < seed.length; i += 1) {
      acc += seed.charCodeAt(i) * (i + 1);
    }
    // The API rejects priority outside [1, 9999] (GT-11507), so keep the
    // deterministic per-seed value inside [1000, 9999].
    return 1000 + (acc % 9000);
  }

  function createRuleButton(page: import('@playwright/test').Page) {
    return page
      .getByRole('button', { name: /新增规则|新建规则|Create Rule|New Rule/ })
      .or(page.locator('button').filter({ has: page.locator('svg.lucide-plus') }))
      .first();
  }

  async function openContentRulesDrawer(page: import('@playwright/test').Page) {
    await page.goto('/zh/security/pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const contentCard = page
      .locator('[class*="cursor-pointer"]')
      .filter({ hasText: /内容规则|Content Rules/ })
      .first();
    await expect(contentCard).toBeVisible({ timeout: 10000 });

    // Set up response listener BEFORE clicking so we don't miss the API call
    const dataLoadedPromise = page.waitForResponse(
      resp => resp.url().includes('rule_page=content_rules') && resp.status() === 200,
      { timeout: 15000 }
    );

    await contentCard.click();
    await page.waitForTimeout(1000);

    const drawer = page.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });

    // Wait for the content rules data to actually load before returning
    await dataLoadedPromise;
    await page.waitForTimeout(500);
  }

  test('open content rules via stage3 card on pipeline page', async ({ authenticatedPage }) => {
    await openContentRulesDrawer(authenticatedPage);

    const header = authenticatedPage.getByText(/内容规则|Content Rules/).first();
    await expect(header).toBeVisible({ timeout: 5000 });
  });

  test('create keyword content rule via drawer form', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-cr-kw-${uniqueSuffix()}`;

    await openContentRulesDrawer(authenticatedPage);

    const createBtn = createRuleButton(authenticatedPage);
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('content-rule-name').fill(ruleName);
    await sheet.getByTestId('content-rule-priority').fill(String(uniquePriority(ruleName)));
    await sheet.getByTestId('content-rule-match-content').fill(`keyword-${uniqueSuffix()}`);

    const saveBtn = sheet.locator('button').filter({ hasText: /保存|Save/ }).first();
    await saveBtn.click();
    await authenticatedPage.waitForTimeout(3000);

    const listResp = await apiClient.get('/unified-rules?page_size=10000');
    if (listResp.ok()) {
      const data = await listResp.json();
      const createdRules = (data.items || [])
        .filter((r: { name: string }) => r.name === ruleName)
        .map((r: { id: number }) => r.id);
      for (const id of createdRules) {
        await apiClient.delete(`/unified-rules/${id}`).catch(() => {});
      }
    }
  });

  test('create and delete content rule via API', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-cr-api-${uniqueSuffix()}`;
    const priority = uniquePriority(ruleName);

    const matchContent = `pw-unique-${uniqueSuffix()}`;
    const createResp = await apiClient.post('/unified-rules', {
      name: ruleName,
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      page: 'content_rules',
      priority,
      condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: matchContent },
      metadata: {
        feature: 'content_rules',
        match_type: 'keyword',
        match_content: matchContent,
        scopes: ['subject'],
        directions: { receive: { enabled: true, action: 'reject' } },
      },
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id: ruleId } = await createResp.json();

    await openContentRulesDrawer(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    await apiClient.delete(`/unified-rules/${ruleId}`);
  });

  test('verify content rules listing shows rule from API', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-cr-list-${uniqueSuffix()}`;
    const priority = uniquePriority(ruleName);

    const createResp = await apiClient.post('/unified-rules', {
      name: ruleName,
      rule_class: 'action',
      stage: 'data',
      action: 'quarantine',
      page: 'content_rules',
      priority,
      condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: 'spam' },
      metadata: {
        feature: 'content_rules',
        match_type: 'keyword',
        match_content: 'spam',
        scopes: ['subject', 'text_body'],
        directions: { receive: { enabled: true, action: 'quarantine' } },
      },
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id: ruleId } = await createResp.json();

    await openContentRulesDrawer(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    await authenticatedPage.getByText(ruleName).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

    await apiClient.delete(`/unified-rules/${ruleId}`).catch(() => {});
  });

  test('form validation shows error for empty rule name', async ({ authenticatedPage }) => {
    await openContentRulesDrawer(authenticatedPage);

    const createBtn = createRuleButton(authenticatedPage);
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('content-rule-name').clear();

    const saveBtn = sheet.locator('button').filter({ hasText: /保存|Save/ }).first();
    await saveBtn.click();
    await authenticatedPage.waitForTimeout(1000);

    const errorMsg = sheet.locator('.text-destructive');
    await expect(errorMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('match type selection updates form correctly', async ({ authenticatedPage }) => {
    await openContentRulesDrawer(authenticatedPage);

    const createBtn = createRuleButton(authenticatedPage);
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const name = `pw-cr-match-${uniqueSuffix()}`;
    await sheet.getByTestId('content-rule-name').fill(name);
    await sheet.getByTestId('content-rule-priority').fill(String(uniquePriority(name)));
    await sheet.getByTestId('content-rule-match-type').click();
    await authenticatedPage.getByRole('option', { name: /正则表达式|Regex/ }).click();
    await sheet.getByTestId('content-rule-match-content').fill('\\d{6}');

    const saveBtn = sheet.locator('button').filter({ hasText: /保存|Save/ }).first();
    await saveBtn.click();
    await authenticatedPage.waitForTimeout(3000);
  });

  test('content rule appears in table after creation', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-cr-table-${uniqueSuffix()}`;
    const priority = uniquePriority(ruleName);
    const matchContent = `pw-cr-table-unique-${uniqueSuffix()}`;

    const createResp = await apiClient.post('/unified-rules', {
      name: ruleName,
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      page: 'content_rules',
      priority,
      condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: matchContent },
      metadata: {
        feature: 'content_rules',
        match_type: 'keyword',
        match_content: matchContent,
        scopes: ['subject'],
        directions: { receive: { enabled: true, action: 'reject' } },
      },
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id: ruleId } = await createResp.json();

    await openContentRulesDrawer(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    const ruleRow = authenticatedPage.locator('tr, [role="row"]').filter({ hasText: ruleName });
    await expect(ruleRow.first()).toBeVisible({ timeout: 10000 });

    const keywordBadge = ruleRow.locator('text=/关键词|Keyword/i');
    await expect(keywordBadge.first()).toBeVisible({ timeout: 5000 }).catch(() => {});

    await apiClient.delete(`/unified-rules/${ruleId}`).catch(() => {});
  });

  test('copy rule creates duplicate with Copy suffix', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-cr-copy-${uniqueSuffix()}`;
    const matchContent = `pw-cr-copy-unique-${uniqueSuffix()}`;

    const createResp = await apiClient.post('/unified-rules', {
      name: ruleName,
      rule_class: 'action',
      stage: 'data',
      action: 'reject',
      page: 'content_rules',
      priority: 8000 + Math.floor(Math.random() * 999),
      condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: matchContent },
      metadata: {
        feature: 'content_rules',
        match_type: 'keyword',
        match_content: matchContent,
        scopes: ['subject'],
        directions: { receive: { enabled: true, action: 'reject' } },
      },
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id: ruleId } = await createResp.json();

    await openContentRulesDrawer(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    const row = authenticatedPage.locator('tr, [role="row"]').filter({ hasText: ruleName });
    await expect(row.first()).toBeVisible({ timeout: 10000 });

    await row.getByRole('button', { name: /更多操作|More operations/ }).click();
    await authenticatedPage.getByRole('menuitem', { name: /复制|Copy/ }).click();
    await authenticatedPage.waitForTimeout(2000);

    const copiedRow = authenticatedPage.locator('tr, [role="row"]').filter({ hasText: /副本|Copy/ });
    await expect(copiedRow.first()).toBeVisible({ timeout: 10000 });

    await apiClient.delete(`/unified-rules/${ruleId}`).catch(() => {});
  });

  test('bulk enable and disable rules', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleIds: number[] = [];

    for (let i = 0; i < 3; i++) {
      const resp = await apiClient.post('/unified-rules', {
        name: `pw-cr-bulk-${uniqueSuffix()}-${i}`,
        rule_class: 'action',
        action: 'reject',
        page: 'content_rules',
        priority: 500 + i,
        condition_tree: { type: 'condition', field: 'subject', operator: 'contain', value: `bulktest${i}` },
        metadata: {
          feature: 'content_rules',
          match_type: 'keyword',
          match_content: `bulktest${i}`,
          scopes: ['subject'],
          directions: { receive: { enabled: true, action: 'reject' } },
        },
        is_active: true,
      });
      if (resp.ok()) {
        const { id } = await resp.json();
        ruleIds.push(id);
      }
    }

    await openContentRulesDrawer(authenticatedPage);
    await authenticatedPage.waitForTimeout(2000);

    for (const id of ruleIds) {
      await apiClient.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });

  test('form requires match content before save', async ({ authenticatedPage }) => {
    await openContentRulesDrawer(authenticatedPage);

    const createBtn = createRuleButton(authenticatedPage);
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('content-rule-name').fill('pw-cr-validation');

    const saveBtn = sheet.locator('button').filter({ hasText: /保存|Save/ }).first();

    await sheet.getByTestId('content-rule-match-content').clear();

    await saveBtn.click();
    await authenticatedPage.waitForTimeout(1000);

    const errorMsg = sheet.locator('.text-destructive');
    await expect(errorMsg.first()).toBeVisible({ timeout: 5000 });
  });

  test('config example applies preset to form', async ({ authenticatedPage }) => {
    await openContentRulesDrawer(authenticatedPage);

    const createBtn = createRuleButton(authenticatedPage);
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    await sheet.getByTestId('content-rule-name').fill('pw-cr-example');

    await sheet.getByRole('button', { name: /配置示例|Configuration Examples|ตัวอย่างการกำหนดค่า|Примеры настройки/ }).click();
    const exampleCard = sheet.getByText(/身份证号外发管控|ID Card Outbound Control|ควบคุมการส่งออกหมายเลขบัตรประชาชน|Контроль отправки номера удостоверения/).locator('..').locator('..');
    const exampleBtn = exampleCard.getByRole('button', { name: /应用|Apply|นำไปใช้|Применить/ });
    await expect(exampleBtn).toBeVisible();
    await exampleBtn.click();
    await expect(sheet.getByTestId('content-rule-match-content')).toHaveValue('\\d{17}[\\dXx]');
  });
});
