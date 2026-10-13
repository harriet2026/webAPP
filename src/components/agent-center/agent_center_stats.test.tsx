import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { AgentCenterCard } from '@/types/agent-center';

const env = vi.hoisted(() => ({ tenant: 7 as number | null, params: 'agent=phishing', request: vi.fn() }));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => {
    const tenant = env.tenant;
    return { effectiveTenantId: tenant, apiRequest: (url: string) => env.request(url, tenant) };
  },
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role_id: 1 }, isTrueSuperAdmin: false }) }));
vi.mock('@/contexts/product-form-context', () => ({ useProductForm: () => ({ switcherEnabled: true, registryReady: true, registry: [], grants: [] }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(env.params), usePathname: () => '/agent-center/overview', useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/agent-center/overview',
}));

import { AgentCenterOverviewPage } from './agent-center-overview-page';

const cards: AgentCenterCard[] = [
  { key: 'phishing', module_key: 'phishing_agent', feature_id: 'phishing', access: 'enabled', status: 'running', stage_position: 'ai', today_processed: 24, hit_count: 2, processed_count: 24, hit_rate: 10, policy_pages: [
    { page: 'phishing_admission', role: 'admission', management: 'dedicated' },
    { page: 'phishing_disposition', role: 'disposition', management: 'dedicated' },
  ] },
  ...(['spoofing', 'threat-retro'] as const).map((key) => ({ key, feature_id: key, access: 'enabled' as const, status: 'running' as const, stage_position: 'ai', today_processed: 12, hit_count: 1, processed_count: 12, hit_rate: 10 })),
];
let overviewCards: AgentCenterCard[];
let detected: number;
let statsFailure: boolean;
let canView: boolean;
let nextBoundary: string;
function calls(path: string) { return env.request.mock.calls.filter(([url]) => String(url).startsWith(path)); }
function sidebar() { return within(screen.getByTestId('agent-center-summary-phishing')); }
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <NextIntlClientProvider locale="zh" messages={zh}><QueryClientProvider client={client}><AgentCenterOverviewPage /></QueryClientProvider></NextIntlClientProvider>;
  const result = render(tree());
  return { ...result, client, refresh: () => result.rerender(tree()) };
}

beforeEach(() => {
  env.tenant = 7;
  env.params = 'agent=phishing';
  overviewCards = structuredClone(cards);
  detected = 34;
  statsFailure = false;
  canView = true;
  nextBoundary = new Date(Date.now() + 86_400_000).toISOString();
  env.request.mockReset().mockImplementation((url: string) => {
    if (url === '/roles/1') return Promise.resolve({ status: 'normal', permissions: [{ submoduleId: 'agent-management', visible: true, canView, canEdit: false }] });
    if (url.startsWith('/agent-center/overview')) return Promise.resolve({ agents: overviewCards });
    if (url.startsWith('/phishing-agent/stats')) return statsFailure ? Promise.reject(new Error('stats unavailable')) : Promise.resolve({ today_detected: detected, next_business_day_at: nextBoundary });
    if (url.includes('admission-rules')) return Promise.resolve([]);
    if (url.includes('/control')) return Promise.resolve({ enabled: true, revision: 1 });
    if (url === '/phishing-agent/config') return Promise.resolve({
      risk_policy: { cutoffs: { low: 40, medium: 70, high: 90 }, policies: { suspicious: { base_disposition: 'proceed' }, low: { base_disposition: 'audit' }, medium: { base_disposition: 'quarantine' }, high: { base_disposition: 'discard' } }, version: 1 },
      runtime_policy: { run_mode: 'realtime', observe_action: 'accept', observe_mark_enabled: false, timeout_minutes: 15, max_recheck_minutes: 30, timeout_async_enabled: true, version: 1 },
    });
    return Promise.resolve({ items: [], total: 45, page: 1, page_size: 20 });
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('Agent center phishing sidebar statistics', () => {
  it.each(['hidden', 'locked', 'status-locked', 'denied', 'pending', 'overview-error'])('does not request stats when phishing access is %s', async (restriction) => {
    env.params = '';
    if (restriction === 'hidden' || restriction === 'locked') overviewCards[0].access = restriction;
    if (restriction === 'status-locked') overviewCards[0].status = 'locked';
    if (restriction === 'denied') canView = false;
    const defaultRequest = env.request.getMockImplementation()!;
    env.request.mockImplementation((url: string, tenant: number) => {
      if (restriction === 'pending' && url === '/roles/1') return new Promise(() => {});
      if (restriction === 'overview-error' && url.startsWith('/agent-center/overview')) return Promise.reject(new Error('overview unavailable'));
      return defaultRequest(url, tenant);
    });
    const page = renderPage();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(calls('/phishing-agent/stats')).toHaveLength(0);
    expect(screen.queryByText('34 今日检测')).not.toBeInTheDocument();
    page.unmount();
  });

  it('keeps stats available for a paused agent and a read-only viewer', async () => {
    overviewCards[0].status = 'paused';
    renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    expect(calls('/phishing-agent/stats')).toHaveLength(1);
  });

  it('shows a placeholder on initial failure, preserves same-tenant cached totals on failure, and recovers to zero', async () => {
    statsFailure = true;
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled());
    expect(sidebar().getByText('— 今日检测')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-metric-value-today_detected')).toHaveTextContent('—');
    statsFailure = false;
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    statsFailure = true;
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled());
    expect(sidebar().getByText('34 今日检测')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-metric-value-today_detected')).toHaveTextContent('34');
    detected = 0;
    statsFailure = false;
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(sidebar().getByText('0 今日检测')).toBeInTheDocument());
    expect(screen.getByTestId('phishing-metric-value-today_detected')).toHaveTextContent('0');
    expect(sidebar().queryByText('24 今日检测')).not.toBeInTheDocument();
  });

  it('clears old totals while switching tenants and ignores a late response from the old tenant', async () => {
    let resolveOld!: (value: unknown) => void;
    let resolveNew!: (value: unknown) => void;
    const defaultRequest = env.request.getMockImplementation()!;
    env.request.mockImplementation((url: string, tenant: number) => {
      if (url.startsWith('/phishing-agent/stats')) return new Promise((resolve) => { if (tenant === 7) resolveOld = resolve; else resolveNew = resolve; });
      return defaultRequest(url, tenant);
    });
    const page = renderPage();
    await waitFor(() => expect(calls('/phishing-agent/stats')).toHaveLength(1));
    env.tenant = 8;
    page.refresh();
    await waitFor(() => expect(calls('/phishing-agent/stats')).toHaveLength(2));
    expect(sidebar().getByText('— 今日检测')).toBeInTheDocument();
    expect(calls('/phishing-agent/stats').map(([, tenant]) => tenant)).toEqual([7, 8]);
    await act(async () => { resolveNew({ today_detected: 91, next_business_day_at: nextBoundary }); });
    await waitFor(() => expect(sidebar().getByText('91 今日检测')).toBeInTheDocument());
    await act(async () => { resolveOld({ today_detected: 34, next_business_day_at: nextBoundary }); });
    expect(sidebar().getByText('91 今日检测')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-metric-value-today_detected')).toHaveTextContent('91');
  });

  it('does not reuse the previous tenant value during a new request or override platform scope', async () => {
    const page = renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    const defaultRequest = env.request.getMockImplementation()!;
    let resolveNew!: (value: unknown) => void;
    env.request.mockImplementation((url: string, tenant: number | null) => url.startsWith('/phishing-agent/stats')
      ? new Promise((resolve) => { resolveNew = resolve; }) : defaultRequest(url, tenant));
    env.tenant = null;
    page.refresh();
    await waitFor(() => expect(calls('/phishing-agent/stats')).toHaveLength(2));
    expect(sidebar().getByText('— 今日检测')).toBeInTheDocument();
    expect(calls('/phishing-agent/stats').at(-1)?.[1]).toBeNull();
    await act(async () => { resolveNew({ today_detected: 70, next_business_day_at: nextBoundary }); });
    await waitFor(() => expect(sidebar().getByText('70 今日检测')).toBeInTheDocument());
  });

  it('removes cached sidebar stats when the capability is locked or viewing permission is revoked', async () => {
    env.params = '';
    const page = renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    overviewCards = overviewCards.map((card) => card.key === 'phishing' ? { ...card, access: 'locked' } : card);
    await act(async () => { await page.client.invalidateQueries({ queryKey: ['agent-center-overview'] }); });
    await waitFor(() => expect(sidebar().getByText('— 今日检测')).toBeInTheDocument());
    expect(calls('/phishing-agent/stats')).toHaveLength(1);
    canView = false;
    await act(async () => { await page.client.invalidateQueries({ queryKey: ['roles'] }); });
    await waitFor(() => expect(screen.queryByTestId('agent-center-summary-phishing')).not.toBeInTheDocument());
    expect(calls('/phishing-agent/stats')).toHaveLength(1);
  });

  it('keeps sidebar stats independent of log filters and pagination and preserves a non-today range at midnight', async () => {
    const boundary = Date.parse('2026-10-11T16:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(boundary - 30_000);
    const timers = vi.spyOn(window, 'setTimeout');
    nextBoundary = new Date(boundary).toISOString();
    renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    await userEvent.type(screen.getByTestId('phishing-log-filter-keyword'), 'needle');
    await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
    await userEvent.click(screen.getByRole('button', { name: '近7天' }));
    await userEvent.click(screen.getByTestId('pagination-next'));
    await waitFor(() => expect(String(calls('/phishing-agent/detection-logs').at(-1)?.[0])).toContain('page=2'));
    expect(sidebar().getByText('34 今日检测')).toBeInTheDocument();
    expect(calls('/phishing-agent/stats')).toHaveLength(1);
    const logsBefore = calls('/phishing-agent/detection-logs').length;
    const boundaryTimer = timers.mock.calls.find(([, delay]) => delay === 31_000)!;
    act(() => { (boundaryTimer[0] as () => void)(); });
    await waitFor(() => expect(calls('/phishing-agent/stats')).toHaveLength(2));
    // The table retains its non-today range; hidden totals issue no extra queries.
    expect(calls('/phishing-agent/detection-logs')).toHaveLength(logsBefore);
    expect(calls('/phishing-agent/stats').every(([url]) => url === '/phishing-agent/stats?')).toBe(true);
    expect(screen.getByTestId('phishing-log-filter-keyword')).toHaveValue('needle');
  });

  it('retries a failed business-day refresh after 60 seconds without loading logs on a sidebar-only page', async () => {
    const boundary = Date.parse('2026-10-11T16:00:00Z');
    const now = vi.spyOn(Date, 'now').mockReturnValue(boundary - 30_000);
    const timers = vi.spyOn(window, 'setTimeout');
    env.params = '';
    nextBoundary = new Date(boundary).toISOString();
    renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    statsFailure = true;
    now.mockReturnValue(boundary + 1000);
    const timer = timers.mock.calls.find(([, delay]) => delay === 31_000)!;
    act(() => { (timer[0] as () => void)(); });
    await waitFor(() => expect(calls('/phishing-agent/stats')).toHaveLength(2));
    expect(sidebar().getByText('34 今日检测')).toBeInTheDocument();
    const retry = timers.mock.calls.find(([, delay]) => delay === 60_000)!;
    expect(retry).toBeDefined();
    statsFailure = false;
    detected = 0;
    nextBoundary = new Date(boundary + 86_400_000).toISOString();
    act(() => { (retry[0] as () => void)(); });
    await waitFor(() => expect(sidebar().getByText('0 今日检测')).toBeInTheDocument());
    expect(calls('/phishing-agent/stats')).toHaveLength(3);
    expect(calls('/phishing-agent/detection-logs')).toHaveLength(0);
  });

  it('cleans up business-day timers on tenant changes and unmount', async () => {
    const boundary = Date.parse('2026-10-11T16:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(boundary - 30_000);
    const timers = vi.spyOn(window, 'setTimeout');
    const clear = vi.spyOn(window, 'clearTimeout');
    nextBoundary = new Date(boundary).toISOString();
    env.params = '';
    const page = renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    const firstIndex = timers.mock.calls.findIndex(([, delay]) => delay === 31_000);
    const oldTimer = timers.mock.results[firstIndex].value;
    nextBoundary = new Date(boundary + 30_000).toISOString();
    detected = 91;
    env.tenant = 8;
    page.refresh();
    await waitFor(() => expect(sidebar().getByText('91 今日检测')).toBeInTheDocument());
    expect(clear).toHaveBeenCalledWith(oldTimer);
    const newIndex = timers.mock.calls.findIndex(([, delay]) => delay === 61_000);
    expect(newIndex).toBeGreaterThan(firstIndex);
    page.unmount();
    expect(clear).toHaveBeenCalledWith(timers.mock.results[newIndex].value);
  });

  it('keeps the same sidebar count when collapsed or viewing another agent and preserves navigation', async () => {
    env.params = '';
    const page = renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    const collapse = zh.agentCenterOverview.collapseSummaryRail;
    await userEvent.click(screen.getByRole('button', { name: collapse }));
    await userEvent.click(screen.getByRole('button', { name: zh.agentCenterOverview.expandSummaryRail }));
    expect(sidebar().getByText('34 今日检测')).toBeInTheDocument();
    expect(screen.getByTestId('agent-center-summary-phishing')).toHaveAttribute('href', '/agent-center/overview?agent=phishing');
    env.params = 'agent=spoofing';
    page.refresh();
    expect(sidebar().getByText('34 今日检测')).toBeInTheDocument();
    expect(within(screen.getByTestId('agent-center-summary-threat-retro')).getByText('12 今日处理')).toBeInTheDocument();
    expect(calls('/phishing-agent/stats')).toHaveLength(1);
  });
  it.each(['', 'agent=phishing', 'agent=phishing&tab=config'])('refreshes once at the server business-day boundary on %s', async (params) => {
    const boundary = Date.parse('2026-10-11T16:00:00Z');
    const now = vi.spyOn(Date, 'now').mockReturnValue(boundary - 30_000);
    const timers = vi.spyOn(window, 'setTimeout');
    env.params = params;
    nextBoundary = new Date(boundary).toISOString();
    const page = renderPage();
    await waitFor(() => expect(sidebar().getByText('34 今日检测')).toBeInTheDocument());
    const boundaryTimers = timers.mock.calls.filter(([, delay]) => delay === 31_000);
    expect(boundaryTimers).toHaveLength(1);
    const logsBefore = calls('/phishing-agent/detection-logs').length;
    detected = 0;
    nextBoundary = new Date(boundary + 86_400_000).toISOString();
    now.mockReturnValue(boundary + 1000);
    act(() => { (boundaryTimers[0][0] as () => void)(); });
    await waitFor(() => expect(sidebar().getByText('0 今日检测')).toBeInTheDocument());
    expect(calls('/phishing-agent/stats')).toHaveLength(2);
    expect(calls('/phishing-agent/detection-logs')).toHaveLength(params === 'agent=phishing' ? logsBefore + 1 : 0);
    page.unmount();
  });
  it('shares detected totals and manual refresh with the KPI while preserving overview processed totals', async () => {
    const page = renderPage();
    await waitFor(() => expect(screen.getByTestId('phishing-metric-value-today_detected')).toHaveTextContent('34'));
    expect(sidebar().getByText('34 今日检测')).toBeInTheDocument();
    expect(calls('/phishing-agent/stats')).toHaveLength(1);
    detected = 35;
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(sidebar().getByText('35 今日检测')).toBeInTheDocument());
    expect(screen.getByTestId('phishing-metric-value-today_detected')).toHaveTextContent('35');
    env.params = '';
    page.refresh();
    await waitFor(() => expect(screen.getByTestId('agent-center-cards')).toHaveTextContent('24'));
    expect(sidebar().getByText('35 今日检测')).toBeInTheDocument();
    expect(within(screen.getByTestId('agent-center-summary-spoofing')).getByText('12 今日处理')).toBeInTheDocument();
  });
});
