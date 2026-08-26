import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import zh from '@/../messages/zh.json';

import { ARCSealingSection } from './ARCSealingSection';

const { StubAuthContext } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createContext } = require('react');
  return { StubAuthContext: createContext(null) };
});

const mockGetARCSettings = vi.fn();
const mockPutARCSettings = vi.fn();
const mockListAllDkimKeys = vi.fn();
vi.mock('@/lib/api/arc', () => ({
  getARCSettings: (...args: unknown[]) => mockGetARCSettings(...args),
  putARCSettings: (...args: unknown[]) => mockPutARCSettings(...args),
}));
vi.mock('@/lib/api/dkim', () => ({
  listAllDkimKeys: (...args: unknown[]) => mockListAllDkimKeys(...args),
}));
vi.mock('@/lib/api/client', () => ({ useApiRequest: () => ({ apiRequest: vi.fn() }) }));
vi.mock('@/lib/api/use-api-error-message', () => ({ useApiErrorMessage: () => () => 'error' }));
vi.mock('@/contexts/auth-context', () => ({ AuthContext: StubAuthContext }));
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ effectiveTenantId: 7, isSystemAdmin: false }) }));
vi.mock('@/hooks/use-permission', () => ({ usePermission: () => ({ isTenantAdmin: true }) }));
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: { ai: true, multiTenant: true, saas: false } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StubAuthContext.Provider value={{ ready: true }}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <ARCSealingSection />
        </NextIntlClientProvider>
      </StubAuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('ARCSealingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetARCSettings.mockResolvedValue({ tenant_id: 7, enabled: false, signing_domain: '' });
    mockPutARCSettings.mockImplementation(async (patch) => ({ tenant_id: 7, enabled: false, signing_domain: '', ...patch }));
  });

  it('enables ARC only with an active DNS-verified tenant DKIM domain', async () => {
    mockListAllDkimKeys.mockResolvedValue([
      { domain: 'gateway.example', is_active: true, dns_status: 'verified' },
    ]);
    renderSection();
    const toggle = await screen.findByTestId('arc-enabled');
    fireEvent.click(toggle);
    await waitFor(() => expect(mockPutARCSettings).toHaveBeenCalledWith(
      { enabled: true, signing_domain: 'gateway.example' },
      expect.any(Function),
    ));
  });

  it('keeps ARC off when no eligible signing key exists', async () => {
    mockListAllDkimKeys.mockResolvedValue([]);
    renderSection();
    const toggle = await screen.findByTestId('arc-enabled');
    expect(toggle.hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByText(zh.authSpoofing.arcSealing.noKeys)).toBeInTheDocument();
  });
});
