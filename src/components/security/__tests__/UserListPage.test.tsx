import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';

// UserListPage always calls useAuth()/useApiRequest() (rules-of-hooks), even when
// embedded — and useAuth() throws outside an AuthProvider. Mock it the same way
// InfrastructurePage.test.tsx does, rather than mounting the real provider (which
// pulls in localStorage/router/query-client wiring irrelevant to this component).
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, user: { role: 'system_admin' }, selectedTenantId: null }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/api/user-list', async (orig) => {
  const actual = await orig<typeof import('@/lib/api/user-list')>();
  return { ...actual, listUserListRules: vi.fn() };
});
import { listUserListRules } from '@/lib/api/user-list';
import type { UserListRulesParams, UserListRulesResult } from '@/lib/api/user-list';
import { mockUserListRulesList } from '@/lib/mock/fixtures';
import { UserListPage } from '../UserListPage';

const wrap = (retry: boolean | number = false) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry, retryDelay: 1_000 } } })}>
    <NextIntlClientProvider locale="zh" messages={zh}><UserListPage embedded /></NextIntlClientProvider>
  </QueryClientProvider>,
);

beforeEach(() => {
  (listUserListRules as ReturnType<typeof vi.fn>).mockImplementation((params: UserListRulesParams): Promise<UserListRulesResult> => {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 10;
    const query = params.search?.toLowerCase() ?? '';
    const rows = mockUserListRulesList().items.filter((rule) => {
      const metadata = JSON.parse(rule.metadata ?? '{}') as { list_type?: string };
      if (metadata.list_type !== params.listType) return false;
      if (!query) return true;
      return rule.condition_tree.toLowerCase().includes(query) || String(rule.id).includes(query);
    });
    return Promise.resolve({
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      serverPaginated: true,
    });
  });
});

describe('UserListPage', () => {
  it('defaults to blacklist tab and shows total 共 21 条', async () => {
    wrap();
    await waitFor(() => expect(screen.getByText(/共/)).toBeTruthy());
    expect(screen.getByText(/21/)).toBeTruthy();
  });
  it('search "alice" filters to matching rows and resets pagination', async () => {
    wrap();
    await waitFor(() => screen.getByText('UB-20260320-001'));
    fireEvent.change(screen.getByPlaceholderText(/搜索规则ID/), { target: { value: 'alice' } });
    await waitFor(() => {
      expect(screen.queryByText('UB-20260319-002')).toBeNull();
      expect(screen.getByText('UB-20260320-001')).toBeTruthy();
    });
  });
  it('renders sender, recipient and owner when the API decodes JSON fields into objects', async () => {
    const [firstRule] = mockUserListRulesList().items;
    (listUserListRules as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      items: [{
        ...firstRule,
        condition_tree: JSON.parse(firstRule.condition_tree) as unknown as string,
        metadata: JSON.parse(firstRule.metadata ?? '{}') as unknown as string,
      }],
    });

    wrap();

    expect(await screen.findByText('spam@bad-actor.com')).toBeTruthy();
    expect(screen.getByText('alice@company.com')).toBeTruthy();
    expect(screen.getByText('admin@company.com')).toBeTruthy();
  });
  it('empty search shows 暂无数据', async () => {
    wrap();
    await waitFor(() => screen.getByText('UB-20260320-001'));
    fireEvent.change(screen.getByPlaceholderText(/搜索规则ID/), { target: { value: 'zzz-none' } });
    await waitFor(() => expect(screen.getByText('暂无数据')).toBeTruthy());
  });

  it('jump-page input clamps out-of-range values to [1, maxPage] (D-007)', async () => {
    wrap();
    // 21 blacklist rows @ 10/page => 3 pages; id 21 (created 2026-03-15) is the
    // only row on page 3.
    await waitFor(() => screen.getByText('UB-20260320-001'));
    const jumpInput = screen.getByRole('spinbutton');

    fireEvent.change(jumpInput, { target: { value: '99' } });
    fireEvent.keyDown(jumpInput, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('UB-20260315-021')).toBeTruthy());
    expect(screen.queryByText('UB-20260320-001')).toBeNull();

    const resetInput = screen.getByRole('spinbutton');
    fireEvent.change(resetInput, { target: { value: '0' } });
    await waitFor(() => expect(resetInput).toHaveValue(0));
    fireEvent.keyDown(resetInput, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('UB-20260320-001')).toBeTruthy());
    expect(screen.queryByText('UB-20260315-021')).toBeNull();
  });

  it('selection is cleared when switching tabs', async () => {
    wrap();
    await waitFor(() => screen.getByText('UB-20260320-001'));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 UB-20260320-001' }));
    await waitFor(() => expect(screen.getByText(/删除选中/)).toBeTruthy());

    fireEvent.click(screen.getByText('白名单规则'));
    await waitFor(() => expect(screen.queryByText(/删除选中/)).toBeNull());
  });

  it('首次加载失败立即显示错误，并允许手动重试（GT-12153）', async () => {
    const listRules = listUserListRules as ReturnType<typeof vi.fn>;
    listRules.mockRejectedValueOnce(new Error('server unavailable'));
    const callCountBefore = listRules.mock.calls.length;
    // 模拟应用根 Provider 的自动重试默认值；组件必须自行关闭它，不能让错误态
    // 在 3 秒反馈窗口内一直停留在骨架屏。
    wrap(3);

    expect(await screen.findByText('加载失败', {}, { timeout: 500 })).toBeTruthy();
    const retry = screen.getByRole('button', { name: '重试' });
    fireEvent.click(retry);

    await waitFor(() => expect(screen.getByText('UB-20260320-001')).toBeTruthy());
    expect(listRules).toHaveBeenCalledTimes(callCountBefore + 2);
  });
});
