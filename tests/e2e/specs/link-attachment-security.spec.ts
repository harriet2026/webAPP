import { test, expect } from '../fixtures/auth.fixture';
import type { Page } from '@playwright/test';

const PAGE_PATH = '/zh/statistics/link-attachment-security';

async function installMockIdentity(page: Page, mockData = true) {
  await page.context().addCookies([
    { name: 'osgateway_auth', value: '1', domain: 'localhost', path: '/' },
    { name: 'osgateway_token', value: 'link-attachment-mock-token', domain: 'localhost', path: '/' },
    { name: 'osg_viewer', value: 'platform', domain: 'localhost', path: '/' },
  ]);
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 20 }),
    });
  });
  await page.addInitScript(({ mockData }) => {
    if (mockData) localStorage.setItem('osgateway_mock_enabled', '1');
    else localStorage.removeItem('osgateway_mock_enabled');
    localStorage.setItem('osgateway_user', JSON.stringify({
      id: 1,
      username: 'link-attachment-reviewer',
      role: 'system_admin',
      role_id: null,
      is_super_admin: true,
      tenant_id: null,
      created_at: '',
      updated_at: '',
    }));
  }, { mockData });
}

test.describe('Link & Attachment Security', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto(PAGE_PATH);
    await page.waitForLoadState('networkidle');
  });

  test('renders the prototype-aligned filters and four KPI cards', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('heading', { name: '链接与附件安全' })).toBeVisible();
    await expect(page.getByTestId('link-attachment-filters')).toBeVisible();
    await expect(page.getByTestId('link-attachment-kpis').locator('[data-testid^="kpi-"]')).toHaveCount(4);
    await expect(page.getByText('含链接邮件总量').first()).toBeVisible();
    await expect(page.getByText('恶意附件检出率').first()).toBeVisible();
  });

  test('direction and time-range filters are interactive', async ({ authenticatedPage: page }) => {
    const receive = page.getByRole('button', { name: '接收', exact: true });
    await receive.click();
    await expect(receive).toHaveAttribute('aria-pressed', 'true');

    const range = page.getByRole('button', { name: '近30日', exact: true });
    await range.click();
    await expect(range).toHaveAttribute('aria-pressed', 'true');
  });

  test('attachment KPI and tab rebuild the attachment analysis view', async ({ authenticatedPage: page }) => {
    await page.getByTestId('kpi-totalAttachmentMail').click();
    await expect(page.getByRole('tab', { name: '恶意附件分析' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('附件类型分布').first()).toBeVisible();
    await expect(page.getByText('沙箱检测结果分布').first()).toBeVisible();
    await expect(page.getByText('TOP 恶意附件').first()).toBeVisible();
  });

  test('chart type persists and detail drill-down expands and collapses', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: '堆叠面积图' }).click();
    await expect(page.getByRole('button', { name: '堆叠面积图' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('las_chart_type'))).toBe('area');

    const detail = page.getByTestId('link-attachment-detail');
    const rows = detail.locator('tbody tr');
    if (await rows.count()) {
      const expander = detail.locator('tbody button[aria-expanded]').first();
      await expect(expander).toHaveAttribute('aria-expanded', 'false');
      await expander.click();
      await expect(expander).toHaveAttribute('aria-expanded', 'true');
      await expect(detail.locator('[data-testid^="threat-distribution-link-"]')).toBeVisible();
      await expander.click();
      await expect(detail.locator('[data-testid^="threat-distribution-link-"]')).toHaveCount(0);
    }
  });

  test('keeps only the approved CSV action', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('button', { name: '导出 CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: /生成报告|AI 分析|AI 解读|一键召回/ })).toHaveCount(0);
  });
});

test.describe('Link & Attachment Security ticket contracts (hermetic mock)', () => {
  test('keeps the system-admin tenant scope page-local and stable', async ({ page }) => {
    await installMockIdentity(page);
    await page.goto(PAGE_PATH);

    const selector = page.getByTestId('tenant-scope-selector');
    await expect(selector).toBeVisible();
    await selector.click();
    await page.getByRole('option', { name: '示例租户 A' }).click();
    await expect(selector).toContainText('示例租户 A');

    // ProductFormProvider reconciles platform view by clearing only the global
    // impersonation scope. The report's controlled page-local selection must
    // survive that effect and must not write the global selection key.
    await page.waitForTimeout(750);
    await expect(selector).toContainText('示例租户 A');
    expect(await page.evaluate(() => localStorage.getItem('osgateway_selected_tenant'))).toBeNull();
  });

  test('shows exact dual-view columns, complete domain metadata, and both row drill-downs', async ({ page }) => {
    await installMockIdentity(page);
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: '链接与附件安全' })).toBeVisible();

    const domainList = page.getByTestId('top-malicious-domains-list');
    const firstDomain = domainList.locator(':scope > div').first();
    await expect(firstDomain).toContainText('evil-phish.com');
    await expect(firstDomain).toContainText('检出次数');
    await expect(firstDomain).toContainText('点击拦截率');
    await expect(firstDomain).toContainText('首次出现');
    await expect(firstDomain).toContainText('封禁状态');

    await page.getByRole('button', { name: '查看全部 20' }).click();
    const domainsDrawer = page.getByRole('dialog');
    await expect(domainsDrawer).toContainText('evil-phish.com');
    await expect(domainsDrawer).toContainText('检出次数');
    await expect(domainsDrawer).toContainText('点击拦截率');
    await expect(domainsDrawer).toContainText('首次出现');
    await expect(domainsDrawer).toContainText('未封禁');
    await page.keyboard.press('Escape');
    await expect(domainsDrawer).toBeHidden();

    let detail = page.getByTestId('link-attachment-detail');
    await expect(detail.getByRole('columnheader')).toHaveText([
      '日期', '含链接邮件总量', '安全链接邮件', '恶意链接邮件', '钓鱼链接', '恶意软件下载',
      'C&C通信', '垃圾推广', '拦截率', '环比变化',
    ]);
    let expander = detail.locator('tbody button[aria-expanded]').first();
    await expander.click();
    await expect(detail.locator('[data-testid^="threat-distribution-link-"]')).toBeVisible();
    await expander.click();
    await expect(detail.locator('[data-testid^="threat-distribution-link-"]')).toHaveCount(0);

    await page.getByRole('tab', { name: '恶意附件分析' }).click();
    detail = page.getByTestId('link-attachment-detail');
    await expect(detail.getByRole('columnheader')).toHaveText([
      '日期', '含附件邮件总量', '安全附件邮件', '恶意附件邮件', '病毒附件', '宏文档',
      '压缩包炸弹', '漏洞利用', '拦截率', '环比变化',
    ]);
    expander = detail.locator('tbody button[aria-expanded]').first();
    await expander.click();
    await expect(detail.locator('[data-testid^="threat-distribution-attachment-"]')).toBeVisible();
  });

  test('renders a retryable service-unavailable state for a 503 instead of fake empty data', async ({ page }) => {
    await installMockIdentity(page, false);
    let statsRequests = 0;
    await page.route('**/api/v1/statistics/link-attachment-security?*', async (route) => {
      statsRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'temporarily unavailable' } }),
      });
    });

    await page.goto(PAGE_PATH);
    const errorState = page.getByTestId('link-attachment-error-state');
    await expect(errorState).toContainText('服务不可用', { timeout: 30000 });
    await expect(errorState.getByRole('button', { name: '重试' })).toBeVisible();
    await expect(page.getByText(/该时段无|暂无数据/)).toHaveCount(0);

    const beforeRetry = statsRequests;
    await errorState.getByRole('button', { name: '重试' }).click();
    await expect.poll(() => statsRequests).toBeGreaterThan(beforeRetry);
  });
});
