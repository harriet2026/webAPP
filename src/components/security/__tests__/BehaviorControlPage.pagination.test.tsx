import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import { listBehaviorControlRules } from '@/lib/api/behavior-control';
import { BehaviorControlPage } from '../BehaviorControlPage';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: false, user: { role: 'tenant_admin', tenant_id: 1 } }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn(), effectiveTenantId: 1 }),
}));

vi.mock('@/lib/api/behavior-control', () => ({
  buildConditionTreeFromForm: () => ({ type: 'condition', field: 'sender', operator: 'isNotNull' }),
  listBehaviorControlRules: vi.fn(),
  resolveBehaviorControlRule: (view: unknown) => view,
  deleteBehaviorControlRule: vi.fn(),
}));

vi.mock('../ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../behavior-control/BehaviorControlTable', () => ({
  BehaviorControlTable: ({ views }: { views: unknown[] }) => (
    <div data-testid="behavior-control-rendered-row-count">{views.length}</div>
  ),
}));

vi.mock('../behavior-control/BehaviorControlDrawer', () => ({
  BehaviorControlDrawer: () => null,
}));

vi.mock('@/components/rules/RuleImportExportDialog', () => ({
  RuleImportExportDialog: () => null,
}));

const mockListBehaviorControlRules = listBehaviorControlRules as ReturnType<typeof vi.fn>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh}>
        <BehaviorControlPage embedded />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockListBehaviorControlRules.mockReset();
  mockListBehaviorControlRules.mockResolvedValue({
    items: Array.from({ length: 17 }, (_, index) => ({
      rule: {
        id: index + 1,
        name: `rule-${index + 1}`,
        priority: index + 1,
        is_active: true,
      },
      meta: {
        direction: 'outbound',
        object_config: { type: 'sender', value: `user-${index + 1}@example.test` },
      },
      list_id_display: `BC#${index + 1}`,
    })),
  });
});

describe('BehaviorControlPage pagination', () => {
  it('GT-13652: keeps the page-size selector available when a new size leaves one page', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId('behavior-control-page-size')).toHaveTextContent('10 条/页');
    expect(screen.getByTestId('behavior-control-page-2')).toBeVisible();

    await user.click(screen.getByTestId('behavior-control-page-size'));
    await user.click(await screen.findByTestId('behavior-control-page-size-20'));

    await waitFor(() => {
      expect(screen.getByTestId('behavior-control-rendered-row-count')).toHaveTextContent('17');
      expect(screen.getByTestId('behavior-control-page-size')).toHaveTextContent('20 条/页');
    });
    expect(screen.queryByTestId('behavior-control-page-2')).not.toBeInTheDocument();
  });
});
