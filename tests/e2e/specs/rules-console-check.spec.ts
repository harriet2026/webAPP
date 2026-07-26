import { test, expect } from '../fixtures/auth.fixture';

const RULES_PAGES = [
  { name: 'Tag Rules', path: '/zh/rules/tag' },
  { name: 'Data Rules', path: '/zh/rules/data' },
  { name: 'Header Rules', path: '/zh/rules/header' },
  { name: 'Rcpt Rules', path: '/zh/rules/rcpt' },
  { name: 'Mail Rules', path: '/zh/rules/mail' },
  { name: 'OnConnect Rules', path: '/zh/rules/onconnect' },
  { name: 'Sideline Rules', path: '/zh/rules/sideline' },
  { name: 'RBL', path: '/zh/rules/rbl' },
  { name: 'Exec Impersonation', path: '/zh/rules/exec-impersonation' },
  { name: 'Domain Lookalike', path: '/zh/rules/domain-lookalike' },
];

for (const { name, path } of RULES_PAGES) {
  test(`${name} - no console errors`, async ({ authenticatedPage: page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    // Track failing responses by URL. The auth fixture lands on the dashboard
    // first, whose system-status widget (AI editions) probes the per-tenant agent
    // stats via a fault-isolated Promise.all (optionalSource → null on error). For
    // the platform viewer (system_admin, no tenant selected) those endpoints are
    // capability-gated and legitimately reject — /spoofing-agent/stats → 403,
    // /threat-retro-agent/stats → 400 "tenant_id required". Those in-flight
    // requests resolve after we navigate here, so the browser logs a generic
    // "Failed to load resource" console error on this page. Tolerate ONLY those
    // known-expected endpoints; any other 4xx/5xx is a real failure.
    const ALLOWED_FAILING = [
      /\/api\/v1\/spoofing-agent\/stats\b/,
      /\/api\/v1\/threat-retro-agent\/stats\b/,
    ];
    const unexpectedFailures: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) {
        const url = r.url();
        if (!ALLOWED_FAILING.some((re) => re.test(url))) {
          unexpectedFailures.push(`[${r.status()}] ${r.request().method()} ${url}`);
        }
      }
    });

    await page.goto(path, { waitUntil: 'networkidle', timeout: 30000 });

    // wait a bit for any lazy errors
    await page.waitForTimeout(2000);

    if (consoleErrors.length > 0) {
      console.log(`\n=== Console Errors on ${name} ===`);
      for (const e of consoleErrors) console.log(e);
    }
    if (pageErrors.length > 0) {
      console.log(`\n=== Page Errors on ${name} ===`);
      for (const e of pageErrors) console.log(e);
    }

    // Resource-load console errors are byproducts of failing responses, which we
    // check precisely by URL via `unexpectedFailures` above (the console text
    // carries no URL). Keep every other console error (real JS errors) strict.
    const knownWarnings = ['MISSING_MESSAGE'];
    const filteredErrors = consoleErrors.filter(
      (e) =>
        !knownWarnings.some((w) => e.includes(w)) &&
        !/Failed to load resource: the server responded with a status of/.test(e),
    );
    expect(unexpectedFailures).toEqual([]);
    expect(filteredErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
