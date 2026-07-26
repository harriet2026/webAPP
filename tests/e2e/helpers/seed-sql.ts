import * as crypto from 'crypto';
import { internalFetch } from './internal-client';

const HMAC_SECRET = process.env.OSG_INTERNAL_HMAC_SECRET || 'test-hmac-secret-for-e2e';
const PATH = '/internal/v1/test/sql';

function hmacTextHeaders(method: string, path: string, bodyStr: string): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}\n${method.toUpperCase()}\n${path}\n${bodyStr}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload, 'utf-8').digest('hex');
  return { 'X-OSG-Timestamp': ts, 'X-OSG-Signature': sig };
}

/** Executes a statement against the apiserver's internal test-SQL endpoint (mTLS + HMAC). */
export async function seedSQL(sql: string): Promise<void> {
  const bodyStr = JSON.stringify({ sql });
  const resp = await internalFetch(PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hmacTextHeaders('POST', PATH, bodyStr) },
    body: bodyStr,
  });
  if (!resp.ok) {
    throw new Error(`seedSQL failed: ${resp.status} ${await resp.text()}`);
  }
}

/** Best-effort cleanup: never fails the test it is unwinding. */
export async function cleanupSQL(sql: string): Promise<void> {
  try {
    await seedSQL(sql);
  } catch {
    /* ignore */
  }
}
