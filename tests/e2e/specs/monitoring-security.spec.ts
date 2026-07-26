import { expect, test } from '../fixtures/auth.fixture';

test.describe('Detection engine status', () => {
  test('switches engines and makes detail rows follow the selected time range', async ({ authenticatedPage }) => {
    await authenticatedPage.evaluate(() => localStorage.setItem('osgateway_mock_enabled', '1'));
    await authenticatedPage.goto('/zh/monitoring/security');
    await expect(authenticatedPage.getByTestId('monitor-security-page')).toBeVisible();

    const engines = ['antispam', 'antivirus', 'sandbox', 'rbl'];
    for (const engine of engines) {
      await expect(authenticatedPage.getByTestId(`monitor-security-engine-${engine}`)).toBeVisible();
    }

    await authenticatedPage.getByTestId('monitor-security-engine-sandbox').click();
    await expect(authenticatedPage.getByTestId('monitor-security-engine-sandbox')).toHaveAttribute('aria-pressed', 'true');
    await expect(authenticatedPage.locator('[data-testid^="monitor-security-detail-row-sandbox-"]')).toHaveCount(3);

    await authenticatedPage.getByTestId('monitor-security-engine-antispam').click();
    await authenticatedPage.getByTestId('monitor-security-range-trigger').click();
    await authenticatedPage.getByTestId('monitor-security-range-7d').click();
    await expect(authenticatedPage.locator('[data-testid^="monitor-security-detail-row-antispam-"]')).toHaveCount(7);

    await authenticatedPage.getByTestId('monitor-security-range-trigger').click();
    await authenticatedPage.getByTestId('monitor-security-range-30d').click();
    await expect(authenticatedPage.locator('[data-testid^="monitor-security-detail-row-antispam-"]')).toHaveCount(30);
  });
});
