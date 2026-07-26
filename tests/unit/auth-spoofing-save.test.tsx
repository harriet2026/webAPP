import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FormatChecksConfig } from '@/types/auth-spoofing';

const { mockApiRequest, toastSuccess } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, user: { role: 'system_admin' } }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: { ai: true } }),
}));

vi.mock('@/components/security/ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/security/auth-spoofing/FormatChecksSection', () => ({
  FormatChecksSection: ({
    config,
    onChange,
  }: {
    config: FormatChecksConfig;
    onChange: (config: FormatChecksConfig) => void;
  }) => createElement(
    'button',
    {
      type: 'button',
      onClick: () => onChange({
        ...config,
        mailfrom_invalid: { ...config.mailfrom_invalid, action: 'quarantine' },
      }),
    },
    'change-format',
  ),
}));

vi.mock('@/components/security/auth-spoofing/ProtocolChecksSection', () => ({
  ProtocolChecksSection: () => null,
}));

vi.mock('@/components/security/auth-spoofing/SimilarDomainSection', () => ({
  SimilarDomainSection: () => null,
}));

vi.mock('@/components/security/auth-spoofing/DisplayNameSpoofSection', () => ({
  DisplayNameSpoofSection: () => null,
}));

vi.mock('@/components/security/auth-spoofing/ExceptionRulesEntry', () => ({
  ExceptionRulesEntry: () => null,
}));

const mockConfig = {
  format_checks: {
    mailfrom_empty: { enabled: true, action: 'accept' as const, observe_mode: false },
    mailfrom_invalid: { enabled: true, action: 'reject' as const, observe_mode: false },
    envelope_header_mismatch: { enabled: true, action: 'quarantine' as const, observe_mode: false },
  },
  protocol_checks: {
    template: 'standard' as const,
    observe_mode: false,
    spf: {},
    dkim: {},
    dmarc: {},
    ptr: {},
  },
  similar_domain: {
    enabled: false,
    action: 'quarantine' as const,
    observe_mode: false,
    threshold: 2,
    protected_domains: [],
  },
  display_name_spoof: {
    inbound: { enabled: true, action: 'quarantine' as const, observe_mode: false },
    outbound: { enabled: true, action: 'quarantine' as const, observe_mode: false },
    internal: { enabled: true, action: 'quarantine' as const, observe_mode: false },
    internal_users: [],
  },
};

import { AuthSpoofingPage } from '@/components/security/AuthSpoofingPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthSpoofingPage),
    ),
  );
}

describe('AuthSpoofingPage save flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/auth-spoofing/config' && options?.method === 'PUT') {
        return { ok: true };
      }
      if (path.startsWith('/auth-spoofing/observe-stats')) {
        return { days: 7, points: [] };
      }
      if (path === '/auth-spoofing/config') {
        return mockConfig;
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
  });

  it('enables Save after an edit and persists the edited config with PUT', async () => {
    renderPage();

    const saveButton = await screen.findByRole('button', { name: 'save' });
    await waitFor(() => expect(screen.getByText('change-format')).toBeInTheDocument());
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByText('change-format'));
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/auth-spoofing/config',
        expect.objectContaining({
          method: 'PUT',
          body: expect.objectContaining({
            format_checks: expect.objectContaining({
              mailfrom_invalid: expect.objectContaining({ action: 'quarantine' }),
            }),
          }),
        }),
      );
    });
    await waitFor(() => expect(saveButton).toBeDisabled());
    expect(toastSuccess).toHaveBeenCalledWith('saveSuccess');
  });
});
