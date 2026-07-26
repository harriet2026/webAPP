import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// Guard: an e2e spec must never pick "the tenant to work with" by taking the
// FIRST element of the /tenants list.
//
// Why this keeps biting (three separate spellings hit one regression round):
//   * The list is NOT ordered by id, so items[0] is arbitrary.
//   * `page_size` is capped at 100 server-side, so passing 500 silently returns
//     the same first 100 — "page_size must cover every tenant" is not a thing.
//   * Once a Python E2E run has left hundreds of tenants behind, items[0] is
//     typically a leftover in `pending` status. A non-active tenant cannot be
//     selected: `selectedTenantId` stays null, resolveSecurityScope then
//     normalizes the viewer back to 'platform' (src/lib/security-scope.ts), and
//     the spec fails somewhere far away — "no /monitor/* calls" saw calls, a
//     drawer never opened, an export came back scope="admin".
//
// The failure is data-volume dependent, so it passes on a small dev DB and
// turns into a hard failure only after the suite has been run a few times.
// That is exactly the kind of thing a static guard should catch instead.
//
// Pick by PROPERTY, not by position — and include whatever the assertions
// require:
//
//   const usable = items.filter(t => t.status === 'active');           // selectable
//   const usable = items.filter(t => t.status === 'active'
//                                 && !(t.capability_flags ?? []).length); // + ungranted
//   return usable.reduce((lo, t) => (t.id < lo.id ? t : lo)).id;       // lowest id
//
// or use tests/e2e/helpers/tenant.ts (getDefaultTenantId /
// getDefaultTenantIdViaFetch) when you specifically want the tenant
// global-setup activated and granted the AI capabilities to.
//
// Escape hatch: put `allow-items0:` with a reason on the preceding line when a
// spec genuinely wants "whatever the API returns first" and does not care which
// tenant it is.

const E2E_DIR = path.resolve(__dirname, '../e2e');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// `items[0]`, `items?.[0]`, `.items [0]` … followed by an optional `.id`.
const FIRST_ITEM = /\bitems\s*\??\.?\s*\[\s*0\s*\]/g;

// How far back to look for the fetch whose response is being indexed. Keep this
// at statement scale (~a few lines): a wider window sweeps in an UNRELATED
// earlier /tenants call and then flags e.g. `domainsResp.json().items[0]`.
const LOOKBACK = 300;

// Blank out comments before scanning, preserving offsets and line breaks: a
// comment that *explains* this anti-pattern (including the one above) must not
// trip the guard. Strings are left alone -- a tenant lookup written inside a
// string literal is not a thing here.
function stripComments(src: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));
}

type Violation = { file: string; line: number; snippet: string };

function findViolations(): Violation[] {
  const violations: Violation[] = [];

  for (const file of walk(E2E_DIR)) {
    const raw = readFileSync(file, 'utf8');
    const src = stripComments(raw);
    const lines = raw.split('\n');

    for (const match of src.matchAll(FIRST_ITEM)) {
      const idx = match.index ?? 0;
      const before = src.slice(Math.max(0, idx - LOOKBACK), idx);

      // Only the tenant LIST counts. Require the nearby fetch URL to END at
      // /tenants (optionally with a query string) -- a nested route such as
      // `/tenants/${id}/domains` indexes domains, not tenants, and must not be
      // flagged. A guard that cries wolf gets deleted.
      const TENANT_LIST_URL = /\/tenants(\?[^'"`]*)?['"`]/;
      if (!TENANT_LIST_URL.test(before)) continue;

      const lineNo = src.slice(0, idx).split('\n').length;
      const prev = lines[lineNo - 2] ?? '';
      if (prev.includes('allow-items0:')) continue;

      violations.push({
        file: path.relative(path.resolve(__dirname, '../..'), file),
        line: lineNo,
        snippet: (lines[lineNo - 1] ?? '').trim(),
      });
    }
  }

  return violations;
}

describe('e2e specs must not select a tenant by list position', () => {
  it('has no items[0] tenant lookups', () => {
    const violations = findViolations();
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  ${v.snippet}`)
      .join('\n');

    expect(
      violations,
      violations.length
        ? `e2e specs must not take the first tenant from the list — it is not ` +
            `id-ordered and is usually a 'pending' leftover once the suite has ` +
            `run a few times. Filter by status/capability and take the lowest ` +
            `id, or use tests/e2e/helpers/tenant.ts.\n${report}`
        : '',
    ).toEqual([]);
  });

  // The guard is only worth having if it actually fires. Feed it the exact
  // shape that broke system-status.spec.ts and viewer-switcher.spec.ts.
  it('flags the shape that regressed system-status / viewer-switcher', () => {
    const sample = `
      async function firstTenantId(token: string): Promise<number | null> {
        const r = await fetch(\`\${API_BASE}/api/v1/tenants\`, {
          headers: { Authorization: \`Bearer \${token}\` },
        });
        const body = await r.json();
        return body.items?.[0]?.id ?? null;
      }
    `;
    const idx = sample.search(FIRST_ITEM);
    expect(idx, 'regex must match items?.[0]').toBeGreaterThan(-1);
    expect(/\/tenants\b/.test(sample.slice(0, idx))).toBe(true);
  });
});
