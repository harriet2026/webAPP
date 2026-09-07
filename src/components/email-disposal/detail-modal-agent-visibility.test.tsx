import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import { AuthContext } from '@/contexts/auth-context';
import { DetailModal } from './detail-modal';

// The locale-aware navigation module is the framework boundary for this component;
// its router needs a Next app runtime that Vitest does not provide.
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

type AuthContextValue = ComponentProps<typeof AuthContext.Provider>['value'];

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let overviewFailuresRemaining = 0;

function createAuthContextValue(): AuthContextValue {
  return {
    user: {
      id: 1,
      username: 'admin',
      role: 'system_admin',
      tenant_id: null,
      role_id: null,
      is_super_admin: true,
      created_at: '',
      updated_at: '',
    },
    token: null,
    expiresAt: null,
    selectedTenantId: 73,
    isLoading: false,
    demoAuthBypassEnabled: false,
    showAdvancedRules: false,
    features: { aiInterpret: false },
    login: vi.fn(),
    completeLogin: vi.fn(),
    logout: vi.fn(),
    startDemoSession: vi.fn(),
    setSelectedTenant: vi.fn(),
    hasPermission: vi.fn(() => true),
    isSystemAdmin: true,
    isTenantAdmin: false,
    isTrueSuperAdmin: true,
    canSeeRoute: vi.fn(() => true),
    can: vi.fn(() => true),
  };
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function analysisResponse(): object {
  return {
    scope: 'all',
    final_verdict: 'safe',
    total_elapsed_ms: 20,
    stages: [
      { stage: 1, key: 'connection', status: 'pass', checks: [] },
      { stage: 2, key: 'identity', status: 'pass', checks: [] },
      { stage: 3, key: 'content', status: 'pass', checks: [] },
      {
        stage: 4,
        key: 'ai',
        status: 'skipped',
        checks: [
          { key: 'phishingAgent', status: 'skipped', rule_ids: [] },
          { key: 'spoofingAgent', status: 'skipped', rule_ids: [] },
          { key: 'threatRetroAgent', status: 'skipped', rule_ids: [] },
          { key: 'futureAgent', status: 'skipped', rule_ids: [] },
        ],
      },
      { stage: 5, key: 'comprehensive', status: 'pass', checks: [] },
    ],
  };
}

function overviewResponse(): object {
  return {
    agents: [
      { key: 'phishing', module_key: 'phishing_agent', feature_id: 'phishing-detection', access: 'enabled', status: 'running', stage_position: '4.0', today_processed: null, hit_count: null, processed_count: null, hit_rate: null },
      { key: 'spoofing', module_key: 'spoofing_agent', feature_id: 'spoofing-detection', access: 'hidden', status: 'locked', stage_position: '4.1', today_processed: null, hit_count: null, processed_count: null, hit_rate: null },
      { key: 'threat-retro', module_key: 'threat_retro_agent', feature_id: 'threat-retro', access: 'hidden', status: 'locked', stage_position: '4.2', today_processed: null, hit_count: null, processed_count: null, hit_rate: null },
      { key: 'future-agent', module_key: 'future_agent', feature_id: 'future-agent', access: 'enabled', status: 'running', stage_position: '4.3', today_processed: null, hit_count: null, processed_count: null, hit_rate: null },
    ],
  };
}

function renderDetailModal(props: Partial<ComponentProps<typeof DetailModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={createAuthContextValue()}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} aiEnabled {...props} />
        </NextIntlClientProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.removeItem('osgateway_demo_session');
  localStorage.removeItem('osgateway_mock_enabled');
  overviewFailuresRemaining = 0;
  fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === '/api/v1/mail-logs/1') {
      return jsonResponse({
        id: 1,
        message_id: '<agent-visibility@example.test>',
        message_uuid: 'agent-visibility-uuid',
        client_ip: '203.0.113.10',
        sender: 'sender@example.test',
        recipients: ['recipient@example.test', 'other@example.test'],
        authenticated: false,
        subject: 'Agent visibility regression',
        action: 'accept',
        status: 'delivered',
        email_type: 'normal',
        received_at: '2026-09-03T08:00:00.000Z',
      });
    }
    if (url === '/api/v1/mail-logs/1/events?page=1&page_size=100') {
      return jsonResponse({ items: [] });
    }
    if (url === '/api/v1/mail-logs/1/analysis?recipient=other%40example.test') {
      return jsonResponse({
        ...analysisResponse(),
        scope: 'recipient',
        recipient: 'other@example.test',
        action: 'accept',
        status: 'delivered',
      });
    }
    if (url === '/api/v1/mail-logs/1/analysis') return jsonResponse(analysisResponse());
    if (url === '/api/v1/agent-center/overview?include_stats=false') {
      if (overviewFailuresRemaining > 0) {
        overviewFailuresRemaining -= 1;
        return jsonResponse({ error: 'overview unavailable' }, 500);
      }
      return jsonResponse(overviewResponse());
    }
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DetailModal agent visibility', () => {
  it('joins tenant access with mail evidence in the user-visible analysis', async () => {
    renderDetailModal();

    const phishing = await screen.findByTestId('analysis-check-phishingAgent');
    expect(phishing).toHaveTextContent('跳过');
    expect(phishing).not.toHaveTextContent('未接入');
    expect(screen.queryByText('仿冒邮件检测智能体')).not.toBeInTheDocument();
    expect(screen.queryByText('威胁回溯智能体')).not.toBeInTheDocument();
    expect(screen.queryByTestId('analysis-check-futureAgent')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-stage-4')).toHaveTextContent('1 项策略');
    expect(screen.getByTestId('analysis-stage-5')).toHaveTextContent('综合分析');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/agent-center/overview?include_stats=false',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Tenant-ID': '73' }),
      }),
    );
  });

  it.each([
    ['closed drawer', { open: false, mailLogId: 1, aiEnabled: true }],
    ['missing mail id', { open: true, mailLogId: null, aiEnabled: true }],
    ['AI-disabled product form', { open: true, mailLogId: 1, aiEnabled: false }],
  ] as const)('does not request the agent overview for a %s', async (_label, props) => {
    renderDetailModal(props);

    await waitFor(() => {
      if (props.open && props.mailLogId) {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/v1/mail-logs/1',
          expect.any(Object),
        );
      } else {
        expect(fetchMock).not.toHaveBeenCalled();
      }
    });
    expect(fetchMock.mock.calls.some(([input]) => (
      String(input) === '/api/v1/agent-center/overview?include_stats=false'
    ))).toBe(false);
  });

  it('fails closed on overview errors and retries both analysis inputs', async () => {
    overviewFailuresRemaining = 1;
    renderDetailModal();

    expect(await screen.findByTestId('analysis-error')).toHaveTextContent('检测结果加载失败');
    expect(screen.queryByTestId('analysis-check-phishingAgent')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByTestId('analysis-check-phishingAgent')).toHaveTextContent('跳过');
    expect(fetchMock.mock.calls.filter(([input]) => (
      String(input) === '/api/v1/mail-logs/1/analysis'
    ))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([input]) => (
      String(input) === '/api/v1/agent-center/overview?include_stats=false'
    ))).toHaveLength(2);
  });

  it('reuses the tenant overview while changing recipient analysis', async () => {
    const user = userEvent.setup();
    renderDetailModal();

    const selector = await screen.findByTestId('analysis-recipient-switcher');
    await screen.findByTestId('analysis-check-phishingAgent');
    await user.click(selector);
    await user.click(await screen.findByRole('option', { name: 'other@example.test' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => (
        String(input) === '/api/v1/mail-logs/1/analysis?recipient=other%40example.test'
      ))).toBe(true);
    });
    expect(selector).toHaveTextContent('other@example.test');
    expect(screen.getByTestId('analysis-check-phishingAgent')).toHaveTextContent('跳过');
    expect(screen.queryByText('仿冒邮件检测智能体')).not.toBeInTheDocument();
    expect(screen.queryByText('威胁回溯智能体')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => (
      String(input) === '/api/v1/agent-center/overview?include_stats=false'
    ))).toHaveLength(1);
  });
});
