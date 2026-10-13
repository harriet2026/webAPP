import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import { ApiError } from '@/lib/api/client';
import { RuleEffectivenessPage } from './RuleEffectivenessPage';

// 真实的 useQuery：GT-14364 的根因是 TanStack Query 在从未成功过的查询上重新请求时，
// 会清空 error 并回到 pending，只有真实实现才能复现这一点。
const fetchReport = vi.fn<() => Promise<unknown>>();
vi.mock('./hooks/useRuleEffectiveness', async (importOriginal) => ({
  ...await importOriginal<typeof import('./hooks/useRuleEffectiveness')>(),
  useRuleEffectiveness: () => useQuery({ queryKey: ['rule-effectiveness-test'], queryFn: () => fetchReport(), retry: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ setSelectedTenant: vi.fn(), isSystemAdmin: false }) }));
vi.mock('@/contexts/product-form-context', () => ({ useProductForm: () => ({ setViewer: vi.fn() }) }));
vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({ useSecurityScope: () => ({ scopeActive: false }) }));
vi.mock('./FilterBar', () => ({ FilterBar: () => null }));
vi.mock('./KpiCards', () => ({ KpiCards: () => null }));
vi.mock('./ObserveTimeoutAlert', () => ({ ObserveTimeoutAlert: () => null }));
vi.mock('./DetailTable', () => ({ DetailTable: () => <div data-testid="rule-effectiveness-detail-table" /> }));

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <RuleEffectivenessPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => fetchReport.mockReset());

// GT-14364：首次加载失败后点击「重新加载」，响应返回前错误区域与按钮必须保留，
// 按钮禁用并显示「正在重试」；成功后错误区域消失，再次失败则按钮恢复可点。
describe('rule effectiveness manual retry state (GT-14364)', () => {
  it('keeps the error card with a disabled retrying button until the retry succeeds', async () => {
    fetchReport.mockRejectedValueOnce(new ApiError(500, 'boom'));
    const pending = deferred();
    fetchReport.mockReturnValueOnce(pending.promise);
    renderPage();

    const retry = await screen.findByTestId('rule-effectiveness-retry');
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await act(() => new Promise((r) => setTimeout(r, 0))); // TanStack Query 经 setTimeout(0) 通知组件；等一个宏任务让重试开始后的状态渲染出来，再断言用户实际看到的界面

    expect(screen.getByTestId('rule-effectiveness-error-state')).toBeInTheDocument();
    expect(screen.getByTestId('rule-effectiveness-retry')).toBeDisabled();
    expect(screen.getByTestId('rule-effectiveness-retry')).toHaveTextContent('正在重试');

    await act(async () => { pending.resolve({ kpi: {}, rows: [], degraded_modules: [] }); });
    expect(screen.queryByTestId('rule-effectiveness-error-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('rule-effectiveness-detail-table')).toBeInTheDocument();
  });

  it('re-enables the retry button when the retry fails again and keeps the forbidden variant', async () => {
    fetchReport.mockRejectedValueOnce(new ApiError(403, 'forbidden'));
    const pending = deferred();
    fetchReport.mockReturnValueOnce(pending.promise);
    renderPage();

    fireEvent.click(await screen.findByTestId('rule-effectiveness-retry'));
    await act(() => new Promise((r) => setTimeout(r, 0)));
    // 重试进行中仍保留原错误类型（403 → 无权查看）的卡片，不退化为通用加载失败或空白。
    expect(screen.getByTestId('rule-effectiveness-forbidden-state')).toBeInTheDocument();
    expect(screen.getByTestId('rule-effectiveness-retry')).toBeDisabled();

    await act(async () => { pending.reject(new ApiError(500, 'still down')); });
    expect(screen.getByTestId('rule-effectiveness-error-state')).toBeInTheDocument();
    expect(screen.getByTestId('rule-effectiveness-retry')).toBeEnabled();
    expect(screen.getByTestId('rule-effectiveness-retry')).toHaveTextContent('重新加载');
  });
});
