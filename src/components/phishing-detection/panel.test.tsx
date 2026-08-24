import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { PhishAgentConfig } from '@/types/phishing-config';

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}));
const apiRequest = vi.hoisted(() => vi.fn());
const getControl = vi.hoisted(() => vi.fn());
const listRules = vi.hoisted(() => vi.fn());
const getConfig = vi.hoisted(() => vi.fn());
const getAnalysisConfig = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useSearchParams: () => navigation.params }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/agent-center/overview',
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest, effectiveTenantId: 7 }),
}));
vi.mock('@/lib/api/phishing-control', () => ({
  getPhishingControl: (...args: unknown[]) => getControl(...args),
  putPhishingControl: vi.fn(),
}));
vi.mock('@/lib/api/phishing-admission-rules', () => ({
  listAdmissionRules: (...args: unknown[]) => listRules(...args),
  createAdmissionRule: vi.fn(),
  updateAdmissionRule: vi.fn(),
  deleteAdmissionRule: vi.fn(),
  setAdmissionRuleStatus: vi.fn(),
}));
vi.mock('@/lib/api/phishing-config', () => ({
  getPhishingConfig: (...args: unknown[]) => getConfig(...args),
  putPhishingConfig: vi.fn(),
}));
vi.mock('@/lib/api/phishing-analysis-config', () => ({
  getPhishingAnalysisConfig: (...args: unknown[]) => getAnalysisConfig(...args),
  putPhishingAnalysisConfig: vi.fn(),
}));
vi.mock('./access', () => ({ usePhishingAccess: () => ({ canEdit: true, readOnly: false }) }));

import { PhishingAgentPanel, type PhishingAgentTab } from './panel';

const config: PhishAgentConfig = {
  risk_policy: {
    cutoffs: { low: 40, medium: 70, high: 90 },
    policies: {
      suspicious: { base_disposition: 'proceed' },
      low: { base_disposition: 'audit' },
      medium: { base_disposition: 'quarantine' },
      high: { base_disposition: 'discard' },
    },
    version: 1,
    updated_at: '2026-08-18T00:00:00Z',
  },
  runtime_policy: {
    run_mode: 'realtime',
    observe_action: 'accept',
    observe_mark_enabled: false,
    timeout_minutes: 15,
    max_recheck_minutes: 30,
    timeout_async_enabled: true,
    version: 1,
    updated_at: '2026-08-18T00:00:00Z',
  },
};

function renderPanel(initialTab: PhishingAgentTab) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={queryClient}>
        <PhishingAgentPanel initialTab={initialTab} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('PhishingAgentPanel URL orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.params = new URLSearchParams('agent=phishing&tab=overview');
    apiRequest.mockResolvedValue({ items: [] });
    getControl.mockResolvedValue({ enabled: false, desired_state: 'disabled', runtime_state: 'stopped', revision: 1 });
    listRules.mockResolvedValue([]);
    getConfig.mockResolvedValue(structuredClone(config));
    getAnalysisConfig.mockResolvedValue({ netdisk_domain: false, netdisk_extract: false, netdisk_spoof: false, version: 1, updated_at: '2026-08-18T00:00:00Z' });
  });

  it('follows tab changes from browser URL navigation after mount', async () => {
    const view = renderPanel('overview');
    expect(screen.queryByTestId('phishing-config-page')).not.toBeInTheDocument();

    navigation.params = new URLSearchParams('agent=phishing&tab=config');
    view.rerender(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <PhishingAgentPanel initialTab="config" />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

    expect(await screen.findByTestId('phishing-config-page')).toBeInTheDocument();
  });

  it('consumes create-admission-rule by opening the config drawer and removing the action', async () => {
    navigation.params = new URLSearchParams('agent=phishing&tab=overview&action=create-admission-rule');
    renderPanel('overview');

    expect(await screen.findByTestId('admission-rule-sheet')).toBeInTheDocument();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(
      '/agent-center/overview?agent=phishing&tab=config',
    ));
  });
});
