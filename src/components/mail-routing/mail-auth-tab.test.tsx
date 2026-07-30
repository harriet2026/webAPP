import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MailAuthTab } from './mail-auth-tab';
import type { MailAuthConfig } from '@/lib/api/mail-auth';

// 发信认证 Tab TLS 三档 + 域名多选升级（Task 8，design/implement/plan/2026-07-28-mail-
// routing-html-spec-alignment-plan.md）—— 行为契约见 task-8-brief.md。fixture 抄
// src/lib/mock/mail-routing-fixtures.ts::mrMockAuthConfigs（7001 ldap off / 7002 smtp
// force / 7003 imap prefer+nocert）。

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TENANT_ID = 42;

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const VERIFIED_DOMAINS = [
  { id: 9001, domain: 'example.cn', verify_status: 'verified', is_active: true },
  { id: 9002, domain: 'mail.example.cn', verify_status: 'verified', is_active: true },
  { id: 9003, domain: 'corp.example.com', verify_status: 'verified', is_active: true },
  { id: 9004, domain: 'legacy.example.net', verify_status: 'verified', is_active: true },
  { id: 9005, domain: 'newdomain.cn', verify_status: 'verified', is_active: true },
];

const FIXTURES: MailAuthConfig[] = [
  {
    id: 7001, tenant_id: 1, priority: 100, domain_scope: { all: true }, protocol: 'ldap',
    server_host: 'ldap.example.cn', server_port: 389, ssl_enabled: false, auth_timeout: 20,
    protocol_config: { starttls: false, skip_verify: false, bind_dn_template: 'uid=%s,ou=users,dc=example,dc=cn' },
    scenes: ['userspace'], is_active: true, created_at: '2026-06-18 09:00:00', updated_at: '2026-06-18 09:00:00',
  },
  {
    id: 7002, tenant_id: 1, priority: 150, domain_scope: { domains: ['example.cn'] }, protocol: 'smtp',
    server_host: 'smtp.example.cn', server_port: 465, ssl_enabled: true, auth_timeout: 30,
    protocol_config: { starttls: false, auth_mech: 'PLAIN', skip_verify: false },
    scenes: ['smtpsend'], is_active: true, created_at: '2026-06-17 16:30:00', updated_at: '2026-06-17 16:30:00',
  },
  {
    id: 7003, tenant_id: 1, priority: 120, domain_scope: { domains: ['mail.example.cn'] }, protocol: 'imap',
    server_host: 'imap.example.cn', server_port: 993, ssl_enabled: false, auth_timeout: 25,
    protocol_config: { starttls: true, skip_verify: true },
    scenes: ['mailsync'], is_active: true, created_at: '2026-06-16 10:15:00', updated_at: '2026-06-16 10:15:00',
  },
];

function routeApi(fixtures: MailAuthConfig[] = FIXTURES) {
  mockApiRequest.mockImplementation((url: string, opts?: { method?: string; body?: unknown }) => {
    const method = (opts?.method ?? 'GET').toUpperCase();
    if (method === 'GET' && url.startsWith('/mail-auth-configs')) {
      return Promise.resolve({ items: fixtures, total: fixtures.length, page: 1, page_size: 100 });
    }
    if (method === 'GET' && url === `/tenants/${TENANT_ID}/domains`) {
      return Promise.resolve({ items: VERIFIED_DOMAINS });
    }
    if (method === 'POST' && url === '/mail-auth-configs') {
      return Promise.resolve({ ...fixtures[0], id: 9999, ...(opts?.body as object) });
    }
    if (method === 'PUT' && /^\/mail-auth-configs\/\d+$/.test(url)) {
      return Promise.resolve({});
    }
    if (method === 'DELETE' && /^\/mail-auth-configs\/\d+$/.test(url)) {
      return Promise.resolve({});
    }
    if (method === 'POST' && url === '/mail-auth-configs/test') {
      return Promise.resolve({ success: true, message: '连接成功', latency_ms: 42 });
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

describe('MailAuthTab', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    routeApi();
  });

  it('renders 3 rows with the exact TLS/cert badge combinations (7001 none / 7002 force+verify / 7003 prefer+noVerify)', async () => {
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    const row7001 = screen.getByTestId('mr-auth-row-7001');
    expect(within(row7001).queryByText('强制 TLS')).not.toBeInTheDocument();
    expect(within(row7001).queryByText('优先 TLS')).not.toBeInTheDocument();
    expect(within(row7001).queryByText('校验证书')).not.toBeInTheDocument();
    expect(within(row7001).queryByText('不校验证书')).not.toBeInTheDocument();
    expect(within(row7001).getByText('LDAP')).toBeInTheDocument();

    const row7002 = screen.getByTestId('mr-auth-row-7002');
    expect(within(row7002).getByText('强制 TLS')).toBeInTheDocument();
    expect(within(row7002).getByText('校验证书')).toBeInTheDocument();

    const row7003 = screen.getByTestId('mr-auth-row-7003');
    expect(within(row7003).getByText('优先 TLS')).toBeInTheDocument();
    expect(within(row7003).getByText('不校验证书')).toBeInTheDocument();
  });

  it('shows the priority column value (DEV-2 deviation from demo)', async () => {
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));
    expect(within(screen.getByTestId('mr-auth-row-7002')).getByText('150')).toBeInTheDocument();
  });

  it('switching the protocol select auto-fills the default port for the current TLS mode', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-create'));
    await screen.findByTestId('mr-auth-drawer');

    // New-config default: LDAP + prefer TLS → port 636.
    expect(screen.getByTestId('mr-auth-port-input')).toHaveValue(636);

    await user.click(screen.getByTestId('mr-auth-protocol-select'));
    await user.click(await screen.findByRole('option', { name: 'IMAP' }));
    // IMAP + prefer → ssl port 993.
    expect(screen.getByTestId('mr-auth-port-input')).toHaveValue(993);
  });

  it('switching TLS mode to off resets the port to standard, disables cert verify, and shows the plaintext warning', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-create'));
    await screen.findByTestId('mr-auth-drawer');

    expect(screen.getByTestId('mr-auth-verify-cert-checkbox')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('mr-auth-warn-plaintext')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mr-auth-tls-mode-select'));
    await user.click(await screen.findByRole('option', { name: '关闭' }));

    // LDAP + off → standard port 389.
    expect(screen.getByTestId('mr-auth-port-input')).toHaveValue(389);
    expect(screen.getByTestId('mr-auth-verify-cert-checkbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('mr-auth-warn-plaintext')).toHaveTextContent(
      '未启用传输加密：认证凭据将以明文传输，建议仅在受信任的内网环境使用。',
    );
  });

  it('the domain picker locks specific domains when "All" is checked, and vice versa', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-create'));
    await screen.findByTestId('mr-auth-drawer');

    await user.click(screen.getByTestId('mr-auth-domain-trigger'));
    await screen.findByTestId('mr-auth-domain-popover');
    await waitFor(() => expect(screen.getByTestId('mr-auth-domain-option-example.cn')).not.toHaveAttribute('aria-disabled', 'true'));

    await user.click(screen.getByTestId('mr-auth-domain-option-all'));
    // Specific domain checkboxes are now locked (disabled).
    expect(screen.getByTestId('mr-auth-domain-option-example.cn')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('mr-auth-domain-badge-all')).toBeInTheDocument();

    // Unchecking All unlocks the specific domain options again.
    await user.click(screen.getByTestId('mr-auth-domain-option-all'));
    expect(screen.getByTestId('mr-auth-domain-option-example.cn')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('mr-auth-domain-badge-all')).not.toBeInTheDocument();
  });

  it('shows the scene-conflict red text when the draft (All domains + userspace) overlaps an existing config (7001)', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-create'));
    await screen.findByTestId('mr-auth-drawer');

    await user.click(screen.getByTestId('mr-auth-domain-trigger'));
    await screen.findByTestId('mr-auth-domain-popover');
    await user.click(screen.getByTestId('mr-auth-domain-option-all'));

    await user.click(screen.getByTestId('mr-auth-scene-userspace'));

    expect(screen.getByTestId('mr-auth-conflict-error')).toHaveTextContent(
      '与已有配置（LDAP）在相同域名+场景下冲突，同一场景仅允许一条生效配置。',
    );

    // Save is blocked while the conflict stands.
    await user.click(screen.getByTestId('mr-auth-save'));
    expect(mockApiRequest).not.toHaveBeenCalledWith('/mail-auth-configs', expect.objectContaining({ method: 'POST' }));
  });

  it('blocks saving a fresh create with the three required-field red errors visible immediately', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-create'));
    await screen.findByTestId('mr-auth-drawer');

    expect(screen.getByTestId('mr-auth-domain-error')).toHaveTextContent('请选择适用域名');
    expect(screen.getByTestId('mr-auth-host-error')).toHaveTextContent('请输入认证服务器地址');
    expect(screen.getByTestId('mr-auth-scenes-error')).toHaveTextContent('请至少选择一个生效场景');
  });

  it('delete confirm dialog uses the static title (no dynamic name)', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-delete-7001'));
    const dialog = await screen.findByTestId('mr-auth-delete-dialog');
    expect(within(dialog).getByText('删除该发信认证配置？')).toBeInTheDocument();
    expect(within(dialog).getByText('删除后，对应域名在相关场景下将回退到默认认证策略。')).toBeInTheDocument();
  });

  // Final review finding 2：发信认证 Tab 此前只有搜索框，缺 html_spec §2.2/§3.13 的筛选弹层
  // （域名/认证协议/场景三个 Select）。回归用例：协议筛选 LDAP → 只剩 7001（唯一 ldap 行）+
  // 筛选按钮徽章计数=1。
  it('filter popover: 认证协议筛选 LDAP → 只剩 7001 行，筛选徽章计数为 1', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-filter'));
    await screen.findByTestId('mr-auth-filter-popover');
    await user.click(screen.getByTestId('mr-auth-filter-protocol'));
    const ldapOption = await screen.findByRole('option', { name: 'LDAP' });
    await user.click(ldapOption);

    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(1));
    expect(screen.getByTestId('mr-auth-row-7001')).toBeInTheDocument();
    expect(screen.getByTestId('mr-auth-filter').querySelector('.bg-blue-600')).toHaveTextContent('1');

    // 重置筛选恢复全部 3 行，徽章消失。
    await user.click(screen.getByTestId('mr-auth-reset'));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));
    expect(screen.getByTestId('mr-auth-filter').querySelector('.bg-blue-600')).toBeNull();
  });

  it('filter popover: 域名筛选具体域名 → 命中「全部域名」配置(7001) + 该域名专属配置', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-filter'));
    await screen.findByTestId('mr-auth-filter-popover');
    await user.click(screen.getByTestId('mr-auth-filter-domain'));
    const domainOption = await screen.findByRole('option', { name: 'example.cn' });
    await user.click(domainOption);

    // 7001 domain_scope={all:true} 覆盖一切、7002 domain_scope={domains:['example.cn']}
    // 精确命中；7003 (mail.example.cn) 不命中。
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(2));
    expect(screen.getByTestId('mr-auth-row-7001')).toBeInTheDocument();
    expect(screen.getByTestId('mr-auth-row-7002')).toBeInTheDocument();
    expect(screen.queryByTestId('mr-auth-row-7003')).not.toBeInTheDocument();
  });

  it('filter popover: 场景筛选邮件同步代理 → 只剩 7003 行', async () => {
    const user = userEvent.setup();
    render(wrap(<MailAuthTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-auth-filter'));
    await screen.findByTestId('mr-auth-filter-popover');
    await user.click(screen.getByTestId('mr-auth-filter-scene'));
    const sceneOption = await screen.findByRole('option', { name: '邮件同步代理' });
    await user.click(sceneOption);

    await waitFor(() => expect(screen.getAllByTestId(/^mr-auth-row-/)).toHaveLength(1));
    expect(screen.getByTestId('mr-auth-row-7003')).toBeInTheDocument();
  });
});
