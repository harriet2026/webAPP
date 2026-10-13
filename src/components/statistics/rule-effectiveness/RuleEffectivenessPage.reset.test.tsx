import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import { RuleEffectivenessPage } from './RuleEffectivenessPage';

// 真实的 useQuery（与产品 hook 相同的 60 秒缓存）：重置回到默认条件时会命中首次加载的缓存，
// 只有真实实现才能暴露"界面恢复默认但没有重新查询"。fetched 记录实际发出的查询参数；
// 页面的筛选栏使用真实 FilterBar。
const fetched: Array<Record<string, unknown>> = [];
let reportRows: Array<{ id: string }> = [];
vi.mock('./hooks/useRuleEffectiveness', async (importOriginal) => ({
  ...await importOriginal<typeof import('./hooks/useRuleEffectiveness')>(),
  useRuleEffectiveness: (params: Record<string, unknown>) => useQuery({
    queryKey: ['rule-effectiveness', params],
    queryFn: () => { fetched.push(params); return Promise.resolve({ kpi: {}, rows: reportRows, degraded_modules: [] }); },
    staleTime: 60_000,
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-tenant', () => ({ useTenant: () => ({ setSelectedTenant: vi.fn(), isSystemAdmin: true }) }));
vi.mock('@/contexts/product-form-context', () => ({ useProductForm: () => ({ setViewer: vi.fn() }) }));
vi.mock('@/components/statistics/security-overview/hooks/useSecurityScope', () => ({ useSecurityScope: () => ({ scopeActive: true }) }));
vi.mock('@/components/statistics/security-overview/TenantScopeSelector', () => ({
  TenantScopeSelector: ({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) => (
    <button type="button" data-testid="tenant-scope-stub" onClick={() => onChange(5)}>{value ?? 'all'}</button>
  ),
}));
vi.mock('./KpiCards', () => ({ KpiCards: () => null }));
vi.mock('./ObserveTimeoutAlert', () => ({ ObserveTimeoutAlert: () => null }));
vi.mock('./DetailTable', () => ({ DetailTable: ({ rows, pagination }: {
  rows: Array<{ id: string }>;
  pagination: { page: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void };
}) => <div>
  <span data-testid="visible-rows">{rows.map((row) => row.id).join(',')}</span>
  <span data-testid="all-rows-total">{pagination.total}</span>
  <button data-testid="next-page" onClick={() => pagination.onPageChange(pagination.page + 1)}>Next</button>
  <button data-testid="page-size-10" onClick={() => pagination.onPageSizeChange(10)}>10</button>
</div> }));

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

// TanStack Query 经 setTimeout(0) 通知组件；等一个宏任务让查询与重渲染完成。
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));
const click = async (testid: string) => { fireEvent.click(screen.getByTestId(testid)); await settle(); };

afterEach(() => { fetched.length = 0; reportRows = []; });

// GT-14372：重置按钮恢复租户、时间、策略模块、观察时长的默认筛选并按默认条件重新查询；
// 已是默认条件时点击也要重新查询。
describe('rule effectiveness reset filters (GT-14372)', () => {
  it('paginates only details and resets the page when filters or page size change (GT-14083)', async () => {
    reportRows = Array.from({ length: 25 }, (_, i) => ({ id: `row-${i + 1}` }));
    renderPage();
    await settle();
    await waitFor(() => expect(screen.getByTestId('visible-rows').textContent?.split(',')).toHaveLength(20));
    await click('next-page');
    expect(screen.getByTestId('visible-rows')).toHaveTextContent(/^row-21,row-22,row-23,row-24,row-25$/);
    expect(screen.getByTestId('all-rows-total')).toHaveTextContent(/^25$/);
    expect(fetched).toHaveLength(1);

    await click('rule-effectiveness-timerange-filter');
    await click('rule-effectiveness-timerange-30d');
    await click('rule-effectiveness-timerange-filter');
    await click('rule-effectiveness-timerange-7d');
    expect(screen.getByTestId('visible-rows').textContent).toBe(reportRows.slice(0, 20).map((row) => row.id).join(','));
    await click('next-page');
    await click('page-size-10');
    expect(screen.getByTestId('visible-rows').textContent).toBe(reportRows.slice(0, 10).map((row) => row.id).join(','));
  });

  it('restores every filter to its default and re-queries with the default params', async () => {
    renderPage();
    await settle();
    expect(fetched).toHaveLength(1);
    const defaults = fetched[0];

    await click('tenant-scope-stub');
    await click('rule-effectiveness-timerange-filter');
    await click('rule-effectiveness-timerange-30d');
    await click('rule-effectiveness-module-filter');
    await click('rule-effectiveness-module-option-auth_spoofing');
    await click('rule-effectiveness-duration-filter');
    await click('rule-effectiveness-duration-option-lt7');
    const changed = fetched[fetched.length - 1];
    expect(changed).toMatchObject({ scopeTenantId: 5, durationBuckets: ['7to30', 'gt30'] });
    expect(changed.startDate).not.toBe(defaults.startDate);
    expect(changed.modules).not.toEqual(defaults.modules);
    const beforeReset = fetched.length;

    await click('rule-effectiveness-reset');

    // 只按默认条件重新查询一次，不再用修改后的条件多查一次。
    expect(fetched.slice(beforeReset)).toEqual([defaults]);
    expect(screen.getByTestId('rule-effectiveness-timerange-filter')).toHaveTextContent(zh.ruleEffectiveness.filter.timeRange['7d']);
    expect(screen.getByTestId('tenant-scope-stub')).toHaveTextContent('all');
  });

  it('re-queries when the filters are already at their defaults', async () => {
    renderPage();
    await settle();
    expect(fetched).toHaveLength(1);

    await click('rule-effectiveness-reset');

    expect(fetched).toHaveLength(2);
    expect(fetched[1]).toEqual(fetched[0]);
  });
});
