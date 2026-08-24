import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { MailLogAnalysis, MailLogDetail } from '@/types/email-disposal-detail';
import type { MailChildEvent } from '@/types/log';
import { DetailModal } from './detail-modal';

const { apiRequestMock, lifecycleHookMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  lifecycleHookMock: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  API_BASE: '/api/v1',
  useApiRequest: () => ({ apiRequest: apiRequestMock }),
}));

vi.mock('./hooks/use-lifecycle-log-stream', () => ({
  useLifecycleLogStream: lifecycleHookMock,
}));

vi.mock('./sections/overview-section', () => ({
  OverviewSection: ({ onViewBasis }: { onViewBasis?: () => void }) => <div data-testid="overview-section-stub" data-has-view-basis={onViewBasis ? 'true' : 'false'} />,
}));

vi.mock('./sections/analysis-section', () => ({
  AnalysisSection: ({
    analysis,
    analysisLoading,
    selectedRecipient,
    onSelectedRecipientChange,
    events = [],
  }: {
    analysis?: MailLogAnalysis;
    analysisLoading?: boolean;
    selectedRecipient?: string;
    onSelectedRecipientChange?: (recipient: string | undefined) => void;
    events?: MailChildEvent[];
  }) => (
    <div
      data-testid="analysis-section-stub"
      data-analysis-scope={analysis?.scope ?? ''}
      data-analysis-loading={analysisLoading ? 'true' : 'false'}
      data-selected-recipient={selectedRecipient ?? ''}
      data-event-ids={events.map((event) => event.id).join(',')}
    >
      <button type="button" data-testid="analysis-select-recipient" onClick={() => onSelectedRecipientChange?.('blocked@example.test')}>
        select recipient
      </button>
    </div>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const intersectionObservers: TestIntersectionObserver[] = [];
const scrollIntoViewMock = vi.fn();
const originalScrollIntoView = Element.prototype.scrollIntoView;
let detailResponse: MailLogDetail;

class TestIntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  readonly takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0];
    intersectionObservers.push(this);
  }

  trigger(entries: Array<{ target: Element; isIntersecting: boolean }>) {
    this.callback(
      entries.map((entry) => entry as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

function detail(): MailLogDetail {
  return {
    id: 1,
    message_id: '<lazy-raw-log@example.test>',
    message_uuid: 'uuid-lazy-raw-log',
    client_ip: '203.0.113.10',
    sender: 'sender@example.test',
    recipients: ['blocked@example.test', 'clean@example.test'],
    authenticated: false,
    subject: 'Lazy raw lifecycle log',
    action: 'accept',
    status: 'delivered',
    received_at: '2026-07-31T07:00:00.000Z',
    processed_at: '2026-07-31T07:00:01.000Z',
    delivered_at: '2026-07-31T07:00:02.000Z',
    processing_time_ms: 1000,
    recipient_dispositions: [
      { recipient: 'blocked@example.test', final_action: 'discard', status: 'discarded' },
      { recipient: 'clean@example.test', final_action: 'accept', status: 'delivered' },
    ],
  };
}

function analysisResponse(): object {
  return {
    scope: 'all',
    final_verdict: 'safe',
    total_elapsed_ms: 12,
    stages: [
      { stage: 1, key: 'connection', status: 'pass', duration_ms: 12, checks: [] },
      { stage: 2, key: 'identity', status: 'pass', checks: [] },
      { stage: 3, key: 'content', status: 'pass', checks: [] },
      { stage: 4, key: 'ai', status: 'skipped', checks: [] },
      { stage: 5, key: 'comprehensive', status: 'pass', checks: [] },
    ],
  };
}

describe('DetailModal raw lifecycle logs', () => {
  beforeEach(() => {
    intersectionObservers.length = 0;
    scrollIntoViewMock.mockReset();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    apiRequestMock.mockReset();
    lifecycleHookMock.mockReset();
    detailResponse = detail();
    lifecycleHookMock.mockImplementation((_id: number | null, enabled: boolean) => ({
      logs: [],
      nodes: {},
      loaded: enabled,
      loading: false,
      error: false,
      partial: false,
      truncated: false,
      retryModule: vi.fn(),
      retryNode: vi.fn(),
    }));
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === '/mail-logs/1') return detailResponse;
      if (path === '/mail-logs/1/analysis') return analysisResponse();
      if (path === '/mail-logs/1/analysis?recipient=blocked%40example.test') {
        return { ...analysisResponse(), scope: 'recipient', recipient: 'blocked@example.test', action: 'discard', status: 'discarded' };
      }
      if (path === '/mail-logs/1/events?page=1&page_size=100') {
        return {
          items: [
            { id: 11, event_source: 'workflow.quarantine', event_type: 'workflow', event_result: 'discarded', queue_id: 'q1', event_time: '2026-07-31T07:00:03.000Z', recipient: 'BLOCKED@example.test', correlation_status: 'matched' },
            { id: 12, event_source: 'workflow.sideline', event_type: 'workflow', event_result: 'released', queue_id: 'q1', event_time: '2026-07-31T07:00:04.000Z', recipients: 'clean@example.test, other@example.test', correlation_status: 'matched' },
            { id: 13, event_source: 'admin_api', event_type: 'recall', event_result: 'success', queue_id: 'q1', event_time: '2026-07-31T07:00:05.000Z', correlation_status: 'matched' },
          ],
        };
      }
      throw new Error(`unexpected request: ${path}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalScrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('does not request lifecycle logs until the collapsed section is expanded', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    const trigger = await screen.findByTestId('disposal-raw-logs-trigger');
    expect(screen.queryByTestId('disposal-detail-nav-analysis')).not.toBeInTheDocument();
    expect(screen.queryByTestId('disposal-detail-analysis')).not.toBeInTheDocument();
    expect(screen.getByTestId('overview-section-stub')).toHaveAttribute('data-has-view-basis', 'false');
    await waitFor(() => expect(intersectionObservers.length).toBeGreaterThan(0));
    expect(intersectionObservers.at(-1)!.observe.mock.calls.map(([target]) => target.getAttribute('data-section-key'))).toEqual([
      'overview',
      'rawlogs',
    ]);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('raw-logs-count-badge')).toHaveTextContent('未加载');
    expect(lifecycleHookMock.mock.calls.at(-1)?.[1]).toBe(false);

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(lifecycleHookMock.mock.calls.at(-1)?.[1]).toBe(true);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(screen.getByTestId('raw-logs-count-badge')).toHaveTextContent('0 条');
    });
  });

  it('shows security analysis and its jump entry only when explicitly enabled', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('disposal-detail-nav-analysis')).toBeInTheDocument();
    expect(screen.queryByTestId('disposal-detail-nav-analysis-risk')).not.toBeInTheDocument();
    expect(screen.getByTestId('disposal-detail-analysis')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-section-stub')).toBeInTheDocument();
    expect(screen.getByTestId('overview-section-stub')).toHaveAttribute('data-has-view-basis', 'true');
    await waitFor(() => {
      expect(screen.getByTestId('analysis-section-stub')).toHaveAttribute('data-analysis-scope', 'all');
    });

    expect(apiRequestMock.mock.calls.filter(([path]) => path === '/mail-logs/1/analysis')).toHaveLength(1);
  });

  it.each([
    ['phishing', 'bg-red-500', '钓鱼邮件'],
    ['spam', 'bg-amber-500', '垃圾邮件'],
    ['normal', 'bg-emerald-500', '正常'],
  ] as const)('shows the %s final verdict risk tone on the security analysis navigation item', async (emailType, toneClass, label) => {
    detailResponse = { ...detailResponse, email_type: emailType };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    const risk = await screen.findByTestId('disposal-detail-nav-analysis-risk');
    expect(risk).toHaveClass(toneClass);
    expect(screen.getByTestId('disposal-detail-nav-analysis')).toHaveAccessibleName(
      `安全分析，最终判定：${label}`,
    );
  });

  it('collapses the desktop navigation to labeled icons and keeps that preference while mounted', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    const nav = await screen.findByTestId('disposal-detail-nav');
    const toggle = screen.getByTestId('disposal-detail-nav-toggle');
    expect(nav).toHaveAttribute('data-collapsed', 'false');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('收起导航栏');
    expect(screen.getByTestId('disposal-detail-nav-icon-overview')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('disposal-detail-nav-icon-analysis')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('disposal-detail-nav-icon-rawlogs')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(toggle);

    expect(nav).toHaveAttribute('data-collapsed', 'true');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('展开导航栏');
    expect(screen.getByTestId('disposal-detail-nav-overview')).toHaveAccessibleName('概览与处置');
    expect(screen.getByTestId('disposal-detail-nav-analysis')).toHaveAccessibleName('安全分析');
    expect(screen.getByTestId('disposal-detail-nav-rawlogs')).toHaveAccessibleName('原始日志');

    rerender(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open={false} mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('disposal-detail-nav')).toHaveAttribute('data-collapsed', 'true');
  });

  it('tracks the current section with a content-rooted IntersectionObserver and resets on reopen', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('disposal-detail-current-section')).toHaveTextContent('当前查看：概览与处置');
    await waitFor(() => expect(intersectionObservers.length).toBeGreaterThan(0));
    const observer = intersectionObservers.at(-1)!;
    expect(observer.rootMargin).toBe('0px 0px -80% 0px');
    expect(observer.observe.mock.calls.map(([target]) => target.getAttribute('data-section-key'))).toEqual([
      'overview',
      'analysis',
      'rawlogs',
    ]);

    scrollIntoViewMock.mockClear();
    act(() => {
      observer.trigger([{ target: screen.getByTestId('disposal-detail-analysis'), isIntersecting: true }]);
    });
    expect(screen.getByTestId('disposal-detail-current-section')).toHaveTextContent('当前查看：安全分析');
    expect(screen.getByTestId('disposal-detail-nav-analysis')).toHaveAttribute('aria-current', 'location');
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', inline: 'center', block: 'nearest' });

    rerender(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open={false} mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('disposal-detail-current-section')).toHaveTextContent('当前查看：概览与处置');
    });
  });

  it('shows message_uuid in the shared header as 邮件ID', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    const mailId = await screen.findByTestId('disposal-detail-mail-id');
    expect(mailId).toHaveTextContent('邮件ID：uuid-lazy-raw-log');
    expect(mailId).not.toHaveTextContent('<lazy-raw-log@example.test>');
  });

  it('requests authoritative recipient analysis and only passes exactly attributed events', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    const analysis = await screen.findByTestId('analysis-section-stub');
    await waitFor(() => {
      expect(analysis).toHaveAttribute('data-analysis-scope', 'all');
      expect(analysis).toHaveAttribute('data-event-ids', '11,12,13');
    });

    fireEvent.click(screen.getByTestId('analysis-select-recipient'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith('/mail-logs/1/analysis?recipient=blocked%40example.test');
      expect(analysis).toHaveAttribute('data-analysis-scope', 'recipient');
      expect(analysis).toHaveAttribute('data-selected-recipient', 'blocked@example.test');
      expect(analysis).toHaveAttribute('data-event-ids', '11');
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open={false} mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale="zh" messages={zh as never}>
          <DetailModal open mailLogId={1} onOpenChange={vi.fn()} showSecurityAnalysis />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const reopenedAnalysis = screen.getByTestId('analysis-section-stub');
      expect(reopenedAnalysis).toHaveAttribute('data-analysis-scope', 'all');
      expect(reopenedAnalysis).toHaveAttribute('data-selected-recipient', '');
      expect(reopenedAnalysis).toHaveAttribute('data-event-ids', '11,12,13');
    });
  });
});
