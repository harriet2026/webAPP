import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// GT-12077: This test intentionally does NOT `import` the proxy module.
// Next.js statically analyzes `export const config` in proxy.ts at
// build time to derive the matcher; it cannot resolve a value re-exported
// from an imported module. A prior extraction of `config` into
// `proxy-config.ts` (re-exported via `import { config } from
// './proxy-config'; export { config };`) silently broke this —
// Next.js lost the matcher and the proxy fell back to running on
// EVERY request, including `/api/*` (which then got redirected to the
// login page instead of reaching the API route handler). Unit tests that
// imported the config value all stayed green because the *value* was still
// correct; only Next.js's static build-time analysis of the source file
// was broken. So instead of importing, this test reads proxy.ts AS
// TEXT and asserts the matcher literal is present in the file itself. If
// `config` is ever extracted out of proxy.ts again, this test goes
// RED even though a value-based test would not have caught it.
const proxySource = readFileSync(
  join(__dirname, '../../src/proxy.ts'),
  'utf-8'
);

describe('proxy matcher (GT-12077)', () => {
  it('declares config as an inline literal in proxy.ts, not imported', () => {
    // Must NOT import config from another module.
    expect(proxySource).not.toMatch(/import\s*{\s*config\s*}\s*from/);
    // Must declare it inline so Next.js's static analysis can see it.
    expect(proxySource).toMatch(/export\s+const\s+config\s*=\s*{/);
  });

  it('contains /portal/:path* entry to handle bare quarantine-digest links', () => {
    // GT-12077: Quarantine-digest emails link recipients to
    // `/{locale}/portal/quarantine/<id>/release?token=...`. However, older
    // mails or hand-edited base URLs may use a bare `/portal/...` (no locale
    // prefix). Without the `'/portal/:path*'` matcher entry, next-intl never
    // sees the request and Postfix returns 404. The auth gate already exempts
    // portal paths via isPortalPath(), so recipients are not bounced to /login
    // without this entry.
    //
    // This test locks down the presence of that entry: if someone deletes it,
    // every bare portal link silently 404s again and this test goes RED.
    expect(proxySource).toContain("'/portal/:path*'");
  });

  it('still contains locale-prefixed matcher for localized routes', () => {
    // Ensure the fix was not made by replacing the locale-prefixed entry, but
    // by adding a new one alongside it.
    expect(proxySource).toContain("'/(zh|en|th|ru)/:path*'");
  });

  it('preserves the root matcher entry', () => {
    // Ensure the matcher array was not accidentally cleared or replaced.
    expect(proxySource).toMatch(/matcher:\s*\[\s*'\/'/);
  });
});
