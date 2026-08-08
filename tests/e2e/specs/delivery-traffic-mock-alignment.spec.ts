import { test, expect } from '@playwright/test';

test.describe('Delivery Traffic html_spec alignment (mock runtime)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      { name: 'osgateway_token', value: 'delivery-alignment', domain: 'localhost', path: '/' },
      { name: 'osg_viewer', value: 'platform', domain: 'localhost', path: '/' },
    ]);
    await page.addInitScript(() => {
      localStorage.setItem('osgateway_mock_enabled', '1');
      localStorage.setItem('osgateway_user', JSON.stringify({
        id: 1,
        username: 'alignment-admin',
        role: 'system_admin',
        role_id: null,
        is_super_admin: true,
        tenant_id: null,
        created_at: '2026-07-23T00:00:00Z',
        updated_at: '2026-07-23T00:00:00Z',
      }));
    });
  });

  test('validates all four layers, custom dates and queue details', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto('/zh/statistics/delivery-traffic');
    await expect(page.getByText('投递与流量分析').first()).toBeVisible();

    await expect(page.getByText('租户范围').first()).toBeVisible();
    await expect(page.getByTestId('delivery-kpi-grid').locator('[data-slot="card"]')).toHaveCount(5);
    const queueCard = page.getByTestId('delivery-queue-health');
    await expect(queueCard.getByText('队列健康状态')).toBeVisible();
    await expect(queueCard.getByText('接收队列')).toBeVisible();
    await expect(queueCard.getByText('外发队列')).toBeVisible();
    await expect(queueCard.getByText('域内队列')).toBeVisible();
    await expect(queueCard.locator('.rounded-xl.border')).toHaveCount(0);
    await expect(queueCard.locator('[data-slot="tooltip-trigger"]')).toHaveCount(0);
    const bottomActions = page.getByTestId('delivery-bottom-actions');
    await expect(bottomActions.getByText('导出 CSV')).toBeVisible();
    await expect(bottomActions.getByText('生成报告')).toHaveCount(0);
    await expect(bottomActions.getByText('AI 分析')).toHaveCount(0);

    const detailCard = page.getByText('明细数据', { exact: true }).locator('xpath=ancestor::*[@data-slot="card"][1]');
    const firstDetailRow = detailCard.locator('tbody tr').first();
    await expect(firstDetailRow.locator('td').nth(2)).toHaveClass(/text-green-600/);
    await expect(firstDetailRow.locator('td').nth(3)).toHaveClass(/text-red-600/);
    await expect(firstDetailRow.locator('td').nth(4)).toHaveClass(/text-orange-500/);
    await expect(firstDetailRow.locator('td').nth(5)).toHaveClass(/text-muted-foreground/);
    await expect(firstDetailRow.locator('td').nth(6)).toHaveClass(/text-green-600/);
    // 环比 (change) column colors by SIGN — matches the demo prototype
    // (delivery-traffic-analysis-page.tsx: change >= 0 → red, < 0 → green).
    // The mock's `change` is seeded-random (rng()*10-5), so assert the coloring
    // RULE against each cell's actual value instead of hardcoding per-row colors
    // (those drift with any change to the fixture's RNG-consumption sequence).
    for (const detailRow of await detailCard.locator('tbody tr').all()) {
      const changeCell = detailRow.locator('td').nth(7);
      const n = parseFloat(((await changeCell.textContent()) ?? '').replace('%', '').trim());
      if (n > 0) await expect(changeCell).toHaveClass(/text-red-500/);
      else if (n < 0) await expect(changeCell).toHaveClass(/text-green-500/);
    }

    const expectations = {
      all: { visible: ['检测中', '取消'], hidden: [] },
      receive: { visible: ['检测中'], hidden: ['用户不存在', '邮箱已满'] },
      send: { visible: ['检测中'], hidden: ['目标拒绝', 'DNS失败', 'RBL拦截'] },
      internal: { visible: [], hidden: ['内部垃圾', '内部钓鱼', '内部病毒'] },
    } as const;

    for (const [direction, { visible, hidden }] of Object.entries(expectations)) {
      await page.getByTestId(`delivery-direction-${direction}`).click();
      await expect(page.getByTestId(`delivery-direction-${direction}`)).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(450);
      for (const header of visible) await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
      for (const header of hidden) await expect(page.getByRole('columnheader', { name: header })).toHaveCount(0);
    }

    await expect(page.getByTestId('delivery-internal-extended')).toBeVisible();
    await page.getByTestId('delivery-direction-send').click();
    await page.waitForTimeout(450);
    await expect(page.getByTestId('delivery-send-extended')).toBeVisible();

    await page.getByTestId('delivery-direction-receive').click();
    await page.waitForTimeout(450);
    const queueToggle = page.getByTestId('delivery-queue-expand');
    await queueToggle.click();
    await expect(queueToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('最老邮件年龄')).toBeVisible();
    await expect(page.getByText('处理速率')).toBeVisible();

    await page.getByTestId('delivery-time-range-custom').click();
    const dates = page.getByTestId('delivery-custom-range').locator('input[type="date"]');
    await dates.nth(0).fill('2026-01-01');
    await dates.nth(1).fill('2026-07-23');
    await expect(page.getByText('最多 90 天')).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });
});
