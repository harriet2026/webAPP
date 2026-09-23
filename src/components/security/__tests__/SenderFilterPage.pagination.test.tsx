import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import zh from '@/../messages/zh.json';
import { listSenderFilterGroups, listSenderFilterRules } from '@/lib/api/sender-filter';
import { SenderFilterPage } from '../SenderFilterPage';

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: false, user: { role: 'tenant_admin', tenant_id: 1 } }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn(), effectiveTenantId: 1 }),
}));

vi.mock('@/lib/api/sender-filter', () => ({
  buildConditionTree: vi.fn(),
  filterSenderFilterRules: vi.fn((rules: unknown[]) => rules),
  formatListId: vi.fn(),
  listSenderFilterGroups: vi.fn(),
  listSenderFilterRules: vi.fn(),
  resolveSenderFilterRule: vi.fn(),
}));

vi.mock('@/lib/api/mail-routing', () => ({
  listTenantDomains: vi.fn().mockResolvedValue([]),
}));

vi.mock('../sender-filter/SenderFilterTable', () => ({
  SenderFilterTable: ({ pageSize }: { pageSize: number }) => (
    <div data-testid="sender-filter-page-size">{pageSize}</div>
  ),
}));

vi.mock('../sender-filter/SenderFilterDrawer', () => ({
  SenderFilterDrawer: () => null,
}));

vi.mock('../ModuleMasterSwitch', () => ({
  ModuleMasterSwitch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shared/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/components/rules/RuleImportExportDialog', () => ({
  RuleImportExportDialog: () => null,
}));

const mockListSenderFilterRules = vi.mocked(listSenderFilterRules);
const mockListSenderFilterGroups = vi.mocked(listSenderFilterGroups);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="zh" messages={zh}>
        <SenderFilterPage embedded />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockListSenderFilterRules.mockReset();
  mockListSenderFilterGroups.mockReset();
  mockListSenderFilterRules.mockResolvedValue({ items: [] });
  mockListSenderFilterGroups.mockResolvedValue({ senderGroups: [], ipGroups: [] });
});

describe('SenderFilterPage pagination', () => {
  it('GT-13672: starts with the same 10-row page size as behavior control', async () => {
    renderPage();

    expect(await screen.findByTestId('sender-filter-page-size')).toHaveTextContent('10');
  });
});
