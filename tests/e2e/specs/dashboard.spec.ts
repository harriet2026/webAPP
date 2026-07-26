import { test, expect } from '../fixtures/auth.fixture';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Dashboard', () => {
  test('page loads with stat cards', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.goto();
    await dashboardPage.expectLoaded();
    const count = await dashboardPage.getStatCardCount();
    expect(count).toBeGreaterThan(0);
  });
});
