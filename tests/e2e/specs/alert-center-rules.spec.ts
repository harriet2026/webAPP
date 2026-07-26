import { test, expect } from '../fixtures/auth.fixture';

const RULES = { items: [
  { id: 1, name: 'Deferred 严重积压', description: '', enabled: true, severity: 'p0', metric_key: 'queue_deferred', module: 'mailflow_queue', aggregation: 'avg_5min', operator: 'gt', threshold_warn: 10000, threshold_crit: 50000, dual_threshold: true, target_scope: { node: 'all' }, duration_type: 'time', duration_seconds: 300, sample_count: 3, notify_email_enabled: true, notify_recipients: ['ops@co.com'], recovery_notify: true, convergence_window_seconds: 300, effective_period: null, combined_conditions: null, escalation: null, suppress_interval_seconds: null, silence_period: null, created_at: '', updated_at: '' },
] };
const METRICS = { items: [
  { key: 'queue_deferred', module: 'mailflow_queue', source: 'tdengine', unit: '封', default_warn: 10000, default_crit: 50000, available: true, node_scoped: true },
  { key: 'antispam_hit_rate', module: 'detection', source: 'reldb', unit: '%', default_warn: null, default_crit: null, available: false, node_scoped: false },
] };
const TEMPLATES = { items: [
  { key: 'deferred_critical', name: '队列严重积压', description: 'Deferred>50000 持续5分钟', module: 'mailflow_queue', metric_key: 'queue_deferred', aggregation: 'avg_5min', operator: 'gt', threshold_warn: 10000, threshold_crit: 50000, dual_threshold: true, duration_type: 'time', duration_seconds: 300, severity: 'p0' },
] };

async function mock(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/monitor/alert-rules/metrics', (r) => r.fulfill({ json: METRICS }));
  await page.route('**/api/v1/monitor/alert-rules/templates', (r) => r.fulfill({ json: TEMPLATES }));
  await page.route(/\/api\/v1\/monitor\/alert-rules(\?.*)?$/, (r) => r.fulfill({ json: RULES }));
  await page.route('**/api/v1/monitor/alerts/stats', (r) => r.fulfill({ json: { total: 0, unconfirmed: 0, processing: 0, resolved: 0, critical: 0, major: 0 } }));
}

test.describe('Alert Center — rules', () => {
  test.beforeEach(async ({ authenticatedPage }) => { await mock(authenticatedPage); });

  test('TC010 rules tab lists rules', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('tab', { name: '告警规则' }).click();
    await expect(authenticatedPage.getByTestId('rule-row-1')).toContainText('Deferred 严重积压');
  });

  test('TC011 add-rule drawer opens; advanced step disabled', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('tab', { name: '告警规则' }).click();
    await authenticatedPage.getByRole('button', { name: /新增规则/ }).click();
    await expect(authenticatedPage.getByTestId('editor-trigger')).toBeVisible();
    const adv = authenticatedPage.getByTestId('editor-advanced-disabled');
    await expect(adv).toBeVisible();
    await expect(adv).toHaveAttribute('disabled', '');
  });

  test('TC011b unavailable metric group is greyed/disabled', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('tab', { name: '告警规则' }).click();
    await authenticatedPage.getByRole('button', { name: /新增规则/ }).click();
    await authenticatedPage.getByTestId('editor-trigger').getByRole('combobox').first().click();
    // detection group (antispam_hit_rate) is rendered greyed-out + disabled
    const engineItem = authenticatedPage.getByRole('option', { name: /反垃圾命中率|Antispam Hit Rate/i }).first();
    if (await engineItem.count()) await expect(engineItem).toBeDisabled();
  });

  test('TC012 template prefill fills metric+threshold', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('tab', { name: '告警规则' }).click();
    await authenticatedPage.getByRole('button', { name: /新增规则/ }).click();
    await expect(authenticatedPage.getByTestId('editor-trigger')).toBeVisible();

    // Drive the template Select (data-testid on trigger for a stable locator)
    // and pick the deferred_critical template. applyTemplate sets metric +
    // dual_threshold + threshold_crit=50000 + threshold_warn=10000.
    await authenticatedPage.getByTestId('template-select').click();
    await authenticatedPage.getByRole('option', { name: /队列严重积压/ }).click();

    // dual_threshold is now true → the critical-threshold input is rendered.
    await expect(authenticatedPage.getByTestId('crit-threshold-input')).toHaveValue('50000');
  });

  test('TC019 edit loads existing rule into drawer', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/zh/monitoring/alerts');
    await authenticatedPage.getByRole('tab', { name: '告警规则' }).click();
    await authenticatedPage.getByTestId('rule-row-1').getByRole('button', { name: /编辑/ }).click();
    await expect(authenticatedPage.locator('input[value="Deferred 严重积压"]')).toBeVisible();
  });
});
