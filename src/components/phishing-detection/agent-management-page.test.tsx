import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { PhishTenantEngineParams, PhishAdmissionRule } from '@/types/phishing-config';

// GT-12865：钓鱼邮件检测智能体页面外套控制栏总开关。
// 只覆盖新增的 usePhishingEngineToggle / PhishingAgentHeaderActions / 危险横幅，
// 不重复覆盖 PhishingOverviewPage、PhishingConfigPage 自身已有的测试范围。

const getEngineConfigMock = vi.fn();
const putEngineConfigMock = vi.fn();
const listAdmissionRulesMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const routerReplaceMock = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    useApiRequest: () => ({ apiRequest: vi.fn() }),
  };
});

vi.mock('@/lib/api/phishing-config', () => ({
  getEngineConfig: (...args: unknown[]) => getEngineConfigMock(...args),
  putEngineConfig: (...args: unknown[]) => putEngineConfigMock(...args),
  listAdmissionRules: (...args: unknown[]) => listAdmissionRulesMock(...args),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/agent-center/overview',
  useRouter: () => ({ replace: routerReplaceMock }),
  useSearchParams: () => new URLSearchParams('agent=phishing'),
}));

// PhishingOverviewPage / PhishingConfigPage 拉入大量与本次改动无关的依赖
// （useTenant、检测日志表等），用极简替身隔离，只验证 PhishingAgentPanel
// 自身新增的危险横幅逻辑。
vi.mock('./phishing-overview-page', () => ({
  PhishingOverviewPage: () => <div data-testid="stub-overview" />,
}));
vi.mock('./config/phishing-config-page', () => ({
  PhishingConfigPage: () => <div data-testid="stub-config" />,
}));

import { PhishingAgentHeaderActions, PhishingAgentPanel } from './agent-management-page';

function makeEngine(overrides: Partial<PhishTenantEngineParams> = {}): PhishTenantEngineParams {
  return {
    enabled: true,
    netdisk_domain: true,
    netdisk_extract: true,
    netdisk_spoof: true,
    run_mode: 'realtime',
    observe_action: 'deliver',
    protection_level: 'standard',
    ...overrides,
  };
}

function makeRule(overrides: Partial<PhishAdmissionRule> = {}): PhishAdmissionRule {
  return {
    id: 1,
    name: '默认规则',
    directions: ['inbound'],
    enabled: true,
    ...overrides,
  } as PhishAdmissionRule;
}

function renderHeaderActions() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={client}>
        <PhishingAgentHeaderActions />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={client}>
        <PhishingAgentPanel />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getEngineConfigMock.mockResolvedValue({ engine: makeEngine(), version: 1 });
  putEngineConfigMock.mockResolvedValue(undefined);
  listAdmissionRulesMock.mockResolvedValue([makeRule()]);
});

describe('PhishingAgentHeaderActions（GT-12865 智能体总开关）', () => {
  it('renders the master switch checked with the enabled status text', async () => {
    renderHeaderActions();

    const toggle = await screen.findByTestId('phishing-agent-master-switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('已启用')).toBeInTheDocument();
  });

  it('shows a destructive confirmation before disabling, and keeps it enabled on Cancel', async () => {
    renderHeaderActions();

    const toggle = await screen.findByTestId('phishing-agent-master-switch');
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);

    expect(await screen.findByText('确认关闭钓鱼邮件检测智能体？')).toBeInTheDocument();

    fireEvent.click(screen.getByText('取消'));

    await waitFor(() => expect(screen.queryByText('确认关闭钓鱼邮件检测智能体？')).not.toBeInTheDocument());
    expect(putEngineConfigMock).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('disables the agent after confirming, calling putEngineConfig with enabled=false', async () => {
    renderHeaderActions();

    const toggle = await screen.findByTestId('phishing-agent-master-switch');
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    fireEvent.click(await screen.findByText('确认关闭'));

    await waitFor(() => expect(putEngineConfigMock).toHaveBeenCalledTimes(1));
    expect(putEngineConfigMock.mock.calls[0][0]).toMatchObject({ enabled: false });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('blocks enabling and prompts to configure admission rules first when none are active', async () => {
    getEngineConfigMock.mockResolvedValue({ engine: makeEngine({ enabled: false }), version: 1 });
    listAdmissionRulesMock.mockResolvedValue([]);
    renderHeaderActions();

    const toggle = await screen.findByTestId('phishing-agent-master-switch');
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(toggle);

    expect(await screen.findByText('请先配置检测范围与准入规则')).toBeInTheDocument();

    fireEvent.click(screen.getByText('前往配置'));

    expect(putEngineConfigMock).not.toHaveBeenCalled();
    expect(routerReplaceMock).toHaveBeenCalledWith(
      expect.stringContaining('agent=phishing'),
      expect.anything(),
    );
    expect(routerReplaceMock.mock.calls[0][0]).toContain('tab=config');
  });

  it('enables the agent directly when at least one admission rule is already active', async () => {
    getEngineConfigMock.mockResolvedValue({ engine: makeEngine({ enabled: false }), version: 1 });
    listAdmissionRulesMock.mockResolvedValue([makeRule({ enabled: true })]);
    renderHeaderActions();

    const toggle = await screen.findByTestId('phishing-agent-master-switch');
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    fireEvent.click(toggle);

    await waitFor(() => expect(putEngineConfigMock).toHaveBeenCalledTimes(1));
    expect(putEngineConfigMock.mock.calls[0][0]).toMatchObject({ enabled: true });
    expect(screen.queryByText('请先配置检测范围与准入规则')).not.toBeInTheDocument();
  });
});

describe('PhishingAgentPanel disabled banner（GT-12865）', () => {
  it('shows no banner while the agent is enabled', async () => {
    renderPanel();

    await screen.findByTestId('stub-overview');
    expect(screen.queryByTestId('phishing-agent-disabled-banner')).not.toBeInTheDocument();
  });

  it('shows the danger banner once the agent has been disabled', async () => {
    getEngineConfigMock.mockResolvedValue({ engine: makeEngine({ enabled: false }), version: 1 });
    renderPanel();

    expect(await screen.findByTestId('phishing-agent-disabled-banner')).toHaveTextContent(
      '钓鱼邮件检测智能体已关闭',
    );
  });
});
