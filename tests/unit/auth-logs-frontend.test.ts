import { describe, it, expect } from 'vitest';
import { formatIPLocation, sceneLabelKey, SCENE_OPTIONS } from '@/components/auth-logs/constants';
import { sidebarNavItems, type NavItem } from '@/lib/constants';

// G3: ip_location is localized on the client from a language-neutral descriptor.
// The translator stub echoes the key so we can assert which key was chosen.
describe('formatIPLocation', () => {
  const t = (k: string) => k;

  it('returns the internal key for kind=internal', () => {
    expect(formatIPLocation({ kind: 'internal' }, t)).toBe('authAttempts.ipLocation.internal');
  });

  it('appends the region verbatim for kind=overseas', () => {
    expect(formatIPLocation({ kind: 'overseas', region: 'United States' }, t)).toBe(
      'authAttempts.ipLocation.overseas · United States',
    );
  });

  it('uses the domestic key for kind=domestic (境内/境外 split)', () => {
    expect(formatIPLocation({ kind: 'domestic', region: 'China' }, t)).toBe(
      'authAttempts.ipLocation.domestic · China',
    );
    expect(formatIPLocation({ kind: 'domestic' }, t)).toBe('authAttempts.ipLocation.domestic');
  });

  it('omits the separator when overseas has no region', () => {
    expect(formatIPLocation({ kind: 'overseas' }, t)).toBe('authAttempts.ipLocation.overseas');
  });

  it('returns empty string for null/undefined or an unknown kind', () => {
    expect(formatIPLocation(null, t)).toBe('');
    expect(formatIPLocation(undefined, t)).toBe('');
    expect(formatIPLocation({ kind: 'mystery' }, t)).toBe('');
  });
});

// The scene filter must only offer scenes that auth_attempt_log actually
// contains. authd records every attempt as 'smtpsend'; 'userspace'/'mailsync'
// are not produced, so offering them as filters would always return zero rows.
describe('scene filter options', () => {
  it('exposes only the reachable smtpsend scene as a filter option', () => {
    expect(SCENE_OPTIONS.map((o) => o.value)).toEqual(['smtpsend']);
  });

  it('still resolves labels for all scenes (for column/detail rendering)', () => {
    expect(sceneLabelKey('smtpsend')).toBe('authAttempts.scenes.smtpsend');
    expect(sceneLabelKey('userspace')).toBe('authAttempts.scenes.userspace');
    expect(sceneLabelKey('mailsync')).toBe('authAttempts.scenes.mailsync');
    expect(sceneLabelKey(undefined)).toBeUndefined();
  });
});

// B1 regression: the auth-logs sidebar entry must be reachable by a tenant_admin
// (spec §4.2). The bug was that the `logs` GROUP carried requiresAdvancedRules,
// which hid it from every non-system-admin regardless of permission. This test
// replicates the real isItemAllowed predicate (sidebar-nav.tsx) and asserts the
// tenant_admin outcome, so re-adding the group-level advanced gate fails CI.
describe('sidebar auth-logs visibility', () => {
  // Faithful copy of sidebar-nav.tsx isItemAllowed (form gating omitted: it is
  // additive / default-visible for items with no registry counterpart).
  function isItemAllowed(
    item: NavItem,
    ctx: { perms: string[]; isSystemAdmin: boolean; showAdvancedRules: boolean },
  ): boolean {
    if (item.permission && !ctx.perms.includes(item.permission)) return false;
    if (item.requiresAdvancedRules && !(ctx.isSystemAdmin && ctx.showAdvancedRules)) return false;
    return true;
  }

  const logsGroup = sidebarNavItems.find((i) => i.id === 'logs');
  const authItem = logsGroup?.children?.find((c) => c.id === 'auth-attempts');
  const linkClicksItem = logsGroup?.children?.find((c) => c.id === 'link-clicks');
  // admin-audit-logs was briefly relocated to the `mail` group, then moved back
  // into `logs` for the logs-admin-logs html_spec alignment (commit f8a3f1c9,
  // 归入日志审计). Resolve it from wherever it now lives so the regression guard
  // keeps tracking it.
  const adminAuditItem = logsGroup?.children?.find((c) => c.id === 'admin-audit-logs');

  it('structure: logs group is not advanced-gated; auth-attempts is permission-gated', () => {
    expect(logsGroup).toBeDefined();
    expect(logsGroup!.requiresAdvancedRules).toBeFalsy();
    expect(authItem?.permission).toBe('view_auth_attempts');
    expect(linkClicksItem?.permission).toBe('view_link_logs');
  });

  it('admin-audit-logs is permission-gated, NOT advanced-rules-gated (review finding #3: tenant_admin must see it)', () => {
    expect(adminAuditItem, 'admin-audit-logs must exist (currently under mail)').toBeDefined();
    // The nav item must NOT carry requiresAdvancedRules — that flag hides it
    // from tenant_admin (who has no advanced-rules toggle), contradicting
    // spec §F2 (multi-tenant tenant view). Permission gating alone decides.
    expect(adminAuditItem!.requiresAdvancedRules ?? false).toBe(false);
    expect(adminAuditItem!.permission).toBe('view_admin_audit_logs');
  });

  it('tenant_admin (with view_admin_audit_logs perm) sees the group, auth-attempts AND admin-audit (review finding #3)', () => {
    const tenantAdmin = { perms: ['view_auth_attempts', 'view_admin_audit_logs'], isSystemAdmin: false, showAdvancedRules: false };
    expect(isItemAllowed(logsGroup!, tenantAdmin)).toBe(true);
    expect(isItemAllowed(authItem!, tenantAdmin)).toBe(true);
    // admin-audit-logs is now visible to tenant_admin via permission, not advanced-rules.
    expect(isItemAllowed(adminAuditItem!, tenantAdmin)).toBe(true);
  });

  it('a role without the permission still cannot see auth-attempts', () => {
    const noPerm = { perms: [] as string[], isSystemAdmin: false, showAdvancedRules: false };
    expect(isItemAllowed(authItem!, noPerm)).toBe(false);
  });
});
