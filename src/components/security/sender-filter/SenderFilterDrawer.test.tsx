import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SenderFilterDrawer } from './SenderFilterDrawer';
import type { SenderFilterGroups, SenderFilterRuleView } from '@/types/sender-filter';

// Identity translator (mirrors SenderFilterTable.test.tsx): the drawer calls
// `useTranslations()` with NO namespace and passes fully-qualified keys like
// 'senderFilter.ruleName', so the mock returns the key as-is (never prefixed
// with "undefined.") and appends any interpolation params.
// GT-12693：抽屉改为按登录角色决定优先级可填范围（后端 validatePriority 对
// tenant_admin 收窄到 100-1000），因此需要 auth 上下文。默认给平台管理员，
// 保持这批既有用例原有的"全量范围"前提不变——角色相关的断言在
// sender-filter-priority.test.tsx 里单独覆盖。
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, params?: Record<string, unknown>) => {
    const full = namespace ? `${namespace}.${key}` : key;
    return params ? `${full}:${JSON.stringify(params)}` : full;
  },
}));

const emptyGroups: SenderFilterGroups = { senderGroups: [], ipGroups: [] };

function renderDrawer(overrides: Partial<React.ComponentProps<typeof SenderFilterDrawer>> = {}) {
  return render(
    <SenderFilterDrawer
      open
      onOpenChange={vi.fn()}
      editingRule={null}
      listTypeTab="blacklist"
      groups={emptyGroups}
      tenantDomains={[]}
      onSubmit={vi.fn()}
      {...overrides}
    />,
  );
}

// GT-12117: minimal domain-type editing rule so the drawer renders the
// 组织域名 branch without driving the sender-type Select.
const domainRule = {
  rule: { name: 'r', description: '', priority: 100, is_active: true, valid_until: null, action: 'reject' },
  list_type: 'blacklist',
  list_id_display: 'B1',
  resolved: {
    list_type: 'blacklist',
    whitelist_mode: undefined,
    sender_config: { type: 'domain', value: 'corp.example.com' },
    ip_range: { type: 'all', value: undefined },
  },
  is_complex: false,
} as unknown as SenderFilterRuleView;

// GT-12665 取代了 GT-12117 的"只能从租户域名里选"：域名改为可自由输入的 combobox，
// 租户接收域名退化为快捷建议，因此没有"租户无域名"的空态了。
describe('SenderFilterDrawer 组织域名输入 (GT-12665)', () => {
  it('domain 类型渲染可输入的 combobox，并把租户域名作为建议', () => {
    renderDrawer({ editingRule: domainRule, tenantDomains: ['corp.example.com', 'mail.example.org'] });
    const input = screen.getByTestId('sender-filter-domain-input');
    expect(input).toBeInTheDocument();
    // 建议列表默认收起，聚焦后展开
    expect(screen.queryByTestId('sender-filter-domain-suggestions')).toBeNull();
    fireEvent.focus(input);
    // 建议按当前输入过滤：编辑态里已填 corp.example.com，故只剩它一条
    expect(within(screen.getByTestId('sender-filter-domain-suggestions')).getByText('corp.example.com'))
      .toBeInTheDocument();
    // 清空输入后两条建议都回来
    fireEvent.change(input, { target: { value: '' } });
    const listbox = screen.getByTestId('sender-filter-domain-suggestions');
    expect(within(listbox).getByText('corp.example.com')).toBeInTheDocument();
    expect(within(listbox).getByText('mail.example.org')).toBeInTheDocument();
    // 不应出现 individual 态的 placeholder
    expect(screen.queryByPlaceholderText('senderFilter.senderPlaceholder_individual')).toBeNull();
  });

  it('租户无域名时仍可自由输入外部域名，只是没有建议', () => {
    renderDrawer({ editingRule: domainRule, tenantDomains: [] });
    const input = screen.getByTestId('sender-filter-domain-input');
    expect(input).toBeInTheDocument();
    fireEvent.focus(input);
    expect(screen.queryByTestId('sender-filter-domain-suggestions')).toBeNull();
    fireEvent.change(input, { target: { value: 'partner.example.net' } });
    expect(input).toHaveValue('partner.example.net');
  });
});

describe('SenderFilterDrawer (demo rewrite)', () => {
  it('黑名单抽屉仍不展示 email_type / whitelist_mode 字段', () => {
    renderDrawer({ listTypeTab: 'blacklist' });
    expect(screen.queryByTestId('sender-filter-email-type')).toBeNull();
    expect(screen.queryByText('senderFilter.whitelistMode')).toBeNull();
    expect(screen.queryByText('senderFilter.whitelistMode_bypass_content')).toBeNull();
    // valid_from (生效开始) removed too — expire is a single date field.
    expect(screen.queryByText('senderFilter.validFrom')).toBeNull();
  });

  it('白名单抽屉展示模式并将默认 bypass_content 随表单提交', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ listTypeTab: 'whitelist', onSubmit });

    expect(screen.getByText('senderFilter.whitelistMode')).toBeInTheDocument();
    expect(screen.getByText('senderFilter.whitelistMode_bypass_content')).toBeInTheDocument();
    expect(screen.getByDisplayValue('800')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /senderFilter\.ruleName/ }), {
      target: { value: '可信发信人' },
    });
    fireEvent.change(screen.getByPlaceholderText('senderFilter.senderPlaceholder_individual'), {
      target: { value: 'trusted@example.org' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        list_type: 'whitelist',
        action: 'accept',
        whitelist_mode: 'bypass_content',
        priority: 800,
      }));
    });
  });

  it('渲染右侧配置提示（4 分区之一）', () => {
    renderDrawer();
    expect(screen.getByText('senderFilter.configHintsTitle')).toBeInTheDocument();
    // hint1 must be the "数值越大越优先" wording — never "越小".
    expect(screen.getByText('senderFilter.configHint1')).toBeInTheDocument();
  });

  it('本地模拟：individual 邮箱相等即命中', () => {
    renderDrawer();
    // Default sender type is individual → a plain text input is shown.
    const senderInput = screen.getByPlaceholderText('senderFilter.senderPlaceholder_individual');
    fireEvent.change(senderInput, { target: { value: 'spam@bad.com' } });

    // Expand the simulation collapsible.
    fireEvent.click(screen.getByText('senderFilter.simulationTest'));

    const simInput = screen.getByPlaceholderText('senderFilter.simEmailPlaceholder');
    fireEvent.change(simInput, { target: { value: 'spam@bad.com' } });

    fireEvent.click(screen.getByText('senderFilter.startTest'));

    // Local match (no API round-trip): equal address → hit.
    expect(screen.getByText('senderFilter.hitRule')).toBeInTheDocument();
    expect(screen.queryByText('senderFilter.notHit')).toBeNull();
  });

  it('本地模拟：不相等邮箱未命中', () => {
    renderDrawer();
    const senderInput = screen.getByPlaceholderText('senderFilter.senderPlaceholder_individual');
    fireEvent.change(senderInput, { target: { value: 'spam@bad.com' } });

    fireEvent.click(screen.getByText('senderFilter.simulationTest'));
    const simInput = screen.getByPlaceholderText('senderFilter.simEmailPlaceholder');
    fireEvent.change(simInput, { target: { value: 'someone@else.com' } });
    fireEvent.click(screen.getByText('senderFilter.startTest'));

    expect(screen.getByText('senderFilter.notHit')).toBeInTheDocument();
    expect(screen.queryByText('senderFilter.hitRule')).toBeNull();
  });

  it('编辑态回填名称与优先级（无 whitelist_mode 依赖）', () => {
    const editingRule: SenderFilterRuleView = {
      rule: {
        id: 7,
        name: '可疑发件人',
        rule_class: 'action',
        stage: 'rcpt',
        priority: 640,
        condition_tree: '{}',
        action: 'reject',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      } as SenderFilterRuleView['rule'],
      list_type: 'blacklist',
      list_id_display: 'BL-20260101-007',
      resolved: {
        feature: 'sender_filter',
        sender_config: { type: 'individual', value: 'attacker@example.org' },
        ip_range: { type: 'all' },
        list_type: 'blacklist',
      },
      is_complex: false,
    };
    renderDrawer({ editingRule });
    expect(screen.getByDisplayValue('可疑发件人')).toBeInTheDocument();
    expect(screen.getByDisplayValue('attacker@example.org')).toBeInTheDocument();
    expect(screen.getByDisplayValue('640')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// GT-11486 复杂规则编辑态 / GT-11685 重名行内提示
// ---------------------------------------------------------------------------

import type { Rule } from '@/types/unified-rules';

const complexView: SenderFilterRuleView = {
  rule: {
    id: 3,
    name: 'Complex rule',
    description: '由 API 创建',
    rule_class: 'action',
    stage: 'rcpt',
    priority: 300,
    condition_tree: JSON.stringify({
      type: 'OR',
      children: [
        { type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' },
        { type: 'condition', field: 'sender', operator: 'eq', value: 'c@d.com' },
      ],
    }),
    action: 'reject',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as Rule,
  list_type: 'blacklist',
  list_id_display: 'BL-20260101-003',
  resolved: null,
  is_complex: true,
};

describe('SenderFilterDrawer 复杂规则编辑 (GT-11486)', () => {
  it('回填基础字段并显示只读提示，不显示条件编辑控件', () => {
    renderDrawer({ editingRule: complexView });
    expect(screen.getByRole('textbox', { name: /senderFilter\.ruleName/ })).toHaveValue('Complex rule');
    expect(screen.getByText('senderFilter.complexEditTitle')).toBeInTheDocument();
    // 条件与动作编辑控件不应出现
    expect(screen.queryByPlaceholderText('senderFilter.senderPlaceholder_individual')).toBeNull();
    expect(screen.queryByText('senderFilter.sectionAction')).toBeNull();
    // 原始条件以只读形式可见（管理员能看到这条规则真正匹配什么）
    expect(screen.getByText(/a@b\.com/)).toBeInTheDocument();
  });

  it('保存回调收到 is_complex 标记与原名（供页面走部分更新）', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderDrawer({ editingRule: complexView, onSubmit });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        is_complex: true,
        name: 'Complex rule',
        priority: 300,
      }));
    });
  });
});

describe('SenderFilterDrawer 重名冲突行内提示 (GT-11685)', () => {
  it('onSubmit 以 409 拒绝时，规则名称下方出现重名提示', async () => {
    const onSubmit = vi.fn().mockRejectedValue(Object.assign(new Error('规则名称已存在'), { status: 409 }));
    renderDrawer({ onSubmit });
    fireEvent.change(screen.getByRole('textbox', { name: /senderFilter\.ruleName/ }), {
      target: { value: '重复名称' },
    });
    fireEvent.change(screen.getByPlaceholderText('senderFilter.senderPlaceholder_individual'), {
      target: { value: 'dup@example.org' },
    });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => {
      expect(screen.getByText('senderFilter.errors.nameDuplicate')).toBeInTheDocument();
    });
  });
});
