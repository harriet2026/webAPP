import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { StepBar } from './step-bar';
import { ProxyStep } from './proxy-step';

// 出站步骤条 + 步骤一「代理 IP」（Task 5 落地 + Task 13 接通真实后端 proxysvr-endpoints）。
// 行为契约见 .superpowers/sdd/2026-07-29-mail-routing-backend-plan/task-13-brief.md：StepBar
// 锁定态、ProxyStep 9 列表格、rDNS 警告、HELO=IP 校验、真实 TCP/TLS 探测。
// fixture 字段对齐 internal/models/proxysvr.go::ProxysvrEndpoint。

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

const TENANT_ID = 1;

interface ProxyFixture {
  id: number;
  name: string;
  host: string;
  port: number;
  presend_code: number;
  lid: string;
  license_present: boolean;
  use_tls: boolean;
  is_active: boolean;
  egress_ip: string;
  helo_hostname: string;
  tls_min_version: string;
  cipher_profile: string;
  probe_status?: string | null;
  last_probe_time: string | null;
}

const FIXTURES: ProxyFixture[] = [
  {
    id: 3001,
    name: '主出口-电信',
    host: '1.1.1.1',
    port: 6620,
    presend_code: 347,
    lid: 'lid-3001',
    license_present: false,
    use_tls: false,
    is_active: true,
    egress_ip: '132.148.32.1',
    helo_hostname: 'mail.test.com',
    tls_min_version: '1.2',
    cipher_profile: 'default',
    probe_status: 'normal',
    last_probe_time: '2026-06-18 09:10:00',
  },
  {
    id: 3002,
    name: '备出口-联通',
    host: '1.1.1.2',
    port: 6620,
    presend_code: 347,
    lid: 'lid-3002',
    license_present: false,
    use_tls: false,
    is_active: true,
    egress_ip: '132.148.32.2',
    helo_hostname: '',
    tls_min_version: '1.2',
    cipher_profile: 'default',
    probe_status: 'normal',
    last_probe_time: '2026-06-18 09:10:05',
  },
  {
    id: 3003,
    name: '高安全出口',
    host: '1.1.1.3',
    port: 6620,
    presend_code: 347,
    lid: 'lid-3003',
    license_present: true,
    use_tls: true,
    is_active: false,
    egress_ip: '132.148.32.3',
    helo_hostname: 'mail.secure.com',
    tls_min_version: '1.3',
    cipher_profile: 'high',
    probe_status: 'abnormal',
    last_probe_time: '2026-06-16 14:00:00',
  },
];

function routeApi(fixtures: ProxyFixture[] = FIXTURES) {
  const state = fixtures.map((f) => ({ ...f }));
  mockApiRequest.mockImplementation((url: string, opts?: { method?: string; body?: unknown }) => {
    const method = (opts?.method ?? 'GET').toUpperCase();
    if (method === 'GET' && url.startsWith('/proxysvr-endpoints?')) {
      return Promise.resolve({ items: state, total: state.length });
    }
    if (method === 'PUT' && /^\/proxysvr-endpoints\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      const idx = state.findIndex((p) => p.id === id);
      if (idx >= 0) state[idx] = { ...state[idx], ...(opts?.body as Partial<ProxyFixture>) };
      return Promise.resolve(state[idx]);
    }
    if (method === 'POST' && url === '/proxysvr-endpoints') {
      const created = {
        id: 3999,
        probe_status: 'unchecked',
        last_probe_time: null,
        license_present: false,
        ...(opts?.body as Partial<ProxyFixture>),
      } as ProxyFixture;
      state.push(created);
      return Promise.resolve(created);
    }
    if (method === 'DELETE' && /^\/proxysvr-endpoints\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      const idx = state.findIndex((p) => p.id === id);
      if (idx >= 0) state.splice(idx, 1);
      return Promise.resolve({});
    }
    if (method === 'POST' && /^\/proxysvr-endpoints\/\d+\/probe$/.test(url)) {
      const id = Number(url.split('/')[2]);
      const idx = state.findIndex((p) => p.id === id);
      if (idx >= 0) {
        state[idx] = { ...state[idx], probe_status: 'normal', last_probe_time: 'now' };
      }
      return Promise.resolve({ probe_status: 'normal', last_probe_time: 'now' });
    }
    return Promise.resolve({});
  });
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
        <TooltipProvider>{ui}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('StepBar', () => {
  it('keeps all setup sections available because routes can use the default channel', () => {
    render(wrap(<StepBar step={1} onStepChange={() => {}} />));
    expect(screen.getByTestId('mr-ob-step-1')).not.toBeDisabled();
    expect(screen.getByTestId('mr-ob-step-2')).not.toBeDisabled();
    expect(screen.getByTestId('mr-ob-step-2')).not.toHaveAttribute('title');
    expect(screen.getByTestId('mr-ob-step-3')).not.toBeDisabled();
    expect(screen.getByTestId('mr-ob-step-3')).not.toHaveAttribute('title');
  });

  it('calls onStepChange when any setup section is clicked', async () => {
    const user = userEvent.setup();
    const onStepChange = vi.fn();
    render(wrap(<StepBar step={1} onStepChange={onStepChange} />));
    await user.click(screen.getByTestId('mr-ob-step-2'));
    expect(onStepChange).toHaveBeenCalledWith(2);
    await user.click(screen.getByTestId('mr-ob-step-3'));
    expect(onStepChange).toHaveBeenCalledWith(3);
  });
});

describe('ProxyStep', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    (toast.success as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();
    routeApi();
  });

  it('renders the 3 rows from the real proxysvr-endpoints API (9-column table)', async () => {
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));
    expect(screen.getByTestId('mr-ob-proxy-row-3001')).toBeInTheDocument();
    expect(screen.getByTestId('mr-ob-proxy-row-3002')).toBeInTheDocument();
    expect(screen.getByTestId('mr-ob-proxy-row-3003')).toBeInTheDocument();
    expect(mockApiRequest).toHaveBeenCalledWith('/proxysvr-endpoints?page=1&page_size=100');
    const headerCells = within(screen.getByTestId('mr-ob-proxy-table')).getAllByRole('columnheader');
    expect(headerCells).toHaveLength(9);
  });

  it('renders a legacy endpoint without probe_status as unchecked', async () => {
    routeApi([{ ...FIXTURES[0], probe_status: undefined }]);
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    expect(await screen.findByTestId('mr-ob-proxy-status-3001')).toHaveTextContent('未检测');
  });

  it('filter popover: setting the 代理 IP field narrows the rows and updates the count badge', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-filter'));
    const badge = () => screen.getByTestId('mr-ob-proxy-filter').querySelector('.bg-blue-600');
    expect(badge()).toBeFalsy();

    await user.type(screen.getByTestId('mr-ob-proxy-filter-proxy-ip'), '1.1.1.2');
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(1));
    expect(screen.getByTestId('mr-ob-proxy-row-3002')).toBeInTheDocument();
    expect(badge()).toHaveTextContent('1');
  });

  it('port out of 1-65535 shows the exact demo validation text "端口范围 1-65535"', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-edit-3001'));
    await screen.findByTestId('mr-ob-proxy-drawer');

    const portInput = screen.getByTestId('mr-ob-proxy-port-input');
    await user.clear(portInput);
    await user.type(portInput, '70000');
    expect(screen.getByTestId('mr-ob-proxy-port-error')).toHaveTextContent('端口范围 1-65535');
  });

  it('lid (账户标识) is required — blank shows an inline error and blocks save', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-create'));
    await screen.findByTestId('mr-ob-proxy-drawer');
    await user.type(screen.getByTestId('mr-ob-proxy-name-input'), '新代理');
    await user.type(screen.getByTestId('mr-ob-proxy-ip-input'), '2.2.2.2');
    expect(screen.getByTestId('mr-ob-proxy-lid-error')).toHaveTextContent('请输入账户标识');
    await user.click(screen.getByTestId('mr-ob-proxy-save'));
    expect(mockApiRequest).not.toHaveBeenCalledWith('/proxysvr-endpoints', expect.objectContaining({ method: 'POST' }));
  });

  it('p3002 with an empty HELO shows the gray "系统默认" text', async () => {
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));
    expect(within(screen.getByTestId('mr-ob-proxy-row-3002')).getByText('系统默认')).toBeInTheDocument();
  });

  it('rDNS warning shows when HELO != mock PTR host, and disappears once HELO matches it', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-edit-3001'));
    await screen.findByTestId('mr-ob-proxy-drawer');

    expect(screen.getByTestId('mr-ob-proxy-rdns-warning')).toHaveTextContent(
      '出口 IP 132.148.32.1 的反向解析为 ptr-isp.example.com，与 HELO 声明 mail.test.com 不一致，可能被对端拒收。',
    );

    const heloInput = screen.getByTestId('mr-ob-proxy-helo-input');
    await user.clear(heloInput);
    await user.type(heloInput, 'ptr-isp.example.com');
    expect(screen.queryByTestId('mr-ob-proxy-rdns-warning')).not.toBeInTheDocument();
  });

  it('HELO = IP address shows the exact red validation text and suppresses the rDNS warning', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-edit-3001'));
    await screen.findByTestId('mr-ob-proxy-drawer');

    const heloInput = screen.getByTestId('mr-ob-proxy-helo-input');
    await user.clear(heloInput);
    await user.type(heloInput, '132.148.32.1');

    expect(screen.getByTestId('mr-ob-proxy-helo-error')).toHaveTextContent(
      'HELO 主机名需为合法域名格式，不能为 IP 地址',
    );
    expect(screen.queryByTestId('mr-ob-proxy-rdns-warning')).not.toBeInTheDocument();
  });

  it('delete confirmation shows the channel auto-evict copy verbatim and removes the row', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-delete-3001'));
    const dialog = await screen.findByTestId('mr-ob-proxy-delete-dialog');
    expect(within(dialog).getByText('删除代理 IP「主出口-电信」？')).toBeInTheDocument();
    expect(
      within(dialog).getByText('若该代理属于某投递通道，通道将自动剔除该代理，仅由正常代理负载。'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByTestId('mr-ob-proxy-delete-confirm'));
    await waitFor(() => expect(screen.queryByTestId('mr-ob-proxy-row-3001')).not.toBeInTheDocument());
    expect(mockApiRequest).toHaveBeenCalledWith('/proxysvr-endpoints/3001', { method: 'DELETE' });
  });

  it('inline 探测 calls the real probe endpoint and shows the completion toast once it resolves', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-probe-3001'));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith('/proxysvr-endpoints/3001/probe', { method: 'POST' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('探测完成：TCP 连通 + SMTP HELO 握手'));
  });

  it('saving with HELO equal to the system default shows the dedicated toast', async () => {
    const user = userEvent.setup();
    render(wrap(<ProxyStep tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-proxy-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-ob-proxy-edit-3001'));
    await screen.findByTestId('mr-ob-proxy-drawer');

    const heloInput = screen.getByTestId('mr-ob-proxy-helo-input');
    await user.clear(heloInput);
    await user.type(heloInput, 'mail.gateway.local');
    await user.click(screen.getByTestId('mr-ob-proxy-save'));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('HELO 与系统默认一致，可留空以简化配置'),
    );
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/proxysvr-endpoints/3001',
      expect.objectContaining({ method: 'PUT', body: expect.objectContaining({ lid: 'lid-3001', helo_hostname: 'mail.gateway.local' }) }),
    );
  });
});
