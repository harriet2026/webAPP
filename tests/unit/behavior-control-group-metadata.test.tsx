/**
 * GT-12717：发信行为管控「新建规则 → 管控对象=群组」时，群组下拉恒空。
 *
 * 根因不在群组数据，而在前端解析：后端 serializeRuleToMap 用 json.RawMessage
 * 内联下发 `metadata`，运行时是**对象**；BehaviorControlDrawer 却做裸
 * JSON.parse，对象先被转成 "[object Object]" 再解析 → 抛 SyntaxError → 被
 * filter 里的 catch 吞掉并 return false → 每个群组都被判成「不匹配」→ 下拉恒空。
 *
 * 因此本文件的 fixture **必须用对象形态的 metadata**（照抄 dev 栈真实响应），
 * 用字符串形态会恒绿、测不出这个 bug。另补一条字符串形态用例保证向后兼容。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const { mockApiRequest } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
  apiRequest: mockApiRequest,
  ApiError: class ApiError extends Error {},
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, hasPermission: () => true, user: { role: 'system_admin' } }),
}));

vi.mock('@/lib/api/behavior-control', () => ({
  createBehaviorControlRule: vi.fn(),
  updateBehaviorControlRule: vi.fn(),
}));

import { BehaviorControlDrawer } from '@/components/security/behavior-control/BehaviorControlDrawer';

// dev 栈探针群组 4057（tenant 581）的真实 API 响应形态：metadata /
// condition_tree 都是**对象**，不是字符串。
const senderGroupObjectShape = {
  id: 4057,
  name: 'GT12717-probe-发信人群组',
  is_active: true,
  metadata: { group_type: 'sender', member_count: 2 },
  condition_tree: {
    type: 'condition',
    field: 'sender',
    operator: 'within',
    value: 'a@probe.test\nb@probe.test',
  },
} as unknown as { id: number; name: string; metadata: string; is_active: boolean };

// 历史/mock 数据可能仍是字符串形态，必须继续可用。
const senderGroupStringShape = {
  id: 4058,
  name: 'GT12717-string-发信人群组',
  is_active: true,
  metadata: JSON.stringify({ group_type: 'sender', member_count: 3 }),
  condition_tree: JSON.stringify({
    type: 'condition',
    field: 'sender',
    operator: 'within',
    value: 'c@probe.test',
  }),
} as unknown as { id: number; name: string; metadata: string; is_active: boolean };

// 另一类群组：证明 group_type 过滤仍然生效（不能被一并塞进发件人下拉）。
const ipGroupObjectShape = {
  id: 4059,
  name: 'GT12717-probe-IP群组',
  is_active: true,
  metadata: { group_type: 'ip', member_count: 9 },
  condition_tree: { type: 'condition', field: 'client_ip', operator: 'within', value: '10.0.0.0/8' },
} as unknown as { id: number; name: string; metadata: string; is_active: boolean };

function renderDrawer(items: unknown[]) {
  mockApiRequest.mockResolvedValue({ items });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(BehaviorControlDrawer, {
        open: true,
        onOpenChange: vi.fn(),
        editing: null,
        // 直接进入「发件人 → 群组」分支，免去两次 Select 交互。
        defaults: { object_config: { type: 'sender', sub_type: 'group', value: '' } },
      }),
    ),
  );
}

/** 定位群组下拉的 trigger：以唯一的「管理群组」按钮为锚点，取同一容器里的 combobox。 */
function groupSelectTrigger(): HTMLElement {
  const manage = screen.getByText('behaviorControl.form.manageGroup');
  const container = manage.closest('div.flex-1') as HTMLElement;
  expect(container).toBeTruthy();
  return within(container).getByRole('combobox');
}

describe('BehaviorControlDrawer 群组下拉（GT-12717）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('metadata 为对象形态（真实 API）时仍能渲染发件人群组选项并带成员数', async () => {
    const user = userEvent.setup();
    renderDrawer([senderGroupObjectShape, ipGroupObjectShape]);

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    await user.click(groupSelectTrigger());

    const option = await screen.findByRole('option', { name: /GT12717-probe-发信人群组 \(2\)/ });
    expect(option).toBeInTheDocument();
    // group_type 过滤仍然生效：IP 群组不出现在发件人下拉里。
    expect(screen.queryByRole('option', { name: /GT12717-probe-IP群组/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('metadata 为字符串形态（历史数据）时向后兼容', async () => {
    const user = userEvent.setup();
    renderDrawer([senderGroupStringShape]);

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    await user.click(groupSelectTrigger());

    expect(await screen.findByRole('option', { name: /GT12717-string-发信人群组 \(3\)/ })).toBeInTheDocument();
  });

  it('「管理群组」预览弹窗按对象形态 metadata 显示群组类型与成员名单', async () => {
    const user = userEvent.setup();
    renderDrawer([senderGroupObjectShape]);

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    await user.click(groupSelectTrigger());
    await user.click(await screen.findByRole('option', { name: /GT12717-probe-发信人群组 \(2\)/ }));

    await user.click(screen.getByText('behaviorControl.form.manageGroup'));

    // 标题带群组名、类型徽标为「发件人」、成员数取自 metadata.member_count。
    expect(await screen.findByText(/behaviorControl.groupPreview.title/)).toBeInTheDocument();
    expect(screen.getByText('behaviorControl.groupPreview.typeSender')).toBeInTheDocument();
    expect(screen.getByText('a@probe.test')).toBeInTheDocument();
    expect(screen.getByText('b@probe.test')).toBeInTheDocument();
  });
});
