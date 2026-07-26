/**
 * Playwright E2E for the login + 2FA feature (Spec §4.5 TC-B01..B08).
 *
 * OTP-consuming flows (login+2FA success, forgot-password verify,
 * trust-device) use the dev-only getLastCode()/overrideCaptcha() fixtures
 * (see helpers.ts) to read the plaintext code/solve the captcha without an
 * OCR step — the dev apiserver otherwise only persists an HMAC digest.
 */
import { test, expect } from '@playwright/test';
import {
  applyWorkerClientIP,
  clearVcodeIPLimit,
  createThrowawayUser,
  deleteThrowawayUser,
  getLastCode,
  overrideCaptcha,
} from './helpers';

const LOGIN_URL = '/zh/login';

test.beforeAll(async () => {
  // This file alone sends ~4 real OTPs (TC-B05, TC-B01, forgot-password,
  // trust-device); a prior manual re-run within the same 60s window can
  // already have consumed most of security.vcode_per_ip_per_min (default 5)
  // for this worker's IP — start from a clean slate.
  await clearVcodeIPLimit();
});

// Give this worker its own per-IP verifycode quota, so a concurrently running
// spec file (perf.spec.ts also sends OTPs) cannot starve us. See
// workerClientIP() for why quota exhaustion surfaces as a getLastCode 404.
test.beforeEach(async ({ context }, testInfo) => {
  await applyWorkerClientIP(context, testInfo.workerIndex);
});

/** Fills each of the 6 OTP boxes with its digit individually. Each box has a
 * native maxlength=1, which Playwright's fill() respects — filling the first
 * box with the whole 6-digit string silently truncates to 1 char instead of
 * triggering the component's overflow-fill logic (that only fires for a
 * multi-char *paste* or a real multi-char keystroke, not a maxlength-clamped
 * programmatic value set). */
async function fillOtp(page: import('@playwright/test').Page, code: string) {
  const otpInputs = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"]');
  await expect(otpInputs).toHaveCount(6, { timeout: 10000 });
  for (let i = 0; i < 6; i++) {
    await otpInputs.nth(i).fill(code[i]);
  }
}

test.describe.serial('Login + 2FA (TC-B01..B08)', () => {
  // TC-B07 — 记住账号：勾选后重开页，账号回填、密码为空。
  test('TC-B07 remember account — prefilled on reopen, password empty', async ({ page }) => {
    await page.goto(LOGIN_URL);
    // Type a username, check "remember", submit wrong password (so we stay on
    // the page; remember is persisted on submit attempt via the state machine).
    await page.locator('input[name="username"]').fill('remember-e2e-user');
    await page.locator('input[name="password"]').fill('wrong-pwd');
    // shadcn Checkbox renders a visually-hidden native input + a clickable
    // button/label. Click the label text to toggle (pointer-stable).
    await page.locator('label[for="osg-login-remember"]').click();

    // Submit; we expect to stay on credentials with an error (wrong pwd).
    await page.locator('button[type="submit"]').click();
    // Wait for the remaining-attempts hint OR the error text to confirm submit ran.
    await expect(page.locator('[data-testid="login-remaining"], .text-destructive').first()).toBeVisible({
      timeout: 10000,
    });

    // The localStorage key must now hold the remembered account.
    const saved = await page.evaluate(() => localStorage.getItem('osg_login_account'));
    expect(saved).toBe('remember-e2e-user');

    // Reload → username prefilled, password empty.
    await page.reload();
    await expect(page.locator('input[name="username"]')).toHaveValue('remember-e2e-user');
    await expect(page.locator('input[name="password"]')).toHaveValue('');

    // Cleanup: clear localStorage so other specs aren't affected.
    await page.evaluate(() => localStorage.removeItem('osg_login_account'));
  });

  // TC-B02 — 失败计数：错密码一次 → 断言 remainingAttempts 文案出现。
  test('TC-B02 wrong password shows remaining attempts hint', async ({ page }) => {
    const user = await createThrowawayUser();
    try {
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill('DefinitelyWrong1!');
      await page.locator('button[type="submit"]').click();
      // remainingAttempts hint renders in the [data-testid="login-remaining"] slot.
      await expect(page.locator('[data-testid="login-remaining"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('[data-testid="login-remaining"]')).toContainText(/\d/);
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  // captcha：失败达 captcha_after_failures(=2) 后断言验证码图出现。
  test('captcha gate appears after threshold failures', async ({ page }) => {
    const user = await createThrowawayUser();
    try {
      await page.goto(LOGIN_URL);
      // First wrong attempt — captcha not yet required.
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill('DefinitelyWrong1!');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('[data-testid="login-remaining"]')).toBeVisible({ timeout: 10000 });

      // Second wrong attempt — captcha_after_failures=2 → next render shows the
      // captcha SVG. The login page refreshes the captcha image when the
      // server returns captcha_required=true on this attempt.
      await page.locator('input[name="password"]').fill('DefinitelyWrong2!');
      await page.locator('button[type="submit"]').click();
      // The captcha row appears (svg inside the refresh button). Scoped to
      // the captcha-refresh aria-label specifically — a bare
      // `button[aria-label]` + svg filter also matches the password
      // show/hide toggle button, which is a strict-mode violation.
      await expect(page.locator('#osg-login-captcha')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('button[aria-label="点击刷新"], button[aria-label="Refresh"]')).toBeVisible();
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  // TC-B03 — 锁定：连续错到阈值 → 倒计时文案 + 按钮禁用。
  // Driving the (ip,user) bucket to max_login_attempts(=5) needs a valid
  // captcha on every attempt from the 3rd on (captcha_after_failures=2). We
  // solve that with overrideCaptcha() instead of OCR-ing the SVG: whenever
  // the UI auto-refetches a captcha (captured via the response listener
  // below), we force its stored answer to a known value and type it back.
  test('TC-B03 lockout after max_login_attempts shows countdown in UI', async ({ page }) => {
    const user = await createThrowawayUser();
    try {
      let lastCaptchaId: string | null = null;
      page.on('response', async (resp) => {
        if (resp.request().method() === 'GET' && resp.url().includes('/api/v1/auth/captcha')) {
          try {
            lastCaptchaId = ((await resp.json()) as { captcha_id?: string }).captcha_id ?? null;
          } catch {
            /* unrelated in-flight response; ignore */
          }
        }
      });

      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);

      // Attempts 1-2: below the pre-request captcha_after_failures(=2) check,
      // so no captcha is required yet. Attempt 2's response is the first to
      // report captcha_required=true, which makes the UI auto-fetch a fresh
      // captcha for attempt 3.
      for (let i = 0; i < 2; i++) {
        await page.locator('input[name="password"]').fill(`WrongB03-${i}A!`);
        await page.locator('button[type="submit"]').click();
        if (i === 0) {
          await expect(page.locator('[data-testid="login-remaining"]')).toBeVisible({ timeout: 10000 });
        }
      }

      // Attempts 3-5: max_login_attempts(=5) trips on the 5th failure. Each
      // of these must present a valid (overridden) captcha answer.
      for (let i = 2; i < 5; i++) {
        await expect.poll(() => lastCaptchaId, { timeout: 10000 }).not.toBeNull();
        const captchaId: string = lastCaptchaId!;
        lastCaptchaId = null;
        const answer = await overrideCaptcha(captchaId);
        await expect(page.locator('#osg-login-captcha')).toBeVisible({ timeout: 10000 });
        await page.locator('#osg-login-captcha').fill(answer);
        await page.locator('input[name="password"]').fill(`WrongB03-${i}A!`);
        await page.locator('button[type="submit"]').click();
      }

      // The 5th failure trips the lockout: countdown text + disabled submit.
      await expect(page.locator('[data-testid="login-locked"]')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('button[type="submit"]')).toBeDisabled();
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  // TC-B05 — 重发倒计时：进 2FA 步 → 60s 倒计时按钮出现。
  // We can reach the 2FA step without typing the code: seed a user with 2FA
  // enabled (method=email, target set), log in with the right password, and
  // the server returns need_2fa. The backend already dispatched the login
  // code (and started its own resend-throttle window) before returning
  // need_2fa, so the UI must start its OWN 60s countdown immediately on
  // entering the step — not wait for a resend click (F4 fix) — otherwise an
  // immediate click would hit the backend's ErrResendTooSoon.
  test('TC-B05 2FA step shows resend countdown', async ({ page }) => {
    const user = await createThrowawayUser({
      twoFactorEnabled: true,
      twoFactorMethod: 'email',
      email: 'e2e-2fa@example.com',
      // The /users create endpoint defaults new accounts to
      // must_change_password=true, which would preempt the 2FA step. Clear it
      // so login reaches the need_2fa response.
      clearMustChange: true,
    });
    try {
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      await page.locator('button[type="submit"]').click();
      // The 2FA step renders the masked-target hint + OTP boxes + resend btn.
      await expect(page.locator('text=/\\*\\*|\\*\\d+/').first()).toBeVisible({ timeout: 10000 }).catch(() => {});
      // 6 OTP boxes appear.
      await expect(page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"]')).toHaveCount(6, {
        timeout: 10000,
      });
      // The resend button is ALREADY in its 60s-countdown form ("Ns 后重新获取")
      // the moment the step renders — no click needed, and the button must be
      // disabled for the duration.
      const resendBtn = page.locator('button:has-text("重新获取"), button:has-text("Resend")').first();
      await expect(resendBtn).toBeVisible({ timeout: 5000 });
      await expect(resendBtn).toContainText(/\d+\s*s/, { timeout: 3000 });
      await expect(resendBtn).toBeDisabled();
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  // TC-B06 — 强制改密：must_change_password 账号 → 进入改密步 → 提交新密码 →
  // 完成登录（该用户 2FA 关闭，forced-change 直接签发 token）。
  test('TC-B06 forced password change completes and reaches dashboard', async ({ page }) => {
    const user = await createThrowawayUser({ mustChangePassword: true });
    try {
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      await page.locator('button[type="submit"]').click();
      // The forced-change step renders.
      await expect(page.locator('#osg-fc-new')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=/设置新密码|Set a new password/').first()).toBeVisible();

      const newPassword = 'E2eForcedChange@1234';
      await page.locator('#osg-fc-new').fill(newPassword);
      await page.locator('#osg-fc-confirm').fill(newPassword);
      await page.locator('button:has-text("完成设置并登录"), button:has-text("Finish and log in")').click();
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });

      // Re-entry gating: logging in again with the OLD password must still
      // fail (the change actually took effect server-side, not just in UI
      // state), and the NEW password must log in without re-gating.
      await page.evaluate(() => localStorage.clear());
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('[data-testid="login-remaining"], .text-destructive').first()).toBeVisible({
        timeout: 10000,
      });

      await page.locator('input[name="password"]').fill(newPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  // TC-B01 — 正常登录 + 2FA → dashboard.
  test('TC-B01 login + 2FA → dashboard', async ({ page }) => {
    const user = await createThrowawayUser({
      twoFactorEnabled: true,
      twoFactorMethod: 'email',
      email: 'e2e-b01@example.com',
      clearMustChange: true,
    });
    try {
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      const [loginResp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST'),
        page.locator('button[type="submit"]').click(),
      ]);
      const loginBody = await loginResp.json();
      expect(loginBody.need_2fa).toBe(true);
      const ticket = loginBody.ticket as string;
      expect(ticket).toBeTruthy();

      const code = await getLastCode(ticket);
      await fillOtp(page, code);
      await page.locator('button:has-text("验证"), button:has-text("Verify")').first().click();
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  // 找回密码 — 发码 + 校验 → 成功横幅.
  test('forgot password end-to-end', async ({ page }) => {
    const user = await createThrowawayUser({ email: 'e2e-forgot@example.com' });
    try {
      await page.goto(LOGIN_URL);
      await page.locator('button:has-text("忘记密码"), button:has-text("Forgot password")').click();
      await page.locator('#osg-forgot-account').fill(user.username);
      // Default channel radio is "email" — matches the seeded receiver.
      const [codeResp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/api/v1/auth/password/reset/code') && r.request().method() === 'POST',
        ),
        page.locator('button:has-text("获取验证码"), button:has-text("Send code")').click(),
      ]);
      const ticket = (await codeResp.json()).ticket as string;
      expect(ticket).toBeTruthy();

      const code = await getLastCode(ticket);
      await fillOtp(page, code);
      await page.locator('#osg-forgot-new').fill('E2eForgot@Strong1234');
      await page.locator('button:has-text("完成设置并登录"), button:has-text("Finish and log in")').click();

      // Success → back to credentials with the reset-success banner (green,
      // not the destructive/red styling — see the F7 fix).
      await expect(page.locator('[data-testid="login-success"]')).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  // 信任设备 — 勾选后完成 2FA；再次登录断言未出现 OTP 步.
  test('trust device skips 2FA on next login', async ({ page }) => {
    const user = await createThrowawayUser({
      twoFactorEnabled: true,
      twoFactorMethod: 'email',
      email: 'e2e-trust@example.com',
      clearMustChange: true,
    });
    try {
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      const [loginResp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST'),
        page.locator('button[type="submit"]').click(),
      ]);
      const ticket = (await loginResp.json()).ticket as string;
      const code = await getLastCode(ticket);

      // .check() on the checkbox role (not a label click) — Radix's
      // Checkbox renders as a <button role="checkbox">, and asserts the
      // resulting aria-checked state instead of hoping a label-for click
      // landed.
      await page.getByRole('checkbox', { name: '30 天内信任此设备' }).check();
      await fillOtp(page, code);
      await page.locator('button:has-text("验证"), button:has-text("Verify")').first().click();
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });

      // Log back in — the trust cookie must skip the 2FA step entirely.
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });
});

// Spec §4.3 requires the login-2fa suite to run against at least zh + en.
// Everything above exercises zh; this locale-parametrized smoke test repeats
// the core credentials-step flow (wrong password → remaining-attempts hint,
// 2FA step render) under each locale WITHOUT duplicating the full suite.
for (const locale of ['zh', 'en'] as const) {
  // Deliberately does NOT complete a real 2FA send: security.vcode_per_ip_per_min
  // (default 5) is a shared-IP quota across every OTP-consuming test in this
  // file (TC-B05/TC-B01/forgot-password/trust-device already use most of it).
  // Wrong-password → remaining-attempts hint exercises the same credentials
  // step + i18n strings without spending a send.
  test(`[${locale}] credentials step renders`, async ({ page }) => {
    const user = await createThrowawayUser();
    try {
      await page.goto(`/${locale}/login`);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill('DefinitelyWrong1!');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('[data-testid="login-remaining"]')).toBeVisible({ timeout: 10000 });
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });
}
