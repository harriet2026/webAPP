import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// GT-12729: StageRulesPage 对 tenant_config 物化生成的规则应只读——隐藏/禁用编辑、
// 删除按钮,并禁用启停开关,与后端 DB 层 CRUD 403 保持一致(见 task-8-brief.md)。

const { mockApiRequest, mockGetUnifiedRules } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockGetUnifiedRules: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
  apiRequest: mockApiRequest,
}));

vi.mock('@/lib/api/unified-rules', () => ({
  getUnifiedRules: mockGetUnifiedRules,
  deleteUnifiedRule: vi.fn(),
  toggleUnifiedRule: vi.fn(),
  exportUnifiedRules: vi.fn(),
  previewUnifiedRulesImport: vi.fn(),
  executeUnifiedRulesImport: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), key);
    return key;
  },
  useLocale: () => 'zh',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/zh/rules/action/mail',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => ({
    selectedTenantId: 2,
    effectiveTenantId: 2,
    setSelectedTenant: vi.fn(),
    isSystemAdmin: true,
    isAdmin: true,
    isViewingAllTenants: false,
  }),
}));

import { StageRulesPage } from '@/components/rules/StageRulesPage';

const managedRule = {
  id: 101,
  name: '租户配置物化规则',
  description: '',
  rule_class: 'action' as const,
  stage: 'mail' as const,
  priority: 500,
  condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'isNotNull' }),
  action: 'reject',
  is_active: true,
  page: 'action',
  tags: [],
  metadata: JSON.stringify({ managed_by: 'tenant_config' }),
  is_system: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const normalRule = {
  id: 102,
  name: '普通规则',
  description: '',
  rule_class: 'action' as const,
  stage: 'mail' as const,
  priority: 400,
  condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'isNotNull' }),
  action: 'reject',
  is_active: true,
  page: 'action',
  tags: [],
  metadata: undefined,
  is_system: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(ui: ReturnType<typeof createElement>) {
  const qc = createQueryClient();
  return render(createElement(QueryClientProvider, { client: qc }, ui));
}

describe('StageRulesPage managed 规则只读(GT-12729)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('managed_by=tenant_config 的规则:编辑/删除按钮禁用,启停开关禁用;普通规则不受影响', async () => {
    mockGetUnifiedRules.mockResolvedValue([managedRule, normalRule]);
    renderPage(createElement(StageRulesPage, { stage: 'mail' }));

    await waitFor(() => expect(screen.getByText('租户配置物化规则')).toBeTruthy());
    expect(screen.getByText('普通规则')).toBeTruthy();

    const rows = screen.getAllByRole('row');
    // 第一行是表头,其余按渲染顺序对应 rules 数组。
    const managedRow = rows[1];
    const normalRow = rows[2];

    const managedButtons = managedRow.querySelectorAll('button');
    const normalButtons = normalRow.querySelectorAll('button');

    // 每行按钮顺序: [启停, 编辑, 删除]
    expect(managedButtons).toHaveLength(3);
    expect(normalButtons).toHaveLength(3);

    managedButtons.forEach((btn) => expect(btn).toBeDisabled());
    normalButtons.forEach((btn) => expect(btn).not.toBeDisabled());
  });
});
