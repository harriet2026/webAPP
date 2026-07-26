import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const { mockApiRequest } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
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
  toast: { success: vi.fn(), error: vi.fn() },
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
