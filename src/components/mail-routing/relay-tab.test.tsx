import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RelayTab } from './relay-tab';

// 转发 Tab（Task 4 单表重构 + Task 13 接通真实后端 mail-admission-rules，取代 relay-grants）。
// 行为契约见 .superpowers/sdd/2026-07-29-mail-routing-backend-plan/task-13-brief.md。
// fixture 字段对齐 internal/models/mail_admission.go::MailAdmissionRule（优先级/HELO/收信域名
// 匹配方式现在都是真实列，不再是 mock-only mail_routing_ext 扩展位）。

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const TENANT_ID = 42;

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

interface RuleFixture {
  id: number;
  note: string;
  client_cidr: string;
  use_spf: boolean;
  skip_antispam: boolean;
  is_active: boolean;
  sender_domain: string;
  priority: number;
  helo_pattern: string;
  /** 默认 'contains'（既有用例的隐含假设）；I10 透传用例需要一条非默认值来验证
   * 编辑保存不会把它悄悄退回默认。 */
  helo_match?: string;
  rcpt_domain: string;
  rcpt_match: string;
  rate_limit_per_hour?: number | null;
  expires_at?: string | null;
  allow_null_sender?: boolean;
  /** 默认 false（既有用例的隐含假设）；privileged-preservation 用例需要一条既有
   * privileged=true 的 fixture。 */
  privileged?: boolean;
  /** 默认 null（全部 fixture 都不是通过具体域名 FK 授权的）；any-sender 编辑用例靠它标记
   * "这条本就是 tenant_domain_id 为 null 的 any-sender 授权"。 */
  tenant_domain_id?: number | null;
}

const FIXTURES: RuleFixture[] = [
  {
    id: 8003,
    note: '兜底拒绝',
    client_cidr: '',
    use_spf: false,
    skip_antispam: false,
    is_active: false,
    sender_domain: '',
    priority: 1,
    helo_pattern: '',
    rcpt_domain: '',
    rcpt_match: 'contains',
  },
  {
    id: 8001,
    note: '内网放行',
    client_cidr: '192.168.0.0/16',
    use_spf: false,
    skip_antispam: true,
    is_active: true,
    sender_domain: 'example.cn',
    priority: 990,
    helo_pattern: '',
    rcpt_domain: 'example.cn',
    rcpt_match: 'equals',
  },
  {
    id: 8002,
    note: '合作伙伴转发',
    client_cidr: '203.0.113.5,203.0.113.6',
    use_spf: true,
    skip_antispam: false,
    is_active: true,
    sender_domain: 'partner.com',
    priority: 950,
    helo_pattern: 'partner.com',
    rcpt_domain: 'example.cn',
    rcpt_match: 'contains',
    // 非默认值，专供「编辑 PUT 透传」用例断言：省略这些字段时后端会无条件清空/退回默认
    // （review finding 2 + I10），必须原样带回。
    rate_limit_per_hour: 300,
    expires_at: '2026-12-31T23:59:59Z',
    allow_null_sender: true,
    helo_match: 'equals',
  },
];

// 已验证租户域名 mock 清单（对应 review finding 1 的「已验证域名保存被放行」正例，以及
// finding 2 测试里 8002 行 partner.com 的必填联动）。
const VERIFIED_DOMAINS = [
  { id: 501, domain: 'example.cn', verify_status: 'verified', is_active: true },
  { id: 502, domain: 'partner.com', verify_status: 'verified', is_active: true },
];

const ENABLED_POLICY = {
  enabled: true,
  trusted_cidrs: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
  min_prefix_len_v4: 24,
  min_prefix_len_v6: 64,
  can_privilege: true,
};

function ruleBody(f: RuleFixture) {
  return {
    id: f.id,
    tenant_id: 1,
    tenant_domain_id: f.tenant_domain_id ?? null,
    client_cidr: f.client_cidr,
    use_spf: f.use_spf,
    privileged: f.privileged ?? false,
    allow_null_sender: f.allow_null_sender ?? false,
    skip_antispam: f.skip_antispam,
    rate_limit_per_hour: f.rate_limit_per_hour ?? null,
    priority: f.priority,
    helo_pattern: f.helo_pattern,
    helo_match: f.helo_match ?? 'contains',
    rcpt_domain: f.rcpt_domain,
    rcpt_match: f.rcpt_match,
    is_active: f.is_active,
    expires_at: f.expires_at ?? null,
    note: f.note,
    sender_domain: f.sender_domain,
    created_at: '2026-06-18 09:00:00',
    updated_at: '2026-06-18 09:00:00',
  };
}

function routeApi(
  fixtures: RuleFixture[] = FIXTURES,
  domains: typeof VERIFIED_DOMAINS = VERIFIED_DOMAINS,
  policy = ENABLED_POLICY,
) {
  mockApiRequest.mockImplementation((url: string, opts?: { method?: string; body?: unknown }) => {
    const method = (opts?.method ?? 'GET').toUpperCase();
    if (method === 'GET' && url === '/mail-admission-rules') {
      return Promise.resolve({ items: fixtures.map(ruleBody) });
    }
    if (method === 'GET' && url === '/mail-admission/_meta/policy') {
      return Promise.resolve(policy);
    }
    if (method === 'PUT' && url === '/mail-admission/_meta/policy') {
      return Promise.resolve({ ...policy, ...(opts?.body as { enabled?: boolean }) });
    }
    if (method === 'GET' && url === `/tenants/${TENANT_ID}/domains`) {
      return Promise.resolve({ items: domains });
    }
    if (method === 'POST' && url === '/mail-admission-rules') {
      return Promise.resolve(ruleBody({ ...fixtures[0], id: 9999, note: (opts?.body as { note?: string })?.note ?? '' }));
    }
    if (method === 'PUT' && /^\/mail-admission-rules\/\d+$/.test(url)) {
      return Promise.resolve({});
    }
    if (method === 'DELETE' && /^\/mail-admission-rules\/\d+$/.test(url)) {
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

describe('RelayTab', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    routeApi();
  });

  it('shows the default-off gate and lets a system admin enable it from the rules page', async () => {
    const user = userEvent.setup();
    routeApi(FIXTURES, VERIFIED_DOMAINS, { ...ENABLED_POLICY, enabled: false });
    render(wrap(<RelayTab tenantId={TENANT_ID} />));

    expect(await screen.findByTestId('mr-relay-master-switch-off')).toHaveTextContent(
      '规则总开关已关闭，当前所有转发规则均不会生效'
    );
    const masterSwitch = screen.getByTestId('mr-relay-master-switch');
    expect(masterSwitch).not.toBeChecked();

    await user.click(masterSwitch);

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith('/mail-admission/_meta/policy', {
        method: 'PUT',
        body: { enabled: true },
      });
      expect(screen.queryByTestId('mr-relay-master-switch-off')).not.toBeInTheDocument();
    });
  });

  it('renders 3 rows sorted by priority descending (990 -> 950 -> 1)', async () => {
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    const rows = screen.getAllByTestId(/^mr-relay-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'mr-relay-row-8001',
      'mr-relay-row-8002',
      'mr-relay-row-8003',
    ]);
    expect(mockApiRequest).toHaveBeenCalledWith('/mail-admission-rules');
  });

  it('SPF badge renders only for the 8002 row (use_spf=true)', async () => {
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    expect(screen.getByTestId('mr-relay-spf-badge-8002')).toBeInTheDocument();
    expect(screen.queryByTestId('mr-relay-spf-badge-8001')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mr-relay-spf-badge-8003')).not.toBeInTheDocument();
  });

  it('spam filter badge/text: 8001=不过滤, 8002/8003=过滤', async () => {
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    expect(within(screen.getByTestId('mr-relay-row-8001')).getByText('不过滤')).toBeInTheDocument();
    expect(within(screen.getByTestId('mr-relay-row-8002')).getByText('过滤')).toBeInTheDocument();
    expect(within(screen.getByTestId('mr-relay-row-8003')).getByText('过滤')).toBeInTheDocument();
  });

  it('priority/HELO/收信域名匹配方式 controls are always editable (real backend columns, not mock-only)', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');

    expect(screen.getByTestId('mr-relay-priority-input')).not.toBeDisabled();
    expect(screen.getByTestId('mr-relay-helo-input')).not.toBeDisabled();
    expect(screen.getByTestId('mr-relay-rcpt-domain-input')).not.toBeDisabled();
    expect(screen.getByTestId('mr-relay-rcpt-match-select')).not.toHaveAttribute('data-disabled');
  });

  it('editing 8002 shows its real priority/HELO/rcpt fields (990/partner.com/example.cn/contains)', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-edit-8002'));
    await screen.findByTestId('mr-relay-drawer');
    expect(screen.getByTestId('mr-relay-priority-input')).toHaveValue(950);
    expect(screen.getByTestId('mr-relay-helo-input')).toHaveValue('partner.com');
    expect(screen.getByTestId('mr-relay-rcpt-domain-input')).toHaveValue('example.cn');
  });

  it('SPF checkbox checked without a sender domain shows the immediate required red hint', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');

    await user.click(screen.getByTestId('mr-relay-spf-checkbox'));
    expect(screen.getByTestId('mr-relay-from-domain-error')).toHaveTextContent('启用 SPF 认证时发信域名必填');

    await user.type(screen.getByTestId('mr-relay-from-domain-input'), 'partner.com');
    expect(screen.queryByTestId('mr-relay-from-domain-error')).not.toBeInTheDocument();
  });

  // GT-12329 review Important I11：emptyRelayRow() 的默认草稿（来源 IP='ALL'、不用 SPF）
  // 违反后端 chk_mail_admission_has_source（来源 IP/CIDR 与 SPF 二选一），此前前端没有
  // 对应校验，新建规则时只填规则名不碰来源/SPF 字段就必定保存 400。断言：① 默认草稿下
  // 保存被阻断并显示红字；② 仅补上来源 IP 或仅勾选 SPF 任一项即可清除红字并放行保存。
  it('new admission rule with the default draft (source ALL, no SPF) blocks save with a source-required error', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');
    await user.type(screen.getByTestId('mr-relay-name-input'), '默认草稿必填校验');

    expect(screen.getByTestId('mr-relay-source-ip-error')).toHaveTextContent(
      '来源 IP/CIDR 与「使用 SPF 记录」至少需要满足一项'
    );

    await user.click(screen.getByTestId('mr-relay-save'));
    const postCalls = mockApiRequest.mock.calls.filter(
      ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });

  it('filling Source IP clears the source-required error and allows save', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');
    await user.type(screen.getByTestId('mr-relay-name-input'), '补上来源 IP');
    await user.type(screen.getByTestId('mr-relay-from-domain-input'), 'example.cn');
    await user.type(screen.getByTestId('mr-relay-source-ip-input'), '192.168.1.0/24');
    expect(screen.queryByTestId('mr-relay-source-ip-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mr-relay-save'));
    await waitFor(() => {
      const postCalls = mockApiRequest.mock.calls.filter(
        ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });
  });

  it('checking "Use SPF Record" alone clears the source-required error (SPF satisfies the either/or)', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');
    await user.type(screen.getByTestId('mr-relay-name-input'), '仅用 SPF');
    await user.click(screen.getByTestId('mr-relay-spf-checkbox'));
    expect(screen.queryByTestId('mr-relay-source-ip-error')).not.toBeInTheDocument();
  });

  it('simulator: 192.168.1.5/example.cn/example.cn hits 内网放行 with the exact demo result text', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-edit-8001'));
    await screen.findByTestId('mr-relay-drawer');

    await user.type(screen.getByTestId('mr-relay-sim-src'), '192.168.1.5');
    await user.type(screen.getByTestId('mr-relay-sim-from'), 'example.cn');
    await user.type(screen.getByTestId('mr-relay-sim-rcpt'), 'example.cn');
    await user.click(screen.getByTestId('mr-relay-sim-run'));

    expect(screen.getByTestId('mr-relay-sim-result')).toHaveTextContent(
      '命中规则《内网放行》，动作：允许通过（垃圾邮件过滤：否）'
    );
  });

  it('模拟测试 row button opens the same edit drawer (demo behavior)', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-sim-8002'));
    const drawer = await screen.findByTestId('mr-relay-drawer');
    expect(within(drawer).getByText('编辑转发规则')).toBeInTheDocument();
    expect(within(drawer).getByTestId('mr-relay-name-input')).toHaveValue('合作伙伴转发');
  });

  it('delete dialog title includes the rule name (from note)', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-delete-8001'));
    const dialog = await screen.findByTestId('mr-relay-delete-dialog');
    expect(within(dialog).getByText('删除转发规则「内网放行」？')).toBeInTheDocument();
    expect(within(dialog).getByTestId('mr-relay-delete-confirm')).toHaveTextContent('确认删除');
  });

  // Review finding 1（silent open relay）：发信域名未精确匹配任何已验证租户域名时，
  // 旧实现会把 tenant_domain_id 静默置 null 并一并推 privileged:true 提交——等价于未经
  // 确认地开出一个 any-sender 开放中继。修复后必须阻断保存并给出行内红字，不打 POST。
  it('blocks save and shows an inline error when the from-domain is not a verified tenant domain', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');

    await user.type(screen.getByTestId('mr-relay-name-input'), '未验证域名规则');
    await user.type(screen.getByTestId('mr-relay-from-domain-input'), 'unverified-domain.com');
    await user.click(screen.getByTestId('mr-relay-save'));

    expect(screen.getByTestId('mr-relay-from-domain-error')).toHaveTextContent(
      '发信域名必须为已验证的租户域名'
    );
    const postCalls = mockApiRequest.mock.calls.filter(
      ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });

  // 正例：mock 域名清单里的域之一（example.cn）精确匹配时应正常放行保存，证明校验没有把
  // 合法的已验证域名一并挡住；priority/helo_pattern/rcpt_domain/rcpt_match 也随表单原样写入。
  it('allows save when the from-domain matches a verified tenant domain, writing real priority/helo/rcpt fields', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');

    await user.type(screen.getByTestId('mr-relay-name-input'), '已验证域名规则');
    await user.type(screen.getByTestId('mr-relay-from-domain-input'), 'example.cn');
    // I11：新建规则的来源必填校验（CIDR 或 SPF 二选一）与本用例要测的域名校验相互独立，
    // 这里随手补一个来源 IP 让本用例只受它自己关心的那条校验影响。
    await user.type(screen.getByTestId('mr-relay-source-ip-input'), '192.168.1.0/24');
    expect(screen.queryByTestId('mr-relay-from-domain-error')).not.toBeInTheDocument();

    const priorityInput = screen.getByTestId('mr-relay-priority-input');
    await user.clear(priorityInput);
    await user.type(priorityInput, '500');
    await user.type(screen.getByTestId('mr-relay-helo-input'), 'mail.example.cn');

    await user.click(screen.getByTestId('mr-relay-save'));

    await waitFor(() => {
      const postCalls = mockApiRequest.mock.calls.filter(
        ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });
    const [, postOpts] = mockApiRequest.mock.calls.find(
      ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
    )!;
    const body = (postOpts as {
      body?: { tenant_domain_id?: number | null; privileged?: boolean; priority?: number; helo_pattern?: string };
    }).body;
    expect(body?.tenant_domain_id).toBe(501);
    expect(body?.privileged).toBe(false);
    expect(body?.priority).toBe(500);
    expect(body?.helo_pattern).toBe('mail.example.cn');
  });

  // Code review (Important)：后端 verifyRcptDomainOwnership（internal/api/mail_admission.go）
  // 对 rcpt_match=equals 强制要求 rcpt_domain 命中本租户已验证域或其子域，此前前端没有对应
  // 校验/红字，用户只能撞 400 靠通用 toast 看后端英文消息——与同文件 fromDomain 的
  // domainVerifyErr 已有实现不一致（同页两套标准）。以下三组用例补齐该口径。
  it('blocks save and shows an inline error when rcpt_match=equals and rcpt_domain is not a verified/owned domain', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');

    await user.type(screen.getByTestId('mr-relay-name-input'), '收信域名未验证');
    // 发信域名先填一个已验证域，隔离出本用例只测 rcptDomain 这一条校验。
    await user.type(screen.getByTestId('mr-relay-from-domain-input'), 'example.cn');
    await user.click(screen.getByTestId('mr-relay-rcpt-match-select'));
    await user.click(screen.getByRole('option', { name: '等于' }));
    await user.type(screen.getByTestId('mr-relay-rcpt-domain-input'), 'unverified-rcpt.com');
    await user.click(screen.getByTestId('mr-relay-save'));

    expect(screen.getByTestId('mr-relay-rcpt-domain-error')).toHaveTextContent(
      '收信域名必须为已验证的租户域名或其子域'
    );
    const postCalls = mockApiRequest.mock.calls.filter(
      ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
    );
    expect(postCalls).toHaveLength(0);
  });

  it.each([
    ['精确匹配', 'example.cn'],
    ['子域匹配', 'mail.example.cn'],
  ])('allows save when rcpt_match=equals and rcpt_domain is a verified domain (%s)', async (_label, rcptDomain) => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');

    await user.type(screen.getByTestId('mr-relay-name-input'), '收信域名已验证');
    await user.type(screen.getByTestId('mr-relay-from-domain-input'), 'example.cn');
    // I11：见上方同名注释。
    await user.type(screen.getByTestId('mr-relay-source-ip-input'), '192.168.1.0/24');
    await user.click(screen.getByTestId('mr-relay-rcpt-match-select'));
    await user.click(screen.getByRole('option', { name: '等于' }));
    await user.type(screen.getByTestId('mr-relay-rcpt-domain-input'), rcptDomain);
    expect(screen.queryByTestId('mr-relay-rcpt-domain-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mr-relay-save'));

    await waitFor(() => {
      const postCalls = mockApiRequest.mock.calls.filter(
        ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });
    const [, postOpts] = mockApiRequest.mock.calls.find(
      ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
    )!;
    const body = (postOpts as { body?: { rcpt_domain?: string; rcpt_match?: string } }).body;
    expect(body?.rcpt_domain).toBe(rcptDomain);
    expect(body?.rcpt_match).toBe('equals');
  });

  it.each([
    ['contains（默认）', undefined],
    ['regex', '正则匹配'],
  ])('rcpt_match=%s with an unrelated rcpt_domain does not trigger the verified-domain check', async (_label, optionLabel) => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-create'));
    await screen.findByTestId('mr-relay-drawer');

    await user.type(screen.getByTestId('mr-relay-name-input'), '非 equals 不校验');
    await user.type(screen.getByTestId('mr-relay-from-domain-input'), 'example.cn');
    // I11：见上方同名注释。
    await user.type(screen.getByTestId('mr-relay-source-ip-input'), '192.168.1.0/24');
    if (optionLabel) {
      await user.click(screen.getByTestId('mr-relay-rcpt-match-select'));
      await user.click(screen.getByRole('option', { name: optionLabel }));
    }
    // 完全不相干的域名——equals 形态下会命中红字，contains/regex 形态下不应该。
    await user.type(screen.getByTestId('mr-relay-rcpt-domain-input'), 'totally-unrelated.org');
    expect(screen.queryByTestId('mr-relay-rcpt-domain-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mr-relay-save'));
    await waitFor(() => {
      const postCalls = mockApiRequest.mock.calls.filter(
        ([u, opts]) => u === '/mail-admission-rules' && (opts as { method?: string } | undefined)?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });
    expect(screen.queryByTestId('mr-relay-rcpt-domain-error')).not.toBeInTheDocument();
  });

  // Review finding 2（PUT 静默清空）+ I10（helo_match 透传）：编辑保存此前只回填
  // conceptual 字段，rate_limit_per_hour/expires_at/allow_null_sender/helo_match 四个
  // UI 未暴露的字段随 PUT 省略被后端无条件清空/退回默认（helo_match 退回 'contains'，
  // 等于悄悄放宽了这条规则的 HELO 匹配严格度）。8002 fixture 特意带非默认值，断言它们
  // 原样透传。
  it('editing an existing rule passes rate_limit_per_hour/expires_at/allow_null_sender/helo_match through unchanged on save (PUT)', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-edit-8002'));
    await screen.findByTestId('mr-relay-drawer');
    await user.click(screen.getByTestId('mr-relay-save'));

    await waitFor(() => {
      const putCalls = mockApiRequest.mock.calls.filter(
        ([u, opts]) => u === '/mail-admission-rules/8002' && (opts as { method?: string } | undefined)?.method === 'PUT'
      );
      expect(putCalls).toHaveLength(1);
    });
    const [, putOpts] = mockApiRequest.mock.calls.find(
      ([u, opts]) => u === '/mail-admission-rules/8002' && (opts as { method?: string } | undefined)?.method === 'PUT'
    )!;
    const body = (
      putOpts as {
        body?: {
          rate_limit_per_hour?: number | null;
          expires_at?: string | null;
          allow_null_sender?: boolean;
          helo_match?: string;
        };
      }
    ).body;
    expect(body?.rate_limit_per_hour).toBe(300);
    expect(body?.expires_at).toBe('2026-12-31T23:59:59Z');
    expect(body?.allow_null_sender).toBe(true);
    expect(body?.helo_match).toBe('equals');
  });

  // Final review finding 1（PUT 时重算 privileged 静默降级）：编辑一条既有 privileged=true
  // 的授权，只改启停等无关字段保存，PUT body 的 privileged 必须仍是 true——不能因为这次
  // 恰好能解析出 tenant_domain_id（本 fixture 的 sender_domain=example.cn 命中已验证域名
  // 501）就被公式重算成 false。
  it('editing a privileged=true rule while only toggling active preserves privileged=true (review finding 1)', async () => {
    const user = userEvent.setup();
    const privilegedFixture: RuleFixture = {
      id: 8004,
      note: '特权中转',
      client_cidr: '198.51.100.0/24',
      use_spf: false,
      skip_antispam: false,
      is_active: true,
      sender_domain: 'example.cn',
      priority: 700,
      helo_pattern: '',
      rcpt_domain: '',
      rcpt_match: 'contains',
      privileged: true,
    };
    routeApi([privilegedFixture]);
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(1));

    await user.click(screen.getByTestId('mr-relay-edit-8004'));
    await screen.findByTestId('mr-relay-drawer');
    // 只切启停，不碰域名/SPF——这次保存本不该触碰 privileged 语义。
    await user.click(screen.getByTestId('mr-relay-active-switch'));
    await user.click(screen.getByTestId('mr-relay-save'));

    await waitFor(() => {
      const putCalls = mockApiRequest.mock.calls.filter(
        ([u, opts]) => u === '/mail-admission-rules/8004' && (opts as { method?: string } | undefined)?.method === 'PUT'
      );
      expect(putCalls).toHaveLength(1);
    });
    const [, putOpts] = mockApiRequest.mock.calls.find(
      ([u, opts]) => u === '/mail-admission-rules/8004' && (opts as { method?: string } | undefined)?.method === 'PUT'
    )!;
    const body = (putOpts as { body?: { privileged?: boolean } }).body;
    expect(body?.privileged).toBe(true);
  });

  // Final review finding 1 后半段：编辑一条既有 any-sender 授权（tenant_domain_id 本就是
  // null，8003「兜底拒绝」fixture 的 sender_domain 也是空）时，域名 gate 不应拦截——用户
  // 只是想切个启停，不是要新引入一个"任意发信域"语义。
  it('editing an existing any-sender rule can toggle disable and save without the domain-verify gate blocking (review finding 1)', async () => {
    const user = userEvent.setup();
    render(wrap(<RelayTab tenantId={TENANT_ID} />));
    await waitFor(() => expect(screen.getAllByTestId(/^mr-relay-row-/)).toHaveLength(3));

    await user.click(screen.getByTestId('mr-relay-edit-8003'));
    await screen.findByTestId('mr-relay-drawer');
    expect(screen.queryByTestId('mr-relay-from-domain-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mr-relay-active-switch'));
    await user.click(screen.getByTestId('mr-relay-save'));

    await waitFor(() => {
      const putCalls = mockApiRequest.mock.calls.filter(
        ([u, opts]) => u === '/mail-admission-rules/8003' && (opts as { method?: string } | undefined)?.method === 'PUT'
      );
      expect(putCalls).toHaveLength(1);
    });
  });
});
