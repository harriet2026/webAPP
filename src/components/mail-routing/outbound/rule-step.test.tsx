import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import zh from '@/../messages/zh.json';
import { RuleStep } from './rule-step';
import type { FieldDefinitionsResponse, Rule, RuleNode } from '@/types/unified-rules';
import type { OutboundChannelRow, OutboundProxyRow } from './outbound-types';

// 出站路由步骤三：路由规则（Task 7 落地 + Task 13 接通真实后端）单测。行为契约见
// .superpowers/sdd/2026-07-29-mail-routing-backend-plan/task-13-brief.md。
//
// GT-12321 用例从旧 OutboundRoutingTab.test.tsx 迁移而来：编辑含
// `is_outbound eq 'false'` 条件的规则保存时，条件树必须原样保留（不注入 true、不剥离）。

const mockApiRequest = vi.fn();
vi.mock('@/lib/api/client', () => ({
  useScopedApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

const mockGetUnifiedRules = vi.fn();
const mockGetFieldDefinitions = vi.fn();
vi.mock('@/lib/api/unified-rules', () => ({
  getUnifiedRules: (...args: unknown[]) => mockGetUnifiedRules(...args),
  getFieldDefinitions: (...args: unknown[]) => mockGetFieldDefinitions(...args),
  createUnifiedRule: (data: unknown, req: typeof mockApiRequest) => req('/unified-rules', { method: 'POST', body: data }),
  updateUnifiedRule: (id: number, data: unknown, req: typeof mockApiRequest) => req(`/unified-rules/${id}`, { method: 'PUT', body: data }),
  deleteUnifiedRule: vi.fn(),
}));

vi.mock('@/lib/api/proxysvr', () => ({
  listActiveProxysvrGroups: vi.fn().mockResolvedValue([]),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() } }));

const fieldDefinitions: FieldDefinitionsResponse = {
  fields: {
    client_ip: {
      label: 'Client IP',
      type: 'ip',
      min_stage: 'onconnect',
      operators: ['eq', 'ne', 'cidr', 'match', 'within'],
      category: 'connection',
      supported: true,
    },
    cac_int_tag: {
      label: 'CAC Int Tag',
      type: 'number',
      min_stage: 'data',
      operators: ['eq', 'ne', 'gt', 'lt', 'ge', 'le', 'within'],
      category: 'security',
      supported: true,
    },
    is_outbound: {
      label: 'Is Outbound',
      type: 'boolean',
      min_stage: 'mail',
      operators: ['eq'],
      category: 'mail_basic',
      supported: true,
    },
    subject: {
      label: 'Subject',
      type: 'string',
      min_stage: 'header',
      operators: ['eq', 'ne', 'contain', 'match', 'within', 'wildcard'],
      category: 'mail_basic',
      supported: true,
    },
    attachment_count: {
      label: 'Attachment Count',
      type: 'number',
      min_stage: 'data',
      operators: ['eq', 'ne', 'gt', 'lt', 'ge', 'le', 'between'],
      category: 'attachment',
      supported: true,
    },
    headers: {
      label: 'Headers',
      type: 'map_string',
      min_stage: 'data',
      operators: ['eq', 'ne', 'contain', 'match'],
      category: 'mail_basic',
      supported: true,
    },
  },
};

beforeEach(() => {
  mockGetFieldDefinitions.mockReset().mockResolvedValue(fieldDefinitions);
});

function unifiedRule(
  overrides: Partial<Rule> & { conditionTree?: RuleNode; metaOverrides?: Record<string, unknown> } = {},
): Rule {
  const { conditionTree, metaOverrides, ...rest } = overrides;
  return {
    id: 5001,
    name: '默认外发',
    rule_class: 'route',
    stage: 'data',
    priority: 900,
    condition_tree: JSON.stringify(conditionTree ?? { type: 'AND', children: [] }),
    metadata: JSON.stringify({ channel: 'smtp', tls_level: 'prefer', ...metaOverrides }),
    is_active: true,
    tls_success_rate: 98,
    created_at: '2026-06-18 09:00:00',
    updated_at: '2026-06-18 09:00:00',
    ...rest,
  } as Rule;
}

// channels/proxies 现在是真实 proxysvr_groups/proxysvr_endpoints 映射（Task 13），id 不带
// 'psg:' 前缀——row.channelId 的 `psg:<id>` 前缀是 rule-step.tsx 表单内部编码。
const channels: OutboundChannelRow[] = [
  { id: '4001', channelName: '测试通道', status: 'enabled', proxyIds: ['3001'] },
  { id: '4002', channelName: '高安全通道', status: 'enabled', proxyIds: ['3003'] },
];
const proxies: OutboundProxyRow[] = [
  {
    id: '3001',
    name: '主出口',
    proxyIp: '1.1.1.1',
    proxyPort: 6620,
    presendCode: 347,
    lid: 'lid-001',
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
    id: '3003',
    name: '高安全出口',
    proxyIp: '1.1.1.3',
    proxyPort: 6620,
    presendCode: 347,
    lid: 'lid-003',
    licensePresent: false,
    license: '',
    useTls: true,
    egressIp: '132.148.32.3',
    heloHostname: 'mail.secure.com',
    tlsMinVersion: '1.3',
    cipherProfile: 'high',
    status: 'enabled',
    probeStatus: 'abnormal',
    lastProbeTime: null,
  },
];

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

describe('RuleStep list', () => {
  beforeEach(() => {
    mockApiRequest.mockReset().mockResolvedValue({});
    mockGetUnifiedRules.mockReset().mockResolvedValue([
      unifiedRule({ id: 5001, name: '默认外发', priority: 900, tls_success_rate: 98 }),
      unifiedRule({ id: 5002, name: '金融合作方', priority: 980, metaOverrides: { tls_level: 'force_verify' }, tls_success_rate: 87 }),
    ]);
  });

  it('渲染 2 行，按优先级降序（DEV-1，980 在前）', async () => {
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-table');
    const rows = screen.getAllByTestId(/^mr-ob-rule-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-testid', 'mr-ob-rule-row-5002');
    expect(rows[1]).toHaveAttribute('data-testid', 'mr-ob-rule-row-5001');
  });

  it('87% 成功率（tlsLevel=forceVerify）不带告警图标', async () => {
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    const row = await screen.findByTestId('mr-ob-rule-row-5002');
    expect(within(row).getByText('87%')).toBeInTheDocument();
    expect(within(row).queryByTestId('mr-ob-rule-tls-alert-5002')).not.toBeInTheDocument();
  });

  it('force 且 <90% 时带橙色告警图标', async () => {
    mockGetUnifiedRules.mockResolvedValue([
      unifiedRule({ id: 5003, name: '低成功率', priority: 500, metaOverrides: { tls_level: 'force' }, tls_success_rate: 80 }),
    ]);
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    const row = await screen.findByTestId('mr-ob-rule-row-5003');
    expect(within(row).getByTestId('mr-ob-rule-tls-alert-5003')).toBeInTheDocument();
  });

  it('tls_success_rate=null（近窗口无投递统计）→ 显示「—」而不是 0%', async () => {
    mockGetUnifiedRules.mockResolvedValue([unifiedRule({ id: 5004, name: '新规则', priority: 500, tls_success_rate: null })]);
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    const row = await screen.findByTestId('mr-ob-rule-row-5004');
    expect(within(row).getByText('—')).toBeInTheDocument();
  });
});

describe('RuleStep drawer', () => {
  beforeEach(() => {
    mockApiRequest.mockReset().mockResolvedValue({});
    mockGetUnifiedRules.mockReset().mockResolvedValue([]);
  });

  it('新建规则未填任何条件字段 → 显示兜底规则橙色警告', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');
    expect(screen.getByTestId('mr-ob-rule-no-condition-warning')).toBeInTheDocument();
  });

  it('TLS 加密等级控件始终可编辑（真实字段，不再是 mock-only 展示位）', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');
    expect(screen.getByTestId('mr-ob-rule-tls-level-select')).not.toBeDisabled();
  });

  it('选择意图引擎“垃圾”标签并保存 → condition_tree 写入 cac_int_tag within 3/4', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');

    await user.type(screen.getByTestId('mr-ob-rule-name-input'), '垃圾邮件专用路由');
    await user.type(screen.getByTestId('mr-ob-rule-target-host-input'), 'spam-relay.example.com');
    await user.click(screen.getByTestId('mr-ob-rule-intent-tag-select'));
    await user.click(await screen.findByRole('option', { name: '垃圾' }));
    expect(screen.queryByTestId('mr-ob-rule-no-condition-warning')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('mr-ob-rule-save'));
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [, opts] = mockApiRequest.mock.calls[0];
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;
    expect((submitted.children ?? []).find((node) => node.field === 'cac_int_tag')).toEqual({
      type: 'condition',
      field: 'cac_int_tag',
      operator: 'within',
      value: '3\n4',
    });
  });

  it('更多条件从后端目录展示全部可用字段，并把新增条件合并进 condition_tree', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');

    const addButton = screen.getByTestId('mr-ob-rule-more-condition-add');
    await waitFor(() => expect(addButton).not.toBeDisabled());
    await user.click(addButton);
    await user.click(screen.getByTestId('mr-ob-rule-more-condition-field-0'));

    // 第一条断言必须用 findBy*：Base UI 的 select 弹层是延迟挂载的，紧跟在
    // user.click 之后同步查询会在 React 冲刷之前读到空 DOM（约 50% 概率）。
    // 先 await 一条，弹层落定后下面的同步查询才成立 —— 尤其是那两条
    // queryByRole().not.toBeInTheDocument() 负向断言：弹层没开时它们恒真，
    // 靠这条 await 才有区分力。
    expect(await screen.findByRole('option', { name: /Subject.*subject/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Attachment Count.*attachment_count/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Headers.*headers/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Is Outbound.*is_outbound/ })).toBeInTheDocument();
    // 固定条件仍由原表单负责，不在“更多条件”的新增列表里重复出现。
    expect(screen.queryByRole('option', { name: /Client IP.*client_ip/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /CAC Int Tag.*cac_int_tag/ })).not.toBeInTheDocument();

    await user.click(await screen.findByRole('option', { name: /Subject.*subject/ }));
    await user.click(screen.getByTestId('mr-ob-rule-more-condition-operator-0'));
    await user.click(await screen.findByRole('option', { name: '正则匹配' }));
    fireEvent.change(screen.getByTestId('mr-ob-rule-more-condition-value-0'), { target: { value: '^财务.+审批$' } });
    fireEvent.change(screen.getByTestId('mr-ob-rule-name-input'), { target: { value: '财务主题路由' } });
    fireEvent.change(screen.getByTestId('mr-ob-rule-target-host-input'), { target: { value: 'finance-relay.example.com' } });
    await user.click(screen.getByTestId('mr-ob-rule-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [, opts] = mockApiRequest.mock.calls[0];
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;
    expect((submitted.children ?? []).find((node) => node.field === 'subject')).toEqual({
      type: 'condition',
      field: 'subject',
      operator: 'match',
      value: '^财务.+审批$',
    });
    expect(mockGetFieldDefinitions).toHaveBeenCalledWith('data', 'mail_routing_outbound', expect.any(Function));
  });

  it('更多条件未填写完整时阻断保存', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');
    const addButton = screen.getByTestId('mr-ob-rule-more-condition-add');
    await waitFor(() => expect(addButton).not.toBeDisabled());
    await user.click(addButton);
    await screen.findByTestId('mr-ob-rule-more-condition-error');

    fireEvent.change(screen.getByTestId('mr-ob-rule-name-input'), { target: { value: '未完成条件' } });
    fireEvent.change(screen.getByTestId('mr-ob-rule-target-host-input'), { target: { value: 'relay.example.com' } });
    await user.click(screen.getByTestId('mr-ob-rule-save'));
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('目的地址填 127.0.0.1 → 红字「目的地址不能与网关本地地址相同」', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');
    fireEvent.change(screen.getByTestId('mr-ob-rule-target-host-input'), { target: { value: '127.0.0.1' } });
    await waitFor(() => {
      expect(screen.getByTestId('mr-ob-rule-target-host-error')).toHaveTextContent('目的地址不能与网关本地地址相同');
    });
  });

  it('模拟测试结果 pre 含「└── 预计对端响应：250 2.0.0 Ok」', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');
    await user.type(screen.getByTestId('mr-ob-rule-name-input'), '模拟规则');
    await user.click(screen.getByTestId('mr-ob-rule-simulate-run'));
    const pre = await screen.findByTestId('mr-ob-rule-simulate-result');
    expect(pre.textContent).toContain('└── 预计对端响应：250 2.0.0 Ok');
  });

  // 浏览器实测发现：channel≠proxysvr（含"默认通道"）时目的地址是真实后端硬约束
  // （internal/api/unified_rules.go::validateRouteRuleMetadata 对 channel=smtp 强制要求
  // next_hop_host 非空），必须在前端拦住，不能让 demo 的"选填"文案通过。
  it('默认通道下目的地址留空 → 阻断保存并提示必填（真实后端 next_hop_host 约束）', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));
    await screen.findByTestId('mr-ob-rule-empty');
    await user.click(screen.getByTestId('mr-ob-rule-create'));
    await screen.findByTestId('mr-ob-rule-drawer');
    await user.type(screen.getByTestId('mr-ob-rule-name-input'), '目的地址必填规则');
    expect(await screen.findByTestId('mr-ob-rule-target-host-error')).toHaveTextContent(
      '此通道下目的地址为必填（真实后端暂不支持留空按 MX 投递）',
    );
    await user.click(screen.getByTestId('mr-ob-rule-save'));
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});

describe('RuleStep GT-12321: is_outbound preservation', () => {
  const receiveDirectionTree: RuleNode = {
    type: 'AND',
    children: [
      { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'false' },
      { type: 'condition', field: 'recipient_domain', operator: 'eq', value: 'osgateway.local' },
    ],
  };

  beforeEach(() => {
    mockApiRequest.mockReset().mockResolvedValue({});
    mockGetUnifiedRules.mockReset().mockResolvedValue([
      unifiedRule({
        id: 5958,
        name: 'inbound to proxysvr',
        priority: 100,
        conditionTree: receiveDirectionTree,
        // channel=proxysvr（无 next_hop_host）——channelId 换算为 `psg:38`，不受"channel≠
        // proxysvr 时目的地址必填"校验约束（该规则本就没有 next_hop_host，proxysvr 通道由
        // 通道自身决定投递目标）。
        metadata: JSON.stringify({ channel: 'proxysvr', proxysvr_group_id: 38 }),
      }),
    ]);
  });

  /** 收集树中所有 is_outbound 条件的值。 */
  function isOutboundValues(node: RuleNode): string[] {
    if (node.type === 'condition') return node.field === 'is_outbound' ? [String(node.value)] : [];
    return (node.children ?? []).flatMap(isOutboundValues);
  }

  it('保留一条接收方向规则（is_outbound=false）而不是强制注入 true', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={697} channels={channels} proxies={proxies} />));

    await screen.findByText('inbound to proxysvr');
    await user.click(screen.getByTestId('mr-ob-rule-edit-5958'));
    await screen.findByTestId('mr-ob-rule-drawer');
    await waitFor(() =>
      expect(screen.getByTestId('mr-ob-rule-more-condition-field-0')).toHaveTextContent('Is Outbound'),
    );
    expect(screen.getByTestId('mr-ob-rule-more-condition-value-0')).toHaveTextContent('否');
    await user.click(screen.getByTestId('mr-ob-rule-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [url, opts] = mockApiRequest.mock.calls[0];
    expect(url).toBe('/unified-rules/5958');
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;
    expect(isOutboundValues(submitted)).toEqual(['false']);
  });
});

// review 复查发现的两项 finding 的回归用例（splitConditions/buildConditionTree，见
// rule-step.tsx 文件头及函数注释）：
// finding 1：known 字段（client_ip/senderdomain/auth_user/recipient·cc·bcc）此前恒写死
//   算子（cidr/eq/eq/contain），不回填原算子，非默认算子的历史规则一保存就被静默收窄。
// finding 2：顶层同时含多个映射到同一表单槽位的已知字段（如 recipient 与 cc 并存）时，
//   未被优先链选中的节点既不展示也不会进 otherConditions，保存即静默丢失。
describe('RuleStep 条件树 review 修复：算子回填 + 同槽位多字段透传', () => {
  beforeEach(() => {
    mockApiRequest.mockReset().mockResolvedValue({});
  });

  it('保存 contain 算子的发信域名条件时保留 contain（不被固化为写死的默认算子 eq）', async () => {
    const tree: RuleNode = {
      type: 'AND',
      children: [{ type: 'condition', field: 'senderdomain', operator: 'contain', value: 'osgateway.local' }],
    };
    mockGetUnifiedRules.mockReset().mockResolvedValue([
      // metadata 显式带 next_hop_host：默认通道（channelId='default'）下目的地址是真实后端
      // 硬约束必填字段（见文件顶部另一组用例），不带的话保存会被前端校验拦住，
      // mockApiRequest 永远不会被调用，这里只是为了让 save 能真正跑到底。
      unifiedRule({
        id: 6001,
        name: '发信域名包含规则',
        priority: 100,
        conditionTree: tree,
        metadata: JSON.stringify({ channel: 'smtp', next_hop_host: 'smtp.out.example.com', next_hop_port: 25, tls_level: 'prefer' }),
      }),
    ]);
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));

    await screen.findByText('发信域名包含规则');
    await user.click(screen.getByTestId('mr-ob-rule-edit-6001'));
    await screen.findByTestId('mr-ob-rule-drawer');
    // 值确实回显进了表单字段，证明该节点被识别为"已知字段"而不是整体透传。
    expect(screen.getByTestId('mr-ob-rule-from-domain-input')).toHaveValue('osgateway.local');
    await user.click(screen.getByTestId('mr-ob-rule-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [, opts] = mockApiRequest.mock.calls[0];
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;
    const senderNode = (submitted.children ?? []).find((n) => n.field === 'senderdomain');
    expect(senderNode?.operator).toBe('contain');
    expect(senderNode?.value).toBe('osgateway.local');
  });

  it('算子超出表单可表达范围（within，要求多值列表）的节点整体归 otherConditions 原样透传', async () => {
    const tree: RuleNode = {
      type: 'AND',
      children: [{ type: 'condition', field: 'client_ip', operator: 'within', value: '10.0.0.0/8\n172.16.0.0/12' }],
    };
    mockGetUnifiedRules.mockReset().mockResolvedValue([
      unifiedRule({
        id: 6002,
        name: 'IP 网段列表规则',
        priority: 100,
        conditionTree: tree,
        metadata: JSON.stringify({ channel: 'smtp', next_hop_host: 'smtp.out.example.com', next_hop_port: 25, tls_level: 'prefer' }),
      }),
    ]);
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));

    await screen.findByText('IP 网段列表规则');
    await user.click(screen.getByTestId('mr-ob-rule-edit-6002'));
    await screen.findByTestId('mr-ob-rule-drawer');
    // within 超出「来源IP」文本框的表达范围，不应被误当成已知字段展示进输入框。
    expect(screen.getByTestId('mr-ob-rule-source-ip-input')).toHaveValue('');
    await user.click(screen.getByTestId('mr-ob-rule-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [, opts] = mockApiRequest.mock.calls[0];
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;
    const withinNode = (submitted.children ?? []).find((n) => n.operator === 'within');
    expect(withinNode).toEqual({ type: 'condition', field: 'client_ip', operator: 'within', value: '10.0.0.0/8\n172.16.0.0/12' });
  });

  it('回填标准钓鱼标签并原样保存；无法由下拉准确表达的 cac_int_tag eq 3 继续透传', async () => {
    const tree: RuleNode = {
      type: 'AND',
      children: [
        { type: 'condition', field: 'cac_int_tag', operator: 'within', value: '9,7' },
        { type: 'condition', field: 'cac_int_tag', operator: 'eq', value: '3' },
      ],
    };
    mockGetUnifiedRules.mockReset().mockResolvedValue([
      unifiedRule({
        id: 6004,
        name: '意图标签兼容规则',
        priority: 100,
        conditionTree: tree,
        metadata: JSON.stringify({ channel: 'smtp', next_hop_host: 'smtp.out.example.com', next_hop_port: 25, tls_level: 'prefer' }),
      }),
    ]);
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));

    await screen.findByText('意图标签兼容规则');
    await user.click(screen.getByTestId('mr-ob-rule-edit-6004'));
    await screen.findByTestId('mr-ob-rule-drawer');
    expect(screen.getByTestId('mr-ob-rule-intent-tag-select')).toHaveTextContent('钓鱼');
    await user.click(screen.getByTestId('mr-ob-rule-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [, opts] = mockApiRequest.mock.calls[0];
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;
    const tagNodes = (submitted.children ?? []).filter((node) => node.field === 'cac_int_tag');
    expect(tagNodes).toEqual([
      { type: 'condition', field: 'cac_int_tag', operator: 'eq', value: '3' },
      { type: 'condition', field: 'cac_int_tag', operator: 'within', value: '9,7' },
    ]);
  });

  it('recipient 与 cc 并存时，编辑保存后两个节点都保留在 payload 中（不因共享槽位而丢失一个）', async () => {
    const tree: RuleNode = {
      type: 'AND',
      children: [
        { type: 'condition', field: 'recipient', operator: 'contain', value: 'boss@example.com' },
        { type: 'condition', field: 'cc', operator: 'contain', value: 'audit@example.com' },
      ],
    };
    mockGetUnifiedRules.mockReset().mockResolvedValue([
      unifiedRule({
        id: 6003,
        name: '收件人+抄送并存规则',
        priority: 100,
        conditionTree: tree,
        metadata: JSON.stringify({ channel: 'smtp', next_hop_host: 'smtp.out.example.com', next_hop_port: 25, tls_level: 'prefer' }),
      }),
    ]);
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));

    await screen.findByText('收件人+抄送并存规则');
    await user.click(screen.getByTestId('mr-ob-rule-edit-6003'));
    await screen.findByTestId('mr-ob-rule-drawer');
    await user.click(screen.getByTestId('mr-ob-rule-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [, opts] = mockApiRequest.mock.calls[0];
    const submitted = (opts as { body: { condition_tree: RuleNode } }).body.condition_tree;
    const rcptNodes = (submitted.children ?? []).filter((n) => n.field === 'recipient' || n.field === 'cc');
    expect(rcptNodes).toHaveLength(2);
    expect(rcptNodes.find((n) => n.field === 'recipient')?.value).toBe('boss@example.com');
    expect(rcptNodes.find((n) => n.field === 'cc')?.value).toBe('audit@example.com');
  });
});

// Task 13：TLS 等级现在是真实字段，编辑保存时必须按抽屉的选择原样写回 metadata.tls_level
// （不再有 mock-only mr_ext 展示位这回事）。
describe('RuleStep：TLS 等级编辑保存回写 metadata.tls_level', () => {
  beforeEach(() => {
    mockApiRequest.mockReset().mockResolvedValue({});
    mockGetUnifiedRules.mockReset().mockResolvedValue([
      unifiedRule({
        id: 5001,
        name: '默认外发',
        priority: 900,
        metadata: JSON.stringify({ channel: 'smtp', next_hop_host: 'smtp.out.example.com', next_hop_port: 25, tls_level: 'prefer' }),
      }),
    ]);
  });

  it('把 TLS 等级从 prefer 改成 force 并保存 → payload.metadata.tls_level="force"', async () => {
    const user = userEvent.setup();
    render(wrap(<RuleStep tenantId={1} channels={channels} proxies={proxies} />));

    await screen.findByText('默认外发');
    await user.click(screen.getByTestId('mr-ob-rule-edit-5001'));
    await screen.findByTestId('mr-ob-rule-drawer');
    await user.click(screen.getByTestId('mr-ob-rule-tls-level-select'));
    await user.click(await screen.findByRole('option', { name: '强制 TLS' }));
    await user.click(screen.getByTestId('mr-ob-rule-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    const [, opts] = mockApiRequest.mock.calls[0];
    const metadata = (opts as { body: { metadata: { tls_level?: string } } }).body.metadata;
    expect(metadata.tls_level).toBe('force');
  });
});
