/**
 * Helpers for the login-2fa e2e specs.
 *
 * Test-data seeding + reset goes through the internal /test/sql endpoint
 * (dev-only, mTLS + HMAC), mirroring webapp/tests/e2e/specs/profile.spec.ts.
 *
 * OTP code retrieval:
 * The dev apiserver wires the REAL EmailSender + SMSSender (not NoopSender),
 * and the verifycode service persists only the code's HMAC digest in Redis
 * (never the plaintext) — so there's no way to read the 6-digit code off the
 * wire or out of Redis. cmd/apiserver/main.go closes this gap for dev only:
 * when OSG_ENV=dev it calls verifycode.Service.EnableDevCodeCapture(), which
 * remembers the plaintext code per ticket in-process; getLastCode() below
 * retrieves it through the dev-only /internal/v1/test/last-code fixture.
 *
 * Captcha solving: overrideCaptcha() forces a given captcha_id's stored
 * answer to a fixed, returned string via /internal/v1/test/captcha-override —
 * so a test can pass the captcha gate without OCR-ing the SVG.
 *
 * Both fixtures are registered ONLY when OSG_ENV=dev (routes.go) and require
 * the internal HMAC signature below — never reachable in production.
 */
import * as crypto from 'crypto';
import { internalFetch } from '../../helpers/internal-client';

const API_BASE = 'http://localhost:18080/api/v1';
const HMAC_SECRET = process.env.OSG_INTERNAL_HMAC_SECRET || 'test-hmac-secret-for-e2e';

export function hmacTextHeaders(method: string, path: string, bodyStr: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\n${method.toUpperCase()}\n${path}\n${bodyStr}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload, 'utf-8').digest('hex');
  return { 'X-OSG-Timestamp': ts, 'X-OSG-Signature': sig };
}

export async function seedSQL(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
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
  return (await resp.json()) as { columns: string[]; rows: unknown[][] };
}

// bcrypt hash for a known throwaway password. We precompute one constant hash
// rather than calling bcrypt per spec (cheap + deterministic). Verified
// against cost-10 bcrypt of "E2e@Throwaway1".
const THROWAWAY_PWD = 'E2e@Throwaway1';

// Compute a fresh bcrypt hash via the API's login-bcrypt? We don't have a
// helper; instead we seed a user via SQL with a hash produced at spec time is
// not feasible from TS. The simplest robust approach: insert the user through
// the /api/v1/users endpoint (admin-authenticated), which hashes the password
// server-side. That avoids shipping a brittle precomputed hash.
export async function loginAdminAndGetToken(): Promise<string> {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!r.ok) throw new Error(`admin login failed: ${r.status}`);
  const body = await r.json();
  return body.token as string;
}

export interface ThrowawayUser {
  username: string;
  password: string;
  userId: number;
}

/**
 * Create a throwaway system_admin user via the authenticated /users endpoint
 * (server-side bcrypt). Used by lockout / captcha / remaining-attempts tests
 * so the shared dev admin is never locked out. Returns the username + the
 * plaintext password + the new user id.
 *
 * IMPORTANT: the /users endpoint defaults new accounts to
 * must_change_password=true (first-login forced change). For tests that need
 * to reach a step OTHER than forced-change (2FA, setup, plain login), pass
 * `clearMustChange: true` to flip the flag off post-create.
 */
export async function createThrowawayUser(opts?: {
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
  twoFactorMethod?: string;
  phone?: string;
  email?: string;
  clearMustChange?: boolean;
}): Promise<ThrowawayUser> {
  const token = await loginAdminAndGetToken();
  const stamp = `e2e2fa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const username = stamp;
  const password = THROWAWAY_PWD;
  const r = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, password, role: 'system_admin' }),
  });
  if (!r.ok) throw new Error(`create throwaway user failed: ${r.status} ${await r.text()}`);
  const body = await r.json();
  const userId = Number(body.id);

  // Apply optional 2FA / must-change flags via SQL (the /users create endpoint
  // does not expose them). clearMustChange flips the create-default flag OFF.
  const sets: string[] = [];
  if (opts?.clearMustChange) sets.push('must_change_password = FALSE');
  if (opts?.mustChangePassword) sets.push('must_change_password = TRUE');
  if (opts?.twoFactorEnabled) {
    sets.push('two_factor_enabled = TRUE');
    const m = opts.twoFactorMethod ?? 'email';
    sets.push(`two_factor_method = '${m}'`);
    // For the server to issue need_2fa (not need_2fa_setup), the user must
    // have a receiver on file matching the method. Default it here so
    // existing 2FA-only callers keep working without passing phone/email.
    if (m === 'sms' && !opts?.phone) sets.push(`phone = '13800138000'`);
    if (m === 'email' && !opts?.email) sets.push(`email = 'e2e-2fa@example.com'`);
  }
  // phone/email are independent of twoFactorEnabled — forgot-password tests
  // need a receiver on a 2FA-disabled account too.
  if (opts?.phone) sets.push(`phone = '${opts.phone}'`);
  if (opts?.email) sets.push(`email = '${opts.email}'`);
  if (sets.length) {
    await seedSQL(`UPDATE users SET ${sets.join(', ')} WHERE id = ${userId}`);
  }

  return { username, password, userId };
}

async function postInternalTestJSON(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bodyStr = JSON.stringify(body);
  const resp = await internalFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hmacTextHeaders('POST', path, bodyStr) },
    body: bodyStr,
  });
  if (!resp.ok) {
    throw new Error(`${path} failed: ${resp.status} ${await resp.text()}`);
  }
  return (await resp.json()) as Record<string, unknown>;
}

/**
 * getLastCode retrieves the plaintext OTP code most recently dispatched for
 * `ticket` (the ticket returned by login/2FA/reset-code endpoints). Pop
 * semantics: a second call for the same ticket throws (404) — the caller
 * must fetch once per code, right after triggering the send.
 */
export async function getLastCode(ticket: string): Promise<string> {
  const body = await postInternalTestJSON('/internal/v1/test/last-code', { ticket });
  const code = body.code as string;
  if (!code) throw new Error(`getLastCode: empty code for ticket ${ticket}`);
  return code;
}

/**
 * overrideCaptcha forces the stored answer for `captchaId` (from the
 * captcha_id in a GET /auth/captcha response) to a fixed value and returns
 * that value, so the caller can type it into the captcha input to pass the
 * gate without solving the SVG.
 */
export async function overrideCaptcha(captchaId: string): Promise<string> {
  const body = await postInternalTestJSON('/internal/v1/test/captcha-override', { captcha_id: captchaId });
  const answer = body.answer as string;
  if (!answer) throw new Error(`overrideCaptcha: empty answer for captcha_id ${captchaId}`);
  return answer;
}

/**
 * clearVcodeIPLimit wipes the shared security.vcode_per_ip_per_min counter
 * (default 5) for every IP. All login_2fa spec files send OTPs from the same
 * docker-network IP, so back-to-back files (or manual re-runs within the
 * same 60s window) can exhaust the quota well before any real client would.
 * Call this once per spec file (test.beforeAll) that consumes real sends.
 */
export async function clearVcodeIPLimit(): Promise<void> {
  await postInternalTestJSON('/internal/v1/test/clear-vcode-ip-limit', {});
}

/**
 * workerClientIP returns a distinct synthetic source IP per Playwright worker.
 *
 * Why: verifycode's per-IP quota (security.vcode_per_ip_per_min, default 5) is
 * keyed on apiserver's c.ClientIP(). Every worker's browser reaches apiserver
 * through the same webapp container, so without this they all share one bucket
 * and OTP-consuming tests in different spec files starve each other. The
 * failure is opaque: verifycode.Send() captures the plaintext only AFTER its
 * rate-limit check, and Login deliberately swallows the send error (so it does
 * not disclose rate-limiting), so the test still gets a ticket and then
 * getLastCode 404s with "no code captured for this ticket".
 *
 * 203.0.113.0/24 is TEST-NET-3 (RFC 5737): reserved for documentation and
 * outside every OSG_TRUSTED_PROXIES range, so gin's ClientIP() treats it as
 * the untrusted origin and returns it instead of walking past it. Pair with
 * applyWorkerClientIP() in a beforeEach.
 */
export function workerClientIP(workerIndex: number): string {
  return `203.0.113.${(workerIndex % 254) + 1}`;
}

/**
 * applyWorkerClientIP makes every request from `context` (browser navigations
 * included) present this worker's synthetic client IP. custom-server.js
 * appends the real peer to X-Forwarded-For rather than overwriting it, and the
 * /api/v1 proxy passes the header through, so apiserver sees
 * "203.0.113.N, <webapp container IP>" and resolves the former.
 */
export async function applyWorkerClientIP(
  context: { setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> },
  workerIndex: number,
): Promise<void> {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': workerClientIP(workerIndex) });
}

export async function deleteThrowawayUser(userId: number): Promise<void> {
  try {
    const token = await loginAdminAndGetToken();
    await fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort
  }
}
