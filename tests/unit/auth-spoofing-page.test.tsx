import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const mockApiRequest = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), key);
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    createElement('a', { href, ...props }, children),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, hasPermission: () => true, showAdvancedRules: false, user: { role: 'system_admin' } }),
}));

const useProductFormMock = vi.fn();
vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => useProductFormMock(),
}));

const mockConfig = {
  format_checks: {
    mailfrom_empty: { enabled: true, action: 'accept', observe_mode: false },
    mailfrom_invalid: { enabled: true, action: 'reject', observe_mode: false },
    envelope_header_mismatch: { enabled: true, action: 'quarantine', observe_mode: false },
  },
  protocol_checks: {
    template: 'standard',
    observe_mode: false,
    spf: {
      fail: { enabled: true, action: 'reject', observe_mode: false },
      softfail: { enabled: true, action: 'quarantine', observe_mode: false },
      none: { enabled: true, action: 'audit', observe_mode: false },
      temperror: { enabled: true, action: 'audit', observe_mode: false },
    },
    dkim: {
      fail: { enabled: true, action: 'quarantine', observe_mode: false },
      neutral: { enabled: true, action: 'quarantine', observe_mode: false },
      partial: { enabled: false, action: 'accept', observe_mode: false },
      none: { enabled: true, action: 'audit', observe_mode: false },
    },
    dmarc: {
      reject: { enabled: true, action: 'reject', observe_mode: false },
      quarantine: { enabled: true, action: 'quarantine', observe_mode: false },
      none: { enabled: true, action: 'audit', observe_mode: false },
    },
    ptr: {
      norecord: { enabled: true, action: 'audit', observe_mode: false },
      temperror: { enabled: true, action: 'audit', observe_mode: false },
      ehlomismatch: { enabled: true, action: 'quarantine', observe_mode: false },
      amismatch: { enabled: true, action: 'quarantine', observe_mode: false },
    },
  },
  similar_domain: { enabled: true, action: 'quarantine', observe_mode: false, threshold: 2, protected_domains: [] },
  display_name_spoof: {
    inbound: { enabled: true, action: 'quarantine', observe_mode: false },
    outbound: { enabled: true, action: 'quarantine', observe_mode: false },
    internal: { enabled: true, action: 'quarantine', observe_mode: false },
    internal_users: [],
  },
};

import { AuthSpoofingPage } from '@/components/security/AuthSpoofingPage';
import { SimilarDomainSection } from '@/components/security/auth-spoofing/SimilarDomainSection';
import { DisplayNameSpoofSection } from '@/components/security/auth-spoofing/DisplayNameSpoofSection';
import type { SimilarDomainConfig, DisplayNameSpoofConfig } from '@/types/auth-spoofing';

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(ui: ReturnType<typeof createElement>) {
  const qc = createQueryClient();
  return render(
    createElement(QueryClientProvider, { client: qc }, ui),
  );
}

describe('AuthSpoofingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: non-AI product form, so the two spoof-detection sub-sections render
    // (matches pre-existing tests below that assert similarDomain/displayNameSpoof titles).
    useProductFormMock.mockReturnValue({ capabilities: { ai: false } });
  });

  it('renders 4 sub-module section titles', async () => {
    mockApiRequest.mockResolvedValue(mockConfig);
    renderPage(createElement(AuthSpoofingPage));

    await waitFor(() => {
      expect(screen.getByText('formatChecks.title')).toBeInTheDocument();
    });
    expect(screen.getByText('protocolChecks.title')).toBeInTheDocument();
    expect(screen.getByText('similarDomain.title')).toBeInTheDocument();
    expect(screen.getByText('displayNameSpoof.title')).toBeInTheDocument();
  });

  it('renders the save action required to persist configuration changes', async () => {
    mockApiRequest.mockResolvedValue(mockConfig);
    renderPage(<AuthSpoofingPage embedded />);

    await waitFor(() => {
      expect(screen.getByText('formatChecks.title')).toBeInTheDocument();
    });
    const footer = screen.getByTestId('auth-spoofing-footer');
    expect(within(footer).getByRole('button', { name: 'save' })).toBeInTheDocument();
    expect(screen.queryByText('viewObserveStats')).not.toBeInTheDocument();
    expect(screen.queryByText('probe.title')).not.toBeInTheDocument();
    expect(screen.queryByText('restoreDefault')).not.toBeInTheDocument();
  });

  it('does not render a module-level title/description strip (demo-aligned: parent card owns the header)', async () => {
    mockApiRequest.mockResolvedValue(mockConfig);
    renderPage(createElement(AuthSpoofingPage));

    await waitFor(() => {
      expect(screen.getByText('formatChecks.title')).toBeInTheDocument();
    });
    // the redundant module title ("title") and description ("description") are gone
    expect(screen.queryByText('description')).not.toBeInTheDocument();
    expect(screen.queryByText('observeModeTip')).not.toBeInTheDocument();
  });
});

const mockSimilarDomainConfig: SimilarDomainConfig = {
  enabled: true,
  action: 'quarantine',
  observe_mode: false,
  threshold: 2,
  protected_domains: [],
};

const mockDisplayNameSpoofConfig: DisplayNameSpoofConfig = {
  inbound: { enabled: true, action: 'quarantine', observe_mode: false },
  outbound: { enabled: true, action: 'quarantine', observe_mode: false },
  internal: { enabled: true, action: 'quarantine', observe_mode: false },
  internal_users: [],
};

describe('SimilarDomainSection textarea normalization', () => {
  it('splits on newlines, trims whitespace, and filters empty lines, casting to array', () => {
    const onChange = vi.fn();

    renderPage(
      createElement(SimilarDomainSection, { config: mockSimilarDomainConfig, onChange }),
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'example.com\n  test.com  \n\n\n  another.org  ' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as SimilarDomainConfig;
    expect(lastCall.protected_domains).toEqual(['example.com', 'test.com', 'another.org']);
  });
});

describe('DisplayNameSpoofSection internal users', () => {
  it('shows empty warning alert when config has no internal_users', () => {
    const onChange = vi.fn();
    const config: DisplayNameSpoofConfig = {
      ...mockDisplayNameSpoofConfig,
      internal_users: [],
    };

    renderPage(
      createElement(DisplayNameSpoofSection, { config, onChange }),
    );

    expect(screen.getByText('displayNameSpoof.emptyUsersWarning')).toBeInTheDocument();
  });

  it('renders each user with name and match_mode badge when config has internal_users', () => {
    const onChange = vi.fn();
    const config: DisplayNameSpoofConfig = {
      ...mockDisplayNameSpoofConfig,
      internal_users: [
        { name: 'Alice', match_mode: 'exact' },
        { name: 'Bob', match_mode: 'substring' },
      ],
    };

    renderPage(
      createElement(DisplayNameSpoofSection, { config, onChange }),
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getAllByText('displayNameSpoof.exact').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('displayNameSpoof.substring').length).toBeGreaterThanOrEqual(1);
  });

  it('provides a remove button for each user', () => {
    const onChange = vi.fn();
    const config: DisplayNameSpoofConfig = {
      ...mockDisplayNameSpoofConfig,
      internal_users: [
        { name: 'Alice', match_mode: 'exact' },
      ],
    };

    renderPage(
      createElement(DisplayNameSpoofSection, { config, onChange }),
    );

    const aliceSpan = screen.getByText('Alice');
    const userRow = aliceSpan.parentElement!;
    const removeButton = within(userRow).getByRole('button');
    expect(removeButton).toBeInTheDocument();
  });
});

describe('AuthSpoofingPage AI-form gating (task 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides SimilarDomain/DisplayNameSpoof sections when capabilities.ai=true', async () => {
    useProductFormMock.mockReturnValue({ capabilities: { ai: true } });
    mockApiRequest.mockResolvedValue(mockConfig);
    renderPage(createElement(AuthSpoofingPage));

    await waitFor(() => {
      expect(screen.getByText('formatChecks.title')).toBeInTheDocument();
    });
    expect(screen.getByText('protocolChecks.title')).toBeInTheDocument();
    expect(screen.queryByText('similarDomain.title')).not.toBeInTheDocument();
    expect(screen.queryByText('displayNameSpoof.title')).not.toBeInTheDocument();
  });

  it('shows SimilarDomain/DisplayNameSpoof sections when capabilities.ai=false', async () => {
    useProductFormMock.mockReturnValue({ capabilities: { ai: false } });
    mockApiRequest.mockResolvedValue(mockConfig);
    renderPage(createElement(AuthSpoofingPage));

    await waitFor(() => {
      expect(screen.getByText('formatChecks.title')).toBeInTheDocument();
    });
    expect(screen.getByText('similarDomain.title')).toBeInTheDocument();
    expect(screen.getByText('displayNameSpoof.title')).toBeInTheDocument();
  });

  it('always renders ExceptionRulesEntry regardless of AI capability', async () => {
    useProductFormMock.mockReturnValue({ capabilities: { ai: true } });
    mockApiRequest.mockResolvedValue(mockConfig);
    renderPage(createElement(AuthSpoofingPage));

    await waitFor(() => {
      expect(screen.getByText('exceptionEntry.title')).toBeInTheDocument();
    });
    // ProtocolChecksSection also renders its own "goToPipeline" link, so assert
    // at least one instance (the ExceptionRulesEntry's) rather than a unique match.
    expect(screen.getAllByText('goToPipeline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('exceptionEntry.viewCurrent')).toBeInTheDocument();
  });
});
