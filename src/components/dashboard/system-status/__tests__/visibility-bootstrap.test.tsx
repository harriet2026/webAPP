import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// GT-12013: `registry` is [] until /bootstrap answers, but `capabilities` has a
// non-null fallback, so the dashboard mounted before the registry arrived. The
// "未登记=放行" default then treated monitor-infrastructure as VISIBLE, and a
// tenant_admin briefly got the platform-only 系统在线节点 / 系统与服务健康 cards —
// with live links to /monitoring/infrastructure, which 403s for them. Clicking
// during that window is exactly what the reporter did.

// 与 internal/productform/registry.go:9 逐字段一致的真实条目。自造 {id:'x'} 会缺
// visibility，evalVisibility 的 default 分支直接返回 'hide' —— 测试会"因为错误的
// 原因"通过，抓不到真实行为。
const INFRA_FEATURE = {
  id: 'monitor-infrastructure',
  visibility: 'ALWAYS',
  scope: 'platform',
  platformAccess: 'readonly',
  tenantAccess: 'hidden',
  platformHidden: false,
  grantable: false,
  href: '/monitoring/infrastructure',
};

const productForm = {
  capabilities: { ai: true, multiTenant: true, saas: false },
  registry: [] as (typeof INFRA_FEATURE)[],
  registryReady: false,
  grants: [] as string[],
};

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => productForm,
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: false }),
}));
let effectiveViewer = 'tenant';
vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({
  useSecurityScope: () => ({ effectiveViewer, resolvedScopeTenant: null }),
}));

import { useSystemStatusVisibility } from '../visibility';

describe('system-status visibility before bootstrap resolves (GT-12013)', () => {
  beforeEach(() => {
    effectiveViewer = 'tenant';
    productForm.capabilities = { ai: true, multiTenant: true, saas: false };
    productForm.registry = [];
    productForm.registryReady = false;
    productForm.grants = [];
  });

  it('hides the infra card while the feature registry has not loaded yet', () => {
    // registryReady=false — the pre-bootstrap window.
    const { result } = renderHook(() => useSystemStatusVisibility());
    expect(result.current.showInfra).toBe(false);
  });

  it('does not "fail open" just because the registry is an empty array', () => {
    // An empty registry must not be read as "monitor-infrastructure is
    // unregistered, therefore allowed".
    productForm.registry = [];
    productForm.registryReady = false;
    const { result } = renderHook(() => useSystemStatusVisibility());
    expect(result.current.showInfra).toBe(false);
    // and the grid must collapse rather than leave a dangling column
    expect(result.current.kpiCols).toBe(3);
  });

  it('once loaded, a tenant-hidden infra feature stays hidden', () => {
    productForm.registryReady = true;
    productForm.registry = [INFRA_FEATURE];
    const { result } = renderHook(() => useSystemStatusVisibility());
    expect(result.current.showInfra).toBe(false);
  });

  it('once loaded, a feature genuinely absent from the registry is still allowed (未登记=放行)', () => {
    // The additive default must survive for its intended case: registry loaded,
    // feature simply not registered.
    productForm.registryReady = true;
    productForm.registry = [{ ...INFRA_FEATURE, id: 'some-other-feature' }];
    const { result } = renderHook(() => useSystemStatusVisibility());
    expect(result.current.showInfra).toBe(true);
  });
});

// Review finding: registryReady is `bs != null`, and the bootstrap fetch had NO
// retry — its catch deliberately keeps the previous (null) bs. Fine while
// consumers defaulted to "unregistered = visible"; but once the guard fails
// CLOSED, one transient blip on first load permanently hid the platform-only
// infra cards, with no error shown. The retry lives in product-form-context; this
// pins the contract the guard depends on: a registry that NEVER loads must not be
// indistinguishable from "loaded, and the feature is hidden".
describe('registryReady contract (review finding)', () => {
  it('a never-loaded registry hides infra — but that is only safe because bootstrap retries', () => {
    productForm.registryReady = false;
    productForm.registry = [];
    const { result } = renderHook(() => useSystemStatusVisibility());
    expect(result.current.showInfra).toBe(false);
  });

  it('once the registry arrives, a PLATFORM viewer gets the infra card back', () => {
    // The recovery path the retry exists to reach. Without a retry this state is
    // unreachable after a first-load failure, and the card is gone for good —
    // silently, for a platform admin who is entitled to it.
    effectiveViewer = 'platform';
    productForm.registryReady = true;
    productForm.registry = [INFRA_FEATURE];
    const { result } = renderHook(() => useSystemStatusVisibility());
    expect(result.current.showInfra).toBe(true);
    expect(result.current.kpiCols).toBe(4);
  });

  it('a platform viewer whose registry NEVER loads loses the card — which is why the retry matters', () => {
    effectiveViewer = 'platform';
    productForm.registryReady = false;
    productForm.registry = [];
    const { result } = renderHook(() => useSystemStatusVisibility());
    expect(result.current.showInfra).toBe(false);
  });
});
