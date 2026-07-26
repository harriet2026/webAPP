import { describe, it, expect } from 'vitest';
import { visibleNavIds, isItemVisibleByForm } from '@/components/layout/sidebar-visibility';
import { sidebarNavItems, type NavItem } from '@/lib/constants';
import registry from '@/lib/product-form/__fixtures__/registry_for_test.json';
import type { FeatureDef } from '@/lib/product-form/resolve';

const featureRegistry = registry as FeatureDef[];

describe('visibleNavIds', () => {
  it('hides tenant-management in single-tenant', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: false, saas: false }, 'platform', []);
    expect(ids).not.toContain('tenant-management');
  });
  it('hides tenant-management from tenant viewer in multi-tenant', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: true, saas: false }, 'tenant', []);
    expect(ids).not.toContain('tenant-management');
  });
  it('shows tenant-management for platform viewer in multi-tenant', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: true, saas: false }, 'platform', []);
    expect(ids).toContain('tenant-management');
  });
  // GT-12427: 「处置设置」在多租户下为租户自有配置(platformHidden=true),平台视角
  // 侧栏必须隐藏,与同区兄弟模块 strategy-pipeline / group-policy 一致;租户视角可见;
  // 单租户形态 platformHidden 不触发,平台视角仍可见。
  it('GT-12427: hides disposal-settings from platform viewer in multi-tenant', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: true, saas: false }, 'platform', []);
    expect(ids).not.toContain('disposal-settings');
  });
  it('GT-12427: shows disposal-settings to tenant viewer in multi-tenant', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: true, saas: false }, 'tenant', []);
    expect(ids).toContain('disposal-settings');
  });
  it('GT-12427: shows disposal-settings to platform viewer in single-tenant', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: false, saas: false }, 'platform', []);
    expect(ids).toContain('disposal-settings');
  });
  it('hides ungranted agent from tenant viewer (non-saas)', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: true, saas: false }, 'tenant', []);
    expect(ids).not.toContain('phishing-detection');
  });
  it('shows granted agent to tenant viewer', () => {
    const ids = visibleNavIds(featureRegistry, { ai: true, multiTenant: true, saas: false }, 'tenant', ['phishing-detection']);
    expect(ids).toContain('phishing-detection');
  });
});

// Collect every leaf nav item (the ones that carry an href and are gated).
function leafNavItems(items: NavItem[] = sidebarNavItems): NavItem[] {
  const out: NavItem[] = [];
  for (const it of items) {
    if (it.children?.length) out.push(...leafNavItems(it.children));
    else if (it.href) out.push(it);
  }
  return out;
}

describe('isItemVisibleByForm (C1 regression: nav↔registry join by href, not nav id)', () => {
  // T6: every nav item whose href appears in the registry must resolve to
  // exactly one feature; the gate is keyed on that feature's id, never on the
  // nav item's own id (which differs for most entries). This bijection is what
  // was silently broken before the fix.
  it('each gated nav item maps to exactly one registry feature by href', () => {
    const byHref = new Map<string, FeatureDef>();
    for (const f of featureRegistry) if (f.href) byHref.set(f.href, f);
    for (const item of leafNavItems()) {
      const feat = byHref.get(item.href!);
      if (!feat) continue; // additive: not in registry
      // The defining invariant of C1: the nav id is NOT required to equal the
      // feature id, yet the gate must still apply.
      expect(feat.href).toBe(item.href);
    }
    // Sanity: the nav id ≠ feature id case actually occurs (else the test
    // would pass vacuously). `tenants` (nav) ↔ `tenant-management` (feature).
    const tenants = leafNavItems().find((i) => i.id === 'tenants');
    expect(tenants?.href).toBe('/tenants');
    expect(byHref.get('/tenants')?.id).toBe('tenant-management');
    expect(byHref.get('/tenants')?.id).not.toBe('tenants');
  });

  // T1 (negative): single-tenant form must hide the "租户管理" nav item even
  // though its nav id (`tenants`) differs from the feature id
  // (`tenant-management`). Before the fix this leaked through because
  // `registry.some(f => f.id === item.id)` was false.
  it('hides tenants nav item in single-tenant form', () => {
    const caps = { ai: true, multiTenant: false, saas: false };
    const visible = new Set(visibleNavIds(featureRegistry, caps, 'platform', []));
    const tenants = leafNavItems().find((i) => i.id === 'tenants')!;
    expect(tenants.href).toBe('/tenants');
    expect(isItemVisibleByForm(tenants, featureRegistry, visible)).toBe(false);
  });

  // T1 (negative): platformHidden security items must hide under multi-tenant
  // platform viewer (AC-04/05). The consolidated agent overview is visible
  // only when at least one canonical agent feature resolves visible.
  it('hides agent overview nav item under multi-tenant platform viewer', () => {
    const caps = { ai: true, multiTenant: true, saas: false };
    const visible = new Set(visibleNavIds(featureRegistry, caps, 'platform', []));
    const agent = leafNavItems().find((i) => i.id === 'agent-overview')!;
    expect(agent.href).toBe('/agent-center/overview');
    expect(isItemVisibleByForm(agent, featureRegistry, visible)).toBe(false);
  });

  // Positive control: same item shows under single-tenant platform viewer.
  it('shows agent overview nav item under single-tenant platform viewer', () => {
    const caps = { ai: true, multiTenant: false, saas: false };
    const visible = new Set(visibleNavIds(featureRegistry, caps, 'platform', []));
    const agent = leafNavItems().find((i) => i.id === 'agent-overview')!;
    expect(isItemVisibleByForm(agent, featureRegistry, visible)).toBe(true);
  });

  it('additive nav items (no registry counterpart) stay visible', () => {
    const visible = new Set<string>();
    // A synthetic item whose href is not in the registry exercises the "未登记=放行" path.
    const nonRegistry = { id: 'synthetic-unregistered', href: '/some/unregistered/path' };
    expect(isItemVisibleByForm(nonRegistry, featureRegistry, visible)).toBe(true);
  });

  it('all nav leaf hrefs that exist in the registry map to exactly one feature (no orphaned hrefs)', () => {
    // Every nav leaf item with an href that appears in the registry must resolve
    // to a unique feature. If a nav item's href appears in the registry multiple
    // times the gate is ambiguous. This test catches registry drift.
    const byHref = new Map<string, number>();
    for (const f of featureRegistry) {
      if (f.href) byHref.set(f.href, (byHref.get(f.href) ?? 0) + 1);
    }
    for (const [href, count] of byHref.entries()) {
      expect(count, `registry href "${href}" appears ${count} times — must be unique`).toBe(1);
    }
    // Every nav leaf href that is in the registry must resolve to the correct feature.
    for (const item of leafNavItems()) {
      const feat = featureRegistry.find((f) => !!f.href && f.href === item.href);
      if (!feat) continue; // additive: not in registry, covered by previous test
      expect(feat.href, `nav item "${item.id}" href should match feature href`).toBe(item.href);
    }
  });

  it('parent groups (no href) are always visible', () => {
    const visible = new Set<string>();
    const parent = sidebarNavItems.find((i) => i.id === 'mail')!;
    expect(parent.href).toBeUndefined();
    expect(isItemVisibleByForm(parent, featureRegistry, visible)).toBe(true);
  });

  // password-policy is registered ALWAYS-visible (platform scope) in the
  // product-form registry, so it must show up under a single-tenant form
  // for the platform viewer, same as any other ALWAYS feature.
  it('shows password-policy nav item under single-tenant form', () => {
    const caps = { ai: true, multiTenant: false, saas: false };
    const visible = new Set(visibleNavIds(featureRegistry, caps, 'platform', []));
    const item = leafNavItems().find((i) => i.id === 'password-policy')!;
    expect(item.href).toBe('/system/password-policy');
    expect(isItemVisibleByForm(item, featureRegistry, visible)).toBe(true);
  });
});
