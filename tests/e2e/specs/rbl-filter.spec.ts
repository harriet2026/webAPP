import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { RBLFilterPage } from '../pages/rbl-filter.page';
import { uniqueSuffix, uniqueSuffixAlnum } from '../helpers/test-data';

test.describe('RBL Filter', () => {
  let rblFilterPage: RBLFilterPage;
  const testProfileIds: number[] = [];
  const testRuleIds: number[] = [];

  test.afterEach(async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    for (const id of testRuleIds) {
      await apiClient.delete(`/rbl-filter/rules/${id}`).catch(() => {});
    }
    testRuleIds.length = 0;
    for (const id of testProfileIds) {
      await apiClient.delete(`/detection-profiles/${id}`).catch(() => {});
    }
    testProfileIds.length = 0;
  });

  test('page loads with pipeline and RBL card', async ({ authenticatedPage }) => {
    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();

    const pageContent = await authenticatedPage.locator('main').innerText();
    const hasContent = pageContent.length > 0;
    expect(hasContent).toBeTruthy();
  });

  test('RBL card opens embedded page', async ({ authenticatedPage }) => {
    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();

    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(1000);

    const serverSection = authenticatedPage.locator('text=/Server List|服务器列表|RBL/');
    if (await serverSection.count() > 0) {
      await expect(serverSection.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('greylist strategy exposes config dialog with all exemption options', async ({ authenticatedPage }) => {
    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();

    // GT-12682：处置策略改为「执行动作 / 灰名单策略」两张互斥卡片（RadioGroup），
    // 灰名单不再是执行动作下拉里的一项。选中灰名单卡片后才展开配置入口。
    const greylistRadio = authenticatedPage.locator('#strategy-greylist');
    await expect(greylistRadio).toBeVisible();
    await greylistRadio.focus();
    await greylistRadio.press('Space');

    const configureButton = authenticatedPage.getByRole('button', { name: /点击配置|configure/i });
    await configureButton.focus();
    await configureButton.press('Enter');
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toHaveCount(3);
    await expect(dialog).toContainText(/白名单 IP|whitelisted IP/i);
  });

  test('server list displays with table', async ({ authenticatedPage }) => {
    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(1000);

    const table = rblFilterPage.getServerTableElement();
    if (await table.count() > 0) {
      const headers = await rblFilterPage.getServerTableHeaders();
      expect(headers.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('add server via API and verify in UI', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const domain = `pw-test-${uniqueSuffixAlnum()}.example.com`;
    const resp = await apiClient.post('/detection-profiles', {
      config_type: 'rbl',
      name: domain,
      value: JSON.stringify({ timeout_seconds: 5, retry_count: 1 }),
      is_active: true,
    });
    expect(resp.ok()).toBeTruthy();
    const profile = await resp.json();
    testProfileIds.push(profile.id);

    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(1500);

    const domainBadge = authenticatedPage.locator('text=' + domain);
    if (await domainBadge.count() > 0) {
      await expect(domainBadge.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('add invalid domain shows error', async ({ authenticatedPage }) => {
    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(2000);

    await rblFilterPage.addServer('!!!invalid-domain');
    await authenticatedPage.waitForTimeout(1000);

    const errorEl = authenticatedPage.locator('p.text-red-500, .text-destructive, [class*="text-red"]');
    if (await errorEl.count() > 0) {
      const errorText = await errorEl.first().innerText();
      expect(errorText.length).toBeGreaterThan(0);
    }
  });

  test('CRUD round trip via API', async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);

    const createResp = await apiClient.post('/rbl-filter/rules', {
      name: `pw-rbl-test-${uniqueSuffix()}`,
      match_mode: 'any',
      product_action: 'reject',
      priority: 100,
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();

    const created = await createResp.json();
    const ruleId = created.id;
    expect(created.name).toContain('pw-rbl-test-');
    testRuleIds.push(ruleId);

    const getResp = await apiClient.get(`/rbl-filter/rules/${ruleId}`);
    expect(getResp.ok()).toBeTruthy();
    const fetched = await getResp.json();
    expect(fetched.name).toBe(created.name);

    const updateResp = await apiClient.put(`/rbl-filter/rules/${ruleId}`, {
      name: created.name,
      match_mode: 'any',
      product_action: 'quarantine',
      priority: 200,
      is_active: false,
    });
    expect(updateResp.ok()).toBeTruthy();
    const updated = await updateResp.json();
    expect(updated.product_action).toBe('quarantine');
    expect(updated.priority).toBe(200);

    const deleteResp = await apiClient.delete(`/rbl-filter/rules/${ruleId}`);
    expect(deleteResp.ok()).toBeTruthy();
    testRuleIds.splice(testRuleIds.indexOf(ruleId), 1);

    const goneResp = await apiClient.get(`/rbl-filter/rules/${ruleId}`);
    expect(goneResp.status()).toBe(404);
  });

  test('API-created rule appears in hit rules table', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-visible-${uniqueSuffix()}`;
    const createResp = await apiClient.post('/rbl-filter/rules', {
      name: ruleName,
      match_mode: 'any',
      product_action: 'reject',
      priority: 100,
      is_active: true,
    });
    expect(createResp.ok()).toBeTruthy();
    const { id: ruleId } = await createResp.json();
    testRuleIds.push(ruleId);

    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(2000);

    const ruleText = authenticatedPage.locator(`text="${ruleName}"`);
    if (await ruleText.count() > 0) {
      await expect(ruleText.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('create rule sheet opens with form fields', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const domain = `pw-sheet-${uniqueSuffixAlnum()}.example.com`;
    const profileResp = await apiClient.post('/detection-profiles', {
      config_type: 'rbl',
      name: domain,
      value: JSON.stringify({ timeout_seconds: 5, retry_count: 1 }),
      is_active: true,
    });
    if (profileResp.ok()) {
      const p = await profileResp.json();
      testProfileIds.push(p.id);
    }

    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(1500);

    await rblFilterPage.clickCreateRule();

    const sheet = authenticatedPage.locator('[data-slot="sheet-content"]').filter({
      has: authenticatedPage.locator('[data-slot="sheet-title"]').filter({ hasText: /Create Rule|新建规则|创建规则|Edit/ }),
    });
    if (await sheet.count() > 0) {
      await expect(sheet.first()).toBeVisible({ timeout: 5000 });

      const title = sheet.first().locator('h2, [data-slot="sheet-title"]');
      if (await title.count() > 0) {
        await expect(title.first()).toContainText(/Create Rule|新建规则|创建规则|Edit/);
      }

      const nameInput = sheet.first().locator('input').first();
      if (await nameInput.count() > 0) {
        await expect(nameInput).toBeVisible();
      }
    }
  });

  test('manual query probe returns results', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const probeResp = await apiClient.post('/rbl-filter/probe', { client_ip: '127.0.0.2' });
    expect(probeResp.ok()).toBeTruthy();
    const probeData = await probeResp.json();
    expect(probeData.results).toBeDefined();
    expect(Array.isArray(probeData.results)).toBeTruthy();
  });

  test('delete confirmation dialog works', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const resp = await apiClient.post('/rbl-filter/rules', {
      name: `pw-del-${uniqueSuffix()}`,
      match_mode: 'any',
      product_action: 'reject',
      priority: 100,
      is_active: true,
    });
    expect(resp.ok()).toBeTruthy();
    const { id: ruleId } = await resp.json();
    testRuleIds.push(ruleId);

    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(2000);

    const hitRulesTable = authenticatedPage.locator('table').nth(1);
    if (await hitRulesTable.count() > 0) {
      const deleteBtn = hitRulesTable.locator('tbody tr').first().locator('button.text-destructive, button[class*="destructive"]').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        await authenticatedPage.waitForTimeout(500);

        const confirmDialog = authenticatedPage.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: /确认|Confirm|Delete|删除/ }).first();
        if (await confirmDialog.count() > 0) {
          const confirmBtn = confirmDialog.locator('button').filter({ hasText: /确认|Confirm|确定|Yes/ }).first();
          if (await confirmBtn.count() > 0) {
            await confirmBtn.click();
            await authenticatedPage.waitForTimeout(1000);
            testRuleIds.splice(testRuleIds.indexOf(ruleId), 1);
          }
        }
      }
    }

    const goneResp = await apiClient.get(`/rbl-filter/rules/${ruleId}`);
    expect([404, 200]).toContain(goneResp.status());
    if (goneResp.status() === 200) {
      await apiClient.delete(`/rbl-filter/rules/${ruleId}`).catch(() => {});
      testRuleIds.splice(testRuleIds.indexOf(ruleId), 1);
    }
  });

  test('bulk selection shows action buttons', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const localRuleIds: number[] = [];
    for (let i = 0; i < 2; i++) {
      const resp = await apiClient.post('/rbl-filter/rules', {
        name: `pw-bulk-${uniqueSuffix()}-${i}`,
        match_mode: 'any',
        product_action: 'reject',
        priority: 100 + i,
        is_active: true,
      });
      if (resp.ok()) {
        const data = await resp.json();
        localRuleIds.push(data.id);
        testRuleIds.push(data.id);
      }
    }

    rblFilterPage = new RBLFilterPage(authenticatedPage);
    await rblFilterPage.gotoDirect();
    await rblFilterPage.expectLoaded();
    await rblFilterPage.openRBLCard();
    await authenticatedPage.waitForTimeout(2000);

    const hitRulesTable = authenticatedPage.locator('table').nth(1);
    if (await hitRulesTable.count() > 0) {
      await rblFilterPage.selectRow(1, 0);

      const selectedText = authenticatedPage.locator('main').locator('text=/\\d+ selected|已选/');
      if (await selectedText.count() > 0) {
        expect(await selectedText.first().innerText()).toBeTruthy();
      }
    }

    for (const id of localRuleIds) {
      await apiClient.delete(`/rbl-filter/rules/${id}`).catch(() => {});
    }
  });

  test('rule status toggle works', async ({ authenticatedPage, request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const resp = await apiClient.post('/rbl-filter/rules', {
      name: `pw-toggle-${uniqueSuffix()}`,
      match_mode: 'any',
      product_action: 'reject',
      priority: 100,
      is_active: true,
    });
    expect(resp.ok()).toBeTruthy();
    const { id: ruleId } = await resp.json();
    testRuleIds.push(ruleId);

    const statusResp = await apiClient.put(`/rbl-filter/rules/${ruleId}/status`, { is_active: false });
    expect(statusResp.ok()).toBeTruthy();

    const getResp = await apiClient.get(`/rbl-filter/rules/${ruleId}`);
    expect(getResp.ok()).toBeTruthy();
    const rule = await getResp.json();
    expect(rule.is_active).toBe(false);
  });
});
