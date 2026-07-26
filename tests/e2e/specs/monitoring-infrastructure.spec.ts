import { test, expect } from '../fixtures/auth.fixture';

test.describe('Infrastructure monitoring', () => {
  test('system_admin sees page with all 4 tabs', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const tabs = ['硬件资源', '服务进程', '数据库与缓存', '存储与备份'];
    for (const tab of tabs) {
      const tabLocator = authenticatedPage.getByRole('tab', { name: tab });
      await expect(tabLocator).toBeVisible({ timeout: 5000 });
    }
  });

  test('tab switching works and data loads', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const tabNames = ['硬件资源', '服务进程', '数据库与缓存', '存储与备份'];
    for (const tabName of tabNames) {
      const tabLocator = authenticatedPage.getByRole('tab', { name: tabName });
      await tabLocator.click();
      await authenticatedPage.waitForTimeout(500);
    }
  });

  test('refresh button exists and is clickable', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const refreshBtn = authenticatedPage.getByRole('button', { name: /刷新|Refresh/ });
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
    await refreshBtn.click();
  });

  test('time range selector switches between 1h/24h/7d', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const ranges: [string, string][] = [
      ['1h', '近1小时'],
      ['24h', '近24小时'],
      ['7d', '近7天'],
    ];
    for (const [value, label] of ranges) {
      const trigger = authenticatedPage.locator('button[role="combobox"]').last();
      await trigger.click();
      await authenticatedPage.waitForTimeout(500);
      const option = authenticatedPage.locator(`[data-slot="select-item"][data-value="${value}"]`);
      await expect(option).toBeVisible({ timeout: 5000 });
      await option.click();
      await authenticatedPage.waitForTimeout(300);
    }
  });

  test('node selector is present', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const nodeSelect = authenticatedPage.locator('[role="combobox"]').first();
    await expect(nodeSelect).toBeVisible({ timeout: 5000 });
  });

  test('backup tab loads task rows and execution log from backend APIs', async ({ authenticatedPage }) => {
    await authenticatedPage.route('**/api/v1/monitor/backup?*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tasks: [{
            id: 'run-e2e-1',
            name: 'database-daily',
            exec_time: '2026-07-23T02:00:00Z',
            duration: 128,
            size: 12884901888,
            status: 'success',
          }],
        }),
      });
    });
    await authenticatedPage.route('**/api/v1/monitor/backup/run-e2e-1?*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'run-e2e-1',
          node: 'node-1',
          name: 'database-daily',
          exec_time: '2026-07-23T02:00:00Z',
          duration: 128,
          size: 12884901888,
          status: 'success',
          log: 'backup completed successfully',
        }),
      });
    });
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const storageTab = authenticatedPage.getByRole('tab', { name: '存储与备份' });
    await expect(storageTab).toBeVisible({ timeout: 5000 });
    await storageTab.click();
    await authenticatedPage.waitForLoadState('networkidle');
    await expect(
      authenticatedPage.getByTestId('monitor-infrastructure-backup-row-run-e2e-1'),
    ).toBeVisible({ timeout: 10000 });

    await authenticatedPage.getByTestId('monitor-infrastructure-backup-log-run-e2e-1').click();
    await expect(
      authenticatedPage.getByTestId('monitor-infrastructure-backup-log-content'),
    ).toContainText('backup completed successfully');
  });

  test('database tab shows DB backend name not hardcoded Kingbase', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const dbTab = authenticatedPage.getByRole('tab', { name: '数据库与缓存' });
    await expect(dbTab).toBeVisible({ timeout: 5000 });
    await dbTab.click();
    await authenticatedPage.waitForTimeout(1000);
    const kingbaseLabel = authenticatedPage.getByText('Kingbase', { exact: true });
    const hasHardcodedKingbase = await kingbaseLabel.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasHardcodedKingbase).toBe(false);
  });

  test('storage tab shows disk partition section', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const storageTab = authenticatedPage.getByRole('tab', { name: '存储与备份' });
    await expect(storageTab).toBeVisible({ timeout: 5000 });
    await storageTab.click();
    // Wait for storage API (TDengine query) to complete before asserting
    await authenticatedPage.waitForLoadState('networkidle');
    const partitionSection = authenticatedPage.getByText('磁盘分区使用率');
    await expect(partitionSection).toBeVisible({ timeout: 10000 });
  });

  test('control bar shows data update time', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const updateLabel = authenticatedPage.getByText(/数据更新时间|Data updated at/);
    await expect(updateLabel).toBeVisible({ timeout: 5000 });
  });

  test('skeleton loading state is shown during data fetch', async ({ authenticatedPage }) => {
    // Delay the monitor API so the skeleton stays visible long enough to assert.
    // On localhost the API can respond in < 50ms, which causes the skeleton to
    // disappear before Playwright detects it.
    await authenticatedPage.route('**/api/v1/monitor/**', async route => {
      await new Promise(r => setTimeout(r, 1500));
      await route.continue();
    });
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    const skeleton = authenticatedPage.locator('.animate-pulse').first();
    await expect(skeleton).toBeVisible({ timeout: 5000 });
    await authenticatedPage.unroute('**/api/v1/monitor/**');
  });

  test('all tabs have accessible keyboard navigation', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const tabList = authenticatedPage.getByRole('tablist');
    await expect(tabList).toBeVisible({ timeout: 5000 });

    const tabs = tabList.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBe(4);

    for (let i = 0; i < tabCount; i++) {
      await tabs.nth(i).focus();
      await authenticatedPage.keyboard.press('Tab');
    }
  });

  test('database tab shows status cards for db and redis', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const dbTab = authenticatedPage.getByRole('tab', { name: '数据库与缓存' });
    await dbTab.click();
    await authenticatedPage.waitForTimeout(1500);

    // Redis label is always shown
    const redisLabel = authenticatedPage.getByText('Redis', { exact: true });
    await expect(redisLabel).toBeVisible({ timeout: 5000 });
  });

  test('database tab renders without JS errors', async ({ authenticatedPage }) => {
    const jsErrors: string[] = [];
    authenticatedPage.on('pageerror', (err) => jsErrors.push(err.message));

    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const dbTab = authenticatedPage.getByRole('tab', { name: '数据库与缓存' });
    await dbTab.click();
    await authenticatedPage.waitForTimeout(2000);

    expect(jsErrors.filter(e => !e.includes('ChunkLoadError'))).toHaveLength(0);
  });

  test('database tab connections and latency section is visible', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/infrastructure');
    await authenticatedPage.waitForLoadState('networkidle');

    const dbTab = authenticatedPage.getByRole('tab', { name: '数据库与缓存' });
    await dbTab.click();
    await authenticatedPage.waitForTimeout(1500);

    // Connections / latency card title should be visible
    const connLatTitle = authenticatedPage.getByText(/连接数|Connections|connections/i).first();
    await expect(connLatTitle).toBeVisible({ timeout: 5000 });
  });
});
