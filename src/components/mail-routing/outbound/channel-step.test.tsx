import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { toast } from 'sonner';
import { ChannelStep } from './channel-step';
import type { OutboundProxyRow } from './outbound-types';

// 出站步骤二「投递通道」（Task 6 落地 + Task 13 接通真实后端 proxysvr-groups）。行为契约见
// .superpowers/sdd/2026-07-29-mail-routing-backend-plan/task-13-brief.md：列表徽章拼接
// 「名(IP/helo:值)」/失效代理红徽章、抽屉勾选↔排序表联动、↑↓边界禁用、HELO 一致性警告、
// 空选拦截、删除文案改为「被引用不可删」（后端 409 透传）。

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

const TENANT_ID = 1;

const PROXIES: OutboundProxyRow[] = [
  {
    id: '3001',
    name: '主出口-电信',
    proxyIp: '1.1.1.1',
    proxyPort: 6620,
    presendCode: 347,
    lid: 'lid-3001',
    licensePresent: false,
    license: '',
    useTls: false,
    egressIp: '132.148.32.1',
    heloHostname: 'mail.test.com',
    tlsMinVersion: '1.2',
    cipherProfile: 'default',
    status: 'enabled',
    probeStatus: 'normal',
    lastProbeTime: null,
  },
  {
    id: '3002',
    name: '备出口-联通',
    proxyIp: '1.1.1.2',
    proxyPort: 6620,
    presendCode: 347,
    lid: 'lid-3002',
    licensePresent: false,
    license: '',
    useTls: false,
    egressIp: '132.148.32.2',
    heloHostname: '',
    tlsMinVersion: '1.2',
    cipherProfile: 'default',
    status: 'enabled',
    probeStatus: 'normal',
    lastProbeTime: null,
  },
  {
    id: '3003',
    name: '高安全出口',
    proxyIp: '1.1.1.3',
    proxyPort: 6620,
    presendCode: 347,
    lid: 'lid-3003',
    licensePresent: false,
    license: '',
    useTls: true,
    egressIp: '132.148.32.3',
    heloHostname: 'mail.secure.com',
    tlsMinVersion: '1.3',
    cipherProfile: 'high',
    status: 'disabled',
    probeStatus: 'abnormal',
    lastProbeTime: null,
  },
];

interface GroupWireFixture {
  id: number;
  name: string;
  is_active: boolean;
  members: Array<{ endpoint_id: number; ord: number }>;
}

const GROUP_FIXTURES: GroupWireFixture[] = [
  { id: 4001, name: '测试通道', is_active: true, members: [{ endpoint_id: 3001, ord: 0 }, { endpoint_id: 3002, ord: 1 }] },
  { id: 4002, name: '高安全通道', is_active: true, members: [{ endpoint_id: 3003, ord: 0 }] },
];

function routeApi(fixtures: GroupWireFixture[] = GROUP_FIXTURES) {
  const state = fixtures.map((f) => ({ ...f, members: [...f.members] }));
  mockApiRequest.mockImplementation((url: string, opts?: { method?: string; body?: unknown }) => {
    const method = (opts?.method ?? 'GET').toUpperCase();
    if (method === 'GET' && url.startsWith('/proxysvr-groups?')) {
      return Promise.resolve({ items: state, total: state.length });
    }
    if (method === 'PUT' && /^\/proxysvr-groups\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      const idx = state.findIndex((c) => c.id === id);
      if (idx >= 0) state[idx] = { ...state[idx], ...(opts?.body as Partial<GroupWireFixture>) };
      return Promise.resolve(state[idx]);
    }
    if (method === 'POST' && url === '/proxysvr-groups') {
      const created = { id: 4999, ...(opts?.body as Partial<GroupWireFixture>) } as GroupWireFixture;
      state.push(created);
      return Promise.resolve(created);
    }
    if (method === 'DELETE' && /^\/proxysvr-groups\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      const idx = state.findIndex((c) => c.id === id);
      if (idx >= 0) state.splice(idx, 1);
      return Promise.resolve({});
    }
    return Promise.resolve({});
  });
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('ChannelStep', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    (toast.success as ReturnType<typeof vi.fn>).mockReset();
    (toast.error as ReturnType<typeof vi.fn>).mockReset();
    (toast.warning as ReturnType<typeof vi.fn>).mockReset();
    routeApi();
  });

  it('renders the 2 rows from the real proxysvr-groups API, badges formatted as name(ip/helo:value)', async () => {
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));
    expect(mockApiRequest).toHaveBeenCalledWith('/proxysvr-groups?page=1&page_size=100');

    const row1 = screen.getByTestId('mr-ob-channel-row-4001');
    expect(within(row1).getByText('主出口-电信(1.1.1.1/helo:mail.test.com)')).toBeInTheDocument();
    // p3002 has an empty heloHostname -> badge shows the literal "系统默认" fallback.
    expect(within(row1).getByText('备出口-联通(1.1.1.2/helo:系统默认)')).toBeInTheDocument();

    const row2 = screen.getByTestId('mr-ob-channel-row-4002');
    expect(within(row2).getByText('高安全出口(1.1.1.3/helo:mail.secure.com)')).toBeInTheDocument();
  });

  it('a stale proxy reference (deleted proxy) renders the red "代理已删除" outline badge', async () => {
    routeApi([{ id: 4003, name: '陈旧通道', is_active: true, members: [{ endpoint_id: 3001, ord: 0 }, { endpoint_id: 9999, ord: 1 }] }]);
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(1));

    const row = screen.getByTestId('mr-ob-channel-row-4003');
    expect(within(row).getByText('主出口-电信(1.1.1.1/helo:mail.test.com)')).toBeInTheDocument();
    expect(within(row).getByText('代理已删除')).toBeInTheDocument();
  });

  it('empty state shows the dedicated copy "暂无通道，建议先配置自定义通道"', async () => {
    routeApi([]);
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getByTestId('mr-ob-channel-empty')).toBeInTheDocument());
    expect(screen.getByText('暂无通道，建议先配置自定义通道')).toBeInTheDocument();
  });

  it('checking/unchecking a proxy in the drawer keeps the selected-priority table row count in sync', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-edit-4001'));
    await screen.findByTestId('mr-ob-channel-drawer');

    // c4001 starts with proxy_ids [3001, 3002] -> 2 selected rows.
    expect(screen.getAllByTestId(/^mr-ob-channel-selected-row-/)).toHaveLength(2);

    // Check the 3rd proxy (高安全出口) -> 3 selected rows, appended at the end.
    await user.click(screen.getByTestId('mr-ob-channel-proxy-check-3003'));
    const rowsAfterCheck = screen.getAllByTestId(/^mr-ob-channel-selected-row-/);
    expect(rowsAfterCheck).toHaveLength(3);
    expect(rowsAfterCheck[2]).toHaveAttribute('data-testid', 'mr-ob-channel-selected-row-3003');

    // Uncheck 备出口-联通 (3002) -> drops back to 2 rows, order preserved for the rest.
    await user.click(screen.getByTestId('mr-ob-channel-proxy-check-3002'));
    const rowsAfterUncheck = screen.getAllByTestId(/^mr-ob-channel-selected-row-/);
    expect(rowsAfterUncheck).toHaveLength(2);
    expect(rowsAfterUncheck.map((r) => r.getAttribute('data-testid'))).toEqual([
      'mr-ob-channel-selected-row-3001',
      'mr-ob-channel-selected-row-3003',
    ]);

    // Removing via the inline trash button in the sorting table also unchecks the checkbox.
    await user.click(screen.getByTestId('mr-ob-channel-remove-3003'));
    expect(screen.getAllByTestId(/^mr-ob-channel-selected-row-/)).toHaveLength(1);
    expect(screen.getByTestId('mr-ob-channel-proxy-check-3003')).not.toBeChecked();
  });

  it('the up/down priority buttons are disabled at the list boundaries and swap order otherwise', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-edit-4001'));
    await screen.findByTestId('mr-ob-channel-drawer');

    // c4001: [3001, 3002] -> row 1 (3001) up disabled, row 2 (3002) down disabled.
    expect(screen.getByTestId('mr-ob-channel-move-up-3001')).toBeDisabled();
    expect(screen.getByTestId('mr-ob-channel-move-down-3001')).not.toBeDisabled();
    expect(screen.getByTestId('mr-ob-channel-move-up-3002')).not.toBeDisabled();
    expect(screen.getByTestId('mr-ob-channel-move-down-3002')).toBeDisabled();

    await user.click(screen.getByTestId('mr-ob-channel-move-down-3001'));
    const rows = screen.getAllByTestId(/^mr-ob-channel-selected-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'mr-ob-channel-selected-row-3002',
      'mr-ob-channel-selected-row-3001',
    ]);
    // Boundary buttons flip along with the new order.
    expect(screen.getByTestId('mr-ob-channel-move-up-3002')).toBeDisabled();
    expect(screen.getByTestId('mr-ob-channel-move-down-3001')).toBeDisabled();
  });

  it('shows the verbatim HELO inconsistency warning when selected proxies declare >1 distinct HELO, and it disappears once removed', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-edit-4001'));
    await screen.findByTestId('mr-ob-channel-drawer');

    // c4001 = [3001 (mail.test.com), 3002 (empty -> 系统默认)] -> inconsistent.
    expect(screen.getByTestId('mr-ob-channel-helo-warning')).toHaveTextContent(
      '通道内代理 HELO 声明不一致（mail.test.com vs 系统默认），可能导致对端信誉评估分散，建议统一。',
    );

    // Uncheck 备出口-联通 -> only 3001 left -> warning disappears.
    await user.click(screen.getByTestId('mr-ob-channel-proxy-check-3002'));
    expect(screen.queryByTestId('mr-ob-channel-helo-warning')).not.toBeInTheDocument();
  });

  it('saving with zero selected proxies is blocked with the exact validation copy', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-create'));
    await screen.findByTestId('mr-ob-channel-drawer');

    await user.type(screen.getByTestId('mr-ob-channel-name-input'), '空选通道');
    await user.click(screen.getByTestId('mr-ob-channel-save'));

    expect(screen.getByTestId('mr-ob-channel-proxies-error')).toHaveTextContent('请至少选择一个代理 IP');
    expect(mockApiRequest).not.toHaveBeenCalledWith('/proxysvr-groups', expect.objectContaining({ method: 'POST' }));
  });

  it('empty channel name is blocked with "请输入通道名称"', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-create'));
    await screen.findByTestId('mr-ob-channel-drawer');
    await user.click(screen.getByTestId('mr-ob-channel-proxy-check-3001'));
    await user.click(screen.getByTestId('mr-ob-channel-save'));

    expect(screen.getByTestId('mr-ob-channel-name-error')).toHaveTextContent('请输入通道名称');
  });

  it('saving a valid new channel posts members ordered by selection and shows the created toast', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-create'));
    await screen.findByTestId('mr-ob-channel-drawer');
    await user.type(screen.getByTestId('mr-ob-channel-name-input'), '新通道');
    await user.click(screen.getByTestId('mr-ob-channel-proxy-check-3001'));
    await user.click(screen.getByTestId('mr-ob-channel-save'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('投递通道已添加'));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(3));
    expect(mockApiRequest).toHaveBeenCalledWith(
      '/proxysvr-groups',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ name: '新通道', is_active: true, members: [{ endpoint_id: 3001, ord: 0 }] }),
      }),
    );
  });

  it('saving with an inconsistent HELO set additionally fires the save-time warning toast verbatim', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-edit-4001'));
    await screen.findByTestId('mr-ob-channel-drawer');
    await user.click(screen.getByTestId('mr-ob-channel-save'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('投递通道已更新'));
    expect(toast.warning).toHaveBeenCalledWith(
      '当前通道内代理 IP 的 HELO 声明不一致（mail.test.com vs 系统默认），建议统一以避免对端信誉评估分散',
    );
  });

  it('delete confirmation shows the "被引用不可删" copy verbatim and removes the row on success', async () => {
    const user = userEvent.setup();
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-delete-4001'));
    const dialog = await screen.findByTestId('mr-ob-channel-delete-dialog');
    expect(within(dialog).getByText('删除投递通道「测试通道」？')).toBeInTheDocument();
    expect(
      within(dialog).getByText('若该通道正被投递规则引用，删除将被拒绝；请先解除引用后再删除。'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByTestId('mr-ob-channel-delete-confirm'));
    await waitFor(() => expect(screen.queryByTestId('mr-ob-channel-row-4001')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('投递通道已删除');
  });

  it('delete blocked by the backend (409, referenced) shows the server error message via toast and keeps the row', async () => {
    const user = userEvent.setup();
    class ApiError extends Error {}
    mockApiRequest.mockImplementation((url: string, opts?: { method?: string }) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      if (method === 'GET' && url.startsWith('/proxysvr-groups?')) return Promise.resolve({ items: GROUP_FIXTURES, total: GROUP_FIXTURES.length });
      if (method === 'DELETE' && url === '/proxysvr-groups/4001') {
        return Promise.reject(new ApiError('proxysvr group is referenced by one or more outbound route rules and cannot be deleted; remove those rules first'));
      }
      return Promise.resolve({});
    });
    render(wrap(<ChannelStep tenantId={TENANT_ID} proxies={PROXIES} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-ob-channel-row-/)).toHaveLength(2));

    await user.click(screen.getByTestId('mr-ob-channel-delete-4001'));
    const dialog = await screen.findByTestId('mr-ob-channel-delete-dialog');
    await user.click(within(dialog).getByTestId('mr-ob-channel-delete-confirm'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'proxysvr group is referenced by one or more outbound route rules and cannot be deleted; remove those rules first',
      ),
    );
    expect(screen.getByTestId('mr-ob-channel-row-4001')).toBeInTheDocument();
  });
});
