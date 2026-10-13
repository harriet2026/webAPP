import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';

const apiRequest = vi.hoisted(() => vi.fn());
const environment = vi.hoisted(() => ({ tenant: 7 as number | null }));
vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => {
    const tenant = environment.tenant;
    return { apiRequest: (url: string) => apiRequest(url, tenant), effectiveTenantId: tenant };
  },
}));
vi.mock('./access', () => ({
  usePhishingAccess: () => ({ canEdit: true, readOnly: false }),
}));

import { PhishingOverviewPage } from './phishing-overview-page';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <QueryClientProvider client={queryClient}>
        <PhishingOverviewPage />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  const result = render(tree());
  return { ...result, rerenderPage: () => result.rerender(tree()) };
}

function callsFor(path: string) {
  return apiRequest.mock.calls.filter(([url]) => String(url).startsWith(path));
}

function logCalls() {
  return callsFor('/phishing-agent/detection-logs').filter(([url]) => new URL(String(url), 'http://x').searchParams.get('page_size') !== '1');
}

function totalCalls() {
  return callsFor('/phishing-agent/detection-logs').filter(([url]) => new URL(String(url), 'http://x').searchParams.get('page_size') === '1');
}

function lastLogURL() {
  return String(logCalls().at(-1)?.[0]);
}

describe('PhishingOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.tenant = 7;
    apiRequest.mockImplementation((url: string) => {
      if (url.startsWith('/phishing-agent/stats')) {
        return Promise.resolve({
          today_detected: 1,
          today_quarantined: 2,
          pending_review: 3,
          today_recalled: 4,
          recall_success: 5,
          next_business_day_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }
      return Promise.resolve({ items: [], total: 0, page: 1, page_size: 20 });
    });
  });

  it('shows primary KPI values without secondary totals or extra list queries', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('phishing-metric-value-today_detected')).toHaveTextContent('1'));
    for (const label of ['总隔离', '总审核', '总召回', '总召回成功']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    for (const [key, value] of [['today_detected', '1'], ['today_quarantined', '2'], ['pending_review', '3'], ['today_recalled', '4'], ['recall_success', '5']]) {
      expect(screen.getByTestId(`phishing-metric-value-${key}`)).toHaveTextContent(value);
    }
    expect(totalCalls()).toHaveLength(0);
    expect(logCalls()).toHaveLength(1);
  });

  it('refreshes primary stats and logs without querying hidden totals', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(2));
    expect(logCalls()).toHaveLength(2);
    expect(totalCalls()).toHaveLength(0);
  });

  it('does not request admin-only disposal settings for a viewer', async () => {
    renderPage();
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    expect(callsFor('/disposal-settings')).toHaveLength(0);
  });

  it('requests the server-defined today window for the unfiltered log list', async () => {
    renderPage();

    await waitFor(() => expect(logCalls()).toHaveLength(1));
    expect(lastLogURL()).toContain('range=today');
    expect(lastLogURL()).not.toContain('start=');
    expect(lastLogURL()).not.toContain('end=');
  });

  it('filters undecided risks alongside known levels and clears them on reset', async () => {
    renderPage();
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: '风险等级' }));
    await userEvent.click(screen.getByText('未判定'));
    await waitFor(() => expect(lastLogURL()).toContain('risk_level=unknown'));
    await userEvent.click(screen.getByText('高危'));
    await waitFor(() => {
      expect(new URL(lastLogURL(), 'http://x').searchParams.getAll('risk_level')).toEqual(['unknown', 'high']);
    });
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByTestId('phishing-log-filter-reset'));
    await waitFor(() => expect(lastLogURL()).not.toContain('risk_level='));
    expect(screen.getByRole('button', { name: '风险等级' })).toBeInTheDocument();
  });

  it("refreshes the KPI and today's logs when the tenant business day changes", async () => {
    const businessMidnight = new Date('2026-09-24T16:00:00Z').getTime();
    let currentTime = businessMidnight - 30_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    apiRequest.mockImplementation((url: string) => {
      if (url.startsWith('/phishing-agent/stats')) return Promise.resolve({
        today_detected: 1, today_quarantined: 2, pending_review: 3, today_recalled: 4, recall_success: 5,
        next_business_day_at: new Date(currentTime < businessMidnight ? businessMidnight : businessMidnight + 24 * 60 * 60 * 1000).toISOString(),
      });
      return Promise.resolve({ items: [], total: 0, page: 1, page_size: 20 });
    });
    const timers = vi.spyOn(window, 'setTimeout');
    const page = renderPage();
    try {
      await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(1));
      await waitFor(() => expect(logCalls()).toHaveLength(1));
      await waitFor(() => expect(totalCalls()).toHaveLength(0));
      const midnightTimer = timers.mock.calls.find(([, delay]) => typeof delay === 'number' && delay >= 30_000 && delay < 32_000);
      expect(midnightTimer).toBeDefined();
      currentTime = businessMidnight + 1000;
      act(() => { (midnightTimer?.[0] as () => void)(); });
      await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(2));
      await waitFor(() => expect(logCalls()).toHaveLength(2));
      await waitFor(() => expect(totalCalls()).toHaveLength(0));
      expect(lastLogURL()).toContain('range=today');
      await waitFor(() => expect(timers.mock.calls.some(([, delay]) => typeof delay === 'number' && delay > 23 * 60 * 60 * 1000)).toBe(true));
    } finally {
      page.unmount();
      now.mockRestore();
      timers.mockRestore();
    }
  });

  it('retries after the business-day refresh fails', async () => {
    const boundary = new Date('2026-09-24T16:00:00Z').getTime();
    const now = vi.spyOn(Date, 'now').mockReturnValue(boundary - 30_000);
    const timers = vi.spyOn(window, 'setTimeout');
    let statsCalls = 0;
    apiRequest.mockImplementation((url: string) => {
      if (url.startsWith('/phishing-agent/stats')) {
        statsCalls++;
        return statsCalls === 1
          ? Promise.resolve({ today_detected: 1, next_business_day_at: new Date(boundary).toISOString() })
          : Promise.reject(new Error('temporary stats failure'));
      }
      return Promise.resolve({ items: [], total: 0, page: 1, page_size: 20 });
    });
    const page = renderPage();
    try {
      await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(1));
      const boundaryTimer = await waitFor(() => {
        const match = timers.mock.calls.find(([, delay]) => typeof delay === 'number' && delay >= 30_000 && delay < 32_000);
        expect(match).toBeDefined();
        return match;
      });
      act(() => { (boundaryTimer?.[0] as () => void)(); });
      await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(2));
      const retryTimer = timers.mock.calls.find(([, delay]) => delay === 60_000);
      expect(retryTimer).toBeDefined();
      act(() => { (retryTimer?.[0] as () => void)(); });
      await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(3));
    } finally {
      page.unmount();
      now.mockRestore();
      timers.mockRestore();
    }
  });

  it('keeps KPI stats independent from the detection-log time range', async () => {
    renderPage();

    await waitFor(() => expect(callsFor('/phishing-agent/stats')).toHaveLength(1));
    await waitFor(() => expect(totalCalls()).toHaveLength(0));
    await userEvent.click(screen.getByRole('button', { name: '近7天' }));
    await waitFor(() => expect(logCalls()).toHaveLength(2));

    expect(callsFor('/phishing-agent/stats')).toHaveLength(1);
    expect(totalCalls()).toHaveLength(0);
    expect(callsFor('/phishing-agent/stats')[0]?.[0]).not.toContain('start=');
    expect(callsFor('/phishing-agent/stats')[0]?.[0]).not.toContain('end=');
  });

  it('supports keyboard drilldowns with the existing review and recall conditions', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled());
    screen.getByTestId('phishing-kpi-pending_review').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(lastLogURL()).toContain('disposition=audit'));
    const review = new URL(lastLogURL(), 'http://x').searchParams;
    expect(review.has('range')).toBe(false);
    expect(review.has('start')).toBe(false);
    expect(review.has('end')).toBe(false);
    screen.getByTestId('phishing-kpi-recall_success').focus();
    await userEvent.keyboard(' ');
    await waitFor(() => expect(lastLogURL()).toContain('recall_status=recalled'));
    expect(new URL(lastLogURL(), 'http://x').searchParams.get('range')).toBe('today');
  });

  it.each([
    ['phishing-kpi-today_quarantined', 'disposition=quarantine'],
    ['phishing-kpi-pending_review', 'disposition=audit'],
  ])('replaces the %s filter when the recalled KPI is clicked', async (initialKpi, staleParam) => {
    renderPage();

    await waitFor(() => expect(logCalls()).toHaveLength(1));
    await userEvent.click(screen.getByTestId(initialKpi));
    await waitFor(() => expect(logCalls()).toHaveLength(2));
    await userEvent.click(screen.getByTestId('phishing-kpi-today_recalled'));
    await waitFor(() => expect(logCalls()).toHaveLength(3));

    expect(lastLogURL()).toContain('recall_status=recalled');
    expect(lastLogURL()).not.toContain(staleParam);
  });

  it.each([
    { card: 'today_detected', previousCard: 'pending_review', range: 'today', disposition: [], recall: [] },
    { card: 'today_quarantined', previousCard: 'today_recalled', range: 'today', disposition: ['quarantine'], recall: [] },
    { card: 'pending_review', previousCard: 'today_recalled', range: 'all', disposition: ['audit'], recall: [] },
    { card: 'today_recalled', previousCard: 'today_quarantined', range: 'today', disposition: [], recall: ['recalled'] },
    { card: 'recall_success', previousCard: 'pending_review', range: 'today', disposition: [], recall: ['recalled'] },
  ])('replaces unrelated filters and resets pagination for $card', async ({ card, previousCard, range, disposition, recall }) => {
    const defaultRequest = apiRequest.getMockImplementation();
    apiRequest.mockImplementation((url: string) => url.startsWith('/phishing-agent/detection-logs')
      ? Promise.resolve({ items: [], total: 45, page: 1, page_size: 20 })
      : defaultRequest?.(url));
    renderPage();

    await waitFor(() => expect(logCalls()).toHaveLength(1));
    await userEvent.click(screen.getByTestId(`phishing-kpi-${previousCard}`));
    await userEvent.type(screen.getByTestId('phishing-log-filter-keyword'), 'needle');
    await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
    await userEvent.click(screen.getByRole('button', { name: '近7天' }));
    for (const [filter, options] of [
      ['邮件状态', ['投递成功', '拒收']],
      ['运行模式', ['实时检测', '观察模式']],
      ['风险等级', ['高危', '未判定']],
    ] as const) {
      await userEvent.click(screen.getByRole('button', { name: filter }));
      for (const option of options) await userEvent.click(screen.getByText(option));
      await userEvent.keyboard('{Escape}');
    }
    await userEvent.click(screen.getByTestId('pagination-next'));
    await waitFor(() => expect(lastLogURL()).toContain('page=2'));
    const previous = new URL(lastLogURL(), 'http://x').searchParams;
    expect(previous.get('keyword')).toBe('needle');
    expect(previous.getAll('mail_status')).toEqual(['delivered', 'rejected']);
    expect(previous.getAll('detection_mode')).toEqual(['realtime', 'observe']);
    expect(previous.getAll('risk_level')).toEqual(['high', 'unknown']);
    // This unsubmitted edit must also disappear, rather than coming back on search.
    await userEvent.type(screen.getByTestId('phishing-log-filter-keyword'), ' draft');

    const requestsBeforeClick = logCalls().length;
    await userEvent.click(screen.getByTestId(`phishing-kpi-${card}`));
    await waitFor(() => expect(logCalls().length).toBeGreaterThan(requestsBeforeClick));
    const params = new URL(lastLogURL(), 'http://x').searchParams;
    expect(params.get('page')).toBe('1');
    expect(params.get('page_size')).toBe('20');
    expect(params.getAll('disposition')).toEqual(disposition);
    expect(params.getAll('recall_status')).toEqual(recall);
    for (const key of ['keyword', 'mail_status', 'detection_mode', 'risk_level']) {
      expect(params.has(key), key).toBe(false);
    }
    if (range === 'today') {
      expect(params.get('range')).toBe('today');
      expect(params.has('start')).toBe(false);
      expect(params.has('end')).toBe(false);
    } else {
      expect(params.has('range')).toBe(false);
      expect(params.has('start')).toBe(false);
      expect(params.has('end')).toBe(false);
    }
    expect(screen.getByTestId('phishing-log-filter-keyword')).toHaveValue('');
    for (const filter of ['邮件状态', '运行模式', '风险等级']) {
      expect(screen.getByRole('button', { name: filter })).toBeInTheDocument();
    }
    expect(screen.getByTestId('pagination-prev')).toBeDisabled();
    await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
    await waitFor(() => expect(logCalls().length).toBeGreaterThan(requestsBeforeClick + 1));
    expect(lastLogURL()).not.toContain('keyword=');
    await userEvent.click(screen.getByTestId('phishing-log-filter-keyword'));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(logCalls().length).toBeGreaterThan(requestsBeforeClick + 2));
    expect(lastLogURL()).not.toContain('keyword=');
  });

  it.each`
    card                   | initialRange | expectedRange | days
    ${'today_detected'}     | ${'今日'}    | ${'今日'}     | ${0}
    ${'today_detected'}     | ${'近7天'}   | ${'今日'}     | ${0}
    ${'today_detected'}     | ${'近30天'}  | ${'今日'}     | ${0}
    ${'today_detected'}     | ${'自定义'}  | ${'今日'}     | ${0}
    ${'today_quarantined'}  | ${'今日'}    | ${'今日'}     | ${0}
    ${'today_quarantined'}  | ${'近7天'}   | ${'今日'}     | ${0}
    ${'today_quarantined'}  | ${'近30天'}  | ${'今日'}     | ${0}
    ${'today_quarantined'}  | ${'自定义'}  | ${'今日'}     | ${0}
    ${'pending_review'}     | ${'今日'}    | ${'不限日期'}     | ${0}
    ${'pending_review'}     | ${'近7天'}   | ${'不限日期'}    | ${0}
    ${'pending_review'}     | ${'近30天'}  | ${'不限日期'}   | ${0}
    ${'pending_review'}     | ${'自定义'}  | ${'不限日期'}   | ${0}
    ${'today_recalled'}     | ${'今日'}    | ${'今日'}     | ${0}
    ${'today_recalled'}     | ${'近7天'}   | ${'今日'}     | ${0}
    ${'today_recalled'}     | ${'近30天'}  | ${'今日'}     | ${0}
    ${'today_recalled'}     | ${'自定义'}  | ${'今日'}     | ${0}
    ${'recall_success'}     | ${'今日'}    | ${'今日'}     | ${0}
    ${'recall_success'}     | ${'近7天'}   | ${'今日'}    | ${0}
    ${'recall_success'}     | ${'近30天'}  | ${'今日'}   | ${0}
    ${'recall_success'}     | ${'自定义'}  | ${'今日'}   | ${0}
  `('uses $expectedRange when $card is clicked from $initialRange', async ({ card, initialRange, expectedRange, days }) => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('phishing-log-filter-search')).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: initialRange }));
    if (initialRange === '自定义') {
      fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-09-01T09:00' } });
      fireEvent.change(screen.getByLabelText('结束时间'), { target: { value: '2026-09-02T10:30' } });
      await waitFor(() => expect(lastLogURL()).toContain('end='));
    }
    await waitFor(() => expect(screen.getByTestId('phishing-log-filter-search')).toBeEnabled());
    const before = logCalls().length;
    await userEvent.click(screen.getByTestId(`phishing-kpi-${card}`));
    await waitFor(() => expect(logCalls().length).toBeGreaterThan(before));
    const params = new URL(lastLogURL(), 'http://x').searchParams;
    if (expectedRange === '今日') {
      expect(params.get('range')).toBe('today');
      expect(params.has('start')).toBe(false);
      expect(params.has('end')).toBe(false);
      expect(screen.queryByLabelText('开始时间')).not.toBeInTheDocument();
    } else if (expectedRange === '不限日期') {
      expect(params.has('range')).toBe(false);
      expect(params.has('start')).toBe(false);
      expect(params.has('end')).toBe(false);
      expect(screen.getByLabelText('开始时间')).toHaveValue('');
      expect(screen.getByLabelText('结束时间')).toHaveValue('');
    } else if (expectedRange === '自定义') {
      expect(params.has('range')).toBe(false);
      expect(params.get('start')).toBe('2026-09-01T01:00:00.000Z');
      expect(params.get('end')).toBe('2026-09-02T02:30:00.000Z');
      expect(screen.getByLabelText('开始时间')).toHaveValue('2026-09-01T09:00');
      expect(screen.getByLabelText('结束时间')).toHaveValue('2026-09-02T10:30');
    } else {
      expect(params.has('range')).toBe(false);
      expect(Date.parse(params.get('end')!) - Date.parse(params.get('start')!)).toBe(days * 24 * 60 * 60 * 1000);
      expect(screen.queryByLabelText('开始时间')).not.toBeInTheDocument();
    }
    expect(callsFor('/phishing-agent/stats')).toHaveLength(1);
  });

  it.each([
    'today_detected', 'today_quarantined', 'pending_review', 'today_recalled', 'recall_success',
  ])('re-queries identical %s drilldowns and resets them to the default today query', async (card) => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('phishing-log-filter-search')).toBeEnabled());
    await userEvent.click(screen.getByTestId(`phishing-kpi-${card}`));
    await waitFor(() => expect(logCalls()).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId('phishing-log-filter-search')).toBeEnabled());
    const firstURL = lastLogURL();
    await userEvent.click(screen.getByTestId(`phishing-kpi-${card}`));
    await waitFor(() => expect(logCalls()).toHaveLength(3));
    expect(lastLogURL()).toBe(firstURL);
    await userEvent.click(screen.getByRole('button', { name: '自定义' }));
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-09-01T09:00' } });
    fireEvent.change(screen.getByLabelText('结束时间'), { target: { value: '2026-09-02T10:30' } });
    await userEvent.type(screen.getByTestId('phishing-log-filter-keyword'), 'draft');
    await userEvent.click(screen.getByTestId('phishing-log-filter-reset'));
    await waitFor(() => expect(lastLogURL()).toBe('/phishing-agent/detection-logs?page=1&page_size=20&range=today'));
    expect(screen.getByTestId('phishing-log-filter-keyword')).toHaveValue('');
    expect(screen.queryByLabelText('开始时间')).not.toBeInTheDocument();
  });

  it('clears the recall filter when the detected KPI is clicked', async () => {
    renderPage();
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    await userEvent.click(screen.getByTestId('phishing-kpi-today_recalled'));
    await waitFor(() => expect(lastLogURL()).toContain('recall_status=recalled'));
    await userEvent.click(screen.getByTestId('phishing-kpi-today_detected'));
    await waitFor(() => expect(lastLogURL()).toContain('range=today'));
    expect(lastLogURL()).not.toContain('recall_status=');
  });

  it('GT-14327: re-queries the logs on every search click even when the filters are unchanged', async () => {
    renderPage();
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
    await waitFor(() => expect(logCalls()).toHaveLength(2));
    await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
    await waitFor(() => expect(logCalls()).toHaveLength(3));
    expect(new Set(logCalls().map(([url]) => String(url))).size).toBe(1);
  });

  it('GT-14327: moves a relative range window to the search time', async () => {
    let currentTime = new Date('2026-09-30T08:00:00Z').getTime();
    const RealDate = Date;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => currentTime);
    vi.stubGlobal('Date', class extends RealDate {
      constructor(...args: unknown[]) {
        super(...((args.length === 0 ? [currentTime] : args) as [number]));
      }
      static now() { return currentTime; }
    });
    try {
      renderPage();
      await waitFor(() => expect(logCalls()).toHaveLength(1));
      await userEvent.click(screen.getByRole('button', { name: '近7天' }));
      await waitFor(() => expect(lastLogURL()).toContain('end='));
      const firstEnd = new URL(lastLogURL(), 'http://x').searchParams.get('end');
      currentTime += 10 * 60 * 1000;
      await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
      await waitFor(() => expect(new URL(lastLogURL(), 'http://x').searchParams.get('end')).not.toBe(firstEnd));
      expect(new URL(lastLogURL(), 'http://x').searchParams.get('end')).toBe(new RealDate(currentTime).toISOString());
    } finally {
      vi.unstubAllGlobals();
      now.mockRestore();
    }
  });

  it('GT-14327: disables the search button while the log query is in flight', async () => {
    renderPage();
    await waitFor(() => expect(logCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('phishing-log-filter-search')).toBeEnabled());
    let release: (value: unknown) => void = () => {};
    const defaultRequest = apiRequest.getMockImplementation();
    apiRequest.mockImplementation((url: string) => url.startsWith('/phishing-agent/detection-logs')
      ? new Promise((resolve) => { release = () => resolve({ items: [], total: 0, page: 1, page_size: 20 }); })
      : defaultRequest?.(url));
    await userEvent.click(screen.getByTestId('phishing-log-filter-search'));
    await waitFor(() => expect(screen.getByTestId('phishing-log-filter-search')).toBeDisabled());
    await act(async () => { release(undefined); });
    await waitFor(() => expect(screen.getByTestId('phishing-log-filter-search')).toBeEnabled());
  });
});
