import { test, expect } from '../fixtures/auth.fixture';

// Module A (policy pipeline) is tenant-scoped: the platform admin is blocked in
// the multi-tenant dev form (GT-12149 / PRD §1.4), so drive the UI as a tenant_admin.
test.use({ asRole: 'tenant_admin' });




// GT-11894: the action legend at the foot of the policy pipeline shipped with
// four of the gateway's six actions, each a bare label. tagDeliver and review
// were absent, so two of the colours used in the diagram above had nothing to
// decode them, and no action carried the one-line description the prototype
// pairs with each swatch.
const LEGEND = [
  { key: 'deliver', label: '投递', desc: '正常投递收件箱' },
  { key: 'tagDeliver', label: '标记投递', desc: '投递并标记可疑' },
  { key: 'quarantine', label: '隔离', desc: '移至隔离区待审' },
  { key: 'review', label: '审核', desc: '进入人工审核队列' },
  { key: 'block', label: '阻断', desc: '拒绝并退信' },
  { key: 'drop', label: '丢弃', desc: '直接删除不通知' },
];

test.describe('Policy pipeline action legend (/security/pipeline)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('renders all six actions with their descriptions', async ({ authenticatedPage }) => {
    for (const { key, label, desc } of LEGEND) {
      const item = authenticatedPage.locator(`[data-testid="action-legend-${key}"]`);
      await expect(item, key).toBeVisible({ timeout: 10000 });
      await expect(item, key).toContainText(label);
      await expect(item, key).toContainText(desc);
    }
  });

  test('gives each action a swatch of its own colour', async ({ authenticatedPage }) => {
    const colors = await Promise.all(
      LEGEND.map(({ key }) =>
        authenticatedPage
          .locator(`[data-testid="action-legend-${key}"] span`)
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    );
    for (const [i, color] of colors.entries()) {
      // The tokens resolve to oklch, which Chromium serialises as `lab(...)`.
      // Assert a real colour was resolved rather than a transparent fallback,
      // which is what an unknown `var(--action-*)` would leave behind.
      expect(color, LEGEND[i].key).toMatch(/^(lab|oklch|rgb)\(/);
      expect(color, LEGEND[i].key).not.toMatch(/^rgba\(0, 0, 0, 0\)$/);
    }
    expect(new Set(colors).size, `swatch colours: ${colors.join(', ')}`).toBe(LEGEND.length);
  });

  test('the legend sits below the pipeline diagram', async ({ authenticatedPage }) => {
    const legend = await authenticatedPage.getByText('执行动作').first().boundingBox();
    const stage1 = await authenticatedPage.getByText(/阶段\s*1|IP\s*策略/).first().boundingBox();
    expect(legend).not.toBeNull();
    expect(stage1).not.toBeNull();
    expect(legend!.y).toBeGreaterThan(stage1!.y);
  });
});

// GT-11878: 阶段2 只有 4 个子项，缺「收信人检测」。后端能力（收信人数量限制）
// 完整且在线生效，只是管理入口被合并进了「发信行为管控」抽屉，而那次合并只在
// 流水线页执行了 —— 另外两处 UI 至今仍把它列为阶段2的第5项。补回该卡片作为入口。
test.describe('Policy pipeline stage2 收信人检测 (GT-11878)', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/security/pipeline');
    await authenticatedPage.waitForLoadState('networkidle');
  });

  test('阶段2 显示「收信人检测」卡片，点击打开发信行为管控抽屉', async ({ authenticatedPage }) => {
    const label = authenticatedPage.getByText('收信人检测', { exact: true }).first();
    await expect(label).toBeVisible({ timeout: 20_000 });

    // 未实现的「收件人地址验证」（LDAP 存在性验证）不得出现在页面上。
    // 注：流水线卡片只渲染名称 + 「配置」按钮，descKey 在这一页从不渲染（所有
    // policy 都如此，不只本项），所以这里不断言描述文案 —— 描述文案的内容由单测
    // tests/unit/policy-pipeline-stage2-recipient-check.test.ts 守住。
    await expect(authenticatedPage.getByText('收件人地址验证')).toHaveCount(0);

    // 点击后必须真的打开行为管控抽屉（而不是一个死卡片）。
    await label.click();
    const dialog = authenticatedPage.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText(/收信人数量限制|发信行为管控/);
  });
});
