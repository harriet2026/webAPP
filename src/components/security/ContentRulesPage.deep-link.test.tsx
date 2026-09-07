import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Rule } from '@/types/unified-rules';
import { ContentRulesPage } from './ContentRulesPage';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values?.ruleId ? `${key}:${values.ruleId}` : key,
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mocks.apiRequest }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSystemAdmin: false,
    isTenantAdmin: true,
    selectedTenantId: 5,
    user: { role: 'tenant_admin' },
  }),
}));

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => ({ capabilities: { multiTenant: true } }),
}));

vi.mock('@/lib/api/use-api-error-message', () => ({
  useApiErrorMessage: () => (error: Error) => error.message,
}));

vi.mock('@/components/security/ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/security/content-rules/ContentRulesTable', () => ({
  ContentRulesTable: () => <div data-testid="content-rules-table" />,
}));

vi.mock('@/components/security/content-rules/ContentRuleDrawer', () => ({
  ContentRuleDrawer: ({
    open,
    editingRule,
  }: {
    open: boolean;
    editingRule: { rule: Rule } | null;
  }) => open ? <div data-testid="content-rule-drawer">{editingRule?.rule.id}</div> : null,
}));

vi.mock('@/components/shared/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/rules/RuleImportExportDialog', () => ({ RuleImportExportDialog: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const deepLinkedRule = {
  id: 26694,
  name: 'qcr-outbound-body-reject-action',
  page: 'content_rules',
  rule_class: 'action',
  stage: 'data',
  priority: 100,
  action: 'reject',
  is_active: true,
  metadata: {
    feature: 'content_rules',
    match_type: 'keyword',
    match_content: 'probe',
    scopes: ['text_body'],
    directions: { send: { enabled: true, action: 'reject' } },
  },
  condition_tree: {
    type: 'AND',
    children: [
      { type: 'condition', field: 'is_outbound', operator: 'eq', value: 'true' },
      { type: 'condition', field: 'text_body', operator: 'contain', value: 'probe' },
    ],
  },
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
} as unknown as Rule;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ContentRulesPage embedded deepLinkRuleID={26694} deepLinkRuleRef="CR-26694" />
    </QueryClientProvider>,
  );
}

describe('ContentRulesPage disposal-basis deep link (GT-12583 reopened)', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
  });

  it('loads the rule directly and opens its edit drawer even when it is absent from the current page', async () => {
    mocks.apiRequest.mockImplementation(async (path: string) => {
      if (path === '/unified-rules/26694') return deepLinkedRule;
      return { items: [], total: 0, page: 1, page_size: 10 };
    });

    renderPage();

    expect(await screen.findByTestId('content-rule-drawer')).toHaveTextContent('26694');
    expect(mocks.apiRequest).toHaveBeenCalledWith('/unified-rules/26694');
  });

  it('shows one non-enumerating message when the rule is deleted or inaccessible', async () => {
    mocks.apiRequest.mockImplementation(async (path: string) => {
      if (path === '/unified-rules/26694') throw new Error('404');
      return { items: [], total: 0, page: 1, page_size: 10 };
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('content-rule-deep-link-unavailable')).toHaveTextContent(
        'contentRules.deepLinkUnavailable:CR-26694',
      );
    });
    expect(screen.queryByTestId('content-rule-drawer')).not.toBeInTheDocument();
  });
});
