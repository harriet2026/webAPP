import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ReceivingTab } from './receiving-tab';
import type { TenantDomain, TenantDomainNexthop } from '@/types/tenant';

// 收信域 Tab 重构（Task 3，design/implement/plan/2026-07-28-mail-routing-html-spec-
// alignment-plan.md）—— 卡片+nexthop 子表 → demo 扁平表格。行为契约见 task-3-brief.md。

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TENANT_ID = 42;

interface Fixture {
  id: number;
  domain: string;
  hosts: string[];
  port: number;
  probeStatuses: Array<'normal' | 'abnormal' | 'unchecked'>;
  lastProbe: string | null;
}

// Mirrors the demo/Task-2-mock fixture (5 rows, corp.example.com = partial
// 2/4) so the "5 行默认渲染" / "部分异常（2/4）" assertions match html_spec.
const FIXTURES: Fixture[] = [
  { id: 9001, domain: 'example.cn', hosts: ['192.168.1.10', '192.168.1.11'], port: 25, probeStatuses: ['normal', 'normal'], lastProbe: '2026-06-18T09:12:03Z' },
  { id: 9002, domain: 'mail.example.cn', hosts: ['192.168.1.20'], port: 25, probeStatuses: ['normal'], lastProbe: '2026-06-18T08:55:41Z' },
  { id: 9003, domain: 'corp.example.com', hosts: ['10.0.0.5', '10.0.0.6', '10.0.0.7', '10.0.0.8'], port: 587, probeStatuses: ['abnormal', 'abnormal', 'normal', 'normal'], lastProbe: '2026-06-18T07:30:10Z' },
  { id: 9004, domain: 'legacy.example.net', hosts: ['172.16.0.30'], port: 25, probeStatuses: ['abnormal'], lastProbe: '2026-06-17T22:01:55Z' },
  { id: 9005, domain: 'newdomain.cn', hosts: ['192.168.2.1'], port: 25, probeStatuses: ['unchecked'], lastProbe: null },
];

function toDomain(f: Fixture): TenantDomain {
  return {
    id: f.id,
    tenant_id: TENANT_ID,
    domain: f.domain,
    next_hop_type: 'domain',
    next_hop_host: '',
    next_hop_port: 0,
    is_active: true,
    mail_system_type: 'generic',
    verify_status: 'verified',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  };
}

function toNexthops(f: Fixture): TenantDomainNexthop[] {
  return f.hosts.map((host, idx) => ({
    id: f.id * 100 + idx + 1,
    tenant_domain_id: f.id,
    host,
    port: f.port,
    next_hop_type: /^\d+\.\d+\.\d+\.\d+$/.test(host) ? 'ip' : 'domain',
    priority: idx,
    is_active: true,
    probe_status: f.probeStatuses[idx],
    last_probe_time: f.lastProbe,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }));
}

function routeApi(fixtures: Fixture[] = FIXTURES) {
  mockApiRequest.mockImplementation((url: string, opts?: { method?: string; body?: unknown }) => {
    const method = (opts?.method ?? 'GET').toUpperCase();

    if (method === 'GET' && url === `/tenants/${TENANT_ID}/domains`) {
      return Promise.resolve({ items: fixtures.map(toDomain) });
    }
    const nhMatch = url.match(new RegExp(`^/tenants/${TENANT_ID}/domains/(\\d+)/nexthops$`));
    if (method === 'GET' && nhMatch) {
      const f = fixtures.find((x) => x.id === Number(nhMatch[1]));
      return Promise.resolve({ items: f ? toNexthops(f) : [] });
    }
    if (method === 'POST' && url === `/tenants/${TENANT_ID}/domains`) {
      const body = (opts?.body ?? {}) as { domain?: string };
      return Promise.resolve({ ...toDomain(fixtures[0]), id: 9999, domain: body.domain ?? '' });
    }
    if (method === 'POST' && /\/nexthops$/.test(url)) {
      return Promise.resolve({});
    }
    if (method === 'PUT' && /\/nexthops\/\d+$/.test(url)) {
      return Promise.resolve({});
    }
    if (method === 'DELETE' && /\/nexthops\/\d+$/.test(url)) {
      return Promise.resolve({});
    }
    if (method === 'POST' && /\/probe$/.test(url)) {
      return Promise.resolve({ probe_status: 'normal', last_probe_time: '2026-06-19T00:00:00Z', nexthops: [] });
    }
    if (method === 'DELETE' && /^\/tenant-domains\/\d+$/.test(url)) {
      return Promise.resolve({});
    }
    if (method === 'PUT' && /^\/tenant-domains\/\d+$/.test(url)) {
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
        <TooltipProvider>{ui}</TooltipProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('ReceivingTab', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    window.localStorage.clear();
    routeApi();
  });

  it('renders 5 rows by default, with the partial badge showing (2/4)', async () => {
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    const corpRow = screen.getByTestId('mr-recv-row-9003');
    expect(within(corpRow).getByText('部分异常（2/4）')).toBeInTheDocument();
    expect(within(corpRow).getByText('10.0.0.5、10.0.0.6、10.0.0.7、10.0.0.8')).toBeInTheDocument();
    expect(within(corpRow).getByText('587')).toBeInTheDocument();

    // Other three probe states render too.
    expect(within(screen.getByTestId('mr-recv-row-9001')).getByText('正常')).toBeInTheDocument();
    expect(within(screen.getByTestId('mr-recv-row-9004')).getByText('异常')).toBeInTheDocument();
    expect(within(screen.getByTestId('mr-recv-row-9005')).getByText('未检测')).toBeInTheDocument();
  });

  it('filters to 1 row when searching "legacy"', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.type(screen.getByTestId('mr-recv-search'), 'legacy');
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(1));
    expect(screen.getByTestId('mr-recv-row-9004')).toBeInTheDocument();
  });

  it('blocks saving an empty domain name with an immediate red error', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.click(screen.getByTestId('mr-recv-create'));
    await screen.findByTestId('mr-recv-drawer');

    // No touched-suppression: the required errors show immediately on open.
    expect(screen.getByTestId('mr-recv-domain-error')).toHaveTextContent('请输入收信域名');
    expect(screen.getByTestId('mr-recv-hosts-error')).toHaveTextContent('请至少添加一个目的地址');

    await user.click(screen.getByTestId('mr-recv-save'));
    expect(mockApiRequest).not.toHaveBeenCalledWith(
      `/tenants/${TENANT_ID}/domains`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows the TagInput invalid-value red hint and does not commit the tag', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.click(screen.getByTestId('mr-recv-create'));
    await screen.findByTestId('mr-recv-drawer');

    await user.type(screen.getByTestId('mr-recv-tag-input'), 'not a host{Enter}');
    expect(screen.getByTestId('mr-recv-tag-error')).toHaveTextContent('需为合法 IP 或域名');
    // Still required — no tag was committed.
    expect(screen.getByTestId('mr-recv-hosts-error')).toHaveTextContent('请至少添加一个目的地址');
  });

  it('delete dialog title includes the domain name', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.click(screen.getByTestId('mr-recv-delete-9004'));
    const dialog = await screen.findByTestId('mr-recv-delete-dialog');
    expect(within(dialog).getByText('删除收信域「legacy.example.net」？')).toBeInTheDocument();
    expect(within(dialog).getByTestId('mr-recv-delete-confirm')).toHaveTextContent('强制删除');
  });

  it('disables the connectivity test button with a hint when mock mode is off', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.click(screen.getByTestId('mr-recv-edit-9001'));
    await screen.findByTestId('mr-recv-drawer');
    const btn = screen.getByTestId('mr-recv-test-btn');
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toBeTruthy();
  });

  it('edit drawer prefills domain name / hosts / port from the row', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.click(screen.getByTestId('mr-recv-edit-9001'));
    await screen.findByTestId('mr-recv-drawer');
    expect(screen.getByTestId('mr-recv-domain-input')).toHaveValue('example.cn');
    expect(screen.getByTestId('mr-recv-tag-tag-192.168.1.10')).toBeInTheDocument();
    expect(screen.getByTestId('mr-recv-tag-tag-192.168.1.11')).toBeInTheDocument();
    expect(screen.getByTestId('mr-recv-port-input')).toHaveValue(25);
    // No validation errors — the row's own name/hosts/port are all valid.
    expect(screen.queryByTestId('mr-recv-domain-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mr-recv-hosts-error')).not.toBeInTheDocument();
  });

  // Task 9 (progress.md ledger, deferred from Task 3): the rename branch in
  // updateMutation ("if (payload.domainName !== domain.domain) await
  // updateTenantDomain(...)") had no test/e2e coverage — only the no-op path
  // (save without changing the name) was exercised. Cover the PUT call it
  // fires when the domain name actually changes.
  it('renaming a domain in the edit drawer calls updateTenantDomain (PUT /tenant-domains/:id)', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.click(screen.getByTestId('mr-recv-edit-9001'));
    await screen.findByTestId('mr-recv-drawer');
    const domainInput = screen.getByTestId('mr-recv-domain-input');
    await user.clear(domainInput);
    await user.type(domainInput, 'renamed.example.cn');
    await user.click(screen.getByTestId('mr-recv-save'));

    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith(
        '/tenant-domains/9001',
        expect.objectContaining({ method: 'PUT', body: { domain: 'renamed.example.cn' } }),
      ),
    );
  });

  it('saving without changing the domain name does not call updateTenantDomain', async () => {
    const user = userEvent.setup();
    render(wrap(<ReceivingTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-recv-row-/)).toHaveLength(5));

    await user.click(screen.getByTestId('mr-recv-edit-9001'));
    await screen.findByTestId('mr-recv-drawer');
    await user.click(screen.getByTestId('mr-recv-save'));

    // Drawer closes on save success — proof the mutation resolved.
    await waitFor(() => expect(screen.queryByTestId('mr-recv-drawer')).not.toBeInTheDocument());
    expect(mockApiRequest).not.toHaveBeenCalledWith('/tenant-domains/9001', expect.objectContaining({ method: 'PUT' }));
  });
});
