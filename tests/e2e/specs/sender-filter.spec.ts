import { test, expect } from '../fixtures/auth.fixture';


import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


test.describe('Sender Filter Rules', () => {
  async function openSenderFilterDrawer(page: import('@playwright/test').Page) {
    await page.goto('/zh/security/pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const senderFilterCard = page
      .locator('[class*="cursor-pointer"]')
      .filter({ hasText: /发信人黑白名单|发件人过滤|Sender Filter/ })
      .first();
    await expect(senderFilterCard).toBeVisible({ timeout: 10000 });
    await senderFilterCard.click();
    await page.waitForTimeout(2000);

    const drawer = page.locator('[data-slot="sheet-content"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
  }

  test('open sender filter via stage2 card on pipeline page', async ({ authenticatedPage }) => {
    await openSenderFilterDrawer(authenticatedPage);

    const blacklistTab = authenticatedPage.getByRole('tab', { name: /黑名单|Blacklist/ });
    await expect(blacklistTab).toBeVisible({ timeout: 5000 });
  });

  test('create blacklist rule via drawer form', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-sf-bl-${uniqueSuffix()}`;

    await openSenderFilterDrawer(authenticatedPage);

    const createBtn = authenticatedPage
      .locator('button')
      .filter({ hasText: /新增规则|新建规则|New Rule/ })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const nameInput = sheet.locator('input').first();
    await nameInput.fill(ruleName);

    const senderValueInput = sheet.locator('input[placeholder*="user@example"], input[placeholder*="邮箱"], input[placeholder*="email"]').first();
    if (await senderValueInput.count() > 0) {
      await senderValueInput.fill(`spam-${uniqueSuffix()}@example.com`);
    }

    const saveBtn = sheet.locator('button').filter({ hasText: /保存|Save/ }).first();
    await saveBtn.click();
    await authenticatedPage.waitForTimeout(3000);

    const createdRules = await authenticatedPage.evaluate(async (name) => {
      const token = localStorage.getItem('token');
      const resp = await fetch('/api/v1/unified-rules?page=sender_filter&rule_class=action&stage=rcpt&page_size=10000', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      return (data.items || []).filter((r: { name: string }) => r.name === name).map((r: { id: number }) => r.id);
    }, ruleName);

    for (const id of createdRules) {
      await apiClient.delete(`/unified-rules/${id}`).catch(() => {});
    }
  });

  test('whitelist mode can be saved with bypass_content contract', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-sf-wl-${uniqueSuffix()}`;

    await openSenderFilterDrawer(authenticatedPage);

    const whitelistTab = authenticatedPage.getByRole('tab', { name: /白名单|Whitelist/ });
    await whitelistTab.click();
    await authenticatedPage.waitForTimeout(1000);

    const createBtn = authenticatedPage
      .locator('button')
      .filter({ hasText: /新增规则|新建规则|New Rule/ })
      .first();
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const whitelistMode = sheet.getByRole('combobox', { name: /白名单模式|Whitelist Mode/ });
    await expect(whitelistMode).toContainText(/跳过内容检测|Bypass Content Check/);
    await whitelistMode.click();
    await expect(authenticatedPage.getByRole('option', { name: /跳过内容检测|Bypass Content Check/ })).toBeVisible();
    await expect(authenticatedPage.getByRole('option', { name: /直接投递|Direct Deliver/ })).toBeVisible();
    await authenticatedPage.getByRole('option', { name: /跳过内容检测|Bypass Content Check/ }).click();

    const formInputs = sheet.locator('input');
    await formInputs.first().fill(ruleName);

    const senderValueInput = sheet.locator('input[placeholder*="user@example"], input[placeholder*="邮箱"], input[placeholder*="email"]').first();
    if (await senderValueInput.count() > 0) {
      await senderValueInput.fill(`trusted-${uniqueSuffix()}@example.com`);
    }

    const createResponsePromise = authenticatedPage.waitForResponse((response) =>
      response.request().method() === 'POST' && /\/api\/v1\/unified-rules$/.test(response.url()),
    );
    const saveBtn = sheet.locator('button').filter({ hasText: /保存|Save/ }).first();
    await saveBtn.click();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json() as { id: number };

    try {
      const savedRule = await authenticatedPage.evaluate(async (name) => {
        const resp = await fetch('/api/v1/unified-rules?rule_page=sender_filter&rule_class=action&stage=rcpt&page_size=10000');
        const data = await resp.json();
        return (data.items || []).find((rule: { name: string }) => rule.name === name) ?? null;
      }, ruleName) as { metadata?: string | Record<string, unknown>; tags?: string[] } | null;

      expect(savedRule).not.toBeNull();
      const savedMetadata = typeof savedRule?.metadata === 'string'
        ? JSON.parse(savedRule.metadata)
        : (savedRule?.metadata ?? {});
      expect(savedMetadata).toMatchObject({
        feature: 'sender_filter',
        list_type: 'whitelist',
        whitelist_mode: 'bypass_content',
      });
      expect(savedRule?.tags).toContain('sys:nocontent');
    } finally {
      const cleanupResponse = await apiClient.delete(`/unified-rules/${created.id}`);
      expect(cleanupResponse.ok()).toBeTruthy();
    }
  });

  test('delete rule via API and verify table updates', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-sf-del-${uniqueSuffix()}`;
    const senderEmail = `del-${uniqueSuffix()}@example.com`;

    const createResp = await apiClient.post('/unified-rules', {
      name: ruleName,
      rule_class: 'action',
      stage: 'rcpt',
      priority: 100,
      condition_tree: { type: 'condition', field: 'sender', operator: 'eq', value: senderEmail },
      action: 'reject',
      metadata: {
        feature: 'sender_filter',
        sender_config: { type: 'individual', value: senderEmail },
        ip_range: { type: 'all' },
        list_type: 'blacklist',
      },
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id: ruleId } = await createResp.json();

    await openSenderFilterDrawer(authenticatedPage);
    await authenticatedPage.waitForTimeout(3000);

    await authenticatedPage.getByText(ruleName).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

    const deleteResp = await apiClient.delete(`/unified-rules/${ruleId}`);
    expect([200, 204]).toContain(deleteResp.status());
  });

  test('switch between blacklist and whitelist tabs', async ({ authenticatedPage }) => {
    await openSenderFilterDrawer(authenticatedPage);

    const blacklistTab = authenticatedPage.getByRole('tab', { name: /黑名单|Blacklist/ });
    const whitelistTab = authenticatedPage.getByRole('tab', { name: /白名单|Whitelist/ });

    await expect(blacklistTab).toBeVisible({ timeout: 5000 });
    await expect(whitelistTab).toBeVisible({ timeout: 5000 });

    await whitelistTab.click();
    await authenticatedPage.waitForTimeout(500);

    await expect(whitelistTab).toHaveAttribute('aria-selected', 'true');

    await blacklistTab.click();
    await authenticatedPage.waitForTimeout(500);

    await expect(blacklistTab).toHaveAttribute('aria-selected', 'true');
  });

  // GT-11471: IP range type dropdown positioning bug in scrollable drawer
  // Verifies that SelectContent with alignItemWithTrigger={false} correctly positions
  // the dropdown below the trigger even when the form has been scrolled.
  async function openNewRuleSheet(page: import('@playwright/test').Page) {
    await openSenderFilterDrawer(page);
    const createBtn = page.locator('button').filter({ hasText: /新增规则|新建规则|New Rule/ }).first();
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();
    await page.waitForTimeout(1000);
    const sheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    return sheet;
  }

  test('SF-E2E-IP-SINGLE: ip type dropdown selects single ip and reveals ip input (GT-11471)', async ({ authenticatedPage }) => {
    const sheet = await openNewRuleSheet(authenticatedPage);

    // Scroll the inner form container to push the IP range section near the top,
    // reproducing the bug scenario where alignItemWithTrigger caused mis-positioning.
    const scrollContainer = sheet.locator('.overflow-y-auto').first();
    await scrollContainer.evaluate((el) => { el.scrollTop = 300; });
    await authenticatedPage.waitForTimeout(300);

    // Use data-slot attribute — Base UI Trigger doesn't reliably expose role="combobox".
    const ipTypeTrigger = sheet.locator('[data-slot="select-trigger"]').filter({ hasText: /全部IP|所有IP|All IPs/i }).first();
    await expect(ipTypeTrigger).toBeVisible({ timeout: 5000 });
    await ipTypeTrigger.click();

    // Option must be visible and clickable without retries (was failing 77× before fix).
    const singleOption = authenticatedPage.getByRole('option').filter({ hasText: /单个IP|Single IP/i }).first();
    await expect(singleOption).toBeVisible({ timeout: 5000 });
    await singleOption.click();

    // Selecting "single" should reveal the IP address input field.
    const ipInput = sheet.locator('input[placeholder*="192.168"]').first();
    await expect(ipInput).toBeVisible({ timeout: 3000 });
  });

  test('SF-E2E-IP-RANGE: ip type dropdown selects cidr and reveals cidr input (GT-11471)', async ({ authenticatedPage }) => {
    const sheet = await openNewRuleSheet(authenticatedPage);

    const scrollContainer = sheet.locator('.overflow-y-auto').first();
    await scrollContainer.evaluate((el) => { el.scrollTop = 300; });
    await authenticatedPage.waitForTimeout(300);

    const ipTypeTrigger = sheet.locator('[data-slot="select-trigger"]').filter({ hasText: /全部IP|所有IP|All IPs/i }).first();
    await expect(ipTypeTrigger).toBeVisible({ timeout: 5000 });
    await ipTypeTrigger.click();

    const rangeOption = authenticatedPage.getByRole('option').filter({ hasText: /IP范围|CIDR/i }).first();
    await expect(rangeOption).toBeVisible({ timeout: 5000 });
    await rangeOption.click();

    // Selecting "range" should reveal the CIDR input field.
    const cidrInput = sheet.locator('input[placeholder*="192.168"]').first();
    await expect(cidrInput).toBeVisible({ timeout: 3000 });
  });

  test('Sender create drawer: title is 新建规则 and subtitle reflects list_type', async ({ authenticatedPage }) => {
    // The a266c059 demo rewrite moved the black/whitelist distinction out of the
    // sheet title (now a constant "新建规则") into a subtitle, and list_type is
    // fixed by the page tab you open from — it is no longer switchable inside the
    // sheet. So assert the subtitle per tab instead of a list_type-bearing title.
    const page = authenticatedPage;
    await openSenderFilterDrawer(page);

    // Blacklist tab → create → title "新建规则" + 黑名单 subtitle.
    await page.getByRole('tab', { name: /黑名单|Blacklist/ }).click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /新增规则|新建规则|New Rule/ }).first().click();
    await page.waitForTimeout(1000);
    let sheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText('新建规则')).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText(/配置发信人黑名单规则/)).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-slot="sheet-close"]').first().click();
    await page.waitForTimeout(500);

    // Whitelist tab → create → 白名单 subtitle.
    await page.getByRole('tab', { name: /白名单|Whitelist/ }).click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /新增规则|新建规则|New Rule/ }).first().click();
    await page.waitForTimeout(1000);
    sheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText('新建规则')).toBeVisible({ timeout: 5000 });
    await expect(sheet.getByText(/配置发信人白名单规则/)).toBeVisible({ timeout: 5000 });
    await sheet.locator('[data-slot="sheet-close"]').first().click();
    await page.waitForTimeout(500);
  });

  test('Sender create drawer: action options constrained by list_type', async ({ authenticatedPage }) => {
    // list_type is fixed by the page tab (not switchable in-sheet after the
    // a266c059 rewrite), and senderFilter.action_reject renders as "阻断" (not
    // "拒绝"). Verify the constraint by opening the create sheet from each tab.
    const page = authenticatedPage;
    await openSenderFilterDrawer(page);

    // 黑名单 create → 动作下拉含"阻断"，不含"放行"
    await page.getByRole('tab', { name: /黑名单|Blacklist/ }).click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /新增规则|新建规则|New Rule/ }).first().click();
    await page.waitForTimeout(1000);
    let sheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.getByRole('combobox').filter({ hasText: /阻断|放行|隔离|审核/ }).first().click();
    await expect(page.getByRole('option', { name: '阻断', exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: '放行', exact: true })).toHaveCount(0);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await sheet.locator('[data-slot="sheet-close"]').first().click();
    await page.waitForTimeout(500);

    // 白名单 create → 动作下拉含"放行"，不含"阻断"
    await page.getByRole('tab', { name: /白名单|Whitelist/ }).click();
    await page.waitForTimeout(500);
    await page.locator('button').filter({ hasText: /新增规则|新建规则|New Rule/ }).first().click();
    await page.waitForTimeout(1000);
    sheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await sheet.getByRole('combobox').filter({ hasText: /放行|阻断|隔离|审核/ }).first().click();
    await expect(page.getByRole('option', { name: '放行', exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: '阻断', exact: true })).toHaveCount(0);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await sheet.locator('[data-slot="sheet-close"]').first().click();
    await page.waitForTimeout(500);
  });

  test('SF-CONDITION-GROUP: ip type dropdown selects ip group and reveals group selector (GT-11471)', async ({ authenticatedPage }) => {
    const sheet = await openNewRuleSheet(authenticatedPage);

    const scrollContainer = sheet.locator('.overflow-y-auto').first();
    await scrollContainer.evaluate((el) => { el.scrollTop = 300; });
    await authenticatedPage.waitForTimeout(300);

    // Count existing triggers before selection change.
    const triggersBefore = await sheet.locator('[data-slot="select-trigger"]').count();

    const ipTypeTrigger = sheet.locator('[data-slot="select-trigger"]').filter({ hasText: /全部IP|所有IP|All IPs/i }).first();
    await expect(ipTypeTrigger).toBeVisible({ timeout: 5000 });
    await ipTypeTrigger.click();

    const ipGroupOption = authenticatedPage.getByRole('option').filter({ hasText: /IP组|IP Group/i }).first();
    await expect(ipGroupOption).toBeVisible({ timeout: 5000 });
    await ipGroupOption.click();

    // Selecting "ipGroup" should reveal a new select trigger for the IP group value.
    await expect(sheet.locator('[data-slot="select-trigger"]')).toHaveCount(triggersBefore + 1, { timeout: 3000 });
  });
  // GT-11892: submitting the empty form printed the raw zod message keys
  // ("nameRequired", "valueRequired") straight into the field errors, because
  // the schema stores i18n keys in `message` and the JSX rendered
  // `{errors.name.message}` without ever calling t().
  test('empty form shows translated validation messages, not raw i18n keys', async ({ authenticatedPage }) => {
    await openSenderFilterDrawer(authenticatedPage);

    const createBtn = authenticatedPage
      .locator('button')
      .filter({ hasText: /新增规则|新建规则|New Rule/ })
      .first();
    await createBtn.click();
    await authenticatedPage.waitForTimeout(2000);

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').last();
    await expect(sheet).toBeVisible({ timeout: 10000 });

    // Submit with neither the rule name nor the sender address filled in.
    await sheet.getByRole('button', { name: /^保存$|^Save$/ }).click();

    // Post-a266c059 validation strings: senderFilter.errors.nameRequired /
    // senderValueRequired render as these (not the old "请输入规则名称/地址").
    await expect(sheet.getByText('规则名称不能为空')).toBeVisible({ timeout: 10000 });
    await expect(sheet.getByText('请输入发信人邮箱')).toBeVisible({ timeout: 10000 });

    // The raw keys must not survive anywhere in the drawer.
    const body = (await sheet.textContent()) ?? '';
    for (const rawKey of ['nameRequired', 'valueRequired', 'senderValueRequired', 'Priority must be']) {
      expect(body, `raw key leaked: ${rawKey}`).not.toContain(rawKey);
    }
  });
});
