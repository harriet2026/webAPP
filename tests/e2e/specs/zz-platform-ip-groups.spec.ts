import type { APIRequestContext } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { ApiClient } from '../fixtures/api.fixture';
import { uniqueSuffix } from '../helpers/test-data';

/**
 * 平台级 IP 组（spec 2026-07-21-platform-ip-group-policy-tab-design）：
 * 平台安全策略页新增「群组策略」tab，system_admin 平台作用域管理
 * tenant_id NULL 的 IP 组，供 IP 黑白名单表达式（ip_groups）引用。
 *
 * 依赖真实后端（:18080 需运行含平台作用域 groups 门禁的 apiserver）。
 * API 断言一律用绝对地址（tests/AGENTS.md：相对路径写请求会被 301 降级成 GET）。
 */

// 平台作用域客户端：登录 admin 但不设 X-Tenant-ID（createAuthenticatedClient
// 会自动代入最低 id 租户，那是租户作用域，这里刻意不用它）。
async function platformClient(request: APIRequestContext) {
  const client = new ApiClient(request);
  await client.login('admin', 'admin123');
  return client;
}

test.describe('平台安全策略 · 群组策略 tab（平台级 IP 组）', () => {
  test('新 tab 渲染平台 IP 组卡片（含平台语义提示条）', async ({ authenticatedPage: page }) => {
    await page.goto('/zh/system/platform-security');
    await page.getByTestId('platform-security-tab-groups').click();
    await expect(page.getByTestId('groups-card')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('groups-platform-scope-hint')).toBeVisible();
    // 平台作用域仅 IP 组：无五类类型切换 tab
    await expect(page.getByTestId('groups-tab-sender')).toHaveCount(0);
    await expect(page.getByTestId('groups-new')).toBeVisible();
  });

  test('建组 → IP黑白名单表达式引用 → 引用中禁删 → 解除引用后可删', async ({ authenticatedPage: page, request }) => {
    const sfx = uniqueSuffix();
    const groupName = `pfip-${sfx}`;
    const api = await platformClient(request);

    // 1) UI 创建平台 IP 组
    await page.goto('/zh/system/platform-security');
    await page.getByTestId('platform-security-tab-groups').click();
    await expect(page.getByTestId('groups-new')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('groups-new').click();
    const drawer = page.getByTestId('group-edit-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByTestId('group-edit-name').fill(groupName);
    await drawer.getByTestId('group-edit-members').fill('10.99.1.0/24\n10.99.2.7');
    await drawer.getByTestId('group-edit-save').click();
    await expect(drawer).toBeHidden({ timeout: 10000 });
    await expect(page.getByText(groupName)).toBeVisible({ timeout: 10000 });

    // 2) 取组的 rule_id（平台作用域 _meta），确认落库为平台组
    const metaResp = await api.get('/unified-rules/_meta/groups?type=ip');
    expect(metaResp.status()).toBe(200);
    const meta = ((await metaResp.json()) as { items: { id: string; label: string; rule_id: number }[] }).items;
    const grp = meta.find((m) => m.label === groupName);
    expect(grp, `platform _meta/groups should list ${groupName}`).toBeTruthy();
    const groupRuleId = grp!.rule_id;

    // 3) API 创建引用该组的 IP 黑名单表达式规则
    const ruleResp = await api.post('/ip-filter/rules', {
      name: `pfip-ref-${sfx}`,
      ip_config_type: 'expression',
      ip_value: '',
      ip_groups: [groupRuleId],
      action: 'reject',
      list_type: 'blacklist',
      priority: 500,
      is_active: true,
    });
    expect(ruleResp.status(), await ruleResp.text()).toBe(201);
    const ipRuleId = ((await ruleResp.json()) as { id: number }).id;

    try {
      // 4) 引用中：删除按钮禁用（referenceCount > 0）
      await page.reload();
      await page.getByTestId('platform-security-tab-groups').click();
      const refCell = page.getByTestId(`groups-reference-count-${groupRuleId}`);
      await expect(refCell).toHaveText('1', { timeout: 15000 });
      await expect(page.getByTestId(`groups-row-delete-${groupRuleId}`)).toBeDisabled();

      // 5) API 直接删除也要被 409 拦（守卫不能只在前端）
      const delBlocked = await api.delete(`/unified-rules/${groupRuleId}`);
      expect(delBlocked.status()).toBe(409);
    } finally {
      // 6) 解除引用后组可删
      const delRule = await api.delete(`/ip-filter/rules/${ipRuleId}`);
      expect(delRule.status()).toBe(204);
    }
    const delGroup = await api.delete(`/unified-rules/${groupRuleId}`);
    expect(delGroup.status()).toBe(204);
  });

  test('作用域边界：平台仅 ip 类型可建；租户不可见平台组', async ({ request }) => {
    const sfx = uniqueSuffix();
    const api = await platformClient(request);

    // 平台作用域建 sender 组 → 400（v1 仅 ip）
    const senderResp = await api.post('/unified-rules', {
      name: `pfsender-${sfx}`,
      rule_class: 'tag',
      stage: 'mail',
      priority: 100,
      page: 'groups',
      tags: [`grp:pfsender-${sfx}`],
      metadata: { group_type: 'sender' },
      condition_tree: { type: 'condition', field: 'sender', operator: 'eq', value: 'x@osg.test' },
    });
    expect(senderResp.status()).toBe(400);

    // 平台建 ip 组成功
    const groupName = `pfscope-${sfx}`;
    const createResp = await api.post('/unified-rules', {
      name: groupName,
      rule_class: 'tag',
      stage: 'onconnect',
      priority: 100,
      page: 'groups',
      tags: [`grp:${groupName}`],
      metadata: { group_type: 'ip' },
      condition_tree: { type: 'condition', field: 'client_ip', operator: 'cidr', value: '10.98.0.0/24' },
    });
    expect(createResp.status(), await createResp.text()).toBe(201);
    const groupRuleId = ((await createResp.json()) as { id: number }).id;

    try {
      // 同名平台组重复创建 → 409（组名全局唯一）
      const dupResp = await api.post('/unified-rules', {
        name: groupName,
        rule_class: 'tag',
        stage: 'onconnect',
        priority: 100,
        page: 'groups',
        tags: [`grp:${groupName}`],
        metadata: { group_type: 'ip' },
        condition_tree: { type: 'condition', field: 'client_ip', operator: 'cidr', value: '10.97.0.0/24' },
      });
      expect(dupResp.status()).toBe(409);

      // 租户作用域（代入最低 id 租户）：组列表与 _meta 均不见平台组
      const tenantsResp = await api.get('/tenants?page_size=500');
      const tenants = (((await tenantsResp.json()) as { items?: { id: number }[] }).items) ?? [];
      const lowest = tenants.slice().sort((a, b) => a.id - b.id)[0];
      expect(lowest, 'dev stack should have at least one tenant').toBeTruthy();
      api.setTenantId(lowest!.id);

      const tenantList = await api.get('/unified-rules?rule_page=groups&rule_class=tag');
      expect(tenantList.status()).toBe(200);
      const tenantRows = ((await tenantList.json()) as { items: { id: number }[] }).items;
      expect(tenantRows.some((r) => r.id === groupRuleId)).toBe(false);

      const tenantMeta = await api.get('/unified-rules/_meta/groups?type=ip');
      expect(tenantMeta.status()).toBe(200);
      const tenantMetaItems = ((await tenantMeta.json()) as { items: { rule_id: number }[] }).items;
      expect(tenantMetaItems.some((m) => m.rule_id === groupRuleId)).toBe(false);

      // 租户建撞平台名的组 → 409
      const tenantDup = await api.post('/unified-rules', {
        name: groupName,
        rule_class: 'tag',
        stage: 'onconnect',
        priority: 100,
        page: 'groups',
        tags: [`grp:${groupName}`],
        metadata: { group_type: 'ip' },
        condition_tree: { type: 'condition', field: 'client_ip', operator: 'cidr', value: '10.96.0.0/24' },
      });
      expect(tenantDup.status()).toBe(409);
    } finally {
      api.setTenantId(null);
      await api.delete(`/unified-rules/${groupRuleId}`).catch(() => {});
    }
  });
});

test.describe('GT-12132：IP 频率限制支持 IP 组范围', () => {
  test('组范围规则 API 全链路（创建/干跑/删除保护）+ UI 组下拉', async ({ authenticatedPage: page, request }) => {
    const sfx = uniqueSuffix();
    const groupName = `pfreq-${sfx}`;
    const api = await platformClient(request);

    // 平台 IP 组（成员含 CIDR 与精确 IP）
    const groupResp = await api.post('/unified-rules', {
      name: groupName,
      rule_class: 'tag',
      stage: 'onconnect',
      priority: 100,
      page: 'groups',
      tags: [`grp:${groupName}`],
      metadata: { group_type: 'ip' },
      condition_tree: { type: 'condition', field: 'client_ip', operator: 'within', value: '10.77.0.0/24\n10.78.1.1' },
    });
    expect(groupResp.status(), await groupResp.text()).toBe(201);
    const groupRuleId = ((await groupResp.json()) as { id: number }).id;
    // 优先级须全局唯一（CheckIPFrequencyPriorityConflict），取随机高位
    const prio = 50000 + Math.floor(Math.random() * 9000);
    let freqRuleId = 0;

    try {
      // GT-12132 原始复现：scope_type=group 创建——修复后应 201
      const freqResp = await api.post('/ip-frequency/rules', {
        name: `pfreq-rule-${sfx}`,
        scope_type: 'group',
        scope_value: String(groupRuleId),
        action: 'tempfail',
        priority: prio,
        daily_connection_limit: 1,
        suspend_minutes: 15,
        is_active: true,
      });
      expect(freqResp.status(), await freqResp.text()).toBe(201);
      const freqView = (await freqResp.json()) as { Rule: { id: number }; ScopeType: string; ScopeValue: string };
      freqRuleId = freqView.Rule.id;
      expect(freqView.ScopeType).toBe('group');
      expect(freqView.ScopeValue).toBe(String(groupRuleId));

      // 干跑：组内 IP 触发限频、组外 IP 不匹配
      const dryHit = await api.post('/ip-frequency/rules/test', {
        name: 'dry', scope_type: 'group', scope_value: String(groupRuleId),
        action: 'tempfail', priority: prio + 1, daily_connection_limit: 1, suspend_minutes: 15,
        test_ip: '10.77.0.9',
      });
      expect(dryHit.status(), await dryHit.text()).toBe(200);
      expect(((await dryHit.json()) as { blocked: boolean }).blocked).toBe(true);
      const dryMiss = await api.post('/ip-frequency/rules/test', {
        name: 'dry', scope_type: 'group', scope_value: String(groupRuleId),
        action: 'tempfail', priority: prio + 1, daily_connection_limit: 1, suspend_minutes: 15,
        test_ip: '9.9.9.9',
      });
      expect(((await dryMiss.json()) as { blocked: boolean }).blocked).toBe(false);

      // 引用中的组禁删（grpid 条件树叶子被引用扫描计入）
      const delBlocked = await api.delete(`/unified-rules/${groupRuleId}`);
      expect(delBlocked.status()).toBe(409);

      // 引用不存在/非全局组 → 400
      const badRef = await api.post('/ip-frequency/rules', {
        name: `pfreq-bad-${sfx}`, scope_type: 'group', scope_value: '99999999',
        action: 'reject', priority: prio + 2, daily_connection_limit: 1, suspend_minutes: 15,
      });
      expect(badRef.status()).toBe(400);

      // UI：IP 频率限制新增弹窗的范围下拉含「IP组」，组下拉出真实平台组。
      // IP 策略 tab 默认选中的模块就是 IP 频率限制，无需点左侧导航。
      await page.goto('/zh/system/platform-security');
      await page.getByRole('button', { name: '新增规则' }).first().click();
      await page.getByTestId('ipfreq-scope-type').click();
      await expect(page.getByRole('option', { name: 'IP组' })).toBeVisible({ timeout: 5000 });
      await page.getByRole('option', { name: 'IP组' }).click();
      await page.getByTestId('ipfreq-scope-group').click();
      await expect(page.getByRole('option', { name: groupName })).toBeVisible({ timeout: 5000 });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
    } finally {
      if (freqRuleId > 0) {
        await api.delete(`/ip-frequency/rules/${freqRuleId}`).catch(() => {});
      }
      await api.delete(`/unified-rules/${groupRuleId}`).catch(() => {});
    }
  });
});
