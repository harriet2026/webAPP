import { describe, it, expect } from 'vitest';
import { AUDIT_MODULE_GROUPS, filterVisibleModuleGroups } from './admin-audit-taxonomy';

// GT-12376: the「操作模块」filter must reuse the sidebar menu visibility so a
// platform admin no longer sees tenant-only modules (组织通讯录) or locked
// agents (钓鱼/仿冒智能体) as filter options.

const subKeys = (groups: typeof AUDIT_MODULE_GROUPS): string[] =>
  groups.flatMap((g) => g.items.map((i) => i.subKey));

describe('filterVisibleModuleGroups (GT-12376)', () => {
  it('keeps every module when all gates pass', () => {
    const out = filterVisibleModuleGroups(AUDIT_MODULE_GROUPS, () => true, () => true);
    expect(subKeys(out).sort()).toEqual(subKeys(AUDIT_MODULE_GROUPS).sort());
    // sanity: the baseline actually contains the offending modules
    expect(subKeys(AUDIT_MODULE_GROUPS)).toContain('sidebar.organizationContacts');
    expect(subKeys(AUDIT_MODULE_GROUPS)).toContain('sidebar.phishingDetection');
  });

  it('drops a nav-gated module when its nav item is hidden (组织通讯录 on platform)', () => {
    const out = filterVisibleModuleGroups(
      AUDIT_MODULE_GROUPS,
      (item) => item.href !== '/organization-contacts', // menu hides it
      () => true,
    );
    expect(subKeys(out)).not.toContain('sidebar.organizationContacts');
    // an unrelated visible module stays
    expect(subKeys(out)).toContain('sidebar.users');
  });

  it('drops an agent module when its product-form feature is locked/ungranted', () => {
    const out = filterVisibleModuleGroups(
      AUDIT_MODULE_GROUPS,
      () => true,
      (featureId) => featureId !== 'phishing-detection', // phishing locked
    );
    expect(subKeys(out)).not.toContain('sidebar.phishingDetection');
    // spoofing agent (granted) stays if present in the auditable set
    // (only asserts phishing removed; spoofing depends on AUDITABLE_RESOURCE_TYPES)
  });

  it('removes a group entirely when all its items are filtered out', () => {
    // Hide every nav item AND every feature -> only unmapped (additive) modules
    // survive; any group whose items all map to a gate is dropped.
    const out = filterVisibleModuleGroups(AUDIT_MODULE_GROUPS, () => false, () => false);
    // agentCenter group's items are all agent-feature-gated -> group removed
    expect(out.some((g) => g.topKey === 'sidebar.agentCenter')).toBe(false);
  });
});
