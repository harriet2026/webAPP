import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhishingAgentHeaderActions } from './control-switch';
import { getPhishingControl, putPhishingControl } from '@/lib/api/phishing-control';
import { listAdmissionRules } from '@/lib/api/phishing-admission-rules';

vi.mock('@/lib/api/phishing-control', () => ({
  getPhishingControl: vi.fn(),
  putPhishingControl: vi.fn(),
}));
vi.mock('@/lib/api/phishing-admission-rules', () => ({ listAdmissionRules: vi.fn() }));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn(), effectiveTenantId: 11 }),
}));
vi.mock('../access', () => ({ usePhishingAccess: () => ({ canEdit: true, readOnly: false }) }));

const messages = {
  common: { enabled: '已启用', disabled: '已停用', cancel: '取消', confirm: '确认' },
  phishingDetection: {
    control: {
      ariaLabel: '钓鱼智能体总开关',
      enableTitle: '确认开启钓鱼检测智能体？',
      enableDescription: '开启后，新邮件会按当前准入和风险策略处理。',
      disableTitle: '确认关闭钓鱼检测智能体？',
      disableDescription: '关闭后不再处理新邮件，在途任务继续完成。',
      gateTitle: '需要先配置准入规则',
      gateDescription: '至少启用一条准入规则后才能开启。',
      goToConfig: '前往配置',
      readOnly: '当前账号仅可查看',
      updateSuccess: '状态已更新',
      updateError: '状态更新失败',
    },
  },
};

function renderControl(onGoToConfig = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <NextIntlClientProvider locale="zh" messages={messages}>
      <QueryClientProvider client={client}>
        <PhishingAgentHeaderActions onGoToConfig={onGoToConfig} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return onGoToConfig;
}

describe('phishing control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(putPhishingControl).mockResolvedValue({
      enabled: true,
      desired_state: 'enabled',
      runtime_state: 'running',
      revision: 2,
    });
  });

  it('blocks enable and sends the user to admission-rule creation without auto-enabling', async () => {
    vi.mocked(getPhishingControl).mockResolvedValue({
      enabled: false,
      desired_state: 'disabled',
      runtime_state: 'stopped',
      revision: 1,
    });
    vi.mocked(listAdmissionRules).mockResolvedValue([]);
    const onGoToConfig = renderControl();

    const toggle = await screen.findByRole('switch', { name: '钓鱼智能体总开关' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);

    expect(await screen.findByText('需要先配置准入规则')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '前往配置' }));
    expect(onGoToConfig).toHaveBeenCalledOnce();
    expect(putPhishingControl).not.toHaveBeenCalled();
  });

  it('requires confirmation before enabling when admission is ready', async () => {
    vi.mocked(getPhishingControl).mockResolvedValue({
      enabled: false,
      desired_state: 'disabled',
      runtime_state: 'stopped',
      revision: 7,
    });
    vi.mocked(listAdmissionRules).mockResolvedValue([{
      id: 1,
      name: '默认准入',
      enabled: true,
      directions: ['inbound'],
      require_url: true,
      sender_first_seen: true,
      require_qrcode: false,
    }]);
    renderControl();

    const toggle = await screen.findByRole('switch', { name: '钓鱼智能体总开关' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(await screen.findByText('确认开启钓鱼检测智能体？')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => expect(putPhishingControl).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, expected_revision: 7 }),
      expect.any(Function),
    ));
  });

  it('requires confirmation before disabling', async () => {
    vi.mocked(getPhishingControl).mockResolvedValue({
      enabled: true,
      desired_state: 'enabled',
      runtime_state: 'running',
      revision: 9,
    });
    vi.mocked(listAdmissionRules).mockResolvedValue([]);
    renderControl();

    const toggle = await screen.findByRole('switch', { name: '钓鱼智能体总开关' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(await screen.findByText('确认关闭钓鱼检测智能体？')).toBeInTheDocument();
  });
});
