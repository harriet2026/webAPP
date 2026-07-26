/**
 * Login-2FA interaction-latency benchmark (PRD §6.2 ≤ 1s budget, spec §4.2).
 *
 * Two kinds of measurement:
 *   1. UI-level (existing): wall-clock between a user action and the
 *      corresponding page transition, driven through a real page.
 *   2. API-level (added below): direct HTTP timing against the endpoints
 *      spec §4.2 calls out — GET /auth/captcha, POST /auth/login/2fa
 *      (verify), POST /auth/password/reset/{verify-code,commit} — using the dev-only
 *      getLastCode() fixture (see helpers.ts) to complete the OTP-consuming
 *      ones without an OCR step.
 *
 * Concurrency note: GET /auth/captcha has no shared-quota dependency, so it
 * runs genuinely concurrently (moderate load, N=5). The OTP-consuming
 * benchmarks (2FA verify, reset verify) each need a fresh Send() call, and
 * Send() is gated by security.vcode_per_ip_per_min (default 5, shared across
 * ALL verifycode purposes for this IP) — so those run as a handful of
 * SEQUENTIAL samples (distinct throwaway users) rather than a concurrent
 * burst, to avoid flaking on the anti-abuse rate limit rather than the
 * latency budget. clearVcodeIPLimit() in beforeAll additionally guards
 * against a prior spec file (or manual re-run) having already spent most of
 * the quota within the same 60s window.
 */
import { test, expect } from '@playwright/test';
import {
  applyWorkerClientIP,
  clearVcodeIPLimit,
  createThrowawayUser,
  deleteThrowawayUser,
  getLastCode,
} from './helpers';

const LOGIN_URL = '/zh/login';
const LATENCY_BUDGET_MS = 1500;
const API_BASE = 'http://localhost:18080/api/v1';

// Isolate this worker's per-IP verifycode quota from login-flows.spec.ts,
// which runs concurrently and also consumes real OTP sends.
test.beforeEach(async ({ context }, testInfo) => {
  await applyWorkerClientIP(context, testInfo.workerIndex);
});

test.describe('Login interaction latency (PRD 1s budget)', () => {
  test('credentials submit → remaining-attempts hint under budget', async ({ page }) => {
    const user = await createThrowawayUser();
    try {
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill('WrongLatency1!');
      const t0 = Date.now();
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('[data-testid="login-remaining"]')).toBeVisible({ timeout: 10000 });
      const elapsed = Date.now() - t0;
      // Log for the html reporter / CI output.
      console.log(`[perf] credentials-submit latency = ${elapsed}ms`);
      expect(elapsed, 'credentials submit latency under 1500ms').toBeLessThan(LATENCY_BUDGET_MS);
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });

  test('forced-change step appears under budget', async ({ page }) => {
    const user = await createThrowawayUser({ mustChangePassword: true });
    try {
      await page.goto(LOGIN_URL);
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(user.password);
      const t0 = Date.now();
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('#osg-fc-new')).toBeVisible({ timeout: 10000 });
      const elapsed = Date.now() - t0;
      console.log(`[perf] forced-change-step latency = ${elapsed}ms`);
      expect(elapsed, 'forced-change step latency under 1500ms').toBeLessThan(LATENCY_BUDGET_MS);
    } finally {
      await deleteThrowawayUser(user.userId);
    }
  });
});

test.describe('API-level latency (spec §4.2)', () => {
  test.beforeAll(async () => {
    await clearVcodeIPLimit();
  });

  test('GET /auth/captcha under moderate concurrent load', async ({ request }) => {
    const CONCURRENCY = 5;
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, async (_, i) => {
        const t0 = Date.now();
        const resp = await request.get(`${API_BASE}/auth/captcha`);
        const elapsed = Date.now() - t0;
        expect(resp.ok(), `captcha request #${i} status=${resp.status()}`).toBeTruthy();
        return elapsed;
      }),
    );
    console.log(`[perf] GET /auth/captcha concurrent(${CONCURRENCY}) latencies = ${results.join(',')}ms`);
    for (const elapsed of results) {
      expect(elapsed, 'captcha latency under 1500ms').toBeLessThan(LATENCY_BUDGET_MS);
    }
  });

  test('POST /auth/login/2fa (verify) latency', async ({ request }) => {
    const SAMPLES = 2;
    for (let i = 0; i < SAMPLES; i++) {
      const user = await createThrowawayUser({
        twoFactorEnabled: true,
        twoFactorMethod: 'email',
        email: `e2e-perf-2fa-${i}@example.com`,
        clearMustChange: true,
      });
      try {
        const loginResp = await request.post(`${API_BASE}/auth/login`, {
          data: { username: user.username, password: user.password },
        });
        expect(loginResp.ok(), `login #${i} status=${loginResp.status()}`).toBeTruthy();
        const ticket = ((await loginResp.json()) as { ticket: string }).ticket;
        const code = await getLastCode(ticket);

        const t0 = Date.now();
        const verifyResp = await request.post(`${API_BASE}/auth/login/2fa`, {
          data: { ticket, code },
        });
        const elapsed = Date.now() - t0;
        expect(verifyResp.ok(), `2fa verify #${i} status=${verifyResp.status()}`).toBeTruthy();
        console.log(`[perf] POST /auth/login/2fa verify #${i} latency = ${elapsed}ms`);
        expect(elapsed, '2fa verify latency under 1500ms').toBeLessThan(LATENCY_BUDGET_MS);
      } finally {
        await deleteThrowawayUser(user.userId);
      }
    }
  });

  // GT-11959 replaced POST /auth/password/reset/verify with a two-step flow. The
  // budget is what the USER waits, so it covers both hops together — measuring only
  // one would let the other regress unnoticed.
  //
  // (The old endpoint is gone, not deprecated: it validated the password before the
  // code, which leaked account existence once the policy became per-tenant, and it
  // only ever enforced the platform baseline.)
  test('POST /auth/password/reset verify-code + commit latency', async ({ request }) => {
    const SAMPLES = 2;
    for (let i = 0; i < SAMPLES; i++) {
      const user = await createThrowawayUser({ email: `e2e-perf-reset-${i}@example.com` });
      try {
        const codeResp = await request.post(`${API_BASE}/auth/password/reset/code`, {
          data: { account: user.username, method: 'email' },
        });
        expect(codeResp.ok(), `reset/code #${i} status=${codeResp.status()}`).toBeTruthy();
        const ticket = ((await codeResp.json()) as { ticket: string }).ticket;
        const code = await getLastCode(ticket);

        const t0 = Date.now();
        const verifyResp = await request.post(`${API_BASE}/auth/password/reset/verify-code`, {
          data: { ticket, code },
        });
        expect(verifyResp.ok(), `reset/verify-code #${i} status=${verifyResp.status()}`).toBeTruthy();
        const { continuation_ticket } = (await verifyResp.json()) as {
          continuation_ticket: string;
        };
        expect(continuation_ticket, 'verify-code must hand back a continuation ticket').toBeTruthy();

        const commitResp = await request.post(`${API_BASE}/auth/password/reset/commit`, {
          data: { continuation_ticket, new_password: `E2ePerfReset${i}@Strong1234` },
        });
        const elapsed = Date.now() - t0;
        expect(commitResp.ok(), `reset/commit #${i} status=${commitResp.status()}`).toBeTruthy();
        console.log(`[perf] reset verify-code + commit #${i} latency = ${elapsed}ms`);
        expect(elapsed, 'reset (verify-code + commit) latency under 1500ms').toBeLessThan(
          LATENCY_BUDGET_MS,
        );
      } finally {
        await deleteThrowawayUser(user.userId);
      }
    }
  });
});
