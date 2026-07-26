import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { FeatureDef } from '@/lib/product-form/resolve';

const mockUseAuth = vi.fn();
const mockUseProductForm = vi.fn();

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => mockUseProductForm(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'sidebar.system': '系统管理',
      'sidebar.mailRouting': '邮件路由',
      'sidebar.users': '用户管理',
    };
    return map[key] || key;
  },
}));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}));

// VersionFooter (GT-11459) issues a react-query useQuery('/version'); it is
// orthogonal to these nav-visibility tests and, rendered bare, throws
// "No QueryClient set". Stub it so the tests need no QueryClientProvider.
vi.mock('@/components/layout/version-footer', () => ({
  VersionFooter: () => null,
}));

import { SidebarNav } from '@/components/layout/sidebar-nav';

// GT-12329. Deliberately NOT reusing sidebar-nav.test.tsx's `setupAuthMocks`:
// that fixture stubs `hasPermission: () => true`, which bypasses the permission
// matrix entirely — a test written on top of it would pass no matter what
// `permission:` field the nav item carries, i.e. it would assert nothing.
//
// Instead this models a REAL tenant admin: the permission set is the coarse
// fallback that auth-context grants a tenant admin whose role matrix is still
// unconfigured (TENANT_ADMIN_FALLBACK_PERMISSIONS = manage_login_security +
// manage_roles). `manage_tenants` is deliberately absent — that is exactly what
// makes the platform-only entries in the 系统管理 group invisible to them.
const TENANT_ADMIN_PERMISSIONS = new Set(['manage_login_security', 'manage_roles']);

function mockTenantAdmin() {
  mockUseAuth.mockReturnValue({
    hasPermission: (p: string) => TENANT_ADMIN_PERMISSIONS.has(p),
    isSystemAdmin: false,
    showAdvancedRules: false,
    // Mirrors the coarse tenant-admin fallback in usePermissionBag: with an
    // empty role matrix `canSeeRoute` returns true for everything, so the RBAC
    // layer provides NO protection here. The `permission:` gate is the only
    // thing standing between a tenant admin and this entry — which is the
    // whole point of the assertion below.
    canSeeRoute: () => true,
  });
  // Single-tenant form: this is the ONLY form where 邮件路由 exists at all
  // (registry `forwarding` is SINGLE_ONLY), and the form gate resolves through
  // the platform branch here (`!c.multiTenant`), so `tenantAccess: 'hidden'`
  // does not fire. Capabilities are left null to keep the form gate out of the
  // picture entirely, isolating the permission gate under test.
  mockUseProductForm.mockReturnValue({
    capabilities: null,
    registry: [] as FeatureDef[],
    grants: [],
    viewer: 'tenant' as const,
    setViewer: vi.fn(),
  });
}

function mockSystemAdmin() {
  mockUseAuth.mockReturnValue({
    hasPermission: () => true,
    isSystemAdmin: true,
    showAdvancedRules: false,
    canSeeRoute: () => true,
  });
  mockUseProductForm.mockReturnValue({
    capabilities: null,
    registry: [] as FeatureDef[],
    grants: [],
    viewer: 'platform' as const,
    setViewer: vi.fn(),
  });
}

// The 系统管理 group is NOT in SidebarNav's default-expanded set, so its
// children are not in the DOM until it is clicked open. Without this the
// "邮件路由 is hidden" assertion would pass trivially — it would be asserting
// that a collapsed group is collapsed.
function renderWithSystemGroupExpanded() {
  render(<SidebarNav />);
  fireEvent.click(screen.getByText('系统管理'));
}

describe('GT-12329 — 邮件路由 nav entry is platform-admin only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides 邮件路由 from a tenant admin', () => {
    mockTenantAdmin();
    renderWithSystemGroupExpanded();
    expect(screen.queryByText('邮件路由')).not.toBeInTheDocument();
  });

  it('still shows 邮件路由 to a system admin', () => {
    mockSystemAdmin();
    renderWithSystemGroupExpanded();
    expect(screen.getByText('邮件路由')).toBeInTheDocument();
  });

  it('leaves the tenant admin their own 系统管理 entries (gate is not a blanket group hide)', () => {
    mockTenantAdmin();
    renderWithSystemGroupExpanded();
    // 用户管理 is gated on manage_login_security, which a tenant admin DOES hold.
    // Without this the first assertion would also pass if the whole 系统管理 group
    // had simply disappeared.
    expect(screen.getByText('用户管理')).toBeInTheDocument();
  });
});
