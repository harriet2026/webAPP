import { test, expect } from '../fixtures/auth.fixture';


import type { APIRequestContext, Page } from '@playwright/test';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


const API = 'http://localhost:18080/api/v1';

test.describe('Intent Engine', () => {
  // 共享 dev server 上多会话并发时单步耗时可达空载 2-3 倍（同仓库其他模块 spec 的既有先例），
  // 默认 30s 总预算会把「打开抽屉→展开面板→展开卡片→交互」的长用例误杀成超时；放宽到 90s。
  test.describe.configure({ timeout: 90_000 });
  // 解析首个租户并写入浏览器 localStorage，使抽屉内 IntentEnginePage 的 GET/PUT 带上
  // X-Tenant-ID。系统管理员不带该头时后端返回 400 tenant_id required，页面会落入
  // “加载失败 + 重试”态，卡片/开关都不渲染。必须在已登录（同源 localStorage 可写）之后、
  // 导航到受租户约束的页面之前调用。返回 token 与租户头，供需要直接读写后端的用例复用。
  async function selectTenant(page: Page, request: APIRequestContext) {
    const loginResp = await request.post(`${API}/auth/login`, {
      data: { username: 'admin', password: 'admin123' },
    });
    const { token } = (await loginResp.json()) as { token: string };
    // Pick the LOWEST-id tenant over the full list, exactly as global-setup.ts
    // does ("the same tenant the tenant-scoped specs select"). The default page
    // is not id-ordered, so `items[0]` returned whichever tenant happened to land
    // on page 1 — and with hundreds of tenants accumulated by earlier suites that
    // changed between runs. Each tenant carries its OWN intent-engine config, so
    // the spec silently tested a different (often unconfigured) tenant each time,
    // which is why it passed, went flaky, then failed across runs.
    const tenantsResp = await request.get(`${API}/tenants?page_size=500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tenantItems = ((await tenantsResp.json()) as { items: { id: number }[] }).items;
    const tenantId = tenantItems.slice().sort((a, b) => a.id - b.id)[0].id;
    await page.evaluate((tid: number) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
      // 多租户形态下策略流水线属模块A：平台视角被刻意隐藏
      // （PolicyPipelinePage: multiTenant && effectiveViewer === 'platform' -> 不渲染策略卡片）。
      // 仅设置“已选租户”不够——视角由 osg_viewer cookie 决定，必须一并切到 tenant，
      // 否则 admin(system_admin) 会话仍停留在平台视角，页面无任何 pipeline-policy-card-*。
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tenantId);
    const tenantHeader = { Authorization: `Bearer ${token}`, 'X-Tenant-ID': String(tenantId) };
    return { token, tenantId, tenantHeader };
  }

  async function openIntentEngineDrawer(page: Page, request: APIRequestContext) {
    await selectTenant(page, request);
    await page.goto('/zh/security/pipeline');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const intentCard = page.locator('[data-testid="pipeline-policy-card-intentEngine"]');
    await expect(intentCard).toBeVisible({ timeout: 10000 });
    await intentCard.click();
    await page.waitForTimeout(1500);

    const drawer = page.locator('[data-testid="pipeline-config-drawer"]').first();
    await expect(drawer).toBeVisible({ timeout: 15000 });
    // 等意图引擎页脱离 loading（缺省态渲染出总开关即视为就绪，兼顾 dev server 冷编译）
    await expect(page.locator('[data-testid="intent-engine-master-switch"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(500);
  }

  // 高危面板 defaultOpen=false，展开涉黄/赌/涉政/钓鱼卡片前需先展开该面板。
  async function expandHighRiskPanel(page: Page) {
    const drawer = page.locator('[data-testid="pipeline-config-drawer"]').first();
    const trigger = drawer.locator('[data-testid="ie-panel-high"]');
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await page.waitForTimeout(500);
    }
  }

  // 展开某意图卡片（点头部 toggle）。展开前滚到中间，避开 sticky 保存栏遮挡。

  // Turn an intent ON if it is currently off.
  //
  // Every control inside a card is `disabled={!value.enabled || !engineEnabled}`,
  // so a test that drives the action dropdown / threshold radios / mark checkbox
  // must first ensure the intent is enabled. Whether it already is depends on the
  // selected tenant's STORED config, which differs per tenant — the source of
  // this spec's cross-run instability. Flipping the switch also auto-expands the
  // card, which is safe now that expandIntentCard is idempotent.
  async function ensureIntentEnabled(page: Page, direction: string, intent: string) {
    const master = page.locator('[data-testid="intent-engine-master-switch"]');
    if ((await master.getAttribute('aria-checked')) === 'false') {
      await master.click();
      await page.waitForTimeout(300);
    }
    const sw = page
      .locator(`[data-testid="ie-card-${direction}-${intent}"]`)
      .locator('[role="switch"]')
      .first();
    if ((await sw.getAttribute('aria-checked')) !== 'true') {
      await sw.click();
      await page.waitForTimeout(400);
    }
  }

  // Expand the card IF it is not already expanded.
  //
  // The header toggle flips state, so an unconditional click collapses a card
  // that is already open. That happens routinely: turning the intent's enable
  // switch ON auto-expands the card, so a test that flips the switch and then
  // called this ended up with a COLLAPSED card and no action dropdown. Whether
  // it broke depended on the selected tenant's stored `enabled` flag — the
  // switch click is skipped when the intent is already on — which is why this
  // spec passed, went flaky, then failed across runs on the same code.
  //
  // The expanded body is the card's second child element (header + body), so its
  // presence is a reliable structural signal without needing a new testid.
  async function expandIntentCard(page: Page, direction: string, intent: string) {
    const card = page.locator(`[data-testid="ie-card-${direction}-${intent}"]`);
    const toggle = page.locator(`[data-testid="ie-toggle-${direction}-${intent}"]`);
    await toggle.scrollIntoViewIfNeeded();
    if ((await card.locator('> div').count()) < 2) {
      await toggle.click();
    }
    await expect(card.locator('> div')).toHaveCount(2, { timeout: 5000 });
  }

  test('open intent engine drawer from stage5 card', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    const title = authenticatedPage.locator('[data-testid="pipeline-config-drawer-title"]');
    await expect(title).toBeVisible({ timeout: 5000 });
    // 面包屑“阶段3: 内容层 / 意图引擎”仍含标题
    await expect(title).toContainText(/意图引擎/);

    // 卡头总开关（单一策略开关，决策C）与状态文案
    const master = authenticatedPage.locator('[data-testid="intent-engine-master-switch"]');
    await expect(master).toBeVisible({ timeout: 5000 });
    const status = authenticatedPage.locator('[data-testid="intent-engine-status"]');
    await expect(status).toHaveText(/已启用|已禁用/);
  });

  test('save triggers PUT API', async ({ authenticatedPage, request }) => {
    const { tenantHeader } = await selectTenant(authenticatedPage, request);
    const current = await (await request.get(`${API}/security/intent-engine`, { headers: tenantHeader })).json();

    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    const phishingSwitch = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"] [role="switch"]');
    await expect(phishingSwitch).toBeVisible({ timeout: 5000 });
    await phishingSwitch.click();
    await authenticatedPage.waitForTimeout(500);

    const putPromise = authenticatedPage.waitForResponse(
      (resp) => resp.url().includes('/security/intent-engine') && resp.request().method() === 'PUT',
      { timeout: 10000 },
    );

    const saveBtn = authenticatedPage.locator('[data-testid="intent-engine-save"]');
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();

    const response = await putPromise;
    expect(response.status()).toBe(200);

    // 恢复现场
    await request.put(`${API}/security/intent-engine`,
      { headers: { ...tenantHeader, 'Content-Type': 'application/json' }, data: current });
  });

  test('direction tabs switch content', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    const receivePhishing = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"]');
    await expect(receivePhishing).toBeVisible({ timeout: 5000 });

    const sendTab = authenticatedPage.locator('[data-testid="pipeline-config-drawer"] [role="tab"]').filter({ hasText: /外发|发送|Send/ }).first();
    await sendTab.click();
    await authenticatedPage.waitForTimeout(1000);
    // 面板 open 态在切方向后保留（面板组件不随 Tabs 卸载），高危卡片仍可见
    const sendPhishing = authenticatedPage.locator('[data-testid="ie-card-send-phishing"]');
    await expect(sendPhishing).toBeVisible({ timeout: 5000 });
  });

  test('expand card shows action dropdown and mark config for accept', async ({ authenticatedPage, request }) => {
    const { tenantHeader } = await selectTenant(authenticatedPage, request);
    const current = await (await request.get(`${API}/security/intent-engine`, { headers: tenantHeader })).json();

    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    const phishingCard = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"]');
    await expect(phishingCard).toBeVisible({ timeout: 5000 });

    const phishingSwitch = phishingCard.locator('[role="switch"]');
    if ((await phishingSwitch.getAttribute('aria-checked')) !== 'true') {
      await phishingSwitch.click();
      await authenticatedPage.waitForTimeout(300);
    }

    await expandIntentCard(authenticatedPage, 'receive', 'phishing');

    // 分类优先模式下的动作下拉（base-ui Select → button[role=combobox]）
    const actionSelect = phishingCard.locator('button[role="combobox"]').first();
    await expect(actionSelect).toBeVisible({ timeout: 3000 });
    await expect(actionSelect).toBeEnabled({ timeout: 3000 });

    await actionSelect.click();
    await authenticatedPage.waitForTimeout(300);
    const markOption = authenticatedPage.locator('[role="option"]').filter({ hasText: /标记投递/ }).first();
    await markOption.click();
    await authenticatedPage.waitForTimeout(500);

    // 选“标记投递”后展开标记投递子配置
    await expect(phishingCard.locator('[data-testid="ie-mark-config"]')).toBeVisible({ timeout: 3000 });

    await request.put(`${API}/security/intent-engine`,
      { headers: { ...tenantHeader, 'Content-Type': 'application/json' }, data: current });
  });

  test('high risk warning shows when accept selected for high risk intent', async ({ authenticatedPage, request }) => {
    const { tenantHeader } = await selectTenant(authenticatedPage, request);
    const current = await (await request.get(`${API}/security/intent-engine`, { headers: tenantHeader })).json();

    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    const phishingCard = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"]');
    await expect(phishingCard).toBeVisible({ timeout: 5000 });

    const phishingSwitch = phishingCard.locator('[role="switch"]');
    if ((await phishingSwitch.getAttribute('aria-checked')) !== 'true') {
      await phishingSwitch.click();
      await authenticatedPage.waitForTimeout(300);
    }

    await expandIntentCard(authenticatedPage, 'receive', 'phishing');

    const actionSelect = phishingCard.locator('button[role="combobox"]').first();
    await expect(actionSelect).toBeVisible({ timeout: 3000 });
    await actionSelect.click();
    await authenticatedPage.waitForTimeout(300);
    const markOption = authenticatedPage.locator('[role="option"]').filter({ hasText: /标记投递/ }).first();
    await markOption.click();
    await authenticatedPage.waitForTimeout(500);

    // 高危意图选“标记投递”→ 展示红色风险提示条
    await expect(phishingCard.getByText(/高危意图采用标记投递/)).toBeVisible({ timeout: 3000 });

    await request.put(`${API}/security/intent-engine`,
      { headers: { ...tenantHeader, 'Content-Type': 'application/json' }, data: current });
  });

  test('dirty indicator appears after edit', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    const phishingSwitch = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"] [role="switch"]');
    await expect(phishingSwitch).toBeVisible({ timeout: 5000 });
    await phishingSwitch.click();
    await authenticatedPage.waitForTimeout(300);

    // 操作栏 dirty ⚠ 提示
    await expect(authenticatedPage.locator('[data-testid="ie-dirty-hint"]')).toBeVisible({ timeout: 3000 });
  });

  test('reset dialog opens and can be cancelled', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    const resetBtn = authenticatedPage.locator('[data-testid="intent-engine-body"] button').filter({ hasText: /重置为缺省值/ }).first();
    await expect(resetBtn).toBeVisible({ timeout: 5000 });
    await resetBtn.click();
    await authenticatedPage.waitForTimeout(500);

    const dialogTitle = authenticatedPage.locator('text=确认重置配置');
    await expect(dialogTitle).toBeVisible({ timeout: 3000 });
    const cancelBtn = authenticatedPage.locator('[role="dialog"] button').filter({ hasText: /取消/ }).first();
    await cancelBtn.click();
    await authenticatedPage.waitForTimeout(300);
    await expect(dialogTitle).toHaveCount(0, { timeout: 3000 });
  });

  test('copy to directions dialog opens', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    const copyBtn = authenticatedPage.locator('[data-testid="intent-engine-body"] button').filter({ hasText: /复制到其他方向/ }).first();
    await expect(copyBtn).toBeVisible({ timeout: 5000 });
    await copyBtn.click();
    await authenticatedPage.waitForTimeout(500);

    const dialogTitle = authenticatedPage.locator('text=复制配置到其他方向');
    await expect(dialogTitle).toBeVisible({ timeout: 3000 });
    const cancelBtn = authenticatedPage.locator('[role="dialog"] button').filter({ hasText: /取消/ }).first();
    await cancelBtn.click();
  });

  // GT-12208 / GT-11753(重新打开): html_spec 层级5（v2 / 差异 D-07）要求按方向标脏——
  // 复制确实改写了目标方向草稿，必须让保存可用（12208），但提示要点名到被改动的方向、
  // 而不是给当前方向挂一个泛化的「配置已修改未保存」（11753 的误报诉求）。
  // 缺省配置下 receive 与降级后的 send/internal 并不相等，故此处复制必然产生变化。
  test('copy to directions marks the changed direction and enables save', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    const copyBtn = authenticatedPage.locator('[data-testid="intent-engine-body"] button').filter({ hasText: /复制到其他方向/ }).first();
    await expect(copyBtn).toBeVisible({ timeout: 5000 });
    await copyBtn.click();

    // 抽屉本身也是 role=dialog，需按标题限定到「复制配置到其他方向」这个弹窗
    const dialog = authenticatedPage.locator('[role="dialog"]').filter({ hasText: '复制配置到其他方向' });
    await expect(dialog).toBeVisible({ timeout: 3000 });
    // 勾选任一目标方向后确认
    await dialog.locator('input[type="checkbox"], [role="checkbox"]').first().click();
    await dialog.locator('button').filter({ hasText: /确认|确定/ }).first().click();
    await expect(dialog).toHaveCount(0, { timeout: 3000 });

    // 点名反馈「已复制到 X 方向，请保存后生效」取代了泛化的 dirty 提示
    await expect(authenticatedPage.locator('[data-testid="ie-copy-feedback"]')).toBeVisible({ timeout: 3000 });
    await expect(authenticatedPage.locator('[data-testid="ie-dirty-hint"]')).toHaveCount(0);
    // 被改动的方向 Tab 打琥珀点；源方向(receive)不标脏
    await expect(authenticatedPage.locator('[data-testid^="intent-engine-tab-dirty-"]')).not.toHaveCount(0);
    await expect(authenticatedPage.locator('[data-testid="intent-engine-tab-dirty-receive"]')).toHaveCount(0);
    // 复制结果可保存（GT-12208 的核心诉求）
    await expect(authenticatedPage.locator('[data-testid="intent-engine-save"]')).toBeEnabled({ timeout: 3000 });
  });

  // GT-12207: 关闭单个意图后，配置区域应「保留并灰化禁用」，而不是消失。
  // 实测根因不是禁用态渲染有问题（那部分 GT-11743 已做对：opacity-50 +
  // pointer-events-none，控件保留且 disabled），而是点开关时事件冒泡到卡片头部
  // 的 onToggleExpand，把整张卡片折叠了 —— 配置块随之从 DOM/可访问树消失。
  test('disabling an intent keeps its config visible and disabled (not unmounted)', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);
    await expandIntentCard(authenticatedPage, 'receive', 'phishing');

    const card = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"]');
    await expect(card.getByRole('combobox').first()).toBeVisible({ timeout: 5000 });

    // 关掉该意图
    const sw = card.locator('[role="switch"]').first();
    await sw.scrollIntoViewIfNeeded();
    await sw.click();
    await authenticatedPage.waitForTimeout(800);
    await expect(sw).toHaveAttribute('aria-checked', 'false');

    // 关键断言：卡片不应被折叠，配置控件仍在可访问树中
    await expect(card.getByRole('combobox').first()).toBeVisible({ timeout: 5000 });

    // 且应处于灰化禁用态（展开区 opacity-50 + pointer-events-none）
    const dim = await card.evaluate((el) => {
      const body = (el as HTMLElement).querySelector('.border-t') as HTMLElement | null;
      if (!body) return null;
      const cs = getComputedStyle(body);
      return { opacity: cs.opacity, pointerEvents: cs.pointerEvents };
    });
    expect(dim).not.toBeNull();
    expect(Number(dim!.opacity)).toBeLessThan(1);
    expect(dim!.pointerEvents).toBe('none');
  });

  test('non-receive direction shows unsupported mark alert', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    const sendTab = authenticatedPage.locator('[data-testid="pipeline-config-drawer"] [role="tab"]').filter({ hasText: /外发|发送|Send/ }).first();
    await sendTab.click();
    await authenticatedPage.waitForTimeout(1000);

    // 外发方向：标记投递降级提示条
    await expect(authenticatedPage.getByText(/外发方向不支持.*标记投递/)).toBeVisible({ timeout: 3000 });
  });

  test('risk level panels show correct intents', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    // 高危面板含 涉黄/赌、涉政、钓鱼 三卡
    await expect(authenticatedPage.locator('[data-testid="ie-card-receive-phishing"]')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('[data-testid="ie-card-receive-political"]')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.locator('[data-testid="ie-card-receive-porn_gambling"]')).toBeVisible({ timeout: 5000 });
  });

  test('apply same risk level copies config to sibling intents', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    await ensureIntentEnabled(authenticatedPage, 'receive', 'phishing');
    await expandIntentCard(authenticatedPage, 'receive', 'phishing');

    const actionSelect = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"] button[role="combobox"]').first();
    await expect(actionSelect).toBeVisible({ timeout: 3000 });
    await actionSelect.click();
    await authenticatedPage.waitForTimeout(300);
    const rejectOption = authenticatedPage.locator('[role="option"]').filter({ hasText: /阻断|Reject/ }).first();
    await rejectOption.click();
    await authenticatedPage.waitForTimeout(500);

    const applyBtn = authenticatedPage.locator('[data-testid="intent-engine-body"] button').filter({ hasText: /应用同风险/ }).first();
    await expect(applyBtn).toBeEnabled({ timeout: 3000 });
    await applyBtn.click();
    await authenticatedPage.waitForTimeout(500);

    await expect(authenticatedPage.locator('[data-testid="ie-dirty-hint"]')).toBeVisible({ timeout: 3000 });

    // 同风险等级的 涉黄/赌 卡头 Badge 应变为“阻断”
    const pgCard = authenticatedPage.locator('[data-testid="ie-card-receive-porn_gambling"]');
    await expect(pgCard.getByText('阻断').first()).toBeVisible({ timeout: 3000 });
  });

  test('internal direction tab shows cards', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    const internalTab = authenticatedPage.locator('[data-testid="pipeline-config-drawer"] [role="tab"]').filter({ hasText: /域内|Internal/ }).first();
    await internalTab.click();
    await authenticatedPage.waitForTimeout(1000);

    await expandHighRiskPanel(authenticatedPage);
    await expect(authenticatedPage.locator('[data-testid="ie-card-internal-phishing"]')).toBeVisible({ timeout: 5000 });

    // 域内方向：标记投递降级提示条
    await expect(authenticatedPage.getByText(/域内方向不支持.*标记投递/)).toBeVisible({ timeout: 3000 });
  });

  test('change action to discard and save', async ({ authenticatedPage, request }) => {
    const { tenantHeader } = await selectTenant(authenticatedPage, request);
    const current = await (await request.get(`${API}/security/intent-engine`, { headers: tenantHeader })).json();

    await openIntentEngineDrawer(authenticatedPage, request);

    // spam 为中危，中危面板 defaultOpen，无需展开面板
    await expandIntentCard(authenticatedPage, 'receive', 'spam');

    const actionSelect = authenticatedPage.locator('[data-testid="ie-card-receive-spam"] button[role="combobox"]').first();
    await expect(actionSelect).toBeVisible({ timeout: 3000 });
    await actionSelect.click();
    await authenticatedPage.waitForTimeout(300);
    const discardOption = authenticatedPage.locator('[role="option"]').filter({ hasText: /丢弃|Discard/ }).first();
    await discardOption.click();
    await authenticatedPage.waitForTimeout(500);

    const putPromise = authenticatedPage.waitForResponse(
      (resp) => resp.url().includes('/security/intent-engine') && resp.request().method() === 'PUT',
      { timeout: 10000 },
    );
    const saveBtn = authenticatedPage.locator('[data-testid="intent-engine-save"]');
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();
    const response = await putPromise;
    expect(response.status()).toBe(200);

    await request.put(`${API}/security/intent-engine`,
      { headers: { ...tenantHeader, 'Content-Type': 'application/json' }, data: current });
  });

  test('toggle individual intent enabled switch', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    const phishingSwitch = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"] [role="switch"]');
    await expect(phishingSwitch).toBeVisible({ timeout: 5000 });
    await phishingSwitch.click();
    await authenticatedPage.waitForTimeout(300);

    await expect(authenticatedPage.locator('[data-testid="ie-dirty-hint"]')).toBeVisible({ timeout: 3000 });
  });

  test('dirty close shows confirmation dialog', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    const phishingSwitch = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"] [role="switch"]');
    await expect(phishingSwitch).toBeVisible({ timeout: 5000 });
    await phishingSwitch.click();
    await authenticatedPage.waitForTimeout(300);

    // The drawer's close control is icon-only: PolicyPipelinePage renders the
    // Sheet with showCloseButton={false} and its own ghost icon Button whose name
    // comes from aria-label={t('pipeline.drawerClose')} ("关闭") — there is no text
    // node to match. filter({ hasText }) matches text content only, so it resolved
    // to nothing and the click below just waited out the 30s timeout. Match on the
    // accessible name instead, which is what the aria-label actually provides.
    const closeBtn = authenticatedPage
      .locator('[data-testid="pipeline-config-drawer"]')
      .getByRole('button', { name: /关闭|Close/ })
      .first();
    await closeBtn.click();
    await authenticatedPage.waitForTimeout(500);

    const confirmDialog = authenticatedPage.locator('[role="alertdialog"]').first();
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    const cancelBtn = confirmDialog.locator('button').filter({ hasText: /取消|Cancel/ }).first();
    await cancelBtn.click();
    await authenticatedPage.waitForTimeout(300);

    const drawer = authenticatedPage.locator('[data-testid="pipeline-config-drawer"]').first();
    await expect(drawer).toBeVisible({ timeout: 3000 });
  });

  test('subscription low-risk intent present in all directions', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    // subscription 为 LOW_RISK 意图，低危面板 defaultOpen；当前实现对三方向均渲染低危面板，
    // 故 receive/send/internal 都应存在 subscription 卡（与旧“send 不含 subscription”契约相比，
    // 产品已改为三方向均展示——外发/域内仅动作集不含“标记投递”，见降级提示条）。
    for (const dir of ['receive', 'send', 'internal']) {
      if (dir !== 'receive') {
        const tab = authenticatedPage
          .locator('[data-testid="pipeline-config-drawer"] [role="tab"]')
          .filter({ hasText: dir === 'send' ? /外发|发送|Send/ : /域内|Internal/ })
          .first();
        await tab.click();
        await authenticatedPage.waitForTimeout(800);
      }
      const subCard = authenticatedPage.locator(`[data-testid="ie-card-${dir}-subscription"]`);
      await expect(subCard).toHaveCount(1, { timeout: 3000 });
    }
  });

  test('low risk panel present when low-risk intents exist', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);

    // LOW_RISK_INTENTS = ['subscription']（非空），低危面板应渲染
    const lowRiskPanel = authenticatedPage.locator('[data-testid="ie-panel-low"]');
    await expect(lowRiskPanel).toBeVisible({ timeout: 5000 });
    await expect(lowRiskPanel).toContainText(/低危意图/);
  });

  // ---- Task 11 Step 2 新增用例 ----

  test('threshold preset applies strict template', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    // 展开涉黄/赌卡 → 切分段阈值模式
    await expandIntentCard(authenticatedPage, 'receive', 'porn_gambling');
    const card = authenticatedPage.locator('[data-testid="ie-card-receive-porn_gambling"]');
    // base-ui Radio 的 id 落在隐藏(off-screen)的原生 <input> 上，直接点 input 会因“outside of viewport”超时；
    // 改点关联的可见 <label for>，浏览器会把 click 派发到关联控件，从而切到分段阈值模式。
    const thresholdRadio = authenticatedPage.locator('label[for="mode-threshold-porn_gambling-receive"]');
    await thresholdRadio.scrollIntoViewIfNeeded();
    await thresholdRadio.click();
    await authenticatedPage.waitForTimeout(500);

    // 应用模板 → 选“严格”
    const preset = card.locator('[data-testid="ie-preset-select"]');
    await preset.scrollIntoViewIfNeeded();
    await preset.click();
    await authenticatedPage.waitForTimeout(300);
    await authenticatedPage.locator('[role="option"]').filter({ hasText: /^严格$/ }).first().click();
    await authenticatedPage.waitForTimeout(500);

    // 严格模板：0-0.3 隔离 / 0.3-0.6 阻断 / 0.6-1 丢弃
    const nums = card.locator('input[type="number"]');
    await expect(nums.nth(0)).toHaveValue('0');
    await expect(nums.nth(1)).toHaveValue('0.3');
    await expect(nums.nth(2)).toHaveValue('0.3');
    await expect(nums.nth(3)).toHaveValue('0.6');
    await expect(nums.nth(4)).toHaveValue('0.6');
    await expect(nums.nth(5)).toHaveValue('1');

    // DOM 顺序：三个区间动作 Select 在前，末尾一个是“应用模板”触发器
    const combos = card.locator('button[role="combobox"]');
    await expect(combos.nth(0)).toContainText('隔离');
    await expect(combos.nth(1)).toContainText('阻断');
    await expect(combos.nth(2)).toContainText('丢弃');
    // 本用例未保存，DB 不变，无需恢复
  });

  test('save blocked on threshold gap', async ({ authenticatedPage, request }) => {
    await openIntentEngineDrawer(authenticatedPage, request);
    await expandHighRiskPanel(authenticatedPage);

    // 展开钓鱼卡 → 切分段阈值 → 制造区间缺口（区间1 max 0.3 → 0.2）
    await ensureIntentEnabled(authenticatedPage, 'receive', 'phishing');
    await expandIntentCard(authenticatedPage, 'receive', 'phishing');
    const card = authenticatedPage.locator('[data-testid="ie-card-receive-phishing"]');
    // 同上：点可见 label 而非隐藏的原生 radio input，避免 off-screen click 超时。
    const thresholdRadio = authenticatedPage.locator('label[for="mode-threshold-phishing-receive"]');
    await thresholdRadio.scrollIntoViewIfNeeded();
    await thresholdRadio.click();
    await authenticatedPage.waitForTimeout(500);

    const maxInput = card.locator('input[type="number"]').nth(1);
    await maxInput.scrollIntoViewIfNeeded();
    await maxInput.fill('0.2');
    await authenticatedPage.waitForTimeout(300);

    // 监听是否发出 PUT
    let putFired = false;
    authenticatedPage.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/security/intent-engine')) putFired = true;
    });

    const saveBtn = authenticatedPage.locator('[data-testid="intent-engine-save"]');
    await saveBtn.scrollIntoViewIfNeeded();
    await saveBtn.click();

    // 校验拦截：sonner toast 文案“存在未覆盖区间，请修复后保存”
    await expect(authenticatedPage.getByText('存在未覆盖区间，请修复后保存')).toBeVisible({ timeout: 3000 });
    // PUT 未发出，dirty 仍在
    expect(putFired).toBe(false);
    await expect(authenticatedPage.locator('[data-testid="intent-engine-unsaved"]')).toBeVisible({ timeout: 3000 });
    // 本用例未保存，DB 不变，无需恢复
  });

  test('mark deliver full config round trip', async ({ authenticatedPage, request }) => {
    const { tenantHeader } = await selectTenant(authenticatedPage, request);
    const current = await (await request.get(`${API}/security/intent-engine`, { headers: tenantHeader })).json();

    // Seed a deterministic STARTING state so the UI edits below are real changes.
    // The test flips 主题标记 to suffix and ticks 正文标记, then asserts the save
    // round-trips. If the tenant already stores exactly that (this one does:
    // body_mark.enabled=true), the edits are no-ops, the form never goes dirty,
    // no PUT is issued and the wait for it times out. Starting from the opposite
    // state makes the round-trip meaningful regardless of what the tenant held.
    // `current` is restored in the finally block below.
    const seeded = JSON.parse(JSON.stringify(current));
    const sub = seeded.directions.receive.subscription;
    sub.enabled = true;
    sub.action = 'accept';
    sub.mark_config = {
      ...(sub.mark_config ?? {}),
      subject_mark: { ...(sub.mark_config?.subject_mark ?? {}), enabled: true, position: 'prefix' },
      body_mark: { ...(sub.mark_config?.body_mark ?? {}), enabled: false },
    };
    await request.put(`${API}/security/intent-engine`, {
      headers: { ...tenantHeader, 'Content-Type': 'application/json' },
      data: seeded,
    });

    try {
      await openIntentEngineDrawer(authenticatedPage, request);

      // subscription（低危，缺省=标记投递+分类优先）→ 标记投递子配置默认可见
      await ensureIntentEnabled(authenticatedPage, 'receive', 'subscription');
      await expandIntentCard(authenticatedPage, 'receive', 'subscription');
      const card = authenticatedPage.locator('[data-testid="ie-card-receive-subscription"]');
      await expect(card.locator('[data-testid="ie-mark-config"]')).toBeVisible({ timeout: 3000 });

      // 主题标记位置改后缀
      const subjSuffix = card.locator('[data-testid="ie-subject_mark-suffix"]');
      await subjSuffix.scrollIntoViewIfNeeded();
      await subjSuffix.click();
      // 勾选正文标记（幂等：已勾选就别再点，否则是取消勾选）
      //
      // This used to click unconditionally. The selected tenant already stores
      // body_mark.enabled = true for subscription, so the click UNCHECKED it —
      // the save then persisted "off" and the round-trip assertion below (which
      // expects it checked) failed. Whether that happened depended on the
      // tenant's stored config, which is why this only broke on some runs.
      const bodyEnabled = card.locator('[data-testid="ie-body_mark-enabled"]');
      await bodyEnabled.scrollIntoViewIfNeeded();
      if (!(await bodyEnabled.isChecked())) {
        await bodyEnabled.click();
      }
      await expect(bodyEnabled).toBeChecked({ timeout: 3000 });
      await authenticatedPage.waitForTimeout(300);

      const putPromise = authenticatedPage.waitForResponse(
        (resp) => resp.url().includes('/security/intent-engine') && resp.request().method() === 'PUT',
        { timeout: 10000 },
      );
      const saveBtn = authenticatedPage.locator('[data-testid="intent-engine-save"]');
      await saveBtn.scrollIntoViewIfNeeded();
      await saveBtn.click();
      expect((await putPromise).status()).toBe(200);
      await expect(authenticatedPage.getByText('保存成功')).toBeVisible({ timeout: 5000 });

      // reload 回读：重新导航拉取 DB 持久化值
      await openIntentEngineDrawer(authenticatedPage, request);
      await expandIntentCard(authenticatedPage, 'receive', 'subscription');
      const card2 = authenticatedPage.locator('[data-testid="ie-card-receive-subscription"]');
      await expect(card2.locator('[data-testid="ie-mark-config"]')).toBeVisible({ timeout: 3000 });
      await expect(card2.locator('[data-testid="ie-subject_mark-suffix"]')).toBeChecked({ timeout: 3000 });
      await expect(card2.locator('[data-testid="ie-body_mark-enabled"]')).toBeChecked({ timeout: 3000 });
    } finally {
      // 恢复现场（把订阅意图配置还原为进入前的值）
      await request.put(`${API}/security/intent-engine`,
        { headers: { ...tenantHeader, 'Content-Type': 'application/json' }, data: current });
    }
  });
});
