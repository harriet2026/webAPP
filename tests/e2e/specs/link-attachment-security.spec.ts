import { test, expect } from '../fixtures/auth.fixture';

const PAGE_PATH = '/zh/statistics/link-attachment-security';

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

    await page.getByRole('combobox', { name: '时间范围' }).click();
    await page.getByRole('option', { name: '近30日' }).click();
    await expect(page.getByRole('combobox', { name: '时间范围' })).toContainText('近30日');
  });

  test('attachment KPI and tab rebuild the attachment analysis view', async ({ authenticatedPage: page }) => {
    await page.getByTestId('kpi-totalAttachmentMail').click();
    await expect(page.getByRole('tab', { name: '恶意附件分析' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('附件类型分布').first()).toBeVisible();
    await expect(page.getByText('沙箱检测结果分布').first()).toBeVisible();
    await expect(page.getByText('TOP 恶意附件').first()).toBeVisible();
  });

  test('chart type persists and detail drill-down stays hidden', async ({ authenticatedPage: page }) => {
    await page.getByRole('button', { name: '堆叠面积图' }).click();
    await expect(page.getByRole('button', { name: '堆叠面积图' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('las_chart_type'))).toBe('area');

    const detail = page.getByTestId('link-attachment-detail');
    const rows = detail.locator('tbody tr');
    if (await rows.count()) {
      // The detail table renders one row per DAY that actually has link-mail
      // data (backend QueryLinkDetail GROUP BY day, no zero-fill). The demo
      // fixture hardcodes 7 dates, but the real count tracks how many days of
      // traffic the DB holds — a freshly recreated regression DB has far fewer
      // than 7. So assert the real contract (per this test's title): the
      // drill-down stays hidden — every detail row is a plain data row with NO
      // expander button and NO inline chart — instead of a data-volume-
      // dependent hardcoded count.
      await expect(detail.locator('tbody button')).toHaveCount(0);
      await expect(detail.locator('canvas')).toHaveCount(0);
    }
  });

  test('keeps only the approved CSV action', async ({ authenticatedPage: page }) => {
    await expect(page.getByRole('button', { name: '导出 CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: /生成报告|AI 分析|AI 解读|一键召回/ })).toHaveCount(0);
  });
});
