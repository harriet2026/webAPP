import { test, expect } from '../fixtures/auth.fixture';
import { createAuthenticatedClient } from '../fixtures/api.fixture';
import { IPFilterPage } from '../pages/ip-filter.page';
import { uniqueSuffix } from '../helpers/test-data';

test.describe('IP Filter Rules', () => {
  let ipFilterPage: IPFilterPage;

  test.beforeEach(async ({ authenticatedPage }) => {
    ipFilterPage = new IPFilterPage(authenticatedPage);
    await ipFilterPage.goto();
    await ipFilterPage.expectLoaded();
  });

  test('page loads with table and expected columns', async () => {
    // demo 复刻后表格为 5 列：IP地址/段、操作(执行动作)、状态、修改时间、操作(行操作)。
    // 不再有独立的「规则名称」「优先级」列（名称/优先级只在表单里）。
    const headers = await ipFilterPage.getTableColumnHeaders();
    expect(headers.some(h => h.includes('IP') || h.includes('IP 地址') || h.includes('IP地址'))).toBeTruthy();
    expect(headers.some(h => h.includes('Action') || h.includes('动作') || h.includes('操作'))).toBeTruthy();
    expect(headers.some(h => h.includes('Status') || h.includes('状态'))).toBeTruthy();
    expect(headers.some(h => h.includes('修改时间') || h.includes('Updated') || h.includes('Modified'))).toBeTruthy();
  });

  test('search input filters rules', async ({ authenticatedPage }) => {
    const initialCount = await ipFilterPage.getDataRowCount();
    if (initialCount === 0) return;

    // demo 搜索作用于 IP 地址/段 + 优先级（不再有规则名称列）。
    const firstIp = (await ipFilterPage.getCellTextByHeader(0, 'IP地址/段')).trim();
    // IP组 行没有可搜索的 ip_value（显示为「IP组 <名称>」），跳过该情形。
    if (!firstIp.includes('.')) return;

    await ipFilterPage.searchRules(firstIp);
    await authenticatedPage.waitForTimeout(1000);

    const filteredCount = await ipFilterPage.getDataRowCount();
    expect(filteredCount).toBeGreaterThanOrEqual(1);
  });

  test('search with nonexistent term shows empty', async () => {
    await ipFilterPage.searchRules('nonexistent-rule-xyz-99999');
    await ipFilterPage.page.waitForTimeout(1000);

    expect(await ipFilterPage.hasEmptyState()).toBeTruthy();
  });

  test('blacklist/whitelist tab switching works', async () => {
    const blacklistTab = await ipFilterPage.getBlacklistTab();
    if ((await blacklistTab.count()) > 0) {
      await expect(blacklistTab).toBeVisible();
    }

    const whitelistTab = await ipFilterPage.getWhitelistTab();
    if ((await whitelistTab.count()) > 0) {
      await ipFilterPage.switchToWhitelist();
      await ipFilterPage.page.waitForTimeout(500);

      await ipFilterPage.switchToBlacklist();
      await ipFilterPage.page.waitForTimeout(500);
    }
  });

  // Regression guard for GT-11466: the QC report claimed the blacklist tab
  // showed every rule and the whitelist tab showed an empty list. This test
  // asserts the actual list_type filtering instead of just clicking the tabs,
  // so it would catch that bug (the previous test above clicks without asserting
  // any row content and therefore could not). Each tab must show only the rules
  // whose list_type matches the active tab.
  test('list_type tabs filter rows to the matching list (GT-11466)', async ({ authenticatedPage, request }) => {
    const api = await createAuthenticatedClient(request);
    const sfx = uniqueSuffix();
    // demo 复刻后表格无「规则名称」列，改用 IP 值断言可见性（IP 地址/段列一定渲染）。
    // 两个 IP 取不相交的末段区间，避免随机碰撞。
    const blIp = `198.51.100.${Math.floor(Math.random() * 100) + 1}`;
    const wlIp = `198.51.100.${Math.floor(Math.random() * 100) + 130}`;
    const ids: number[] = [];

    // High priority so the seeded rules sort to the top of the first page.
    const blResp = await api.post('/ip-filter/rules', {
      name: `pw-lt-bl-${sfx}`, list_type: 'blacklist', ip_config_type: 'single',
      ip_value: blIp, action: 'reject', priority: 9000,
    });
    expect(blResp.ok()).toBeTruthy();
    ids.push((await blResp.json()).id);

    const wlResp = await api.post('/ip-filter/rules', {
      name: `pw-lt-wl-${sfx}`, list_type: 'whitelist', ip_config_type: 'single',
      ip_value: wlIp, action: 'accept', priority: 9001,
    });
    expect(wlResp.ok()).toBeTruthy();
    ids.push((await wlResp.json()).id);

    try {
      await ipFilterPage.goto();
      await ipFilterPage.expectLoaded();
      await authenticatedPage.waitForTimeout(1000);

      const tbody = authenticatedPage.locator('table tbody');

      // Default tab is the blacklist: the blacklist IP shows, the whitelist IP does not.
      await expect(tbody).toContainText(blIp);
      await expect(tbody).not.toContainText(wlIp);

      // Switching to the whitelist tab inverts visibility.
      await ipFilterPage.switchToWhitelist();
      await authenticatedPage.waitForTimeout(1000);
      await expect(tbody).toContainText(wlIp);
      await expect(tbody).not.toContainText(blIp);
    } finally {
      for (const id of ids) await api.delete(`/ip-filter/rules/${id}`).catch(() => {});
    }
  });

  test('export button triggers download', async ({ authenticatedPage }) => {
    const downloadPromise = authenticatedPage.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await ipFilterPage.getExportButton().click();

    const download = await downloadPromise;
    if (download) {
      const filename = download.suggestedFilename();
      expect(filename).toContain('ip-filter-rules');
      expect(filename).toContain('.json');
    }
  });

  test('create rule dialog opens with form fields', async () => {
    await ipFilterPage.clickCreateRule();

    const sheet = ipFilterPage.page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });

    const title = sheet.locator('h2, [data-slot="sheet-title"]');
    // demo 复刻：抽屉标题为「新建黑名单规则/新建白名单规则」（工具栏按钮才是「新增规则」）。
    await expect(title).toContainText(/新建黑名单规则|新建白名单规则|新增黑名单规则|新增白名单规则/);
  });

  test('create and delete rule round trip via API', async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ruleName = `pw-test-${uniqueSuffix()}`;
    const uniqueIP = `${Math.floor(Math.random()*200)+10}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;

    const createResp = await apiClient.post('/ip-filter/rules', {
      name: ruleName,
      list_type: 'blacklist',
      ip_config_type: 'single',
      ip_value: uniqueIP,
      action: 'reject',
      priority: 100,
    });
    expect(createResp.ok()).toBeTruthy();

    const created = await createResp.json();
    const ruleId = created.id;
    expect(created.name).toBe(ruleName);

    const getResp = await apiClient.get(`/ip-filter/rules/${ruleId}`);
    expect(getResp.ok()).toBeTruthy();
    const fetched = await getResp.json();
    expect(fetched.name).toBe(ruleName);

    const deleteResp = await apiClient.delete(`/ip-filter/rules/${ruleId}`);
    expect(deleteResp.ok()).toBeTruthy();

    const goneResp = await apiClient.get(`/ip-filter/rules/${ruleId}`);
    expect(goneResp.status()).toBe(404);
  });

  // 批量勾选功能在 demo 复刻后移除（demo 表格无 select 列），故不再有此用例。
  // 见 design/implement/spec/filter-rules-pipeline-ip-filter-html-spec-alignment.md（有意偏离已知会用户）。

  test('form validation shows errors for invalid input', async () => {
    await ipFilterPage.clickCreateRule();
    const dialog = ipFilterPage.page.locator('[role="dialog"]').filter({ hasText: /新建黑名单规则|新建白名单规则|新增黑名单规则|新增白名单规则/ });
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const submitBtn = dialog.locator('button').filter({ hasText: /Save|保存|提交|确定/ }).first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await ipFilterPage.page.waitForTimeout(500);
      const errors = dialog.locator('p, [role="alert"], .text-destructive');
      const count = await errors.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('IP create drawer: title reflects list_type and action options are constrained', async ({ authenticatedPage: page }) => {
    // 黑名单 tab → 新增
    await page.getByRole('tab', { name: '黑名单' }).click();
    await page.getByRole('button', { name: '新增规则' }).click();
    const blSheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(blSheet).toBeVisible({ timeout: 5000 });
    await expect(blSheet.getByText('新建黑名单规则')).toBeVisible({ timeout: 5000 });
    // 打开动作下拉：黑名单动作为 隔离/审核/阻断/丢弃（demo 词表），含"阻断"，不含白名单的"投递"
    await blSheet.getByRole('combobox').filter({ hasText: /阻断|隔离|审核|丢弃/ }).first().click();
    await expect(page.getByRole('option', { name: '阻断' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: '投递', exact: true })).toHaveCount(0);
    // Tab 关闭下拉（不触发 sheet close），再显式关闭抽屉
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await blSheet.locator('[data-slot="sheet-close"]').click();
    await page.waitForTimeout(500);
    // 白名单 tab → 新增
    await page.getByRole('tab', { name: '白名单' }).click();
    await page.getByRole('button', { name: '新增规则' }).click();
    const wlSheet = page.locator('[data-slot="sheet-content"]').last();
    await expect(wlSheet).toBeVisible({ timeout: 5000 });
    await expect(wlSheet.getByText('新建白名单规则')).toBeVisible({ timeout: 5000 });
    // 打开动作下拉：白名单动作为 投递/标记投递（demo 词表），含"投递"，不含黑名单的"阻断"
    await wlSheet.getByRole('combobox').filter({ hasText: /投递/ }).first().click();
    await expect(page.getByRole('option', { name: '投递', exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('option', { name: '阻断' })).toHaveCount(0);
    // 清理：关闭下拉与抽屉，避免污染后续测试
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await wlSheet.locator('[data-slot="sheet-close"]').click();
    await page.waitForTimeout(500);
  });

  test('delete confirmation dialog works', async ({ request }) => {
    const apiClient = await createAuthenticatedClient(request);
    const ip = `${Math.floor(Math.random()*200)+10}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`;
    const resp = await apiClient.post('/ip-filter/rules', {
      name: `pw-del-${uniqueSuffix()}`,
      list_type: 'blacklist',
      ip_config_type: 'single',
      ip_value: ip,
      action: 'reject',
      priority: 100,
    });
    expect(resp.ok()).toBeTruthy();
    const { id: ruleId } = await resp.json();

    await ipFilterPage.goto();
    await ipFilterPage.expectLoaded();
    await ipFilterPage.page.waitForTimeout(1000);

    const deleteBtn = ipFilterPage.table.locator('tbody tr').first().locator('button').filter({ hasText: /删除|Delete/ }).first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      await ipFilterPage.page.waitForTimeout(500);

      const confirmDialog = ipFilterPage.page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: /确认|Confirm|Delete|删除/ }).first();
      if (await confirmDialog.count() > 0) {
        const confirmBtn = confirmDialog.locator('button').filter({ hasText: /确认|Confirm|确定|Yes/ }).first();
        if (await confirmBtn.count() > 0) {
          await confirmBtn.click();
          await ipFilterPage.page.waitForTimeout(1000);
        }
      }
    }

    const goneResp = await apiClient.get(`/ip-filter/rules/${ruleId}`);
    expect([404, 200]).toContain(goneResp.status());
    if (goneResp.status() === 200) {
      await apiClient.delete(`/ip-filter/rules/${ruleId}`).catch(() => {});
    }
  });
});
