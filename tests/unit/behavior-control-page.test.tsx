import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import userEvent from '@testing-library/user-event';

const { mockApiRequest, mockToastSuccess } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
  apiRequest: mockApiRequest,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), key);
    return key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mockToastSuccess, error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true, hasPermission: () => true, showAdvancedRules: false, user: { role: 'system_admin' } }),
}));

vi.mock('@/components/shared/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}));

import { BehaviorControlPage } from '@/components/security/BehaviorControlPage';

const bcRule = {
  id: 42,
  name: 'Test BC Rule',
  description: '',
  rule_class: 'action' as const,
  stage: 'rcpt' as const,
  priority: 600,
  condition_tree: { type: 'condition', field: 'sender', operator: 'isNotNull' },
  action: 'audit',
  is_active: true,
  page: 'behavior_control',
  tags: [],
  // The unified-rules list API decodes JSONB fields before returning them.
  metadata: {
    feature: 'behavior_control',
    direction: 'outbound',
    object_config: { type: 'global' },
    time_window: '15min',
    dim_a: 'mail_count',
    threshold_a: 50,
    or_enabled: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const bcRuleComplex = {
  id: 7,
  name: 'Bad Config',
  description: '',
  rule_class: 'action' as const,
  stage: 'rcpt' as const,
  priority: 300,
  condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'isNotNull' }),
  action: 'audit',
  is_active: true,
  page: 'behavior_control',
  tags: [],
  metadata: JSON.stringify({ feature: 'wrong' }),
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

describe('BehaviorControlPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rules with BC#N IDs', async () => {
    mockApiRequest.mockResolvedValue({ items: [bcRule] });
    renderPage(createElement(BehaviorControlPage));

    await waitFor(() => {
      expect(screen.getByText('Test BC Rule')).toBeInTheDocument();
    });
    expect(screen.getByText('BC#42')).toBeInTheDocument();
    expect(screen.getByText('behaviorControl.direction.outbound')).toBeInTheDocument();
    expect(screen.queryByText('behaviorControl.complexRule')).not.toBeInTheDocument();
  });

  it('sorts rules by ID ascending regardless of priority', async () => {
    mockApiRequest.mockResolvedValue({
      items: [
        { ...bcRule, id: 44, name: 'Rule 44', priority: 100 },
        { ...bcRule, id: 42, name: 'Rule 42', priority: 900 },
        { ...bcRule, id: 43, name: 'Rule 43', priority: 500 },
      ],
    });
    renderPage(createElement(BehaviorControlPage));

    const rows = await screen.findAllByTestId(/^behavior-control-row-/);
    expect(rows.map((row) => row.dataset.testid)).toEqual([
      'behavior-control-row-42',
      'behavior-control-row-43',
      'behavior-control-row-44',
    ]);
  });

  it('GT-12168 renders only the switch in the status column and toggles a rule', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({
      items: [bcRule, { ...bcRule, id: 43, name: 'Disabled BC Rule', is_active: false }],
    });
    renderPage(createElement(BehaviorControlPage));

    await waitFor(() => {
      expect(screen.getByTestId('behavior-control-toggle-42')).toBeChecked();
    });
    expect(screen.getByTestId('behavior-control-toggle-43')).not.toBeChecked();
    expect(screen.getByTestId('behavior-control-status-42')).toHaveTextContent('');
    expect(screen.getByTestId('behavior-control-status-43')).toHaveTextContent('');
    expect(screen.getByTestId('behavior-control-status-42').querySelectorAll('[role="switch"]')).toHaveLength(1);
    expect(screen.getByTestId('behavior-control-status-43').querySelectorAll('[role="switch"]')).toHaveLength(1);

    await user.click(screen.getByTestId('behavior-control-toggle-42'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith('/unified-rules/42', {
      method: 'PUT',
      body: { is_active: false },
    }));
    expect(mockToastSuccess).toHaveBeenCalledWith('common.updateSuccess');
  });

  it('GT-13690 edits the rule enabled state in the rule drawer', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({
      items: [{ ...bcRule, is_active: false }],
    });
    renderPage(createElement(BehaviorControlPage));

    await user.click(await screen.findByTestId('behavior-control-edit-42'));
    const activeSwitch = await screen.findByTestId('behavior-control-rule-active');
    expect(activeSwitch).not.toBeChecked();

    await user.click(activeSwitch);
    expect(activeSwitch).toBeChecked();
    await user.click(screen.getByTestId('behavior-control-save'));

    await waitFor(() => expect(mockApiRequest).toHaveBeenCalledWith('/unified-rules/42', expect.objectContaining({
      method: 'PUT',
      body: expect.objectContaining({ is_active: true }),
    })));
  });

  it('prefills the date input from a saved RFC3339 valid-until value', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({
      items: [{ ...bcRule, valid_until: '2026-12-31T00:00:00Z' }],
    });
    renderPage(createElement(BehaviorControlPage));

    await user.click(await screen.findByTestId('behavior-control-edit-42'));
    expect(await screen.findByDisplayValue('2026-12-31')).toHaveAttribute('type', 'date');
  });

  it('marks an expired rule in the list and editing preview', async () => {
    const user = userEvent.setup();
    const expiredRule = { ...bcRule, valid_until: '2000-01-01T00:00:00Z' };
    const activeRule = { ...bcRule, id: 43, name: 'Active BC Rule', valid_until: '2999-01-01T00:00:00Z' };
    mockApiRequest.mockResolvedValue({ items: [expiredRule, activeRule] });
    renderPage(createElement(BehaviorControlPage));

    const status = await screen.findByTestId('behavior-control-status-42');
    expect(status).toHaveTextContent('behaviorControl.filter.expired');
    expect(status).toHaveAttribute('data-slot', 'badge');
    expect(status).toHaveClass('text-destructive');
    expect(screen.queryByTestId('behavior-control-toggle-42')).not.toBeInTheDocument();
    expect(screen.getByTestId('behavior-control-toggle-43')).toBeChecked();
    expect(screen.getByTestId('behavior-control-row-42')).toHaveClass('opacity-60');

    await user.click(screen.getByTestId('behavior-control-filter-status'));
    await user.click(await screen.findByRole('option', { name: 'behaviorControl.filter.enabled' }));
    await waitFor(() => expect(screen.queryByTestId('behavior-control-row-42')).not.toBeInTheDocument());
    expect(screen.getByTestId('behavior-control-row-43')).toBeInTheDocument();

    await user.click(screen.getByTestId('behavior-control-filter-status'));
    await user.click(await screen.findByRole('option', { name: 'behaviorControl.filter.expired' }));
    await waitFor(() => expect(screen.queryByTestId('behavior-control-row-43')).not.toBeInTheDocument());
    expect(screen.getByTestId('behavior-control-row-42')).toBeInTheDocument();

    await user.click(screen.getByTestId('behavior-control-edit-42'));
    expect(await screen.findByTestId('behavior-control-preview-expired')).toHaveTextContent(
      'behaviorControl.preview.expired',
    );
  });

  it('marks complex rules with amber badge', async () => {
    mockApiRequest.mockResolvedValue({ items: [bcRuleComplex] });
    renderPage(createElement(BehaviorControlPage));

    await waitFor(() => {
      expect(screen.getByText('behaviorControl.complexRule')).toBeInTheDocument();
    });
  });

  it('shows empty state when no rules', async () => {
    mockApiRequest.mockResolvedValue({ items: [] });
    renderPage(createElement(BehaviorControlPage));

    await waitFor(() => {
      expect(screen.getByText('behaviorControl.empty')).toBeInTheDocument();
    });
  });

  it('uses the delete-success toast after deleting a rule', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({ items: [bcRule] });
    renderPage(createElement(BehaviorControlPage));

    const ruleName = await screen.findByText('Test BC Rule');
    const row = ruleName.closest('tr');
    expect(row).not.toBeNull();
    const rowButtons = within(row as HTMLTableRowElement).getAllByRole('button');
    await user.click(rowButtons[rowButtons.length - 1]);
    await user.click(screen.getByRole('button', { name: 'common.delete' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('behaviorControl.toast.deleteOk');
    });
  });

  it('opens the import and export entries on their matching tabs', async () => {
    mockApiRequest.mockResolvedValue({ items: [] });
    renderPage(createElement(BehaviorControlPage));

    await waitFor(() => expect(screen.getByTestId('behavior-control-import')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('behavior-control-import'));
    await waitFor(() => expect(screen.getByTestId('rule-import-file')).toBeVisible());
    expect(screen.queryByTestId('rule-export-execute')).toBeNull();

    fireEvent.click(screen.getByTestId('rule-import-export-close'));
    await waitFor(() => expect(screen.queryByTestId('rule-import-export-dialog')).toBeNull());

    fireEvent.click(screen.getByTestId('behavior-control-export'));
    await waitFor(() => expect(screen.getByTestId('rule-export-execute')).toBeVisible());
    expect(screen.queryByTestId('rule-import-file')).toBeNull();
  });

  // NOTE: the former "renders recipient-limit configuration section" and
  // "renders merged behavior-control dimensions" tests were removed. ad619374df
  // (「收信人限制独立成页」+ demo html_spec 对齐) split the recipient-limit config
  // out of BehaviorControlPage into its own RecipientCheckPage (covered by
  // recipient-check-page.test.tsx), and realigned the dimension model —
  // `merged_mail` is no longer a valid BehaviorDimension ('merged' is now a
  // RecipientLimitMode on that separate page), and BehaviorControlTable no
  // longer renders per-rule dimension labels in the list. Both tests asserted
  // the pre-split structure and can't apply to the current page.
});
