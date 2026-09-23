/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS Playwright entrypoint. */
// Real API login and product APIs on an isolated, already seeded SMTP demo.
// This runner never creates mail, tasks, protected targets or mocked responses.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const crypto = require('node:crypto');
const manifest = JSON.parse(fs.readFileSync(process.env.ASSESSMENT_LIVE_MANIFEST, 'utf8'));
const credentials = JSON.parse(fs.readFileSync(process.env.ASSESSMENT_LIVE_LOGIN_FILE, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

if (!Number.isInteger(manifest.tenant_id) || manifest.tenant_id < 1 || !manifest.samples?.length) {
  throw new Error('Manifest requires a positive isolated tenant_id and actual sample records.');
}

// Schema 2 permits retained fragments. Schema-1 samples must pin their version
// explicitly; accepting either observed value would hide a deployment mismatch.
function expectedReportSchemaVersion(sample) {
  const version = sample.report_schema_version ?? manifest.report_schema_version ?? 2;
  if (version !== 1 && version !== 2) {
    throw new Error('Expected report_schema_version must be 1 or 2.');
  }
  return version;
}
for (const sample of manifest.samples) {
  if (sample.status === 'available') expectedReportSchemaVersion(sample);
}

async function login(page, context) {
  const audit = { requests: [], blocked: [], pageErrors: [], dialogs: [], authenticatedBootstraps: 0 };
  const origin = new URL(process.env.ASSESSMENT_LIVE_WEB_URL).origin;
  page.on('pageerror', (error) => audit.pageErrors.push(error.message));
  page.on('dialog', async (dialog) => { audit.dialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/api/v1/bootstrap' || response.status() !== 200) return;
    const bootstrap = await response.json().catch(() => null);
    if (bootstrap?.user && !bootstrap.authStale) audit.authenticatedBootstraps++;
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const allowed = url.origin === origin && (request.method() === 'GET'
      || (request.method() === 'POST' && url.pathname === '/api/v1/auth/login'));
    if (!allowed) {
      audit.blocked.push(`${request.method()} ${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (url.pathname.startsWith('/api/')) audit.requests.push(`${request.method()} ${url.pathname}`);
    return route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    audit.blocked.push('WEBSOCKET');
    socket.close();
  });
  // The existing preview switch also bypasses frontend login. Authenticate
  // before the first render, so its automatic demo fallback never supplies a user.
  const response = await page.request.post('/api/v1/auth/login', { data: credentials });
  expect(response.status(), 'real API login').toBe(200);
  const session = await response.json();
  expect(typeof session.role, 'login completed without another authentication step').toBe('string');
  expect((await context.cookies()).some((cookie) => cookie.name === 'osgateway_token' && cookie.httpOnly && cookie.value.length > 0)).toBe(true);
  audit.requests.push('POST /api/v1/auth/login');
  const bootstrap = await getJSON(page, '/bootstrap');
  expect(bootstrap.authStale).not.toBe(true);
  expect(bootstrap.user?.role).toBe(session.role);
  expect(bootstrap.user?.roleId ?? null).toBe(session.role_id ?? null);
  // Mirror api/auth.ts's normal persisted user using only the real login result.
  const user = { id: 0, username: credentials.username, role: session.role,
    tenant_id: session.tenant_id ?? null, role_id: session.role_id ?? null,
    is_super_admin: session.is_super_admin ?? false, created_at: '', updated_at: '' };
  await context.addInitScript(({ user, tenantID, origin, features }) => {
    if (location.origin !== origin) return;
    localStorage.setItem('osgateway_user', JSON.stringify(user));
    localStorage.setItem('osgateway_features', JSON.stringify(features));
    localStorage.setItem('osgateway_selected_tenant', String(tenantID));
    localStorage.removeItem('osgateway_mock_enabled');
    localStorage.removeItem('osgateway_demo_session');
    document.cookie = 'osgateway_auth=1; path=/; SameSite=Strict';
    document.cookie = `osg_selected_tenant=${tenantID}; path=/; SameSite=Strict`;
    document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
  }, { user, tenantID: manifest.tenant_id, origin, features: { aiInterpret: session.features?.ai_interpret ?? false } });
  return audit;
}

async function getJSON(page, apiPath) {
  const response = await page.request.get(`/api/v1${apiPath}`, {
    headers: { 'X-Tenant-ID': String(manifest.tenant_id) },
  });
  expect(response.status(), apiPath).toBe(200);
  return response.json();
}

async function assertReport(container, result, sample, locale) {
  const labels = require(`../../messages/${locale}.json`).assessment;
  const view = container.getByTestId('assessment-report');
  await expect(view).toBeVisible();
  expect(result.assessment_report_status).toBe(sample.status);
  if (sample.status !== 'available') {
    await expect(view.getByTestId('assessment-state')).toHaveText(labels.states[sample.status]);
    await expect(view.getByTestId('assessment-factor')).toHaveCount(0);
    if (sample.reason) expect(result.assessment_report_reason).toBe(sample.reason);
    return;
  }
  const report = result.assessment_report;
  expect(report.schema_version, 'expected frozen report contract').toBe(expectedReportSchemaVersion(sample));
  expect(report.origin.kind).toBe('worker');
  expect(report.origin.task_id).toBe(sample.task_id);
  expect(report.origin.task_attempt_id).toBeTruthy();
  expect(report.origin.plan_revision).toBe(sample.plan_revision);
  if (sample.snapshot_sha256) expect(report.snapshot_sha256).toBe(sample.snapshot_sha256);
  const factors = report.factors || [];
  await expect(view.getByTestId('assessment-subject')).toHaveCount(report.subjects.length);
  await expect(view.getByTestId('assessment-factor')).toHaveCount(factors.length);
  for (const subject of report.subjects) {
    const group = view.getByTestId('assessment-subject').filter({ has: container.page().getByRole('heading', { name: subject.label, exact: true }) });
    await expect(group).toHaveCount(1);
    for (const factor of factors.filter((item) => item.subject_ref === subject.id)) {
      const card = group.getByTestId('assessment-factor').filter({ hasText: factor.observation });
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(factor.relevance);
      if (factor.limitation) await expect(card).toContainText(factor.limitation);
      await expect(card).toContainText(labels.strengths[factor.strength]);
      await expect(group).toContainText(labels.directions[factor.direction]);
    }
  }
  // Expand the entire rendered catalog, including retained sources no factor cites.
  const details = view.getByTestId('assessment-source');
  const references = factors.flatMap((factor) => factor.source_refs);
  const expectedContents = (report.sources || []).flatMap((source) =>
    Array(Math.max(1, references.filter((ref) => ref === source.id).length)).fill(source.content || labels.emptyContent));
  await expect(details).toHaveCount(expectedContents.length);
  const displayed = [];
  for (let i = 0; i < await details.count(); i++) {
    const detail = details.nth(i);
    await detail.locator('summary').click();
    const content = detail.getByTestId('assessment-source-content');
    await expect(content).toBeVisible();
    displayed.push(await content.textContent());
    await expect(detail.locator('script')).toHaveCount(0);
  }
  expect([...displayed].sort()).toEqual(expectedContents.sort());
  for (const source of report.sources || []) {
    expect(displayed, `retained source ${source.id}`).toContain(source.content || labels.emptyContent);
    expect(Buffer.byteLength(source.content || '')).toBe(source.retained_bytes || 0);
    expect(sha256(source.content || '')).toBe(source.retained_sha256);
  }
  for (const gap of report.gaps || []) await expect(view.getByTestId('assessment-gaps')).toContainText(gap.detail);
}

for (const sample of manifest.samples) {
  for (const locale of manifest.locales || ['en']) {
    for (const surface of sample.surfaces || ['drawer', 'general', 'mail']) {
      test(`${manifest.phase || 'published'} ${sample.name} ${locale} ${surface}`, async ({ page, context }, testInfo) => {
        const audit = await login(page, context);
        try {
          const generic = await getJSON(page, `/investigations/${encodeURIComponent(sample.task_id)}`);
          expect(generic.task.tenant_id).toBe(manifest.tenant_id);
          const mail = await getJSON(page, `/mail-logs/${sample.mail_log_id}`);
          expect(mail.message_uuid).toBe(sample.message_uuid);
          const result = generic.task.result;
          let container;
          let detail;
          if (surface === 'drawer') {
            const phish = sample.kind === 'phish';
            const agent = phish ? 'phishing' : 'spoofing';
            detail = await getJSON(page, `/${agent}-agent/detection-logs/${encodeURIComponent(sample.detail_id)}`);
            expect(detail.investigation.result).toEqual(result);
            if (phish) expect(detail.summary.message_uuid).toBe(sample.message_uuid);
            await page.goto(`/${locale}/agent-center/overview?agent=${agent}`);
            // Preserve access to the actual historical sample across midnight.
            const messages = require(`../../messages/${locale}.json`);
            const labels = messages[phish ? 'phishingDetection' : 'spoofingDetection'];
            if (!phish) await page.getByTestId('spoof-log-range-trigger').click();
            await page.getByRole('button', { name: labels.filters.range['7d'], exact: true }).click();
            if (!phish) await page.keyboard.press('Escape');
            await page.getByTestId(phish ? 'phishing-log-filter-keyword' : 'spoof-log-keyword').fill(sample.subject);
            await page.getByTestId(phish ? 'phishing-log-filter-search' : 'spoof-log-search').click();
            const button = phish ? page.getByTestId(`phishing-log-detail-${sample.detail_id}`)
              : page.getByRole('row').filter({ hasText: sample.subject }).getByTestId('spoof-log-row-detail').first();
            await button.click();
            container = page.getByTestId(phish ? 'phishing-detail-sheet' : 'spoof-detail-sheet');
          } else if (surface === 'general') {
            await page.goto(`/${locale}/investigations?task_id=${sample.task_id}`);
            container = page.getByRole('dialog');
          } else if (surface === 'mail') {
            await page.goto(`/${locale}/logs/email?mail_log_id=${sample.mail_log_id}`);
            const modal = page.getByTestId('email-log-detail-modal');
            await expect(modal).toBeVisible();
            await modal.getByRole('button').filter({ hasText: sample.task_id }).click();
            container = page.getByRole('dialog').filter({ has: page.getByTestId('assessment-report') });
          } else throw new Error(`Unknown surface ${surface}`);
          await assertReport(container, result, sample, locale);
          await expect.poll(() => audit.authenticatedBootstraps, { message: 'browser fetched authenticated product bootstrap' }).toBeGreaterThan(0);
          expect(await page.evaluate(() => localStorage.getItem('osgateway_mock_enabled'))).not.toBe('1');
          expect(await page.evaluate(() => localStorage.getItem('osgateway_demo_session'))).not.toBe('1');
          if (surface === 'drawer' && sample.kind === 'phish') {
            await page.getByTestId('phishing-detail-run-log').click();
            const downloadEvent = page.waitForEvent('download');
            await page.getByTestId('phishing-detail-export').click();
            const download = await downloadEvent;
            const file = testInfo.outputPath('detail-export.json');
            await download.saveAs(file);
            expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(detail);
          }
          await testInfo.attach('actual-product-result', { body: JSON.stringify(generic), contentType: 'application/json' });
          await container.getByTestId('assessment-report').scrollIntoViewIfNeeded();
          await page.screenshot({ path: testInfo.outputPath('report.png'), animations: 'disabled' });
        } finally {
          await testInfo.attach('real-network-audit', { body: JSON.stringify(audit), contentType: 'application/json' });
          expect(audit.blocked).toEqual([]);
          expect(audit.pageErrors).toEqual([]);
          expect(audit.dialogs).toEqual([]);
        }
      });
    }
  }
}
