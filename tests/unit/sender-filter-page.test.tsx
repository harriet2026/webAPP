import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const mockApiRequest = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
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

vi.mock('@/components/rules/RuleImportExportDialog', () => ({
  RuleImportExportDialog: () => null,
}));

import { SenderFilterPage } from '@/components/security/SenderFilterPage';

const blacklistRule = {
  id: 1,
  name: 'Block bad sender',
  description: '',
  rule_class: 'action' as const,
  stage: 'rcpt' as const,
  priority: 100,
  condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'eq', value: 'spam@evil.com' }),
  action: 'reject',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const whitelistRule = {
  id: 2,
  name: 'Allow good sender',
  description: '',
  rule_class: 'action' as const,
  stage: 'rcpt' as const,
  priority: 200,
  condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'eq', value: 'friend@good.com' }),
  action: 'accept',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const complexRule = {
  id: 3,
  name: 'Complex rule',
  description: '',
  rule_class: 'action' as const,
  stage: 'rcpt' as const,
  priority: 300,
  condition_tree: JSON.stringify({ type: 'OR', children: [{ type: 'condition', field: 'sender', operator: 'eq', value: 'a@b.com' }, { type: 'condition', field: 'sender', operator: 'eq', value: 'c@d.com' }] }),
  action: 'reject',
  metadata: JSON.stringify({ feature: 'sender_filter', sender_config: { type: 'group', value: 'grp1' }, ip_range: { type: 'all' }, list_type: 'blacklist' }),
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage(ui: ReturnType<typeof createElement>) {
  const qc = createQueryClient();
  return render(
    createElement(QueryClientProvider, { client: qc }, ui),
  );
}

describe('SenderFilterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders blacklist rules by default', async () => {
    mockApiRequest.mockResolvedValue({ items: [blacklistRule, whitelistRule] });
    renderPage(createElement(SenderFilterPage));

    await waitFor(() => {
      expect(screen.getByText('Block bad sender')).toBeInTheDocument();
    });
    expect(screen.getByText('BL-20260101-001')).toBeInTheDocument();
    expect(screen.queryByText('Allow good sender')).not.toBeInTheDocument();
  });

  it('shows complex condition badge', async () => {
    mockApiRequest.mockResolvedValue({ items: [complexRule] });
    renderPage(createElement(SenderFilterPage));

    await waitFor(() => {
      expect(screen.getByText('Complex rule')).toBeInTheDocument();
    });
    expect(screen.getByText('senderFilter.complexCondition')).toBeInTheDocument();
  });

  it('switches to whitelist tab', async () => {
    mockApiRequest.mockResolvedValue({ items: [blacklistRule, whitelistRule] });
    renderPage(createElement(SenderFilterPage));

    await waitFor(() => {
      expect(screen.getByText('Block bad sender')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('senderFilter.whitelist'));

    await waitFor(() => {
      expect(screen.getByText('Allow good sender')).toBeInTheDocument();
    });
    expect(screen.getByText('WL-20260101-002')).toBeInTheDocument();
    expect(screen.queryByText('Block bad sender')).not.toBeInTheDocument();
  });

  it('opens drawer on add button click', async () => {
    mockApiRequest.mockResolvedValue({ items: [] });
    renderPage(createElement(SenderFilterPage));

    await waitFor(() => {
      expect(screen.getByText('senderFilter.createRule')).toBeInTheDocument();
    });

    const buttons = screen.getAllByText('senderFilter.createRule');
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('creates whitelist rules with whitelist_mode metadata', async () => {
    mockApiRequest.mockResolvedValue({ items: [] });
    renderPage(createElement(SenderFilterPage));

    await waitFor(() => {
      expect(screen.getByText('senderFilter.whitelist')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('senderFilter.whitelist'));
    const createButtons = screen.getAllByText('senderFilter.createRule');
    fireEvent.click(createButtons[createButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('senderFilter.whitelistMode')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/senderFilter\.ruleName/), {
      target: { value: 'Trusted sender' },
    });
    fireEvent.change(screen.getByPlaceholderText('senderFilter.senderPlaceholder_individual'), {
      target: { value: 'trusted@example.org' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith('/unified-rules', {
        method: 'POST',
        body: expect.objectContaining({
          action: 'accept',
          priority: 800,
          tags: ['sys:nocontent'],
          metadata: expect.objectContaining({
            feature: 'sender_filter',
            list_type: 'whitelist',
            whitelist_mode: 'bypass_content',
          }),
        }),
      });
    });
  });

  it('search filters rules', async () => {
    const ruleA = { ...blacklistRule, id: 10, name: 'Alpha rule', condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'eq', value: 'alpha@test.com' }) };
    const ruleB = { ...blacklistRule, id: 11, name: 'Beta rule', condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'eq', value: 'beta@test.com' }) };
    mockApiRequest.mockResolvedValue({ items: [ruleA, ruleB] });
    renderPage(createElement(SenderFilterPage));

    await waitFor(() => {
      expect(screen.getByText('Alpha rule')).toBeInTheDocument();
    });
    expect(screen.getByText('Beta rule')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('senderFilter.searchPlaceholder');
    fireEvent.change(searchInput, { target: { value: 'alpha' } });

    await waitFor(() => {
      expect(screen.getByText('Alpha rule')).toBeInTheDocument();
    });
    expect(screen.queryByText('Beta rule')).not.toBeInTheDocument();
  });

  it('searches raw conditions of complex rules by sender and IP', async () => {
    const complexIPRule = {
      ...complexRule,
      id: 12,
      name: 'Complex IP rule',
      metadata: undefined,
      condition_tree: JSON.stringify({
        type: 'OR',
        children: [
          { type: 'condition', field: 'sender', operator: 'eq', value: 'complex@example.test' },
          { type: 'condition', field: 'client_ip', operator: 'cidr', value: '203.0.113.0/24' },
        ],
      }),
    };
    mockApiRequest.mockResolvedValue({ items: [complexIPRule] });
    renderPage(createElement(SenderFilterPage));

    await waitFor(() => {
      expect(screen.getByText('Complex IP rule')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('senderFilter.searchPlaceholder');
    fireEvent.change(searchInput, { target: { value: '203.0.113.0/24' } });
    await waitFor(() => {
      expect(screen.getByText('Complex IP rule')).toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: 'complex@example.test' } });
    await waitFor(() => {
      expect(screen.getByText('Complex IP rule')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// GT-11721 / GT-11685 / GT-11486 防回归
// ---------------------------------------------------------------------------

import { toast } from 'sonner';

describe('SenderFilterPage GT-11721 状态筛选', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('工具栏提供状态筛选下拉，默认全部状态', async () => {
    mockApiRequest.mockResolvedValue({ items: [blacklistRule] });
    renderPage(createElement(SenderFilterPage));
    await waitFor(() => {
      expect(screen.getByText('Block bad sender')).toBeInTheDocument();
    });
    const trigger = screen.getByLabelText('senderFilter.statusFilter');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('senderFilter.statusAll');
  });
});

describe('SenderFilterPage GT-11685 重名 409 友好提示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('创建重名规则时 toast 显示"规则名称已存在"而非泛化错误', async () => {
    mockApiRequest.mockImplementation((path: string, opts?: { method?: string }) => {
      if (opts?.method === 'POST') {
        return Promise.reject(Object.assign(new Error('规则名称已存在'), { status: 409 }));
      }
      return Promise.resolve({ items: [] });
    });
    renderPage(createElement(SenderFilterPage));
    await waitFor(() => {
      expect(screen.getByText('senderFilter.createRule')).toBeInTheDocument();
    });
    const createButtons = screen.getAllByText('senderFilter.createRule');
    fireEvent.click(createButtons[createButtons.length - 1]);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/senderFilter\.ruleName/), {
      target: { value: 'Block bad sender' },
    });
    fireEvent.change(screen.getByPlaceholderText('senderFilter.senderPlaceholder_individual'), {
      target: { value: 'dup@evil.com' },
    });
    fireEvent.click(screen.getByText('common.save'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('senderFilter.errors.nameDuplicate');
    });
  });
});

describe('SenderFilterPage GT-11486 复杂规则编辑', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('复杂规则打开抽屉回填名称并仅提交基础字段的部分更新', async () => {
    mockApiRequest.mockResolvedValue({ items: [complexRule] });
    renderPage(createElement(SenderFilterPage));
    await waitFor(() => {
      expect(screen.getByText('Complex rule')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // 回填原规则名（QC REQ-2：抽屉不能是空白新建态）
    expect(screen.getByLabelText(/senderFilter\.ruleName/)).toHaveValue('Complex rule');
    // 只读/不支持提示
    expect(screen.getByText('senderFilter.complexEditTitle')).toBeInTheDocument();
    // 条件编辑控件隐藏（复杂条件不可在简易抽屉编辑）
    expect(screen.queryByPlaceholderText('senderFilter.senderPlaceholder_individual')).toBeNull();

    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => {
      const putCall = mockApiRequest.mock.calls.find(
        ([path, opts]) => path === '/unified-rules/3' && (opts as { method?: string })?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = (putCall![1] as { body: Record<string, unknown> }).body;
      expect(body.name).toBe('Complex rule');
      // 部分更新：绝不携带会覆写复杂条件/动作的字段
      expect(body).not.toHaveProperty('condition_tree');
      expect(body).not.toHaveProperty('metadata');
      expect(body).not.toHaveProperty('action');
      expect(body).not.toHaveProperty('tags');
    });
  });
});
