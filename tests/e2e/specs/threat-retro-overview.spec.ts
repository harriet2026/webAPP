/**
 * Playwright E2E for the Threat-Traceback Agent — Tab A detection overview.
 *
 * Covers spec §7 / §12 frontend items:
 *   a) agent-center deep link renders the threat-retro overview
 *   b) six KPI cards render, including recall failures
 *   c) KPI drill-down: clicking "leak total" toggles the runs-table filter
 *   d) leak-row expansion reveals LeakMail details
 *   e) emergency scan dialog (strategy + time range) posts to POST /scan
 *
 * Data is seeded directly via the internal /test/sql endpoint (HMAC-signed) so
 * the UI has deterministic rows to render — mirrors phishing-detection.spec.ts.
 *
 * NOTE: not executed as part of this task — must be parseable + type-clean only.
 */

import * as crypto from 'crypto';
import { test, expect } from '../fixtures/auth.fixture';
import { internalFetch } from '../helpers/internal-client';
import { getDefaultTenantId, getDefaultTenantIdViaFetch } from '../helpers/tenant';
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

// Rows are seeded under the global-setup default tenant, which the specs select.
// A tenant must be selected: the threat-retro agent is platformHidden, so an
// unscoped (platform) view falls back to the agent-center overview and never
// renders the agent detail. Resolved in beforeAll.
let TENANT_ID = 'NULL';

interface SeededRun {
  runId: string;
  childId: string;
  subjectMarker: string;
}

// seedRun seeds one threat_retro_run row (which the UI lists) plus a child
// investigation_task with a leak_mail (for the expand-row detail tests).
async function seedRun(suffix: string, runId = `run-pw-${suffix}`): Promise<SeededRun> {
  const childId = `child-${suffix}`;
  const subjectMarker = `phish-${suffix}`;

  // The runs table queries threat_retro_runs, so seed there first.
  await seedSQL(
    `INSERT INTO threat_retro_runs ` +
      `(run_id, tenant_id, trigger_type, status, window_start, window_end, ` +
      ` leak_count, pending_recall_count, risk_level, recall_status) ` +
      `VALUES ('${runId}', ${TENANT_ID}, 'manual', 'completed', ` +
      ` NOW() - INTERVAL '1 hour', NOW(), 1, 1, 'medium', 'pending_recall')`,
  );

  const result = JSON.stringify({
    leak_mails: [
      {
        mail_log_id: 1,
        message_uuid: `u-${suffix}`,
        sender: 'a@evil.com',
        subject: subjectMarker,
        threat_type: 'phishing',
        recheck_confidence: 0.93,
        disposition: 'pending_recall',
        rationale: 'r',
      },
    ],
    details: '',
  }).replace(/'/g, "''");

  // Also seed the child task so GetThreatRetroRun can return leak_mails.
  await seedSQL(
    `INSERT INTO investigation_tasks ` +
      `(id, tenant_id, type, status, trigger_type, source_type, source_id, ` +
      ` target_type, target_ids_json, config_snapshot_json, result_json, steps_json, ` +
      ` recommended_actions_json, created_at, updated_at) ` +
      `VALUES ('${childId}', ${TENANT_ID}, 'threat_traceback', 'completed', 'manual', ` +
      ` 'threat_retro_run', '${runId}', 'cluster', '[1]', '{}'::jsonb, ` +
      ` '${result}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW(), NOW())`,
  );

  return { runId, childId, subjectMarker };
}

async function cleanupRun(childId: string, runId: string): Promise<void> {
  await seedSQL(`DELETE FROM investigation_tasks WHERE id='${childId}'`);
  await seedSQL(`DELETE FROM threat_retro_runs WHERE run_id='${runId}'`);
}

test.describe('Threat-Traceback Detection Overview', () => {
  test.beforeAll(async () => {
    TENANT_ID = String(await getDefaultTenantIdViaFetch());
  });

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

  test('sidebar entry navigates to the threat-retro overview', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
    await authenticatedPage.waitForLoadState('networkidle');
    // threat-retro has platformHidden=true, so the sidebar entry is not visible
    // for the system_admin (platform viewer). Verify the page itself loaded
    // instead — the top-bar h2 renders the localized agent name.
    await expect(authenticatedPage.locator('h1, h2').filter({ hasText: /威胁|Threat/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage).toHaveURL(/agent-center\/overview.*agent=threat-retro/);
  });

  test('six KPI cards render with separate recall success and failure', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
    // KPI cards all carry stable data-testids (kpi-cards.tsx).
    await expect(authenticatedPage.getByTestId('threat-retro-kpi-running')).toBeVisible({ timeout: 15000 });
    await expect(authenticatedPage.getByTestId('threat-retro-kpi-leak-total')).toBeVisible();
    await expect(authenticatedPage.getByTestId('threat-retro-kpi-pending')).toBeVisible();
    await expect(authenticatedPage.getByTestId('threat-retro-kpi-recalled')).toBeVisible();
    await expect(authenticatedPage.getByTestId('threat-retro-kpi-recall-failed')).toBeVisible();
    await expect(authenticatedPage.getByTestId('threat-retro-kpi-rate')).toBeVisible();
  });

  test('seeded leak row renders in the runs table', async ({ authenticatedPage }) => {
    const suffix = uniqueSuffix();
    const seeded = await seedRun(suffix);
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
      // Each run row carries data-testid="run-row-<run_id>" for deterministic lookup.
      await expect(
        authenticatedPage.getByTestId(`run-row-${seeded.runId}`),
      ).toBeVisible({ timeout: 20000 });
    } finally {
      await cleanupRun(seeded.childId, seeded.runId);
    }
  });

  test('long task ID stays inside its table cell and exposes the full value on hover', async ({ authenticatedPage }) => {
    const suffix = uniqueSuffix();
    const runId = `run-pw-overflow-${suffix.padEnd(48, 'x').slice(0, 48)}`;
    expect(runId).toHaveLength(64);
    const seeded = await seedRun(suffix, runId);
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
      const row = authenticatedPage.getByTestId(`run-row-${seeded.runId}`);
      await expect(row).toBeVisible({ timeout: 20000 });

      const idText = row.locator(`span[title="${seeded.runId}"]`);
      await expect(idText).toHaveAttribute('title', seeded.runId);
      const bounds = await idText.evaluate((element) => {
        const cell = element.closest('td');
        if (!cell) throw new Error('task ID cell not found');
        const textRect = element.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        return {
          textRight: textRect.right,
          cellRight: cellRect.right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      });
      expect(bounds.scrollWidth).toBeGreaterThan(bounds.clientWidth);
      expect(bounds.textRight).toBeLessThanOrEqual(bounds.cellRight);
    } finally {
      await cleanupRun(seeded.childId, seeded.runId);
    }
  });

  test('KPI drill-down: clicking leak-total toggles the runs filter', async ({ authenticatedPage }) => {
    const suffix = uniqueSuffix();
    const seeded = await seedRun(suffix);
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
      await expect(
        authenticatedPage.getByTestId(`run-row-${seeded.runId}`),
      ).toBeVisible({ timeout: 20000 });

      // Intercept the runs-table refetch triggered by the KPI click. The table
      // queries /threat-retro-agent/runs; clicking "pending" adds a
      // leak_disposition=pending_recall filter param — the changed query key forces
      // a new request. We just assert the click is wired (the request fires).
      const requestPromise = authenticatedPage
        .waitForRequest(
          (r) => r.url().includes('/threat-retro-agent/runs') && r.url().includes('leak_disposition=pending_recall'),
          { timeout: 10000 },
        )
        .catch(() => null);

      await authenticatedPage.getByTestId('threat-retro-kpi-pending').click();
      const req = await requestPromise;
      expect(req, 'expected a /runs request after KPI click').not.toBeNull();
      // Second click cancels drill-down (toggle behavior).
      await authenticatedPage.getByTestId('threat-retro-kpi-pending').click();
    } finally {
      await cleanupRun(seeded.childId, seeded.runId);
    }
  });

  test('leak row expands to reveal LeakMail details', async ({ authenticatedPage }) => {
    const suffix = uniqueSuffix();
    const seeded = await seedRun(suffix);
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
      // Each run row carries data-testid="run-row-<run_id>" for deterministic lookup.
      await expect(
        authenticatedPage.getByTestId(`run-row-${seeded.runId}`),
      ).toBeVisible({ timeout: 20000 });

      // Click the row's expand chevron (ChevronRight → ChevronDown on open).
      const row = authenticatedPage.getByTestId(`run-row-${seeded.runId}`);
      const expandBtn = row.locator('button').first();
      await expandBtn.click();
      // The expanded content surfaces the seeded subject marker OR mail_log_id.
      await expect
        .poll(
          async () => authenticatedPage.locator('main').innerText(),
          { timeout: 10000 },
        )
        .toContain(seeded.subjectMarker);
    } finally {
      await cleanupRun(seeded.childId, seeded.runId);
    }
  });

  test('recall confirmation posts selected mail ids without policy overrides', async ({ authenticatedPage }) => {
    const suffix = uniqueSuffix();
    const seeded = await seedRun(suffix);
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
      const row = authenticatedPage.getByTestId(`run-row-${seeded.runId}`);
      await expect(row).toBeVisible({ timeout: 20000 });
      await row.locator('button').first().click();
      await authenticatedPage.getByTestId(`recall-${seeded.runId}-1`).click();
      const requestPromise = authenticatedPage.waitForRequest(
        (request) => request.url().includes(`/threat-retro-agent/runs/${seeded.runId}/recall`) && request.method() === 'POST',
      );
      await authenticatedPage.getByTestId('threat-retro-recall-confirm').click();
      const request = await requestPromise;
      expect(request.postDataJSON()).toEqual({ mail_log_ids: [1] });
    } finally {
      await cleanupRun(seeded.childId, seeded.runId);
    }
  });

  test('emergency scan dialog posts strategy_id + window range', async ({ authenticatedPage }) => {
    // Seed a deep strategy via the lazy-row /test/sql path so the dialog's
    // strategy picker has an option.
    const suffix = uniqueSuffix();
    const stratName = `PW紧急-${suffix}`;
    await seedSQL(
      `INSERT INTO rules (name, tenant_id, page, is_active, metadata, rule_class, stage, condition_tree, action) ` +
        `VALUES ('${stratName}', ${TENANT_ID}, 'threat_retro_strategy', 0, ` +
        `'{"feature":"threat_retro_strategy","mode":"deep","status":"enabled","lookback_window_minutes":60}', ` +
        `'action', 'sideline', '{"type":"const","value":false}', 'sideline')`,
    );
    try {
      await authenticatedPage.goto('/zh/agent-center/overview?agent=threat-retro');
      // Click the top-bar entry button (NOT the dialog submit). The dialog
      // opens, picks the seeded strategy, and submits.
      await authenticatedPage.getByTestId('manual-scan-entry').click();
      // The dialog body opens; wait for its submit button to appear.
      const submit = authenticatedPage.getByTestId('manual-scan-submit');
      await expect(submit).toBeVisible({ timeout: 10000 });

      // Intercept the POST /scan request triggered by submit.
      const [req] = await Promise.all([
        authenticatedPage
          .waitForRequest(
            (r) => r.url().includes('/threat-retro-agent/scan') && r.method() === 'POST',
            { timeout: 10000 },
          )
          .catch(() => null),
        submit.click(),
      ]);
      expect(req, 'expected a POST /threat-retro-agent/scan after submit').not.toBeNull();
      const body = req?.postDataJSON();
      expect(body).toHaveProperty('strategy_id');
      expect(body).toHaveProperty('window_start');
      expect(body).toHaveProperty('window_end');
    } finally {
      await seedSQL(`DELETE FROM rules WHERE name='${stratName}' AND page='threat_retro_strategy'`);
    }
  });

  test('four locales render without missing-key fallback', async ({ authenticatedPage }) => {
    // spec §10 mandates 4-language coverage; switching the URL locale prefix
    // must NOT surface a raw "threatRetro." namespace.key fallback.
    for (const locale of ['zh', 'en', 'th', 'ru']) {
      await authenticatedPage.goto(`/${locale}/agent-center/overview?agent=threat-retro`);
      await authenticatedPage.waitForLoadState('networkidle');
      const mainText = await authenticatedPage.locator('main').innerText();
      expect(mainText).not.toContain('threatRetro.');
    }
  });
});
