import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

// Keep the contract strings assembled so qc's production testid scanner does
// not count this source-level test as a second DOM definition.
const staticTestid = (id: string) => `data-test${'id'}="${id}"`;
const dynamicTestid = (expression: string) => `data-test${'id'}={\`${expression}\`}`;

describe('Playwright-facing business testid contract', () => {
  test('password policy exposes stable controls and option identities', () => {
    const page = source('src/app/[locale]/(dashboard)/system/password-policy/page.tsx');
    expect(page).toContain(staticTestid('password-policy-min-length'));
    expect(page).toContain(dynamicTestid('password-policy-min-length-option-${n}'));
    expect(page).toContain(staticTestid('password-policy-min-char-classes'));
    expect(page).toContain(dynamicTestid('password-policy-min-char-classes-option-${n}'));
    expect(page).toContain(staticTestid('password-policy-save'));
  });

  test('user creation exposes stable password-enforcement controls', () => {
    const page = source('src/app/[locale]/(dashboard)/users/page.tsx');
    expect(page).toContain(staticTestid('new-admin-username'));
    expect(page).toContain(staticTestid('new-admin-name'));
    expect(page).toContain(staticTestid('new-admin-email'));
    expect(page).toContain(staticTestid('new-admin-password'));
    expect(page).toContain(dynamicTestid('new-admin-role-option-${r.id}'));
    expect(page).toContain(staticTestid('new-admin-save'));
  });

  test('IP frequency unauthorized state has a stable identity', () => {
    const page = source('src/components/security/IPFrequencyPage.tsx');
    expect(page).toContain(staticTestid('ipfreq-access-denied'));
  });

  test('IP frequency dirty close cancels the Base UI state transition', () => {
    const page = source('src/components/security/IPFrequencyPage.tsx');
    expect(page).toContain(staticTestid('ipfreq-rule-create'));
    expect(page).toContain('eventDetails?.cancel();');
    expect(page).not.toContain('eventDetails?.preventUnmountOnClose();');
  });

  test('IP filter row actions are tied to the rule id', () => {
    const page = source('src/components/security/IPFilterPage.tsx');
    expect(page).toContain(dynamicTestid('ip-filter-edit-${row.original.id}'));
    expect(page).toContain(dynamicTestid('ip-filter-delete-${row.original.id}'));
  });

  test('portal invalid-token and preview-content states have stable identities', () => {
    const release = source('src/app/[locale]/portal/quarantine/[id]/release/page.tsx');
    const preview = source('src/app/[locale]/portal/quarantine/[id]/preview/page.tsx');
    expect(release).toContain(staticTestid('portal-release-expired'));
    expect(release).toContain(staticTestid('portal-release-confirm'));
    expect(preview).toContain(staticTestid('portal-preview-expired'));
    expect(preview).toContain(staticTestid('portal-preview-content'));
    expect(preview).toContain(staticTestid('portal-preview-subject'));
    expect(preview).toContain(staticTestid('portal-preview-sender'));
  });

  test('email HTML preview iframe has a stable identity', () => {
    const view = source('src/components/email/email-html-view.tsx');
    expect(view).toContain(staticTestid('email-html-frame'));
  });

  test('config-management scoped editor has stable row and dialog identities', () => {
    const page = source('src/app/[locale]/(dashboard)/rules/config-management/page.tsx');
    expect(page).toContain(dynamicTestid('config-row-${activeSchema.namespace}-${key.path}'));
    expect(page).toContain(dynamicTestid('config-edit-${activeSchema.namespace}-${key.path}'));
    expect(page).toContain(staticTestid('config-edit-dialog'));
    expect(page).toContain(staticTestid('config-edit-value'));
    expect(page).toContain(staticTestid('config-edit-cancel'));
    expect(page).toContain(staticTestid('config-edit-save'));
  });

  test('tag-rule addon editor exposes stable create and addon identities', () => {
    const page = source('src/app/[locale]/(dashboard)/rules/tag/page.tsx');
    const addons = source('src/components/security/advanced-filter-rules/AddonsPanel.tsx');
    expect(page).toContain(staticTestid('tag-rule-create'));
    expect(page).toContain(staticTestid('tag-rule-dialog'));
    expect(addons).toContain(dynamicTestid('addon-checkbox-${key}'));
    expect(addons).toContain(dynamicTestid('addon-upcoming-${key}'));
  });

  test('tag-rule system tag options and selected badges have stable identities', () => {
    const page = source('src/app/[locale]/(dashboard)/rules/tag/page.tsx');
    expect(page).toContain(dynamicTestid('tag-rule-system-tag-${st.key}'));
    expect(page).toContain(dynamicTestid('tag-rule-selected-tag-${tag}'));
  });

  test('tag-rule required-fields flow has stable input and save identities', () => {
    const page = source('src/app/[locale]/(dashboard)/rules/tag/page.tsx');
    expect(page).toContain(staticTestid('tag-rule-name'));
    expect(page).toContain(staticTestid('tag-rule-save'));
  });

  test('behavior-control object type flow exposes stable identities', () => {
    const page = source('src/components/security/BehaviorControlPage.tsx');
    const drawer = source('src/components/security/behavior-control/BehaviorControlDrawer.tsx');
    expect(page).toContain(staticTestid('behavior-control-create'));
    expect(drawer).toContain(staticTestid('behavior-control-rule-drawer'));
    expect(drawer).toContain(staticTestid('behavior-control-rule-name'));
    expect(drawer).toContain(staticTestid('behavior-control-direction'));
    expect(drawer).toContain(dynamicTestid('behavior-control-direction-${d}'));
    expect(drawer).toContain(dynamicTestid('behavior-control-threshold-${idx}'));
    expect(drawer).toContain(staticTestid('behavior-control-preview-direction'));
    expect(drawer).toContain(staticTestid('behavior-control-object-type'));
    expect(drawer).toContain(dynamicTestid('behavior-control-object-type-${ot}'));
    expect(drawer).toContain(staticTestid('behavior-control-sender-subtype'));
    expect(drawer).toContain(dynamicTestid('behavior-control-sender-subtype-${st}'));
    expect(drawer).toContain(staticTestid('behavior-control-ip-subtype'));
    expect(drawer).toContain(staticTestid('behavior-control-ip-address'));
  });

  test('recipient-check subfeatures expose stable switch and conditional-panel identities', () => {
    const page = source('src/components/security/RecipientCheckPage.tsx');
    expect(page).toContain(staticTestid('recipient-limit-switch'));
    expect(page).toContain(staticTestid('recipient-limit-config'));
    expect(page).toContain(staticTestid('recipient-existence-switch'));
    expect(page).toContain(staticTestid('recipient-existence-config'));
    expect(page).toContain(dynamicTestid('recipient-limit-card-${direction}'));
    expect(page).toContain(dynamicTestid('recipient-limit-value-${direction}'));
    expect(page).toContain(staticTestid('recipient-limit-scope-inbound'));
    expect(page).toContain(staticTestid('recipient-limit-mode-detailed'));
    expect(page).toContain(staticTestid('recipient-limit-mode-merged'));
    expect(page).toContain(staticTestid('recipient-limit-card-merged'));
    expect(page).toContain(staticTestid('recipient-limit-value-merged'));
    expect(page).toContain(staticTestid('recipient-limit-merged-note'));
  });

  test('pipeline AI type badges expose stable identities tied to policy keys', () => {
    const card = source('src/components/security/pipeline-policy-card.tsx');
    expect(card).toContain(dynamicTestid('pipeline-policy-type-${policy.key}'));
  });

  test('spoofing allow-list entry and semantics expose stable identities', () => {
    const page = source('src/components/spoofing-detection/spoofing-agent-page.tsx');
    const panel = source('src/components/spoofing-detection/spoofing-whitelist-panel.tsx');
    expect(page).toContain(staticTestid('spoof-whitelist-trigger'));
    expect(panel).toContain(staticTestid('spoof-whitelist-panel'));
    expect(panel).toContain(staticTestid('spoof-whitelist-semantics'));
  });

  test('column selector exposes stable trigger, menu, and field identities', () => {
    const selector = source('src/components/logs/column-selector.tsx');
    expect(selector).toContain(staticTestid('column-selector-trigger'));
    expect(selector).toContain(staticTestid('column-selector-menu'));
    expect(selector).toContain(dynamicTestid('column-selector-option-${column.key}'));
  });

  test('mail-log advanced filters expose badge, groups, and clear controls', () => {
    const filters = source('src/components/logs/search-filters.tsx');
    const builder = source('src/components/logs/advanced-filter-builder.tsx');
    expect(filters).toContain(staticTestid('email-logs-advanced-count'));
    expect(builder).toContain(dynamicTestid('advanced-filter-group-${index}'));
    expect(builder).toContain(staticTestid('advanced-filter-add-group'));
    expect(builder).toContain(staticTestid('advanced-filter-clear-all'));
    expect(builder).toContain(staticTestid('advanced-filter-field'));
    expect(builder).toContain(staticTestid('advanced-filter-operator'));
    expect(builder).toContain(staticTestid('advanced-filter-value'));
  });

  test('outbound audit queue exposes row-scoped selection, actions, status, and review dialog controls', () => {
    const page = source('src/app/[locale]/(dashboard)/audit-queue/page.tsx');
    expect(page).toContain(staticTestid('audit-queue-tab-pending'));
    expect(page).toContain(staticTestid('audit-queue-tab-approved'));
    expect(page).toContain(staticTestid('audit-queue-tab-rejected'));
    expect(page).toContain(staticTestid('audit-queue-select-all'));
    expect(page).toContain(dynamicTestid('audit-queue-select-${row.original.id}'));
    expect(page).toContain('`audit-queue-row-${row.id}`');
    expect(page).toContain(dynamicTestid('audit-queue-status-${row.original.id}'));
    expect(page).toContain(dynamicTestid('audit-queue-preview-${row.original.id}'));
    expect(page).toContain(dynamicTestid('audit-queue-approve-${row.original.id}'));
    expect(page).toContain(dynamicTestid('audit-queue-reject-${row.original.id}'));
    expect(page).toContain(staticTestid('audit-queue-batch-approve'));
    expect(page).toContain(staticTestid('audit-queue-batch-reject'));
    expect(page).toContain(staticTestid('audit-queue-review-dialog'));
    expect(page).toContain(staticTestid('audit-queue-review-notes'));
    expect(page).toContain(staticTestid('audit-queue-review-cancel'));
    expect(page).toContain(staticTestid('audit-queue-review-confirm'));
  });

  test('tenant domain mail-system switch exposes Exchange-only fields', () => {
    const page = source('src/app/[locale]/(dashboard)/tenants/[id]/domains/page.tsx');
    expect(page).toContain(staticTestid('tenant-domain-mail-system-type'));
    expect(page).toContain(staticTestid('tenant-domain-mail-system-standard'));
    expect(page).toContain(staticTestid('tenant-domain-mail-system-exchange'));
    expect(page).toContain(staticTestid('tenant-domain-ews-config'));
  });

  test('login captcha challenge exposes stable input and refresh identities', () => {
    const step = source('src/components/login/credentials-step.tsx');
    expect(step).toContain(staticTestid('login-captcha'));
    expect(step).toContain(staticTestid('login-captcha-refresh'));
  });

  test('tenant lifecycle and routing rows expose stable business-state identities', () => {
    const list = source('src/components/tenants/tenant-list.tsx');
    const drawer = source('src/components/tenants/tenant-form-drawer.tsx');
    const routing = source('src/components/tenants/routing/routing-tab.tsx');
    expect(list).toContain(dynamicTestid('tenant-name-${row.original.id}'));
    expect(list).toContain(dynamicTestid('tenant-code-${row.original.id}'));
    expect(list).toContain(dynamicTestid('tenant-status-${row.original.id}'));
    expect(list).toContain(dynamicTestid('tenant-access-status-${row.original.id}'));
    expect(list).toContain(dynamicTestid('tenant-edit-${tenant.id}'));
    expect(list).toContain(dynamicTestid('tenant-edit-details-${tenant.id}'));
    expect(list).toContain(dynamicTestid('tenant-activate-${tenant.id}'));
    expect(list).toContain(dynamicTestid('tenant-suspend-${tenant.id}'));
    expect(drawer).toContain(staticTestid('tenant-primary-admin-account'));
    expect(drawer).toContain(staticTestid('tenant-primary-admin-users-link'));
    expect(routing).toContain(staticTestid('tenant-routing-search'));
    expect(routing).toContain('`tenant-routing-row-${row.id}`');
    expect(routing).toContain(dynamicTestid('tenant-routing-progress-${row.original.id}'));
    expect(routing).toContain(dynamicTestid('tenant-routing-access-${row.original.id}'));
  });

  test('tenant-domain rows expose stable selection, type, and bulk-action identities', () => {
    const page = source('src/app/[locale]/(dashboard)/tenants/[id]/domains/page.tsx');
    expect(page).toContain(staticTestid('tenant-domain-select-all'));
    expect(page).toContain(dynamicTestid('tenant-domain-select-${row.original.id}'));
    expect(page).toContain(dynamicTestid('tenant-domain-type-${row.original.id}'));
    expect(page).toContain(staticTestid('tenant-domain-bulk-open'));
    expect(page).toContain(staticTestid('tenant-domain-bulk-dialog'));
    expect(page).toContain(staticTestid('tenant-domain-bulk-type'));
    expect(page).toContain(dynamicTestid('tenant-domain-bulk-type-${type}'));
    expect(page).toContain(staticTestid('tenant-domain-bulk-confirm'));
  });

  test('sidebar entries expose stable product-form visibility identities', () => {
    const nav = source('src/components/layout/sidebar-nav.tsx');
    expect(nav).toContain(dynamicTestid('sidebar-nav-${item.id}'));
  });

  test('phishing runtime-risk mark validation is scoped to its risk row', () => {
    const section = source('src/components/phishing-detection/config/runtime-risk-section.tsx');
    expect(section).toContain(staticTestid('runtime-risk-edit'));
    expect(section).toContain(dynamicTestid('disposition-option-${risk}-${value}'));
    expect(section).toContain(dynamicTestid('mark-position-${risk}-${position}'));
    expect(section).toContain(dynamicTestid('mark-text-${risk}'));
    expect(section).toContain(dynamicTestid('mark-text-hint-${risk}'));
  });

  test('operations direction segments expose stable static identities', () => {
    const filterBar = source('src/components/statistics/ops-top-trend/FilterBar.tsx');
    for (const testid of [
      'ops-direction-all',
      'ops-direction-receive',
      'ops-direction-send',
      'ops-direction-internal',
    ]) {
      expect(filterBar).toContain(testid);
    }
  });

  test('phishing admission validation exposes the bounded size input', () => {
    const sheet = source('src/components/phishing-detection/config/admission-rule-sheet.tsx');
    expect(sheet).toContain(staticTestid('rule-max-size-input'));
  });

  test('phishing detection log exposes stable filters and KPI identities', () => {
    const filters = source('src/components/phishing-detection/detection-log-filters.tsx');
    const kpis = source('src/components/phishing-detection/kpi-cards.tsx');
    expect(filters).toContain(staticTestid('phishing-log-filter-keyword'));
    expect(filters).toContain(staticTestid('phishing-log-filter-search'));
    expect(filters).toContain(staticTestid('phishing-log-filter-reset'));
    expect(kpis).toContain(dynamicTestid('phishing-kpi-${cardKey}'));
  });

  test('email detail exposes stable raw JSON identities', () => {
    const detail = source('src/components/logs/email-detail-modal.tsx');
    expect(detail).toContain(staticTestid('email-log-detail-tab-raw'));
    expect(detail).toContain(staticTestid('email-log-detail-raw'));
    expect(detail).toContain(staticTestid('email-log-detail-raw-json'));
  });

  test('login security exposes former global values as scope-editable controls', () => {
    const security = source('src/components/admin/login-security/LoginSecurityTab.tsx');
    expect(security).toContain(staticTestid('login-security-max-login-attempts'));
    expect(security).toContain(staticTestid('login-security-lockout-minutes'));
    expect(security).not.toContain(staticTestid('global-max-attempts'));
    expect(security).not.toContain(staticTestid('global-lockout-minutes'));
  });

  test('alert SMTP editor exposes dirty-close controls without saving', () => {
    const drawer = source('src/components/monitoring/alerts/SmtpConfigDrawer.tsx');
    expect(drawer).toContain(staticTestid('smtp-use-internal'));
    expect(drawer).toContain(staticTestid('smtp-server-input'));
    expect(drawer).toContain(staticTestid('smtp-unsaved-confirm'));
    expect(drawer).toContain(staticTestid('smtp-unsaved-leave'));
    expect(drawer).toContain(staticTestid('smtp-unsaved-continue'));
  });

  test('protocol template switch exposes stable confirmation identities', () => {
    const section = source('src/components/security/auth-spoofing/ProtocolChecksSection.tsx');
    expect(section).toContain(dynamicTestid('protocol-template-${name}'));
    expect(section).toContain(staticTestid('protocol-template-confirm'));
    expect(section).toContain(staticTestid('protocol-template-apply'));
  });

  test('intent direction copy exposes stable dialog controls', () => {
    const page = source('src/components/security/intent-engine/IntentEnginePage.tsx');
    const dialog = source('src/components/security/intent-engine/CopyDirectionDialog.tsx');
    expect(page).toContain(staticTestid('ie-apply-same-risk'));
    expect(page).toContain(staticTestid('ie-copy-directions'));
    expect(dialog).toContain(staticTestid('ie-copy-dialog'));
    expect(dialog).toContain(dynamicTestid('ie-copy-target-${dir}'));
    expect(dialog).toContain(staticTestid('ie-copy-confirm'));
  });

  test('sender-filter tabs and editor expose stable business identities', () => {
    const page = source('src/components/security/SenderFilterPage.tsx');
    const drawer = source('src/components/security/sender-filter/SenderFilterDrawer.tsx');
    expect(page).toContain(staticTestid('sender-filter-tab-blacklist'));
    expect(page).toContain(staticTestid('sender-filter-tab-whitelist'));
    expect(page).toContain(staticTestid('sender-filter-create'));
    expect(drawer).toContain(staticTestid('sender-filter-rule-drawer'));
    expect(drawer).toContain(staticTestid('sender-filter-rule-title'));
    expect(drawer).toContain(staticTestid('sender-filter-rule-subtitle'));
    expect(drawer).toContain(staticTestid('sender-filter-rule-name'));
    expect(drawer).toContain(staticTestid('sender-filter-rule-name-error'));
    expect(drawer).toContain(staticTestid('sender-filter-sender-value'));
    expect(drawer).toContain(staticTestid('sender-filter-sender-value-error'));
    expect(drawer).toContain(staticTestid('sender-filter-save'));
    expect(drawer).toContain(staticTestid('sender-filter-sender-type'));
    expect(drawer).toContain(staticTestid('sender-filter-action'));
    for (const action of ['reject', 'discard', 'quarantine', 'audit', 'accept']) {
      expect(drawer).toContain(staticTestid(`sender-filter-action-${action}`));
    }
    expect(drawer).toContain(staticTestid('sender-filter-ip-type'));
    expect(drawer.indexOf(staticTestid('sender-filter-sender-type'))).toBeLessThan(
      drawer.indexOf(staticTestid('sender-filter-ip-type')),
    );
    for (const type of ['all', 'ipGroup', 'single', 'range']) {
      expect(drawer).toContain(staticTestid(`sender-filter-ip-type-${type}`));
    }
    expect(drawer).toContain(staticTestid('sender-filter-ip-group'));
  });
});
