import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthSpoofingConfig, FormatChecksConfig } from '@/types/auth-spoofing';
import zh from '@/../messages/zh.json';
import { AuthSpoofingPage } from './AuthSpoofingPage';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getObserveStats: vi.fn(),
  putConfig: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/api/auth-spoofing', () => ({
  getAuthSpoofingConfig: mocks.getConfig,
  getObserveStats: mocks.getObserveStats,
  putAuthSpoofingConfig: mocks.putConfig,
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, user: { role: 'system_admin' } }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: { ai: true } }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/components/security/ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./auth-spoofing/FormatChecksSection', () => ({
  FormatChecksSection: ({
    config,
    onChange,
  }: {
    config: FormatChecksConfig;
    onChange: (config: FormatChecksConfig) => void;
  }) => (
    <button
      type="button"
      data-testid="make-subject-tag-empty"
      onClick={() =>
        onChange({
          ...config,
          mailfrom_empty: {
            ...config.mailfrom_empty,
            action: 'mark-delivery',
            tag_subject_enabled: true,
            tag_subject_content: '',
          },
        })
      }
    >
      make invalid
    </button>
  ),
}));

vi.mock('./auth-spoofing/ProtocolChecksSection', () => ({
  ProtocolChecksSection: () => null,
}));

vi.mock('./auth-spoofing/SimilarDomainSection', () => ({
  SimilarDomainSection: () => null,
}));

vi.mock('./auth-spoofing/DisplayNameSpoofSection', () => ({
  DisplayNameSpoofSection: () => null,
}));

const check = { enabled: true, action: 'quarantine' as const, observe_mode: false };

function initialConfig(): AuthSpoofingConfig {
  return {
    format_checks: {
      mailfrom_empty: { ...check },
      mailfrom_invalid: { ...check },
      envelope_header_mismatch: { ...check },
    },
    protocol_checks: {
      template: 'custom',
      observe_mode: false,
      spf: {},
      dkim: {},
      dmarc: {},
      ptr: {},
    },
    similar_domain: {
      enabled: false,
      action: 'quarantine',
      observe_mode: false,
      threshold: 2,
      protected_domains: [],
    },
    display_name_spoof: {
      inbound: { ...check },
      outbound: { ...check },
      internal: { ...check },
      internal_users: [],
    },
  };
}

describe('AuthSpoofingPage save validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockResolvedValue(initialConfig());
    mocks.getObserveStats.mockResolvedValue({ days: 7, points: [] });
    mocks.putConfig.mockResolvedValue({ ok: true });
  });

  it('shows a frontend error and does not call PUT when an enabled subject tag is empty', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh}>
          <AuthSpoofingPage embedded />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByTestId('make-subject-tag-empty'));
    const save = screen.getByTestId('auth-spoofing-save');
    await waitFor(() => expect(save).not.toBeDisabled());
    fireEvent.click(save);

    expect(mocks.toastError).toHaveBeenCalledWith('已启用的标记方式内容不能为空');
    expect(mocks.putConfig).not.toHaveBeenCalled();
  });
});
