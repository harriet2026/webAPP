import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';

const access = vi.fn();
vi.mock('../access', () => ({ useThreatRetroAccess: () => access() }));
vi.mock('@/lib/api/client', () => ({ useApiRequest: () => ({ apiRequest: vi.fn() }) }));
vi.mock('@/lib/api/use-api-error-message', () => ({ useApiErrorMessage: () => () => 'error' }));
vi.mock('@/lib/api/threat-retro', () => ({
  listStrategies: vi.fn(async () => []),
  updateStrategy: vi.fn(),
  deleteStrategy: vi.fn(),
  cloneStrategy: vi.fn(),
}));
vi.mock('./strategy-list-table', () => ({
  StrategyListTable: ({ isAdmin }: { isAdmin: boolean }) => (
    <button data-testid="strategy-add" disabled={!isAdmin}>create</button>
  ),
}));
vi.mock('./strategy-sheet', () => ({ StrategySheet: () => null }));
vi.mock('@/components/shared/confirm-dialog', () => ({ ConfirmDialog: () => null }));

import { StrategyTab } from './strategy-tab';

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <StrategyTab />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('Threat retro strategy permissions', () => {
  beforeEach(() => {
    access.mockReturnValue({ status: 'ready', canView: true, canEdit: false, readOnly: true });
  });

  it('disables strategy creation for an auditor', () => {
    renderTab();
    expect(screen.getByTestId('strategy-add')).toBeDisabled();
  });

  it('enables strategy creation for tenant operations', () => {
    access.mockReturnValue({ status: 'ready', canView: true, canEdit: true, readOnly: false });
    renderTab();
    expect(screen.getByTestId('strategy-add')).toBeEnabled();
  });
});
