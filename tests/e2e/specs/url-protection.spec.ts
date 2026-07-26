import { test, expect } from '../fixtures/auth.fixture';
import { pickActiveTenantId } from '../helpers/tenant';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });




// URL检测与防护 —— html_spec filter-rules-pipeline-url-protection 对齐后的行为：
// 显式保存模型（草稿 + 保存配置钮 + 未保存提示，GT 决策#4）、Tab 条形态门控
//（传统版渲染 URL沙箱检测 Tab，GT 决策#1）、复检块双形态 M3 + 超时兜底策略下拉（GT 决策#2）。
test.describe.serial('URL Protection', () => {
  async function openUrlProtectionDrawer(page: import('@playwright/test').Page) {
    // Select the first tenant BEFORE navigating so the React auth context reads it
    // from localStorage on mount. Without X-Tenant-ID, the URL protection API rejects
    // every request from a system_admin with no tenant selected (returns 400).
    const tenantId = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/v1/tenants', { credentials: 'include' });
        const data = await res.json();
        return pickActiveTenantId(data?.items);
      } catch { return null; }
    });
    if (tenantId != null) {
      await page.evaluate(
        (tid) => localStorage.setItem('osgateway_selected_tenant', String(tid)),
        tenantId,
      );
      const appURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
      await page.context().addCookies([
        { name: 'osg_viewer', value: 'tenant', url: appURL, sameSite: 'Lax' },
        { name: 'osg_selected_tenant', value: String(tenantId), url: appURL, sameSite: 'Lax' },
      ]);
      // GT-11731 后 UI 无主机名字段，但后端在 link_protect_enabled=true 时仍要求
      // public_base_url 非空（spec §0 现存缺陷）。在抽屉加载草稿之前经 API 预置，
      // 否则 UI 保存会把草稿里的空值写回而 400。
      await page.evaluate(async (tid) => {
        await fetch('/api/v1/url-protection/settings', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': String(tid) },
          body: JSON.stringify({ public_base_url: 'https://gw.e2e.example.com' }),
        });
      }, tenantId);
    }

    await page.goto('/zh/security/pipeline');
    const card = page.locator('[data-testid="pipeline-policy-card-url"]');
    await expect(card).toBeVisible({ timeout: 10000 });

    // Readiness = the settings GET has returned (that is what populates `draft`).
    //
    // This used to wait for the module master switch to become ENABLED, using it
    // as a proxy for "draft loaded". That stopped working when ee8ccfbea2
    // (2026-07-18, 统一表头 + 总开关) gave UrlProtectionPage
    // `disabled={!isSystemAdmin}`: this spec runs as tenant_admin (Module A is
    // tenant-only), so the switch is now permanently disabled and the wait could
    // never succeed — blocking all 10 tests in this serial describe. The switch's
    // enablement is a permission question, not a loading signal.
    const settingsLoaded = page.waitForResponse(
      (r) => /\/url-protection\/settings/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 15000 },
    );
    await card.click();

    await expect(page.getByTestId('url-protection-page')).toBeVisible({ timeout: 15000 });
    await settingsLoaded;
    // Brief settle wait for sheet animation.
    await page.waitForTimeout(300);
  }

  async function saveDraft(page: import('@playwright/test').Page) {
    await page.getByTestId('url-protection-save').click();
    // 保存成功后未保存提示隐藏（visibility:hidden，元素常驻）
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="url-protection-unsaved"]');
        return el !== null && getComputedStyle(el).visibility === 'hidden';
      },
      { timeout: 8000 },
    );
  }

  async function ensureMasterEnabled(page: import('@playwright/test').Page) {
    const masterSwitch = page.getByTestId('url-protection-master-switch');
    await expect(masterSwitch).toBeVisible({ timeout: 5000 });
    if ((await masterSwitch.getAttribute('aria-checked')) !== 'true') {
      await masterSwitch.click();
      await expect(masterSwitch).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
    }
  }

  test('打开抽屉：卡头状态字 + 总开关 + 保存栏 + 面包屑', async ({ authenticatedPage }) => {
    await openUrlProtectionDrawer(authenticatedPage);

    await expect(authenticatedPage.getByTestId('url-protection-master-switch')).toBeVisible({ timeout: 5000 });
    // html_spec §2.2-3：卡头显示 已启用/已禁用 状态字
    await expect(authenticatedPage.getByTestId('url-protection-status')).toHaveText(/已启用|已禁用/);
    // html_spec §2.2-5：底部保存栏
    await expect(authenticatedPage.getByTestId('url-protection-save')).toBeVisible();
    // 抽屉头部面包屑（html_spec §2.2-1）
    await expect(authenticatedPage.getByTestId('pipeline-config-drawer-title'))
      .toHaveText('阶段3: 内容层 / URL检测与防护');
  });

  test('显式保存：改复检配置出现未保存提示，保存后清除', async ({ authenticatedPage }) => {
    await openUrlProtectionDrawer(authenticatedPage);
    await ensureMasterEnabled(authenticatedPage);

    const unsavedHidden = () => authenticatedPage.evaluate(() => {
      const el = document.querySelector('[data-testid="url-protection-unsaved"]');
      return el ? getComputedStyle(el).visibility === 'hidden' : null;
    });
    expect(await unsavedHidden()).toBe(true);

    const rescanBlacklist = authenticatedPage.getByTestId('rescan-blacklist-toggle');
    const initialRescanBlacklist = await rescanBlacklist.getAttribute('aria-checked');
    await rescanBlacklist.click();
    // 等待提示真正可见（避免固定延时的抖动）
    await authenticatedPage.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="url-protection-unsaved"]');
        return el !== null && getComputedStyle(el).visibility === 'visible';
      },
      { timeout: 5000 },
    );
    expect(await unsavedHidden()).toBe(false);

    await saveDraft(authenticatedPage);
    expect(await unsavedHidden()).toBe(true);

    // 恢复用例进入前的配置，避免污染后续用例。
    if ((await rescanBlacklist.getAttribute('aria-checked')) !== initialRescanBlacklist) {
      await rescanBlacklist.click();
      await saveDraft(authenticatedPage);
    }
  });

  // GT-12221：未保存提示必须是条件渲染——invisible 只是视觉隐藏，textContent 仍会被
  // 文本断言（qc U10 的 not.toContainText）和读屏命中，造成"保存后仍显示未保存"的误报。
  test('未保存提示条件渲染：干净态与保存后 DOM 无文案（GT-12221）', async ({ authenticatedPage }) => {
    test.setTimeout(60_000);
    await openUrlProtectionDrawer(authenticatedPage);
    await ensureMasterEnabled(authenticatedPage);
    const unsaved = authenticatedPage.getByTestId('url-protection-unsaved');
    // 干净态（未做任何修改）：DOM 中不含文案
    await expect(unsaved).toHaveText('');

    const rescanBlacklist = authenticatedPage.getByTestId('rescan-blacklist-toggle');
    const initialRescanBlacklist = await rescanBlacklist.getAttribute('aria-checked');
    await rescanBlacklist.click();
    await expect(unsaved).toContainText('有未保存的更改');

    await saveDraft(authenticatedPage);
    await expect(unsaved).toHaveText('');

    // 恢复用例进入前的配置，避免污染后续用例。
    if ((await rescanBlacklist.getAttribute('aria-checked')) !== initialRescanBlacklist) {
      await rescanBlacklist.click();
      await saveDraft(authenticatedPage);
    }
  });

  // GT-12220 / GT-12222：Base UI 的 Tooltip.Popup 默认不带 ARIA role，
  // getByRole('tooltip')（辅助技术同理）永远取不到。ui/tooltip.tsx 补 role 后，
  // URL 卡片悬停提示与折叠导航模块提示都必须能按 role 定位。
  test('悬停提示可按 role=tooltip 定位：URL 卡片与折叠导航（GT-12220/GT-12222）', async ({ authenticatedPage }) => {
    test.setTimeout(60_000);
    const page = authenticatedPage;
    await openUrlProtectionDrawer(page);
    // 先关抽屉回到流水线页，验证卡片悬停提示（GT-12222）。
    await page
      .locator('[data-testid="pipeline-config-drawer"]')
      .getByRole('button', { name: '关闭' })
      .first()
      .click();
    await expect(page.getByTestId('url-protection-page')).toBeHidden({ timeout: 5000 });

    const card = page.locator('[data-testid="pipeline-policy-card-url"]');
    await card.hover();
    const cardTip = page.getByRole('tooltip').filter({ hasText: '策略：URL检测与防护' });
    await expect(cardTip).toBeVisible({ timeout: 5000 });
    await expect(cardTip).toContainText(/隔离、投递/);
    await expect(cardTip).toContainText('命中则隔离');

    // 重开抽屉，折叠左导航后悬停 url 入口（GT-12220）。
    await card.click();
    await expect(page.getByTestId('url-protection-page')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('pipeline-drawer-nav-collapse').click();
    const navItem = page.getByTestId('pipeline-drawer-nav-url');
    await expect(navItem).not.toContainText('URL检测与防护');
    await navItem.hover();
    await expect(
      page.getByRole('tooltip').filter({ hasText: 'URL检测与防护' }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('总开关关闭（模块注册表即时生效）：置灰 + 已禁用 + 无草稿确认', async ({ authenticatedPage }) => {
    await openUrlProtectionDrawer(authenticatedPage);
    await ensureMasterEnabled(authenticatedPage);

    await authenticatedPage.getByTestId('url-protection-master-switch').click();
    await authenticatedPage.waitForTimeout(300);

    await expect(authenticatedPage.getByTestId('url-protection-status')).toHaveText('已禁用');
    // 页头的统一总开关是唯一的模块启停入口，关闭后整页置灰。
    await expect(
      authenticatedPage.locator('[data-testid="url-protection-page"] .opacity-50.pointer-events-none').first(),
    ).toBeVisible();
    // 统一模块总开关不属于 URL 设置草稿，因此关闭抽屉不应误报未保存确认。
    await expect(authenticatedPage.getByTestId('url-protection-unsaved')).toBeHidden();
    await authenticatedPage
      .locator('[data-testid="pipeline-config-drawer"]')
      .getByRole('button', { name: '关闭' })
      .first()
      .click();
    await expect(authenticatedPage.getByTestId('url-protection-page')).toBeHidden({ timeout: 5000 });
    await expect(authenticatedPage.locator('[role="alertdialog"]')).toHaveCount(0);

    // 恢复模块启用，避免污染后续用例。
    await openUrlProtectionDrawer(authenticatedPage);
    await ensureMasterEnabled(authenticatedPage);
  });

  test('链接保护配置：无单 Tab/重复开关 + 固定策略双列卡 + 锁标注', async ({ authenticatedPage }) => {
    await openUrlProtectionDrawer(authenticatedPage);
    await ensureMasterEnabled(authenticatedPage);

    await expect(authenticatedPage.getByTestId('link-protection-tab')).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId('url-protection-tabs')).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('tab-link-protection')).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('link-protection-toggle-card')).toHaveCount(0);
    await expect(authenticatedPage.locator('[role="switch"][aria-label="link-protection-toggle"]')).toHaveCount(0);
    // html_spec layer-3 状态 3A：固定策略卡带描述文案
    await expect(authenticatedPage.locator('text=用户点击恶意URL时，显示警告页面并拦截访问')).toBeVisible();
    await expect(authenticatedPage.locator('text=用户点击未知URL时，显示警告页面并拦截访问')).toBeVisible();
    await expect(authenticatedPage.locator('text=安全策略为系统固定配置，不可修改')).toBeVisible();
  });

  async function openRescanM3(page: import('@playwright/test').Page) {
    await openUrlProtectionDrawer(page);
    await ensureMasterEnabled(page);
    await expect(page.getByTestId('link-protection-tab')).toBeVisible({ timeout: 5000 });
    const m3 = page.locator('[role="switch"][aria-label="rescan-deep-inspect"]');
    await expect(m3).toBeVisible({ timeout: 5000 });
    if ((await m3.getAttribute('aria-checked')) !== 'true') {
      await m3.click();
      await page.waitForTimeout(300);
    }
    await expect(m3).toHaveAttribute('aria-checked', 'true', { timeout: 5000 });
  }

  test('复检策略：M3 开启后展开超时上限/兜底策略/允许跳过', async ({ authenticatedPage }) => {
    await openRescanM3(authenticatedPage);

    await expect(authenticatedPage.locator('[aria-label="deep-inspect-timeout"]')).toBeVisible({ timeout: 5000 });
    await expect(
      authenticatedPage.locator('[aria-label="deep-inspect-timeout-policy"]'),
    ).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId('deep-inspect-cost-banner')).toBeVisible({ timeout: 5000 });
  });

  test('复检策略：超时上限范围校验', async ({ authenticatedPage }) => {
    await openRescanM3(authenticatedPage);

    const timeoutInput = authenticatedPage.locator('[aria-label="deep-inspect-timeout"]');
    await expect(timeoutInput).toBeVisible({ timeout: 5000 });
    await timeoutInput.fill('121');
    await authenticatedPage.waitForTimeout(300);

    // demo 运行态：非法值不进入草稿，受控输入回弹到上次合法值 60。
    await expect(timeoutInput).toHaveValue('60');

    // 提示文案（hint）也含 10-120，锚定红色错误节点避免严格模式撞车
    await expect(
      authenticatedPage.locator('p.text-destructive', { hasText: /10[–-]120/ }),
    ).toBeVisible({ timeout: 5000 });
  });

  // sticky 保存栏悬浮在内容之上：元素被 Playwright 最小滚动贴到视口底部时会被拦截，
  // 先把目标滚到视口中央再点。
  async function centerClick(locator: import('@playwright/test').Locator) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await locator.click();
  }

  test('复检策略：超时兜底策略选择并保存后持久化（GT 决策#2）', async ({ authenticatedPage }) => {
    await openRescanM3(authenticatedPage);

    const policy = authenticatedPage.locator('[aria-label="deep-inspect-timeout-policy"]');
    await centerClick(policy);
    await authenticatedPage.locator('[role="option"]', { hasText: '放行并标记' }).click();
    await authenticatedPage.waitForTimeout(200);
    await expect(policy).toHaveText(/放行并标记/);

    await saveDraft(authenticatedPage);

    // 重新打开抽屉验证持久化
    await authenticatedPage
      .locator('[data-testid="pipeline-config-drawer"]')
      .getByRole('button', { name: '关闭' })
      .first()
      .click();
    await authenticatedPage.waitForTimeout(500);
    await openRescanM3(authenticatedPage);
    await expect(
      authenticatedPage.locator('[aria-label="deep-inspect-timeout-policy"]'),
    ).toHaveText(/放行并标记/, { timeout: 5000 });

    // 恢复默认（block + M3 关）并保存，避免污染后续
    await centerClick(authenticatedPage.locator('[aria-label="deep-inspect-timeout-policy"]'));
    await authenticatedPage.locator('[role="option"]', { hasText: '拦截并提示' }).click();
    await authenticatedPage.waitForTimeout(200);
    await centerClick(authenticatedPage.locator('[role="switch"][aria-label="rescan-deep-inspect"]'));
    await authenticatedPage.waitForTimeout(200);
    await saveDraft(authenticatedPage);
  });

  test('复检策略：允许跳过开启后出现红色风险条', async ({ authenticatedPage }) => {
    await openRescanM3(authenticatedPage);

    const allowSkip = authenticatedPage.locator('[role="switch"][aria-label="allow-user-skip"]');
    await expect(allowSkip).toBeVisible({ timeout: 5000 });
    if ((await allowSkip.getAttribute('aria-checked')) !== 'true') {
      await allowSkip.click();
      await authenticatedPage.waitForTimeout(300);
    }

    await expect(authenticatedPage.getByTestId('allow-skip-risk-banner')).toBeVisible({ timeout: 5000 });
  });

  // GT 决策#1（覆盖 GT-11727 的一刀切删除）：传统版形态渲染 URL沙箱检测 Tab（默认选中）；
  // M3 深度复检双形态渲染，传统版引擎徽章为「URL 沙箱」（demo 演进行为，html_spec §5.2-3）。
  test('传统版形态：沙箱 Tab 默认选中 + 字段/校验/联动 + M3 引擎徽章', async ({ authenticatedPage }) => {
    await authenticatedPage.context().addCookies([{
      name: 'osg_form_override',
      value: 'legacy-single',
      url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
      sameSite: 'Lax',
    }]);

    await openUrlProtectionDrawer(authenticatedPage);
    await ensureMasterEnabled(authenticatedPage);

    // 双 Tab，沙箱默认选中（html_spec §5.2-3）
    await expect(authenticatedPage.getByTestId('url-protection-tabs')).toBeVisible({ timeout: 5000 });
    const sandboxTab = authenticatedPage.getByTestId('tab-sandbox');
    await expect(sandboxTab).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByTestId('tab-link-protection')).toBeVisible();
    await expect(sandboxTab).toHaveAttribute('aria-selected', 'true');
    await expect(authenticatedPage.getByTestId('sandbox-tab')).toBeVisible();

    // 沙箱字段默认值（html_spec layer-1）
    await expect(authenticatedPage.locator('[role="switch"][aria-label="sandbox-toggle"]')).toBeVisible();
    await expect(authenticatedPage.locator('[aria-label="sandbox-malicious-action"]')).toHaveText(/隔离（邮件存入隔离区）/);
    await expect(authenticatedPage.locator('[aria-label="sandbox-timeout-action"]')).toHaveText(/进行下一步检测/);
    await expect(authenticatedPage.locator('[aria-label="sandbox-cleanup-days"]')).toHaveValue('180');

    // 清理周期校验：非法值回弹 + 红字（html_spec layer-2 状态 2A）
    await authenticatedPage.locator('[aria-label="sandbox-cleanup-days"]').fill('20');
    await authenticatedPage.waitForTimeout(300);
    await expect(authenticatedPage.locator('text=清理周期需在 30-365 天之间')).toBeVisible();
    await expect(authenticatedPage.locator('[aria-label="sandbox-cleanup-days"]')).toHaveValue('180');

    // 本地情报库关闭 → 清理周期块卸载；重开保留（html_spec layer-2 状态 2B）
    await authenticatedPage.locator('[role="switch"][aria-label="sandbox-local-intel"]').click();
    await authenticatedPage.waitForTimeout(300);
    await expect(authenticatedPage.getByTestId('sandbox-cleanup-zone')).toHaveCount(0);
    await authenticatedPage.locator('[role="switch"][aria-label="sandbox-local-intel"]').click();
    await authenticatedPage.waitForTimeout(300);
    await expect(authenticatedPage.getByTestId('sandbox-cleanup-zone')).toBeVisible();

    // 沙箱开关关闭 → 处置区置灰（html_spec layer-2 状态 2C）
    await authenticatedPage.locator('[role="switch"][aria-label="sandbox-toggle"]').click();
    await authenticatedPage.waitForTimeout(300);
    await expect(
      authenticatedPage.locator('[data-testid="sandbox-detect-zone"].opacity-50.pointer-events-none'),
    ).toBeVisible();

    // M3 在传统版渲染，引擎徽章 = URL 沙箱（demo 双形态行为）
    await authenticatedPage.getByTestId('tab-link-protection').click();
    await authenticatedPage.waitForTimeout(300);
    await expect(authenticatedPage.locator('[role="switch"][aria-label="rescan-deep-inspect"]')).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('rescan-policy-section').locator('text=URL 沙箱').first(),
    ).toBeVisible();
  });
});
