import { test, expect } from '../fixtures/auth.fixture';

test.describe('Alert Center — stats cards', () => {
  test('TC028-030 stat cards reflect stats API and update on refresh', async ({ authenticatedPage }) => {
    let refreshed = false;
    await authenticatedPage.route('**/api/v1/monitor/alerts/stats', (r) => {
      r.fulfill({ json: !refreshed
        ? { total: 100, unconfirmed: 5, processing: 3, resolved: 92, critical: 1, major: 2 }
        : { total: 101, unconfirmed: 6, processing: 3, resolved: 92, critical: 2, major: 2 } });
    });
    await authenticatedPage.route(/\/api\/v1\/monitor\/alerts(\?.*)?$/, (r) =>
      r.fulfill({ json: { items: [], total: 0, page: 1, page_size: 50 } }));

    await authenticatedPage.goto('/zh/monitoring/alerts');
    // The page intentionally polls every 30s, so networkidle can race the next
    // poll on a cold dev-server compile. Wait for the actual UI contract.
    await expect(authenticatedPage.getByTestId('stat-total')).toBeVisible();
    await expect(authenticatedPage.getByTestId('stat-total')).toContainText('100');
    await expect(authenticatedPage.getByTestId('stat-unconfirmed')).toContainText('5');

    refreshed = true;
    await authenticatedPage.getByRole('button', { name: /刷新|Refresh/ }).click();
    await expect(authenticatedPage.getByTestId('stat-total')).toContainText('101');
    await expect(authenticatedPage.getByTestId('stat-critical')).toContainText('2');
  });
});
