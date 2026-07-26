/**
 * Playwright E2E for the Threat-Traceback Agent — Tab B 回溯策略.
 *
 * Covers spec §6.2 / §7 / §12 frontend items:
 *   a) strategy tab navigation
 *   b) strategy drawer is deep-only and reveals run-times + quick-add + lookback
 *   c) lookback dropdown enumerates only ≤24h options (no 48h/72h)
 *   d) quick-add 30m chip populates run-times
 *   e) save-and-test (deep only) posts to POST /scan
 *
 * Mirrors phishing-detection.spec.ts for HMAC /test/sql seeding.
 *
 * NOTE: not executed as part of this task — must be parseable + type-clean only.
 */

import * as crypto from 'crypto';
import { test, expect } from '../fixtures/auth.fixture';
import { internalFetch } from '../helpers/internal-client';
import { getDefaultTenantId } from '../helpers/tenant';
import { uniqueSuffix } from '../helpers/test-data';

const HMAC_SECRET = process.env.OSG_INTERNAL_HMAC_SECRET || 'test-hmac-secret-for-e2e';

function hmacTextHeaders(method: string, path: string, bodyStr: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\n${method.toUpperCase()}\n${path}\n${bodyStr}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload, 'utf-8').digest('hex');
  return { 'X-OSG-Timestamp': ts, 'X-OSG-Signature': sig };
}

async function seedSQL(sql: string): Promise<void> {
  const bodyStr = JSON.stringify({ sql });
  const resp = await internalFetch('/internal/v1/test/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hmacTextHeaders('POST', '/internal/v1/test/sql', bodyStr) },
    body: bodyStr,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`seedSQL failed: ${resp.status} ${text}`);
  }
}

test.describe('Threat-Traceback Strategy Tab', () => {
  // The threat-retro agent is platformHidden: without a selected tenant the
  // agent-center deep link falls back to the overview and no detail renders.
  test.beforeEach(async ({ authenticatedPage, request }) => {
    const tenantId = await getDefaultTenantId(request);
    // GT-12245: the platform viewer actively clears a residual tenant selection
    // (product-form-context.tsx), so writing osgateway_selected_tenant alone is
    // not enough -- it is wiped on mount and the tenant-gated, capability-granted
    // AI agent panel never renders. Switch the viewer as the real switcher does.
    await authenticatedPage.evaluate((tid: number) => {
      localStorage.setItem('osgateway_selected_tenant', String(tid));
      document.cookie = `osg_selected_tenant=${tid}; path=/; SameSite=Strict`;
      document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
    }, tenantId);
    // Writing osg_viewer makes the product-form context navigate on its own;
    // navigating straight away truncates it into net::ERR_ABORTED.
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);
  });

  test('strategy tab navigation: clicking the tab shows the strategy list', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro&tab=strategy');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await expect(authenticatedPage.getByTestId('threat-retro-strategy-list')).toBeVisible({ timeout: 10000 });
  });

  test('strategy drawer: deep-only blocks include run-times, quick-add, and lookback', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro&tab=strategy');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await expect(authenticatedPage.getByTestId('threat-retro-strategy-list')).toBeVisible({ timeout: 10000 });

    // Open the new-strategy drawer.
    await authenticatedPage.getByTestId('strategy-add').click();
    await expect(authenticatedPage.getByTestId('strategy-sheet')).toBeVisible({ timeout: 10000 });

    await expect(authenticatedPage.getByTestId('strategy-mode-deep')).toBeDisabled();
    await expect(authenticatedPage.getByTestId('strategy-run-times')).toBeVisible();
    await expect(authenticatedPage.getByTestId('strategy-lookback')).toBeVisible();

    // Quick-add 30m chip populates run-times with HH:30 entries.
    await authenticatedPage.getByTestId('strategy-quickadd-30m').click();
    await expect(authenticatedPage.getByTestId('strategy-run-times')).toContainText(':30');
  });

  test('strategy drawer does not expose unsupported realtime fields', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro&tab=strategy');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await authenticatedPage.getByTestId('strategy-add').click();
    await expect(authenticatedPage.getByTestId('strategy-sheet')).toBeVisible({ timeout: 10000 });

    await expect(authenticatedPage.getByTestId('strategy-mode-deep')).toBeDisabled();
    await expect(authenticatedPage.getByTestId('strategy-mode-realtime')).toHaveCount(0);
    await expect(authenticatedPage.getByTestId('strategy-listen-sources')).toHaveCount(0);
  });

  test('lookback dropdown enumerates only ≤24h options (no 48h / 72h)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro&tab=strategy');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await authenticatedPage.getByTestId('strategy-add').click();
    await expect(authenticatedPage.getByTestId('strategy-lookback')).toBeVisible({ timeout: 10000 });

    // Open the Radix Select and inspect its rendered items. The LOOKBACK_OPTIONS
    // constant is [30,60,120,240,480,720,1440] minutes — i.e. 1440 = 24h is the
    // max, no 48h/72h.
    await authenticatedPage.getByTestId('strategy-lookback').click();
    // Wait for the listbox to appear (Radix renders options in a portal).
    await authenticatedPage.locator('[role="listbox"]').waitFor({ state: 'visible', timeout: 5000 });
    const selectContent = authenticatedPage.locator('[role="option"], [data-slot="select-item"]');
    const count = await selectContent.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const text = (await selectContent.nth(i).innerText()) || '';
      // No item text should mention 48h or 72h.
      expect(text).not.toMatch(/48\s*(小时|h|hr)/i);
      expect(text).not.toMatch(/72\s*(小时|h|hr)/i);
    }
  });

  test('save-and-test (deep mode) fires a POST /threat-retro-agent/scan', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro&tab=strategy');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await authenticatedPage.getByTestId('strategy-add').click();
    // Provide a name + at least one run_time so validation passes.
    await authenticatedPage.getByTestId('strategy-name-input').fill(`PW策略-${uniqueSuffix()}`);
    await authenticatedPage.getByTestId('strategy-quickadd-30m').click();

    // The save-and-test button is deep-mode-only and triggers a -test scan.
    const saveAndTest = authenticatedPage.getByTestId('strategy-save-and-test');
    await expect(saveAndTest).toBeVisible({ timeout: 5000 });

    const [req] = await Promise.all([
      authenticatedPage
        .waitForRequest(
          (r) => r.url().includes('/threat-retro-agent/scan') && r.method() === 'POST',
          { timeout: 10000 },
        )
        .catch(() => null),
      saveAndTest.click(),
    ]);
    expect(req, 'expected a POST /threat-retro-agent/scan from save-and-test').not.toBeNull();
    const body = req?.postDataJSON();
    expect(body).toMatchObject({ test: true });
    expect(body).toHaveProperty('strategy_id');
    expect(body).toHaveProperty('window_start');
    expect(body).toHaveProperty('window_end');
  });

  test('notification preview renders the server response without client substitution', async ({ authenticatedPage }) => {
    await authenticatedPage.route('**/api/v1/threat-retro-agent/notification-preview', async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toEqual({ kind: 'immediate' });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ subject: 'SERVER_RENDERED_SUBJECT', html: '<p>SERVER_RENDERED_BODY</p>' }) });
    });
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro&tab=strategy');
    await authenticatedPage.getByTestId('threat-retro-strategy-tab').click();
    await authenticatedPage.getByTestId('strategy-add').click();
    await authenticatedPage.getByTestId('notification-preview-open').click();
    await expect(authenticatedPage.getByTestId('notification-preview-dialog')).toBeVisible();
    await expect(authenticatedPage.getByTestId('notification-preview-subject')).toHaveText('SERVER_RENDERED_SUBJECT');
  });

  // Cleanup any seeded strategies created by the save flow (best-effort).
  test.afterEach(async () => {
    // The save-and-test test creates a lazy strategy row; clean by name prefix.
    await seedSQL(
      `DELETE FROM rules WHERE page='threat_retro_strategy' AND name LIKE 'PW策略-%'`,
    ).catch(() => {
      /* best-effort cleanup; ignore errors when the row never persisted */
    });
  });
});
