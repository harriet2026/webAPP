import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import zh from '@/../messages/zh.json';
import { DkimOutboundSigningSection } from './DkimOutboundSigningSection';
import type { TenantDomain } from '@/types/tenant-domain';
import type { DkimKey, DkimKeyListResponse } from '@/lib/api/dkim';

// A real context so the guard's `useContext(AuthContext) != null` passes when we
// wrap with its Provider (value below). Created via vi.hoisted so it's available
// inside the hoisted vi.mock factory below. No react-internals mocking needed.
const { StubAuthContext } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createContext: cc } = require('react');
  return { StubAuthContext: cc(null) };
});

// ── Mock the data layer + context hooks ─────────────────────────────────────
const mockGetTenantDomains = vi.fn();
const mockListDkimKeys = vi.fn();
vi.mock('@/lib/api/tenants', () => ({
  getTenantDomains: (id: number) => mockGetTenantDomains(id),
}));
vi.mock('@/lib/api/dkim', () => ({
  listDkimKeys: (p: unknown) => mockListDkimKeys(p),
}));

const tenantState = { effectiveTenantId: 1 as number | null, isSystemAdmin: false };
const permState = { isTenantAdmin: true };
const formState = { capabilities: { ai: true, multiTenant: true, saas: false } };
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => tenantState }));
vi.mock('@/hooks/use-permission', () => ({ usePermission: () => permState }));
vi.mock('@/contexts/product-form-context', () => ({ useProductForm: () => formState }));
// The guard probes AuthContext via useContext; point it at our stub context so a
// Provider with a truthy value makes the probe pass.
vi.mock('@/contexts/auth-context', () => ({ AuthContext: StubAuthContext }));
// Drawer is exercised elsewhere; stub it to a marker so we can assert it opens.
vi.mock('@/components/dkim/dkim-manage-drawer', () => ({
  DkimManageDrawer: ({ open, domain }: { open: boolean; domain: string }) =>
    open ? <div data-testid="dkim-drawer">{domain}</div> : null,
}));

const domain = (id: number, d: string): TenantDomain => ({
  id,
  tenant_id: 1,
  domain: d,
  next_hop_type: 'domain',
  next_hop_host: d,
  next_hop_port: 25,
  is_active: 1,
  mail_system_type: 'standard_smtp',
  mail_system_config: null,
});

const key = (over: Partial<DkimKey>): DkimKey => ({
  id: 1,
  tenant_id: 1,
  domain: 'a.com',
  selector: 's1',
  algorithm: 'rsa-sha256',
  key_size: 2048,
  public_key: 'p',
  dns_record_name: 's1._domainkey.a.com',
  dns_record: 'v=DKIM1;',
  dns_record_observed: null,
  dns_status: 'unverified',
  dns_checked_at: null,
  dns_error: null,
  is_active: false,
  note: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

const list = (items: DkimKey[]): DkimKeyListResponse => ({ items, total: items.length, page: 1, page_size: 100 });

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StubAuthContext.Provider value={{ ready: true }}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DkimOutboundSigningSection />
        </NextIntlClientProvider>
      </StubAuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('DkimOutboundSigningSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tenantState.effectiveTenantId = 1;
    tenantState.isSystemAdmin = false;
    permState.isTenantAdmin = true;
    formState.capabilities = { ai: true, multiTenant: true, saas: false };
  });

  it('renders one row per sending domain with active selector + status', async () => {
    mockGetTenantDomains.mockResolvedValue([domain(101, 'a.com'), domain(102, 'b.com')]);
    mockListDkimKeys.mockResolvedValue(
      list([key({ id: 1, domain: 'a.com', selector: 's2026', is_active: true, dns_status: 'verified' })]),
    );
    renderSection();
    expect(await screen.findByText('a.com')).toBeInTheDocument();
    expect(screen.getByText('b.com')).toBeInTheDocument();
    // active selector shown for a.com
    expect(screen.getByText(/s2026/)).toBeInTheDocument();
    // b.com has no key → "未签名"
    expect(screen.getByText(zh.authSpoofing.dkimOutbound.notSigned)).toBeInTheDocument();
  });

  it('shows the select-tenant empty state for platform admin without a tenant', async () => {
    tenantState.isSystemAdmin = true;
    tenantState.effectiveTenantId = null;
    renderSection();
    expect(
      await screen.findByText(zh.authSpoofing.dkimOutbound.selectTenant),
    ).toBeInTheDocument();
    expect(mockGetTenantDomains).not.toHaveBeenCalled();
  });

  it('shows the no-domains empty state when the tenant has no sending domains', async () => {
    mockGetTenantDomains.mockResolvedValue([]);
    mockListDkimKeys.mockResolvedValue(list([]));
    renderSection();
    expect(
      await screen.findByText(zh.authSpoofing.dkimOutbound.noDomains),
    ).toBeInTheDocument();
  });
});
