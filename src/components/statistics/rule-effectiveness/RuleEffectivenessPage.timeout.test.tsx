import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import { RuleEffectivenessPage } from './RuleEffectivenessPage';

// 真实的 useRuleEffectiveness 与 TanStack Query；只替换最底层的作用域请求函数：
// hang=true 时请求永不返回（只响应中止信号），模拟服务或连接卡住。
const EMPTY_PAGE = { kpi: {}, rows: [], degraded_modules: [], rows_total: 0, page: 1, page_size: 100 };
const sent: string[] = [];
let hang = true;
const scopedRequest = vi.fn((path: string, options?: { signal?: AbortSignal }) => {
  sent.push(path);
  if (!hang) return Promise.resolve(EMPTY_PAGE);
  return new Promise((_, reject) => {
    options?.signal?.addEventListener('abort', () => reject(options.signal?.reason ?? new DOMException('aborted', 'AbortError')));
  });
});
vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({
  useSecurityScope: () => ({ scopeActive: false, scopeResolved: true, resolvedScopeTenant: null, scopedRequest }),
}));
vi.mock('@/lib/mock/storage', () => ({ isMockEnabled: () => false }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ setSelectedTenant: vi.fn(), isSystemAdmin: false }) }));
vi.mock('@/contexts/product-form-context', () => ({ useProductForm: () => ({ setViewer: vi.fn() }) }));
vi.mock('./FilterBar', () => ({ FilterBar: () => null }));
vi.mock('./KpiCards', () => ({ KpiCards: () => null }));
vi.mock('./ObserveTimeoutAlert', () => ({ ObserveTimeoutAlert: () => null }));
vi.mock('./DetailTable', () => ({
  DetailTable: ({ isLoading }: { isLoading: boolean }) => <div data-testid={isLoading ? 'rule-effectiveness-loading-state' : 'rule-effectiveness-detail-table'} />,
}));

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <RuleEffectivenessPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => { vi.useFakeTimers(); hang = true; sent.length = 0; });
afterEach(() => { vi.useRealTimers(); });

// GT-14373：统计请求持续无响应时，30 秒客户端超时后结束加载，显示超时说明与重新加载入口，
// 不显示空数据、不自动重试；服务恢复后点击重新加载显示结果。
describe('rule effectiveness client timeout (GT-14373)', () => {
  it('shows the timeout card after 30s without auto retry, and recovers on manual retry', async () => {
    renderPage();
    await advance(29_000);
    expect(screen.getByTestId('rule-effectiveness-loading-state')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-effectiveness-timeout-state')).not.toBeInTheDocument();

    await advance(1_500);
    expect(screen.getByTestId('rule-effectiveness-timeout-state')).toHaveTextContent('请求超时');
    expect(screen.getByTestId('rule-effectiveness-retry')).toBeEnabled();
    expect(screen.queryByTestId('rule-effectiveness-loading-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rule-effectiveness-error-state')).not.toBeInTheDocument();

    // 超时不自动重试：再等一分钟也只发过一次请求。
    await advance(60_000);
    expect(sent).toHaveLength(1);

    hang = false;
    fireEvent.click(screen.getByTestId('rule-effectiveness-retry'));
    await advance(100);
    expect(sent).toHaveLength(2);
    expect(screen.queryByTestId('rule-effectiveness-timeout-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('rule-effectiveness-detail-table')).toBeInTheDocument();
  });
});
