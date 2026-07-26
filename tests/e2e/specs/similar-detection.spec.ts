import { test, expect } from '../fixtures/auth.fixture';


import type { Page } from '@playwright/test';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });


/**
 * 相似检测（similarDetection）—— html_spec 对齐重构后的新 UI（阶段5 综合策略 /
 * 相似检测抽屉，双 Tab「相似邮件检测 / 相同主题检测」+ RadioGroup「按方向独立/
 * 全方向聚合」+ 三列方向卡 / 单张聚合卡）。
 *
 * design/implement/spec/filter-rules-pipeline-similar-detection-html-spec-alignment.md
 * 是本次重构的权威 spec；旧 spec（aggregate/separate Tabs + module-level 观察开关模型）
 * 已过时，随本次重写整体替换。
 *
 * 走客户端 mock（localStorage `osgateway_mock_enabled=1`，src/lib/mock/{dispatcher,
 * fixtures}.ts），GET /security/similar-detection 返回 defaultConfig()（与
 * src/components/security/similar-detection/defaults.ts 逐字段一致）：
 *   - similar_email: receive{观察开,30,80%,10,隔离} / send{观察关,30,80%,10,隔离} /
 *     internal{观察关,30,80%,10,标记投递+主题标记开/前缀/"[相似邮件]"}
 *   - same_subject:  receive{观察开,60,-,50,隔离} / send{观察开,60,-,50,审核} /
 *     internal{观察关,60,-,50,隔离}（无相似度滑块）
 * cookie `osg_form_override=cloud` 强制云网关形态，使综合策略渲染为阶段5（否则
 * 默认形态可能退化为阶段4，面包屑/左导航摘要断言会不匹配）。
 */

// 共享 dev server 上多会话并发时单步耗时可达空载数倍（同仓库其他模块 spec 的既有
// 先例，见 intent-engine.spec.ts），默认 30s 总预算容易把「打开抽屉→切 Tab→交互」
// 的长用例误杀成超时；放宽到 90s。
test.describe.configure({ timeout: 90_000 });

async function openSimilarDetectionDrawer(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem('osgateway_mock_enabled', '1'));
  await page.context().addCookies([{
    name: 'osg_form_override',
    value: 'cloud',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost',
    sameSite: 'Lax',
  }]);
  await page.goto('/zh/security/pipeline', { waitUntil: 'networkidle', timeout: 60000 });

  const card = page.getByTestId('pipeline-policy-card-similarDetection');
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.click();

  const drawer = page.getByTestId('pipeline-config-drawer');
  await expect(drawer).toBeVisible({ timeout: 15000 });
  // 相似邮件检测 Tab 可见即视为模块脱离 loading 就绪（兼顾 dev server 冷编译）。
  await expect(drawer.getByTestId('similar-detection-tab-similar-email')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300);
  return drawer;
}

test.describe('相似检测 similarDetection（阶段5 综合策略，html_spec 对齐新 UI）', () => {
  test('打开抽屉：面包屑与左导航摘要，默认相似邮件 Tab 参数 30/80/10，接收观察徽章', async ({ authenticatedPage: page }) => {
    const drawer = await openSimilarDetectionDrawer(page);

    // 面包屑「阶段5: 综合策略 / 相似检测」（pipeline.similarDetection，D-8 刻意与
    // 模块内标题「相似邮件与主题检测」不同名，见 SimilarDetectionPage 注释）。
    await expect(page.getByTestId('pipeline-config-drawer-title')).toHaveText('阶段5: 综合策略 / 相似检测');

    // 左导航首项名「相似邮件与主题检测」+ 动态摘要「窗口30分钟 / 阈值80%」
    // （mode=separate 默认取 similar_email.receive 的 window/threshold）。
    const navItem = page.locator('nav button').filter({ hasText: '相似邮件与主题检测' }).first();
    await expect(navItem).toBeVisible();
    await expect(navItem).toContainText('窗口30分钟 / 阈值80%');

    // 默认 Tab = 相似邮件检测。
    await expect(drawer.getByTestId('similar-detection-tab-similar-email')).toHaveAttribute('aria-selected', 'true');
    await expect(drawer.getByTestId('similar-detection-tab-same-subject')).toHaveAttribute('aria-selected', 'false');

    // 三张方向卡默认可见（mode=separate 全选）；接收卡默认 30 分钟 / 80% / 10 封。
    const receiveCard = drawer.getByTestId('similar-detection-card-receive');
    await expect(receiveCard).toBeVisible();
    const numberInputs = receiveCard.locator('input[type="number"]');
    await expect(numberInputs.first()).toHaveValue('30'); // window_minutes
    await expect(numberInputs.nth(1)).toHaveValue('10'); // min_count
    await expect(receiveCard.locator('input[type="range"]')).toHaveCount(1);

    // 接收方向默认观察模式开启 → 全局警告条含「接收方向」徽章。
    const banner = drawer.getByTestId('similar-detection-observe-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('接收方向');
  });

  test('双 Tab 切换：相同主题参数变为 60/50 且无相似度滑块，主题标准化块与两方向观察徽章', async ({ authenticatedPage: page }) => {
    const drawer = await openSimilarDetectionDrawer(page);

    // 切换前：相似邮件 Tab 三卡各带一个相似度滑块。
    await expect(drawer.locator('input[type="range"]')).toHaveCount(3);

    await drawer.getByTestId('similar-detection-tab-same-subject').click();
    await expect(drawer.getByTestId('similar-detection-tab-same-subject')).toHaveAttribute('aria-selected', 'true');

    // 相同主题 Tab 参数集 60/50，且无相似度滑块渲染。
    const receiveCard = drawer.getByTestId('similar-detection-card-receive');
    await expect(receiveCard).toBeVisible();
    const numberInputs = receiveCard.locator('input[type="number"]');
    await expect(numberInputs.first()).toHaveValue('60');
    await expect(numberInputs.nth(1)).toHaveValue('50');
    await expect(drawer.locator('input[type="range"]')).toHaveCount(0);

    // 主题标准化（全局）4 复选框：勾/勾/不勾/勾。
    await expect(drawer.getByTestId('similar-detection-norm-ignoreCase')).toHaveAttribute('aria-checked', 'true');
    await expect(drawer.getByTestId('similar-detection-norm-ignoreRePrefix')).toHaveAttribute('aria-checked', 'true');
    await expect(drawer.getByTestId('similar-detection-norm-ignoreNumbers')).toHaveAttribute('aria-checked', 'false');
    await expect(drawer.getByTestId('similar-detection-norm-similarSubject')).toHaveAttribute('aria-checked', 'true');

    // 相同主题默认接收+外发均观察开启 → 警告条含两个方向徽章。
    const banner = drawer.getByTestId('similar-detection-observe-banner');
    await expect(banner).toContainText('接收方向');
    await expect(banner).toContainText('外发方向');
  });

  test('检测方向配置切换聚合模式：三卡与复选行消失、聚合卡出现；切回后恢复', async ({ authenticatedPage: page }) => {
    const drawer = await openSimilarDetectionDrawer(page);

    await expect(drawer.getByTestId('similar-detection-card-receive')).toBeVisible();
    await expect(drawer.getByTestId('similar-detection-dir-receive')).toBeVisible();
    await expect(drawer.getByTestId('similar-detection-card-aggregate')).toHaveCount(0);

    await drawer.getByTestId('similar-detection-mode-aggregate').click();
    await page.waitForTimeout(300);

    await expect(drawer.getByTestId('similar-detection-card-aggregate')).toBeVisible();
    await expect(drawer.getByTestId('similar-detection-card-receive')).toHaveCount(0);
    await expect(drawer.getByTestId('similar-detection-card-send')).toHaveCount(0);
    await expect(drawer.getByTestId('similar-detection-card-internal')).toHaveCount(0);
    await expect(drawer.getByTestId('similar-detection-dir-receive')).toHaveCount(0);

    // 切回按方向独立检测，三卡与复选行恢复。
    await drawer.getByTestId('similar-detection-mode-separate').click();
    await page.waitForTimeout(300);

    await expect(drawer.getByTestId('similar-detection-card-aggregate')).toHaveCount(0);
    await expect(drawer.getByTestId('similar-detection-card-receive')).toBeVisible();
    await expect(drawer.getByTestId('similar-detection-dir-receive')).toBeVisible();
  });

  test('观察开关联动：外发观察开启后动作禁用+警告条新增「外发方向」徽章，关闭后还原', async ({ authenticatedPage: page }) => {
    const drawer = await openSimilarDetectionDrawer(page);

    const banner = drawer.getByTestId('similar-detection-observe-banner');
    const sendAction = drawer.getByTestId('similar-detection-action-send');
    await expect(banner).not.toContainText('外发方向');
    await expect(sendAction).toBeEnabled();

    await drawer.getByTestId('similar-detection-observe-send').click();
    await page.waitForTimeout(300);

    await expect(banner).toContainText('外发方向');
    await expect(sendAction).toBeDisabled();

    // 关闭外发观察，动作恢复可用，警告条徽章消失。
    await drawer.getByTestId('similar-detection-observe-send').click();
    await page.waitForTimeout(300);

    await expect(banner).not.toContainText('外发方向');
    await expect(sendAction).toBeEnabled();
  });

  test('同步到其他方向复制整份配置；域内卡默认展开标记面板；全不选后空态提示', async ({ authenticatedPage: page }) => {
    const drawer = await openSimilarDetectionDrawer(page);

    // 域内卡默认 action=mark-delivery，标记面板展开，主题标记开启且内容为「[相似邮件]」。
    const internalCard = drawer.getByTestId('similar-detection-card-internal');
    const tagPanel = internalCard.getByTestId('similar-detection-tag-panel');
    await expect(tagPanel).toBeVisible();
    await expect(tagPanel.getByTestId('similar-detection-tag-subject-switch')).toHaveAttribute('aria-checked', 'true');
    await expect(tagPanel.getByTestId('similar-detection-tag-subject-content')).toHaveValue('[相似邮件]');

    // 改外发窗口为 45 分钟，点击「同步到其他方向」，域内卡窗口同步变为 45。
    const sendCard = drawer.getByTestId('similar-detection-card-send');
    const sendWindowInput = sendCard.locator('input[type="number"]').first();
    await sendWindowInput.fill('45');
    await page.waitForTimeout(200);
    await drawer.getByTestId('similar-detection-sync-send').click();
    await page.waitForTimeout(300);

    const internalWindowInput = internalCard.locator('input[type="number"]').first();
    await expect(internalWindowInput).toHaveValue('45');

    // 全部取消勾选检测方向 → 卡片区消失，显示「至少选择一个检测方向」空态提示。
    await drawer.getByTestId('similar-detection-dir-receive').click();
    await drawer.getByTestId('similar-detection-dir-send').click();
    await drawer.getByTestId('similar-detection-dir-internal').click();
    await page.waitForTimeout(300);

    await expect(drawer.getByTestId('similar-detection-empty-hint')).toBeVisible();
    await expect(drawer.getByTestId('similar-detection-card-receive')).toHaveCount(0);
  });

  test('保存：修改后点击保存出现成功提示，脏态清除', async ({ authenticatedPage: page }) => {
    const drawer = await openSimilarDetectionDrawer(page);

    const saveButton = drawer.getByTestId('similar-detection-save');
    await expect(saveButton).toBeDisabled();

    const receiveCard = drawer.getByTestId('similar-detection-card-receive');
    const minCountInput = receiveCard.locator('input[type="number"]').nth(1);
    await minCountInput.fill('12');
    await page.waitForTimeout(200);

    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await expect(page.getByText('相似邮件与主题检测 ✓')).toBeVisible({ timeout: 5000 });
    await expect(saveButton).toBeDisabled({ timeout: 5000 });
  });
});
