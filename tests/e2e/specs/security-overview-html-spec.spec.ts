import { expect, test } from '../fixtures/auth.fixture';

test.describe('邮件安全总览 HTML spec v3', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await authenticatedPage.addInitScript(() => {
      window.localStorage.setItem('osgateway_mock_enabled', '1');
    });
    await authenticatedPage.goto('/zh/statistics/security-overview');
    await expect(authenticatedPage.getByRole('heading', { name: '邮件安全总览' })).toBeVisible();
    await expect(authenticatedPage.getByTestId('security-overview-page')).toHaveCSS(
      'background-color',
      'rgb(248, 249, 251)',
    );
  });

  test('双视角、时空下钻、明细展开与无 PDF/AI 分析入口', async ({ authenticatedPage }) => {
    const tabs = authenticatedPage.getByRole('tab');
    await expect(tabs).toHaveText(['邮件类型', '处置动作']);
    await expect(authenticatedPage.getByRole('button', { name: '面积图' })).toHaveCount(0);
    await expect(authenticatedPage.getByText('拦截率(计算方法待定)')).toHaveCount(0);
    await expect(authenticatedPage.getByRole('button', { name: '生成报告' })).toHaveCount(0);

    const detailTable = authenticatedPage.getByTestId('security-overview-detail-table');
    await expect(detailTable.getByRole('columnheader')).toHaveText([
      '', '日期', '过滤邮件总量', '正常', '订阅资讯', '垃圾邮件', '广告邮件', '有害内容邮件',
      '钓鱼邮件', '账号被盗', '可疑邮件', '仿冒邮件', '病毒邮件', '敏感内容邮件', '拦截率', '环比变化',
    ]);
    await expect(detailTable.getByRole('row').nth(1).getByRole('cell').last()).toHaveText(/[+-]?\d+\.\d%/);

    const geoCard = authenticatedPage.getByTestId('geo-distribution-card');
    const timeCard = authenticatedPage.getByTestId('time-distribution-card');
    const timeChart = authenticatedPage.getByTestId('time-distribution-echarts');
    const geoBox = await geoCard.boundingBox();
    const timeBox = await timeCard.boundingBox();
    expect(geoBox).not.toBeNull();
    expect(timeBox).not.toBeNull();
    expect(Math.abs(geoBox!.y - timeBox!.y)).toBeLessThan(2);
    expect(Math.abs(geoBox!.width - timeBox!.width)).toBeLessThan(2);
    await expect(timeChart.locator('canvas')).toBeVisible();

    await authenticatedPage.getByRole('button', { name: '周内分布' }).click();
    await expect(timeChart.locator('canvas').first()).toBeVisible();
    await expect(authenticatedPage.getByTestId('peak-hours-list')).toHaveCount(0);

    const usRank = authenticatedPage.locator('button[data-country-code="US"]');
    await usRank.click();
    await expect(usRank).toContainText('1,245');
    await expect(usRank).toHaveAttribute('aria-pressed', 'true');
    await expect(authenticatedPage.getByTestId('geo-country-drilldown')).toHaveCount(0);

    await authenticatedPage.getByRole('tab', { name: '处置动作' }).click();
    const deliverLegend = authenticatedPage.getByRole('button', { name: '投递', exact: true });
    await deliverLegend.click();
    await expect(deliverLegend.locator('span')).toHaveClass(/line-through/);
    await deliverLegend.dblclick();
    await expect(authenticatedPage.locator('button span.line-through')).toHaveCount(7);

    await authenticatedPage.getByRole('button', { name: 'expand' }).first().click();
    await expect(authenticatedPage.getByRole('button', { name: 'collapse' })).toBeVisible();
    await expect(authenticatedPage.getByRole('cell').filter({ hasText: /投递:.*\(\d+\.\d%\)/ })).toBeVisible();

    await expect(authenticatedPage.getByTestId('security-overview-ai-analysis')).toHaveCount(0);
  });

  test('ECharts 世界地图按威胁数量着色并与排行、筛选和下钻联动', async ({ authenticatedPage }) => {
    const card = authenticatedPage.getByTestId('geo-distribution-card');
    const map = authenticatedPage.getByTestId('geo-world-map');
    const ranking = authenticatedPage.getByTestId('geo-ranking');

    await expect(map.locator('svg')).toBeVisible();
    await expect(map.locator('circle')).toHaveCount(0);
    await expect(card).toContainText('本周攻击主要来源于：美国(37%)、巴西(16%)、荷兰(11%)');
    await expect(ranking.locator('button[data-country-code]')).toHaveCount(10);
    await expect(card.locator('button[data-country-code="US"] span[style*="flags-4x3.png"]')).toBeVisible();
    expect(await ranking.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

    const hottestCountry = map.locator('path[fill="rgb(153,27,27)"]').first();
    await expect(hottestCountry).toBeVisible();
    await hottestCountry.hover();
    await expect(map.getByText('威胁邮件数量: 1,245')).toBeVisible();
    await expect(map.getByText('拦截率: 97.2%')).toBeVisible();
    await hottestCountry.click();
    await expect(card.locator('[data-slot="card-title"]')).toContainText('美国');
    await expect(card.locator('button[data-country-code="US"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(map.locator('path[stroke="rgb(37,99,235)"]').first()).toBeVisible();

    await card.getByRole('combobox', { name: '威胁筛选' }).click();
    await authenticatedPage.getByRole('option', { name: '钓鱼邮件' }).click();
    await expect(card.locator('button[data-country-code="US"]')).toContainText('386');
    await expect(card.locator('button[data-country-code="US"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByTestId('geo-country-drilldown')).toHaveCount(0);

    await card.getByRole('button', { name: '返回全球' }).click();
    await expect(card.getByRole('button', { name: '返回全球' })).toHaveCount(0);

    await authenticatedPage.evaluate(() => document.documentElement.classList.add('dark'));
    await expect(authenticatedPage.locator('html')).toHaveClass(/dark/);
    await expect(map.locator('path[fill="#374151"]').first()).toBeVisible();

    await authenticatedPage.setViewportSize({ width: 768, height: 900 });
    const mapBox = await map.boundingBox();
    const rankingBox = await ranking.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(rankingBox).not.toBeNull();
    expect(rankingBox!.y).toBeGreaterThan(mapBox!.y);
  });
});
