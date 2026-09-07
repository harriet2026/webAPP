import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => ({ effectiveTenantId: 7 }),
}));

vi.mock('@/hooks/use-permission', () => ({
  usePermission: () => ({ isSystemAdmin: false, isTenantAdmin: true }),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({
    apiRequest: vi.fn().mockResolvedValue({ items: [] }),
  }),
}));

vi.mock('@/lib/api/use-api-error-message', () => ({
  useApiErrorMessage: () => (error: unknown) => String(error),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('./group-edit-dialog', () => ({
  GroupEditDialog: () => null,
}));

vi.mock('./feature-group-drawer', () => ({
  FeatureGroupDrawer: () => null,
}));

vi.mock('@/components/shared/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));

import { GroupManagementPage } from './group-management-page';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GroupManagementPage />
    </QueryClientProvider>,
  );
}

describe('GroupManagementPage tab panel test ids (GT-13260)', () => {
  it('exposes a unique panel locator for every group type', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('groups-card');

    for (const type of ['ip', 'sender', 'recipient', 'content', 'feature']) {
      await user.click(screen.getByTestId(`groups-tab-${type}`));
      const panel = screen.getByTestId(`groups-tabpanel-${type}`);
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(within(panel).getByTestId('groups-new')).toBeVisible();
    }
  });
});
