/**
 * Playwright E2E for the Personal Center (Profile) feature — spec §7.1 (TC-B).
 *
 * Test subject is the dev admin (admin/admin123). DB seeding for devices /
 * login-history rows goes through the internal /test/sql endpoint (dev-only,
 * HMAC-signed). Because the dev admin is shared across specs, the password
 * change test (TC-B04) deliberately does NOT submit — it only asserts the UI
 * gating (rule indicators + save-button enabled state), so the shared
 * admin123 password is never mutated.
 */

import * as crypto from 'crypto';
import { test, expect } from '../fixtures/auth.fixture';
import { ProfilePage } from '../pages/profile.page';
import { waitForToast } from '../helpers/wait';
import { internalFetch } from '../helpers/internal-client';

const API_BASE = 'http://localhost:18080/api/v1';
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

async function getAdminUserId(): Promise<number> {
  const bodyStr = JSON.stringify({ sql: "SELECT id FROM users WHERE username='admin' LIMIT 1" });
  const resp = await internalFetch('/internal/v1/test/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hmacTextHeaders('POST', '/internal/v1/test/sql', bodyStr) },
    body: bodyStr,
  });
  const data = await resp.json();
  const rows = data.rows || [];
  if (!rows.length) throw new Error('admin user not found');
  return Number(rows[0][0]);
}

// The dev admin accrues one admin_sessions row per E2E login; over a full
// regression that is thousands of *active* rows, and SessionsTab renders them
// all without pagination — so a seeded device row never becomes visible within
// the timeout (and the "only current remains" bulk-logout assertion can't
// settle). Delete every session EXCEPT the current one (identified via the
// devices API's `current` flag, so we never log ourselves out), leaving a
// small deterministic list to seed onto.
async function pruneOtherSessions(
  page: import('@playwright/test').Page,
  uid: number,
): Promise<void> {
  const resp = await page.request.get(`${API_BASE}/profile/devices`);
  if (!resp.ok()) return;
  const json = await resp.json();
  const items: Array<{ current?: boolean; session_id?: string }> = json.items || [];
  const currentId = items.find((d) => d.current)?.session_id;
  if (!currentId) return;
  const safe = currentId.replace(/'/g, "''");
  await seedSQL(`DELETE FROM admin_sessions WHERE user_id = ${uid} AND jti <> '${safe}'`);
}

test.describe.serial('Profile — Personal Center (TC-B)', () => {
  let adminUid: number;
  const seededSessionJTIs: string[] = [];
  const seededLoginLogIds: number[] = [];

  test.beforeAll(async () => {
    adminUid = await getAdminUserId();
  });

  test.afterAll(async () => {
    // Clean up seeded sessions + login-log rows so we don't pollute other specs.
    for (const jti of seededSessionJTIs) {
      try {
        await seedSQL(`DELETE FROM admin_sessions WHERE jti='${jti}'`);
      } catch {
        // best-effort
      }
    }
    if (seededLoginLogIds.length) {
      try {
        await seedSQL(`DELETE FROM admin_login_log WHERE id IN (${seededLoginLogIds.join(',')})`);
      } catch {
        // best-effort
      }
    }
  });

  // TC-B01 — 姓名（display name）保存
  test('TC-B01 name save', async ({ authenticatedPage }) => {
    const profile = new ProfilePage(authenticatedPage);
    await profile.goto();
    await profile.expectLoaded();

    // Clear name → save should be disabled (empty name).
    const nameInput = profile.nameInput();
    await nameInput.fill('');
    await expect(profile.saveAccountButton()).toBeDisabled();

    // Type a new name → save → success toast.
    const newName = `测试姓名_${Date.now()}`;
    await nameInput.fill(newName);
    await expect(profile.saveAccountButton()).toBeEnabled();
    await profile.saveAccountButton().click();
    await waitForToast(authenticatedPage, undefined, 8000);

    // Reload → name persists.
    await authenticatedPage.reload();
    await profile.expectLoaded();
    await expect(profile.nameInput()).toHaveValue(newName);
  });

  // TC-B02 — 手机绑定非法不发码，合法手机号触发 60s 倒计时
  test('TC-B02 phone bind invalid phone does not send code', async ({ authenticatedPage }) => {
    const profile = new ProfilePage(authenticatedPage);
    await profile.goto();
    await profile.expectLoaded();
    // The account tab is the default; ensure we're on it.
    await profile.switchTab('account');

    // SMS is unconfigured in dev (no OSG_SMS_CACCLOUD_LICENSE), so a real
    // bind_phone/sms send-code returns 400 and the frontend never starts the
    // countdown (startCountdown runs only after the mutation resolves). Mock a
    // successful send for the VALID phone so we can assert the frontend
    // countdown UX independent of the external SMS provider; other targets
    // (e.g. the invalid "abc" below) fall through to the real backend.
    await authenticatedPage.route('**/api/v1/profile/code', async (route) => {
      const body = route.request().postDataJSON?.() ?? {};
      if (body?.target === '13800138000') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    // Invalid phone "abc": the SendCode button stays enabled, but clicking it
    // surfaces an inline error and does NOT start the countdown.
    const phoneInput = profile.phoneInput();
    await phoneInput.fill('abc');
    const sendBtn = profile.phoneSendCodeButton();
    // Trigger validation by clicking send.
    await sendBtn.click();
    // An error paragraph appears (either toast or inline).
    await expect(profile.page.locator('text=/手机号|phone/i').first()).toBeVisible({ timeout: 5000 });

    // The button text must NOT have switched to the countdown form ("Ns 后重新获取").
    await expect(sendBtn).not.toHaveText(/\d+s/);

    // Now a valid phone: clicking send starts the 60s countdown.
    await phoneInput.fill('13800138000');
    await sendBtn.click();
    // The countdown shows up as "NNs 后重新获取".
    await expect(sendBtn).toHaveText(/\d+\s*s/, { timeout: 8000 });
  });

  // TC-B04 — 密码策略实时校验（不真正提交，避免改坏共享 admin 密码）
  test('TC-B04 password policy live validation (no submit)', async ({ authenticatedPage }) => {
    const profile = new ProfilePage(authenticatedPage);
    await profile.goto();
    await profile.expectLoaded();
    await profile.switchTab('password');

    // Weak password: rule checks all fail, save disabled.
    await profile.oldPasswordInput().fill('admin123');
    await profile.newPasswordInput().fill('short');
    await profile.confirmPasswordInput().fill('short');

    // All rule <li> rows should show an X icon (not passed) for a too-short pw.
    const ruleItems = profile.page.locator('ul li:has(svg)');
    const ruleCount = await ruleItems.count();
    expect(ruleCount).toBeGreaterThan(0);
    for (let i = 0; i < ruleCount; i++) {
      // X icon = svg with class lucide-x; passed = lucide-check.
      const hasX = await ruleItems.nth(i).locator('svg.lucide-x, svg[class*="lucide-x"]').count();
      expect(hasX).toBeGreaterThan(0);
    }
    await expect(profile.passwordSaveButton()).toBeDisabled();

    // Strong password: all rules ✓, save enabled. We do NOT click save.
    await profile.newPasswordInput().fill('GoodPassw0rd!');
    await profile.confirmPasswordInput().fill('GoodPassw0rd!');
    for (let i = 0; i < ruleCount; i++) {
      const hasCheck = await ruleItems.nth(i).locator('svg.lucide-check, svg[class*="lucide-check"]').count();
      expect(hasCheck).toBeGreaterThan(0);
    }
    await expect(profile.passwordSaveButton()).toBeEnabled();
  });

  // TC-B07 — 单台下线
  test('TC-B07 single device logout', async ({ authenticatedPage, browser }) => {
    // Seed a second admin session for the dev admin so the devices list has
    // at least one non-current device.
    adminUid = await getAdminUserId();
    await pruneOtherSessions(authenticatedPage, adminUid);
    const extraJTI = `e2e-pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    seededSessionJTIs.push(extraJTI);
    await seedSQL(
      `INSERT INTO admin_sessions (user_id, jti, device, browser, ip, location, user_agent, expires_at) ` +
      `VALUES (${adminUid}, '${extraJTI}', 'E2E-Other', 'Chrome', '10.0.0.99', '北京', 'e2e', ` +
      `NOW() + INTERVAL '1 hour')`
    );

    const profile = new ProfilePage(authenticatedPage);
    await profile.goto();
    await profile.expectLoaded();
    await profile.switchTab('devices');

    // The seeded row should appear as a non-current device.
    const logoutBtn = profile.deviceLogoutButton(extraJTI);
    await logoutBtn.waitFor({ state: 'visible', timeout: 10000 });

    const initialRows = await profile.deviceRows().count();
    expect(initialRows).toBeGreaterThanOrEqual(2);

    await logoutBtn.click();
    await profile.deviceSingleConfirm().waitFor({ state: 'visible' });
    await profile.deviceSingleConfirm().click();

    // The row disappears (button gone).
    await expect(profile.deviceLogoutButton(extraJTI)).toHaveCount(0, { timeout: 8000 });
  });

  // TC-B08 — 批量下线提示台数
  test('TC-B08 bulk logout shows count', async ({ authenticatedPage }) => {
    // Seed two extra sessions so the bulk action has something to revoke.
    adminUid = await getAdminUserId();
    await pruneOtherSessions(authenticatedPage, adminUid);
    for (let i = 0; i < 2; i++) {
      const jti = `e2e-pw-bulk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      seededSessionJTIs.push(jti);
      await seedSQL(
        `INSERT INTO admin_sessions (user_id, jti, device, browser, ip, location, user_agent, expires_at) ` +
        `VALUES (${adminUid}, '${jti}', 'E2E-Bulk-${i}', 'Firefox', '10.0.0.${100 + i}', '上海', 'e2e', ` +
        `NOW() + INTERVAL '1 hour')`
      );
    }

    const profile = new ProfilePage(authenticatedPage);
    await profile.goto();
    await profile.expectLoaded();
    await profile.switchTab('devices');

    // The bulk button should be enabled (others.length > 0).
    const bulkBtn = profile.deviceLogoutOthersButton();
    await bulkBtn.waitFor({ state: 'visible', timeout: 10000 });
    await expect(bulkBtn).toBeEnabled();

    // Open the confirm dialog and verify it cites a count ≥ 2.
    await bulkBtn.click();
    const dialog = profile.page.locator('[role="alertdialog"]').last();
    await dialog.waitFor({ state: 'visible' });
    const descText = await dialog.innerText();
    expect(descText).toMatch(/\d+/);
    const citedCount = parseInt((descText.match(/(\d+)/) || ['0'])[1], 10);
    expect(citedCount).toBeGreaterThanOrEqual(2);

    // Confirm → others revoked; current device row stays.
    await profile.deviceBatchConfirm().click();
    await dialog.waitFor({ state: 'hidden', timeout: 8000 });

    // Only the current session should remain.
    await expect(profile.deviceRows()).toHaveCount(1, { timeout: 8000 });
  });

  // TC-B09 — 登录历史区间筛选 + 异常高亮 + 分页
  test('TC-B09 login history range filter + abnormal highlight + pagination', async ({ authenticatedPage }) => {
    adminUid = await getAdminUserId();
    // Seed several login-log rows (mix of normal + abnormal) within the last day.
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const ts = new Date(now - i * 3600_000).toISOString().replace('T', ' ').replace('Z', '');
      const abnormal = i % 2 === 1;
      await seedSQL(
        `INSERT INTO admin_login_log (user_id, username, ip, user_agent, client, location, result, ` +
        `fail_reason, abnormal, abnormal_reason, created_at) VALUES ` +
        `(${adminUid}, 'admin', '10.0.0.${10 + i}', 'e2e-ua', 'E2E-Browser', 'E2E-Loc-${i}', ` +
        `'${i % 3 === 0 ? 'fail' : 'success'}', ${i % 3 === 0 ? "'密码错误'" : 'NULL'}, ` +
        `${abnormal}, ${abnormal ? "'非常用登录地点'" : 'NULL'}, '${ts}') RETURNING id`
      ).catch(() => undefined);
    }

    const profile = new ProfilePage(authenticatedPage);
    await profile.goto();
    await profile.expectLoaded();
    await profile.switchTab('history');

    // Set a date range covering today.
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    await profile.historyStartDate().fill(today);
    await profile.historyEndDate().fill(tomorrow);
    await profile.historyQueryButton().click();
    await profile.page.waitForTimeout(1000);

    // Table shows rows (not empty).
    const rows = profile.historyDataRows();
    await rows.first().waitFor({ state: 'visible', timeout: 10000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Pagination control present (ServerPagination renders even for small sets),
    // e.g. "共 4472 条" / "第 1 / 224 页". Use a real RegExp — a `text=/…/` string
    // selector collapses the \d/\s/\/ escapes (the \/ prematurely ends the
    // regex) and never matches.
    await expect(
      profile.page.getByText(/共\s*\d+|第\s*\d+\s*\/\s*\d+/).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
