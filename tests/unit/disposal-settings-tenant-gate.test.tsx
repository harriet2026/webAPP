import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// TEST-2 (review): the disposal-settings page must NOT issue GET/PUT while a
// platform admin has not selected a tenant. `enabled: tenantReady` (page L40)
// is the guard that prevents a silent cross-tenant read; this test pins it so
// a future refactor that drops `enabled` is caught.

const apiRequestMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: apiRequestMock }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (_ns?: string) => (key: string, params?: Record<string, string | number>) => {
    void _ns;
    if (params) {
      return Object.entries(params).reduce(
        (s, [k, v]) => s.replace(`{${k}}`, String(v)),
        key,
      );
    }
    return key;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// useTenant returns effectiveTenantId; controlled per-test via mockImpl.
const useTenantMock = vi.fn();
vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => useTenantMock(),
}));

const useProductFormMock = vi.fn();
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => useProductFormMock(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: true,
    selectedTenantId: null,
    user: { role: 'system_admin' },
    hasPermission: () => true,
    features: { aiInterpret: true },
  }),
}));

// Stub the heavy tab sub-components; we only care about the query gating.
vi.mock('@/components/email-disposal/disposal-settings/QuarantineSettingsTab', () => ({
  QuarantineSettingsTab: () => null,
}));
vi.mock('@/components/email-disposal/disposal-settings/ReviewSettingsTab', () => ({
  ReviewSettingsTab: () => null,
}));
vi.mock('@/components/email-disposal/disposal-settings/RecallSettingsTab', () => ({
  RecallSettingsTab: () => null,
}));
vi.mock('@/components/shared/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  PageHeader: () => null,
  FramedPage: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/layout/tenant-selector', () => ({
  TenantSelector: () => null,
}));

import { DisposalSettingsPage } from '@/components/email-disposal/disposal-settings/disposal-settings-page';
import { UnsavedGuardProvider } from '@/contexts/unsaved-guard-context';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(UnsavedGuardProvider, null, createElement(DisposalSettingsPage))),
  );
}

describe('DisposalSettingsPage tenant-gated query (review TEST-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequestMock.mockResolvedValue({
      quarantine: { enabled: false, notify_emails: [] },
      review: { mode: 'manual', custom_minutes: 30 },
      recall: { enabled: false, timeout_hours: 24 },
    });
  });

  it('does NOT GET settings when platform admin has not selected a tenant', async () => {
    // Multi-tenant product, platform viewer, no tenant selected.
    useProductFormMock.mockReturnValue({
      capabilities: { multiTenant: true },
      viewer: 'platform',
    });
    useTenantMock.mockReturnValue({ effectiveTenantId: null });

    renderPage();

    // Give react-query a chance to (not) fire.
    await waitFor(() => {
      expect(apiRequestMock).not.toHaveBeenCalled();
    });
  });

  it('GETs settings once a tenant is selected', async () => {
    useProductFormMock.mockReturnValue({
      capabilities: { multiTenant: true },
      viewer: 'platform',
    });
    useTenantMock.mockReturnValue({ effectiveTenantId: 5 });

    renderPage();

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
  });

  it('GETs settings for a single-tenant viewer without selection', async () => {
    // Single-tenant (no multiTenant capability) → tenantReady is always true.
    useProductFormMock.mockReturnValue({
      capabilities: { multiTenant: false },
      viewer: 'tenant',
    });
    useTenantMock.mockReturnValue({ effectiveTenantId: null });

    renderPage();

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalled();
    });
  });
});
