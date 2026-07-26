import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockApiRequest = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: mockApiRequest }),
}));

vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => ({ effectiveTenantId: null }),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => (key: string) => {
    const flat: Record<string, string> = {
      'sidebar.stageOnconnect': '连接阶段',
      'sidebar.stageMail': 'MAIL FROM',
      'sidebar.stageRcpt': 'RCPT TO',
      'sidebar.stageHeader': '邮件头',
      'sidebar.stageData': '邮件正文',
      'sidebar.stageSideline': '旁路阶段',
      'common.enabled': '已启用',
      'common.disabled': '已禁用',
      'common.updateSuccess': '更新成功',
      'advancedRules.allMustMatch': '所有条件都匹配',
      'advancedRules.anyMustMatch': '任意条件匹配',
      // The page title was i18n-ified (commit c46deade): PageHeader now reads
      // advancedRules.pipelineTitle instead of a hardcoded string. Echo the
      // shipped zh value so the "shows page title" assertion tracks the real
      // title text the user sees.
      'advancedRules.pipelineTitle': '规则流水线总览',
    };
    const prefixed = ns ? `${ns}.${key}` : key;
    return flat[prefixed] ?? flat[key] ?? key;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    createElement('a', { href, ...props }, children),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/components/shared/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'page-shell' }, children),
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
    createElement('div', { 'data-testid': 'page-header' },
      createElement('h1', null, title),
      actions,
    ),
}));

vi.mock('@/components/shared/status-badge', () => ({
  StatusBadge: ({ status }: { status: string }) => createElement('span', { 'data-testid': 'status-badge' }, status),
}));

import { RulePipelinePage } from '@/components/rules/RulePipelinePage';

// ─── Test data ────────────────────────────────────────────────────────────────

function makeRule(overrides: Partial<{
  id: number; name: string; rule_class: 'tag' | 'action' | 'route';
  stage: string; action: string; priority: number; is_active: boolean;
  tags: string[]; condition_tree: object;
}> = {}) {
  return {
    id: 1,
    name: 'Test Rule',
    rule_class: 'action' as const,
    stage: 'mail',
    action: 'reject',
    priority: 500,
    is_active: true,
    tags: [],
    condition_tree: JSON.stringify({ type: 'condition', field: 'sender', operator: 'suffix', value: '@evil.com' }),
    description: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  const qc = createQueryClient();
  return render(createElement(QueryClientProvider, { client: qc }, createElement(RulePipelinePage)));
}

// The redesigned pipeline (commit 35b17f21) renders a two-column flow diagram.
// Each stage is a node showing aggregate action-count chips (e.g. "reject ×1").
// Clicking a stage node opens a right-hand Sheet with the actual rule rows
// (sections "标签规则" / "动作规则"), where each action row carries an ActionBadge
// chip (✓ / 📥 / ⊘ / ↗) plus a FlowExitBadge (→ EXIT / → 旁路 / → 审核 / → 转移).
// The hardcoded stage-node labels are CONNECT / MAIL FROM / RCPT TO / HEADER / DATA / 旁路阶段.

// Helper: click a stage node then resolve the opened Sheet content scope.
async function openStageSheet(nodeLabel: string) {
  fireEvent.click(await screen.findByText(nodeLabel));
  const sheetHeader = await screen.findByText(`${nodeLabel} 阶段规则`);
  // The dialog/sheet container is the nearest role=dialog ancestor.
  const dialog = sheetHeader.closest('[role="dialog"]') as HTMLElement;
  return within(dialog ?? document.body);
}

// ─── Action categorization (visible via Sheet rows) ───────────────────────────

describe('RulePipelinePage — action categorization (via Sheet rows)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('classifies accept and quarantine as passthrough (✓ / 📥 chips, no terminate ⊘)', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [
          makeRule({ id: 1, stage: 'mail', action: 'accept', priority: 100 }),
          makeRule({ id: 2, stage: 'mail', action: 'quarantine', priority: 200 }),
        ]});
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('MAIL FROM');
    // accept renders the ✓ passthrough chip; quarantine renders 📥.
    expect(sheet.getByText(/✓/)).toBeInTheDocument();
    expect(sheet.getByText(/📥/)).toBeInTheDocument();
    // No hard-stop ⊘ chip since neither action terminates.
    expect(sheet.queryByText(/⊘/)).not.toBeInTheDocument();
  });

  it('classifies reject/disconnect/tempfail/bounce/discard as terminate (⊘ chips)', async () => {
    const terminateActions = ['reject', 'disconnect', 'tempfail', 'bounce', 'discard'];
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({
          items: terminateActions.map((action, i) =>
            makeRule({ id: i + 1, stage: 'data', action, priority: 100 + i, name: `Rule-${action}` }),
          ),
        });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('DATA');
    // All five hard-stop actions render the red ⊘ chip.
    expect(sheet.getAllByText(/⊘/).length).toBe(terminateActions.length);
  });

  it('classifies sideline and audit as terminate but soft (↗ chips, not ⊘)', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [
          makeRule({ id: 1, stage: 'data', action: 'sideline', priority: 300, name: 'SideRule' }),
          makeRule({ id: 2, stage: 'data', action: 'audit', priority: 200, name: 'AuditRule' }),
        ]});
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('DATA');
    // sideline / audit are non-hard-stop terminate → amber ↗ chip, never ✓ passthrough.
    expect(sheet.getAllByText(/↗/).length).toBe(2);
    expect(sheet.queryByText(/✓/)).not.toBeInTheDocument();
  });
});

// ─── Component rendering ──────────────────────────────────────────────────────

describe('RulePipelinePage — stage rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all 5 main stages plus sideline in pipeline order', async () => {
    mockApiRequest.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('CONNECT')).toBeInTheDocument());
    expect(screen.getByText('MAIL FROM')).toBeInTheDocument();
    expect(screen.getByText('RCPT TO')).toBeInTheDocument();
    expect(screen.getByText('HEADER')).toBeInTheDocument();
    expect(screen.getByText('DATA')).toBeInTheDocument();
    expect(screen.getByText('旁路阶段')).toBeInTheDocument();
  });

  it('shows page title', async () => {
    mockApiRequest.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('规则流水线总览')).toBeInTheDocument());
  });

  it('stage nodes show aggregate action-count chips, not rule names', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 1, stage: 'mail', action: 'reject' })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('MAIL FROM')).toBeInTheDocument());
    // The collapsed node shows a "reject ×1" count chip…
    expect(screen.getByText('reject ×1')).toBeInTheDocument();
    // …but the rule name itself only appears inside the stage Sheet.
    expect(screen.queryByText('Test Rule')).not.toBeInTheDocument();
  });

  it('clicking a stage node opens the Sheet with tag/action rule sections', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 1, stage: 'mail', action: 'reject', name: 'RejectSpam' })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('MAIL FROM');

    expect(sheet.getByText('RejectSpam')).toBeInTheDocument();
    expect(sheet.getByText('动作规则')).toBeInTheDocument();
    expect(sheet.getByText('标签规则')).toBeInTheDocument();
  });

  it('closing the Sheet hides the rule rows again', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 1, stage: 'mail', action: 'reject', name: 'RejectSpam' })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('MAIL FROM');
    expect(sheet.getByText('RejectSpam')).toBeInTheDocument();

    // Radix Sheet renders a Close button; clicking it dismisses the sheet.
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => expect(screen.queryByText('RejectSpam')).not.toBeInTheDocument());
  });
});

// ─── Rule row details ─────────────────────────────────────────────────────────

describe('RulePipelinePage — rule rows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows → EXIT badge for hard-stop actions (reject)', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 1, stage: 'rcpt', action: 'reject', name: 'BlockReject' })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('RCPT TO');
    expect(sheet.getByText('BlockReject')).toBeInTheDocument();
    expect(sheet.getByText('→ EXIT')).toBeInTheDocument();
  });

  it('shows → 旁路 badge for sideline action', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 1, stage: 'data', action: 'sideline', name: 'SidelineRule' })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('DATA');
    expect(sheet.getByText('SidelineRule')).toBeInTheDocument();
    expect(sheet.getByText('→ 旁路')).toBeInTheDocument();
  });

  it('no FlowExitBadge for passthrough (accept) actions', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 1, stage: 'mail', action: 'accept', name: 'AllowRule' })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('MAIL FROM');
    expect(sheet.getByText('AllowRule')).toBeInTheDocument();
    expect(sheet.queryByText('→ EXIT')).not.toBeInTheDocument();
    expect(sheet.queryByText('→ 旁路')).not.toBeInTheDocument();
    expect(sheet.queryByText('→ 转移')).not.toBeInTheDocument();
  });

  it('shows 禁用 badge for inactive rules', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 1, stage: 'mail', action: 'reject', name: 'InactiveRule', is_active: false })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('MAIL FROM');
    expect(sheet.getByText('InactiveRule')).toBeInTheDocument();
    expect(sheet.getByText('禁用')).toBeInTheDocument();
  });

  it('shows tag badges for tag rules', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=tag')) {
        return Promise.resolve({ items: [makeRule({ id: 10, rule_class: 'tag', stage: 'mail', action: undefined as unknown as string, name: 'TagSpf', tags: ['sys:spf_fail', 'vip'] })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();
    const sheet = await openStageSheet('MAIL FROM');
    expect(sheet.getByText('TagSpf')).toBeInTheDocument();
    expect(sheet.getByText('sys:spf_fail')).toBeInTheDocument();
    expect(sheet.getByText('vip')).toBeInTheDocument();
  });

  it('opens rule detail sheet on row click', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 5, stage: 'header', action: 'reject', name: 'HeaderReject' })] });
      }
      return Promise.resolve({ items: [] });
    });
    renderPage();

    const sheet = await openStageSheet('HEADER');
    fireEvent.click(sheet.getByText('HeaderReject'));

    await waitFor(() => {
      expect(screen.getByText('ID: 5')).toBeInTheDocument();
      expect(screen.getByText('优先级 500')).toBeInTheDocument();
    });
  });

  it('lists action rules sorted by priority descending', async () => {
    const rules = Array.from({ length: 5 }, (_, i) =>
      makeRule({ id: i + 1, stage: 'data', action: 'reject', name: `Rule${i + 1}`, priority: 100 + i }),
    );
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) return Promise.resolve({ items: rules });
      return Promise.resolve({ items: [] });
    });
    renderPage();

    const sheet = await openStageSheet('DATA');
    // All rules render in the sheet; highest priority (Rule5, 104) first.
    const names = sheet.getAllByText(/^Rule\d$/).map(n => n.textContent);
    expect(names).toEqual(['Rule5', 'Rule4', 'Rule3', 'Rule2', 'Rule1']);
  });
});

// ─── Rule detail sheet contents ───────────────────────────────────────────────
// NOTE: the redesigned pipeline page only fetches tag + action rule classes, so
// route rules are no longer surfaced here (the dedicated route page owns them).
// These tests cover what the detail sheet actually renders today.

describe('RulePipelinePage — rule detail sheet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the selected rule condition tree and action', async () => {
    mockApiRequest.mockImplementation((url: string) => {
      if (url.includes('rule_class=action')) {
        return Promise.resolve({ items: [makeRule({ id: 30, stage: 'data', action: 'reject', name: 'EvilSuffix' })] });
      }
      return Promise.resolve({ items: [] });
    });

    renderPage();
    const stageSheet = await openStageSheet('DATA');
    fireEvent.click(stageSheet.getByText('EvilSuffix'));

    await waitFor(() => expect(screen.getByText('ID: 30')).toBeInTheDocument());
    // Condition tree value from makeRule's default condition_tree is rendered.
    expect(screen.getByText('@evil.com')).toBeInTheDocument();
    expect(screen.getByText('执行动作')).toBeInTheDocument();
  });
});
