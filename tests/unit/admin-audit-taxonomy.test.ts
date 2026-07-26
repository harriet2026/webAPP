import { describe, expect, it } from 'vitest';

import {
  OP_TYPE_META,
  opTypeMeta,
  moduleOf,
  AUDIT_MODULE_GROUPS,
} from '@/components/admin-audit/admin-audit-taxonomy';

describe('admin-audit taxonomy — opTypeMeta', () => {
  it('exposes the canonical backend action set', () => {
    const expected = [
      'create', 'import', 'update', 'delete', 'delete_item', 'reject',
      'block', 'approve', 'release', 'exempt', 'unlock', 'reinject',
      'export', 'bulk_action', 'reset_password', 'ai_interpret',
    ];
    for (const action of expected) {
      expect(OP_TYPE_META[action], `missing meta for action ${action}`).toBeDefined();
    }
  });

  it('maps destructive actions to a red badge', () => {
    expect(opTypeMeta('delete').badge).toContain('red');
    expect(opTypeMeta('delete_item').badge).toContain('red');
    expect(opTypeMeta('reject').badge).toContain('red');
    expect(opTypeMeta('block').badge).toContain('red');
  });

  it('maps benign / release actions to a green-family badge', () => {
    for (const action of ['approve', 'release', 'exempt', 'unlock', 'reinject']) {
      const badge = opTypeMeta(action).badge;
      expect(badge.includes('green') || badge.includes('emerald')).toBe(true);
    }
  });

  it('maps create / import / export / ai_interpret to a blue badge', () => {
    for (const action of ['create', 'import', 'export', 'ai_interpret']) {
      expect(opTypeMeta(action).badge).toContain('blue');
    }
  });

  it('maps update / reset_password to an amber badge', () => {
    expect(opTypeMeta('update').badge).toContain('amber');
    expect(opTypeMeta('reset_password').badge).toContain('amber');
  });

  it('maps bulk_action to a gray badge', () => {
    expect(opTypeMeta('bulk_action').badge).toContain('gray');
  });

  it('uses adminAudit.opType.<action> as the labelKey for known actions', () => {
    expect(opTypeMeta('create').labelKey).toBe('adminAudit.opType.create');
    expect(opTypeMeta('reset_password').labelKey).toBe('adminAudit.opType.resetPassword');
    expect(opTypeMeta('delete_item').labelKey).toBe('adminAudit.opType.deleteItem');
    expect(opTypeMeta('bulk_action').labelKey).toBe('adminAudit.opType.bulkAction');
    expect(opTypeMeta('ai_interpret').labelKey).toBe('adminAudit.opType.aiInterpret');
  });

  it('falls back to a gray neutral badge + unknown labelKey for unmapped actions', () => {
    const meta = opTypeMeta('something_new');
    expect(meta.badge).toContain('gray');
    expect(meta.labelKey).toBe('adminAudit.opType.unknown');
  });
});

describe('admin-audit taxonomy — moduleOf', () => {
  it('maps tenant resource types to existing sidebar sub-keys', () => {
    expect(moduleOf('tenants').subKey).toBe('sidebar.tenants');
    expect(moduleOf('users').subKey).toBe('sidebar.users');
    expect(moduleOf('smtp_credentials').subKey).toBe('sidebar.smtpCredentials');
  });

  it('maps quarantine / sideline / audit_queue to their existing sidebar sub-keys', () => {
    expect(moduleOf('quarantine').subKey).toBe('sidebar.quarantine');
    expect(moduleOf('sideline').subKey).toBe('sidebar.sideline');
    expect(moduleOf('audit_queue').subKey).toBe('sidebar.auditQueue');
  });

  it('returns a top-level sidebar group key as topKey', () => {
    const m = moduleOf('tenants');
    expect(m.topKey).toMatch(/^sidebar\./);
  });

  it('falls back to adminAudit.moduleOther for unknown resource types', () => {
    const m = moduleOf('totally_unknown_resource');
    expect(m.topKey).toBe('adminAudit.moduleOther');
    expect(m.subKey).toBe('adminAudit.moduleOther');
  });

  it('resolves a singular resource type via the plural-form fallback', () => {
    const m = moduleOf('tenant');
    expect(m.subKey).toBe('sidebar.tenants');
  });

  it('resolves a plural resource type via the singular-form fallback', () => {
    const m = moduleOf('ip_rules');
    expect(m.subKey).toBe('sidebar.ipFrequency');
  });

  // review finding #2: every real backend resource_type must be classified
  // (not fall into "其他/Other"). The values come from
  // internal/models/admin.go AdminResourceType constants AND the additional
  // kebab-case values written by audit_middleware.go extractOperationDetails.
  it('classifies every real backend resource_type (no row should fall into 其他) — review finding #2', () => {
    const backendConstants = [
      // models.AdminResourceType constants
      'rules', 'users', 'tenants', 'quarantine', 'sideline', 'smtp_credentials',
      'config_overrides', 'outbound_audit', 'mail_logs', 'attachment_security',
      'url_protection', 'security_config', 'phishing_agent', 'spoofing_agent',
      // audit_middleware.go additional resource types
      'mail-auth-configs', 'contact-sources', 'contact-sync-logs', 'contacts',
      'link-protection-blacklist',
    ];
    for (const rt of backendConstants) {
      const m = moduleOf(rt);
      expect(m.topKey, `resource_type "${rt}" fell into Other`).not.toBe('adminAudit.moduleOther');
      expect(m.subKey, `resource_type "${rt}" fell into Other`).not.toBe('adminAudit.moduleOther');
    }
  });

  it('maps phishing_agent / spoofing_agent to the agent-center sidebar (not the legacy kebab values)', () => {
    expect(moduleOf('phishing_agent').subKey).toBe('sidebar.phishingDetection');
    expect(moduleOf('spoofing_agent').subKey).toBe('sidebar.spoofingDetection');
  });

  it('maps mail_logs to the email-logs sidebar (backend uses mail_logs, not email_logs)', () => {
    expect(moduleOf('mail_logs').subKey).toBe('sidebar.emailLogs');
  });

  it('maps config_overrides to config management', () => {
    expect(moduleOf('config_overrides').subKey).toBe('sidebar.configManagement');
  });

  it('maps the kebab-case middleware resource types to a real sidebar group', () => {
    expect(moduleOf('mail-auth-configs').topKey).not.toBe('adminAudit.moduleOther');
    expect(moduleOf('contact-sources').topKey).not.toBe('adminAudit.moduleOther');
    expect(moduleOf('link-protection-blacklist').topKey).not.toBe('adminAudit.moduleOther');
  });
});

describe('admin-audit taxonomy — AUDIT_MODULE_GROUPS', () => {
  it('is a non-empty grouped dropdown source', () => {
    expect(AUDIT_MODULE_GROUPS.length).toBeGreaterThan(0);
    for (const group of AUDIT_MODULE_GROUPS) {
      expect(group.topKey).toMatch(/^(sidebar|adminAudit)\./);
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(typeof item.value).toBe('string');
        expect(item.subKey).toMatch(/^(sidebar|adminAudit)\./);
      }
    }
  });

  it('places a known resource type under its parent group', () => {
    const tenantsGroup = AUDIT_MODULE_GROUPS.find((g) =>
      g.items.some((i) => i.value === 'tenants'),
    );
    expect(tenantsGroup).toBeDefined();
    expect(tenantsGroup!.items.find((i) => i.value === 'tenants')!.subKey).toBe('sidebar.tenants');
  });

  it('shows no duplicate module labels (one option per (topKey, subKey))', () => {
    // Review finding: the dropdown used to emit one option per resource_type,
    // so labels like 链接与附件安全 / 组织通讯录 appeared 3-4× each.
    const seen = new Set<string>();
    for (const group of AUDIT_MODULE_GROUPS) {
      for (const item of group.items) {
        const key = `${group.topKey}||${item.subKey}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('a module covering several resource_types uses a CSV value matching all of them', () => {
    // 链接与附件安全 (sidebar.linkAttachmentSecurity) is written under three
    // resource_types; selecting it must filter by all three, not just one.
    const item = AUDIT_MODULE_GROUPS.flatMap((g) => g.items).find(
      (i) => i.subKey === 'sidebar.linkAttachmentSecurity',
    );
    expect(item).toBeDefined();
    const values = item!.value.split(',').sort();
    expect(values).toEqual(
      ['attachment_security', 'link-protection-blacklist', 'url_protection'].sort(),
    );
  });

  it('does not offer view-only resource_types that no audit row can match', () => {
    // delivery_traffic / link_clicks / auth_attempts etc. are display-only
    // mappings; as filter options they would always return an empty table.
    const allValues = AUDIT_MODULE_GROUPS.flatMap((g) => g.items).flatMap((i) =>
      i.value.split(','),
    );
    for (const dead of [
      'delivery_traffic',
      'link_clicks',
      'auth_attempts',
      'ops_top_trend',
      'threat_retro',
      'disposal_center',
    ]) {
      expect(allValues).not.toContain(dead);
    }
  });
});
