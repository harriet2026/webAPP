import { test, expect } from '@playwright/test';
import {
  TENANT_ADMIN_PASSWORD,
  TENANT_ADMIN_USERNAME,
} from '../helpers/roles';

test.describe('GT-13021 system-status bootstrap deduplication', () => {
  test('tenant bootstrap does not restart the core dashboard requests', async ({ page }, testInfo) => {
    test.setTimeout(45_000);

    const requestCounts = {
      summary: 0,
      opsTop: 0,
    };
    let coreStartedResolve!: () => void;
    const coreStarted = new Promise<void>((resolve) => {
      coreStartedResolve = resolve;
    });
    const markCoreStarted = () => {
      if (requestCounts.summary > 0 && requestCounts.opsTop > 0) {
        coreStartedResolve();
      }
    };

    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith('/statistics/system-status-summary')) {
        requestCounts.summary += 1;
        markCoreStarted();
      } else if (pathname.endsWith('/statistics/ops-top')) {
        requestCounts.opsTop += 1;
        markCoreStarted();
      }
    });

    await page.route('**/api/v1/statistics/system-status-summary?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          current: { mail_volume: 12, threats: 3, block_rate: 25 },
          previous: { mail_volume: 10, threats: 2, block_rate: 20 },
          threat_trend: [],
          pending_disposal: 0,
          generated_at: '2026-08-18T00:00:00Z',
        }),
      });
    });
    await page.route('**/api/v1/statistics/ops-top?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dimension: 'sender',
          total: 0,
          rows: [],
          trendLabels: [],
        }),
      });
    });

    // Reproduce the Jira timing deterministically: before /bootstrap resolves,
    // the core dashboard has already started with all agent grants fail-closed.
    // Once the tenant grants arrive, only the agent query may start; the stable
    // core query key must not issue a second summary/ops-top batch.
    await page.route('**/api/v1/bootstrap', async (route) => {
      const response = await route.fetch();
      if (response.ok()) {
        await Promise.race([
          coreStarted,
          new Promise((resolve) => setTimeout(resolve, 5_000)),
        ]);
      }
      await route.fulfill({ response });
    });

    const hydrated = page
      .waitForResponse((response) => response.url().includes('/auth/password-policy'))
      .catch(() => null);
    const successfulBootstrap = page.waitForResponse(
      (response) => response.url().includes('/api/v1/bootstrap') && response.ok(),
      { timeout: 30_000 },
    );
    await page.goto('/zh/login?advance');
    await hydrated;
    await page.locator('input[name="username"]').fill(TENANT_ADMIN_USERNAME);
    await page.locator('input[name="password"]').fill(TENANT_ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/zh\/dashboard/, { timeout: 30_000 });
    await expect.poll(() => requestCounts).toEqual({ summary: 1, opsTop: 1 });
    await successfulBootstrap;
    await page.waitForTimeout(1_000);

    expect(requestCounts).toEqual({ summary: 1, opsTop: 1 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await testInfo.attach('network-counts', {
      body: JSON.stringify(requestCounts, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('system-status-fixed', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
});
