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
  apiRequest: vi.fn(),
  effectiveTenantId: 101 as number | null,
}));

vi.mock('@/lib/api/auth-spoofing', () => ({
  getAuthSpoofingConfig: mocks.getConfig,
  getObserveStats: mocks.getObserveStats,
  putAuthSpoofingConfig: mocks.putConfig,
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({
    apiRequest: mocks.apiRequest,
    effectiveTenantId: mocks.effectiveTenantId,
  }),
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
    <div>
      <span data-testid="server-mailfrom-invalid-action">{config.mailfrom_invalid.action}</span>
      <button
        type="button"
        data-testid="make-subject-tag-empty"
        onClick={() =>
          onChange({
            ...config,
            mailfrom_empty: {
              ...config.mailfrom_empty,
              action: 'proceed',
              tag_subject_enabled: true,
              tag_subject_content: '',
            },
          })
        }
      >
        make invalid
      </button>
      <button
        type="button"
        data-testid="make-valid-change"
        onClick={() =>
          onChange({
            ...config,
            mailfrom_empty: { ...config.mailfrom_empty, action: 'audit' },
          })
        }
      >
        make valid change
      </button>
    </div>
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
    mocks.effectiveTenantId = 101;
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

  it('hides fallback defaults and disables writes until a failed config load is retried successfully', async () => {
    const serverConfig = initialConfig();
    serverConfig.format_checks.mailfrom_invalid.action = 'discard';
    serverConfig.similar_domain.threshold = 17;
    mocks.getConfig
      .mockRejectedValueOnce(new Error('server unavailable'))
      .mockResolvedValueOnce(serverConfig);
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

    expect(await screen.findByTestId('auth-spoofing-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-spoofing-config-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('make-subject-tag-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-spoofing-save')).toBeDisabled();
    fireEvent.click(screen.getByTestId('auth-spoofing-save'));
    expect(mocks.putConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('auth-spoofing-load-retry'));

    expect(await screen.findByTestId('auth-spoofing-config-content')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-spoofing-load-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('server-mailfrom-invalid-action')).toHaveTextContent('discard');
    fireEvent.click(screen.getByTestId('make-valid-change'));
    await waitFor(() => expect(screen.getByTestId('auth-spoofing-save')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('auth-spoofing-save'));
    await waitFor(() => expect(mocks.putConfig).toHaveBeenCalledTimes(1));
    expect(mocks.putConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        format_checks: expect.objectContaining({
          mailfrom_empty: expect.objectContaining({ action: 'audit' }),
          mailfrom_invalid: expect.objectContaining({ action: 'discard' }),
        }),
        similar_domain: expect.objectContaining({ threshold: 17 }),
      }),
      mocks.apiRequest,
      expect.any(AbortSignal),
    );
    expect(mocks.getConfig).toHaveBeenCalledTimes(2);
  });

  it('loads and hydrates the current tenant before allowing a cross-tenant save', async () => {
    const tenantOne = initialConfig();
    tenantOne.format_checks.mailfrom_invalid.action = 'reject';
    const tenantTwo = initialConfig();
    tenantTwo.format_checks.mailfrom_invalid.action = 'discard';
    tenantTwo.similar_domain.threshold = 23;

    let resolveTenantTwo!: (config: AuthSpoofingConfig) => void;
    const tenantTwoResponse = new Promise<AuthSpoofingConfig>((resolve) => {
      resolveTenantTwo = resolve;
    });
    mocks.getConfig
      .mockResolvedValueOnce(tenantOne)
      .mockImplementationOnce(() => tenantTwoResponse);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh}>
          <AuthSpoofingPage embedded />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('server-mailfrom-invalid-action')).toHaveTextContent('reject');

    mocks.effectiveTenantId = 202;
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh}>
          <AuthSpoofingPage embedded />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mocks.getConfig).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('auth-spoofing-config-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('auth-spoofing-loading')).toBeInTheDocument();
    expect(screen.getByTestId('auth-spoofing-save')).toBeDisabled();

    resolveTenantTwo(tenantTwo);
    expect(await screen.findByTestId('server-mailfrom-invalid-action')).toHaveTextContent('discard');
    fireEvent.click(screen.getByTestId('make-valid-change'));
    await waitFor(() => expect(screen.getByTestId('auth-spoofing-save')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('auth-spoofing-save'));

    await waitFor(() => expect(mocks.putConfig).toHaveBeenCalledTimes(1));
    expect(mocks.putConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        format_checks: expect.objectContaining({
          mailfrom_invalid: expect.objectContaining({ action: 'discard' }),
        }),
        similar_domain: expect.objectContaining({ threshold: 23 }),
      }),
      mocks.apiRequest,
      expect.any(AbortSignal),
    );
  });
});
