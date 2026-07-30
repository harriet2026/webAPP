import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import registryFixture from '@/lib/product-form/__fixtures__/registry_for_test.json';
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
      'sidebar.dashboard': '仪表盘',
      'sidebar.advancedRules': '高级规则设置',
      'sidebar.rules': '规则管理',
      'sidebar.detection': '检测设置',
      'sidebar.mail': '邮件管理',
      'sidebar.rulePipelineOverview': '规则总览',
      'sidebar.rbl': 'RBL 查询列表',
      'sidebar.execImpersonation': '高管冒充检测',
      'sidebar.domainLookalike': '仿冒域名检测',
      'sidebar.emailLogs': '邮件日志',
      'sidebar.auditQueue': '审核队列',
      'sidebar.investigations': 'Agent 调查',
      'sidebar.assistant': '规则助手',
      'sidebar.inboundAudit': '入站审核',
      'sidebar.quarantine': '隔离区',
      'sidebar.sideline': '旁路队列',
      'sidebar.logs': '日志',
      'sidebar.authAttempts': '认证日志',
      'sidebar.adminAuditLogs': '操作日志',
      'sidebar.system': '系统管理',
      'sidebar.tenants': '租户管理',
      'sidebar.users': '用户管理',
      'sidebar.smtpCredentials': 'SMTP 凭证',
      'sidebar.bounceDsnSettings': '退信 DSN 设置',
      'sidebar.security': '安全策略',
      'sidebar.policyPipeline': '策略流水线',
      'sidebar.agentCenter': '智能体中心',
      'sidebar.agentOverview': '智能体总览',
      'sidebar.phishingDetection': '钓鱼邮件检测智能体',
    };
    return map[key] || key;
  },
}));

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}));

// VersionFooter (GT-11459) issues a react-query useQuery('/version'); it is
// orthogonal to these sidebar tests and, rendered bare, throws
// "No QueryClient set". Stub it so the tests need no QueryClientProvider.
vi.mock('@/components/layout/version-footer', () => ({
  VersionFooter: () => null,
}));

import { SidebarNav } from '@/components/layout/sidebar-nav';
import { UnsavedGuardProvider } from '@/contexts/unsaved-guard-context';

function setupAuthMocks(isSystemAdmin: boolean, showAdvancedRules: boolean) {
  mockUseAuth.mockReturnValue({
    hasPermission: () => true,
    isSystemAdmin,
    showAdvancedRules,
    // sidebar-nav destructures canSeeRoute from useAuth and calls it for every
    // item with an href; without it the whole file threw "canSeeRoute is not a
    // function" (pre-existing, unrelated to what each case asserts).
    canSeeRoute: () => true,
  });
  // Default product-form mock: no capabilities → form gate disabled (preserves
  // the original advanced-rules-only test semantics).
  mockUseProductForm.mockReturnValue({
    capabilities: null,
    registry: [] as FeatureDef[],
    grants: [],
    viewer: 'platform' as const,
    setViewer: vi.fn(),
  });
}

describe('SidebarNav - advanced rules visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthMocks(true, true);
  });

  it('hides advanced rules when not system admin and not checked', () => {
    setupAuthMocks(false, false);
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.queryByText('高级规则设置')).not.toBeInTheDocument();
  });

  it('hides advanced rules when system admin but not checked', () => {
    setupAuthMocks(true, false);
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.queryByText('高级规则设置')).not.toBeInTheDocument();
  });

  it('hides advanced rules when checked but not system admin', () => {
    setupAuthMocks(false, true);
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.queryByText('高级规则设置')).not.toBeInTheDocument();
  });

  it('shows advanced rules when system admin and checked', () => {
    setupAuthMocks(true, true);
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.getByText('高级规则设置')).toBeInTheDocument();
  });

  it('shows rules and detection children under advanced rules when visible', () => {
    setupAuthMocks(true, true);
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.getByText('规则管理')).toBeInTheDocument();
    expect(screen.getByText('检测设置')).toBeInTheDocument();
  });

  it('always shows non-advanced items', () => {
    setupAuthMocks(false, false);
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    // After the nav restructure (commit 77b02ab1) the `mail` group itself is
    // advanced-gated, so it must NOT be the "always visible" canary. Use a
    // genuinely non-advanced top-level group instead: 系统管理 (sidebar.system).
    expect(screen.queryByText('邮件管理')).not.toBeInTheDocument();
    expect(screen.getByText('系统管理')).toBeInTheDocument();
  });
});

// C1 regression guard: exercises the real product-form gate through the
// component render path. Before the fix the gate matched nav `id` to registry
// `id` (e.g. `tenants` vs `tenant-management`), the join never matched, and
// hidden items leaked through. These tests assert the component actually hides
// them now.
describe('SidebarNav - product form visibility gate', () => {
  const registry = registryFixture as FeatureDef[];

  beforeEach(() => {
    vi.clearAllMocks();
    setupAuthMocks(true, true);
  });

  it('hides 租户管理 in single-tenant form (AC-01)', () => {
    mockUseProductForm.mockReturnValue({
      capabilities: { ai: true, multiTenant: false, saas: false },
      registry,
      grants: [],
      viewer: 'platform',
      setViewer: vi.fn(),
    });
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.queryByText('租户管理')).not.toBeInTheDocument();
  });

  it('hides agent overview under multi-tenant platform viewer (AC-05)', () => {
    mockUseProductForm.mockReturnValue({
      capabilities: { ai: true, multiTenant: true, saas: false },
      registry,
      grants: [],
      viewer: 'platform',
      setViewer: vi.fn(),
    });
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.queryByText('智能体总览')).not.toBeInTheDocument();
  });

  it('shows 租户管理 in multi-tenant form', () => {
    mockUseProductForm.mockReturnValue({
      capabilities: { ai: true, multiTenant: true, saas: false },
      registry,
      grants: [],
      viewer: 'platform',
      setViewer: vi.fn(),
    });
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    // "租户管理" lives under the collapsible 系统管理 group; expand it first.
    fireEvent.click(screen.getByText('系统管理'));
    expect(screen.getByText('租户管理')).toBeInTheDocument();
  });
});

// GT-11586 regression guard: the 安全策略 (security) menu must be visible to
// tenant_admin (the spec designates security/策略流水线/分组策略 as tenant-only
// business modules — see design/implement/spec/2026-06-24-product-form-framework-design.md
// §13 rows 408-410 and demo user-permission/types.ts TENANT_ONLY_MODULE_KEYS).
// The bug: both children carried permission:'manage_ip_frequency', which the
// auth permissionMatrix only grants to system_admin, so the children were
// filtered out and the parent header disappeared too.
describe('SidebarNav - security policy visible to tenant_admin (GT-11586)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate a tenant_admin session: not system admin, no advanced-rules,
    // and the real permissionMatrix (tenant_admin has NO manage_ip_frequency).
    mockUseAuth.mockReturnValue({
      hasPermission: (p: string) =>
        ['view_auth_attempts', 'view_admin_audit_logs', 'view_link_logs'].includes(p),
      isSystemAdmin: false,
      showAdvancedRules: false,
      canSeeRoute: () => true,
    });
    // Product-form capabilities null → form gate disabled, isolating the test
    // to the auth-permission layer (the actual bug location).
    mockUseProductForm.mockReturnValue({
      capabilities: null,
      registry: [] as FeatureDef[],
      grants: [],
      viewer: 'tenant' as const,
      setViewer: vi.fn(),
    });
  });

  it('shows the 安全策略 parent header for tenant_admin', () => {
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    expect(screen.getByText('安全策略')).toBeInTheDocument();
  });

  it('shows the 策略流水线 child under 安全策略 for tenant_admin', () => {
    render(<UnsavedGuardProvider><SidebarNav /></UnsavedGuardProvider>);
    // Parent group renders collapsed by default unless the current path
    // matches a child; expand it to assert the child is reachable.
    fireEvent.click(screen.getByText('安全策略'));
    expect(screen.getByText('策略流水线')).toBeInTheDocument();
  });
});
