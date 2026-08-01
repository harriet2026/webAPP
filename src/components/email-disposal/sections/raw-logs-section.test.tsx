import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { toast } from 'sonner';
import zh from '@/../messages/zh.json';
import type { MailLifecycleLog, MailLogDetail } from '@/types/email-disposal-detail';
import { RawLogsSection } from './raw-logs-section';

// Real zh messages (not an identity mock) -- assertions read actual rendered
// copy (原始日志/条/找到.../已复制), matching the pattern established by
// analysis-section.test.tsx.
const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as never}>
    {ui}
  </NextIntlClientProvider>
);

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function baseDetail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: '<abc123@mail.company-security.com>',
    message_uuid: 'uuid-1',
    client_ip: '203.0.113.45',
    sender: 'ceo-fake@company-security.com',
    recipients: ['finance@company.com', 'hr@company.com'],
    authenticated: false,
    subject: 'Q2财务报表 - 紧急审批',
    action: 'quarantine',
    status: 'quarantined',
    received_at: '2026-07-20T09:15:00.000Z',
    processed_at: '2026-07-20T09:15:34.500Z',
    delivered_at: '2026-07-20T09:15:40.000Z',
    processing_time_ms: 599,
    spf_valid: 'softfail',
    dkim_valid: 'fail',
    dmarc_valid: 'pass',
    ptr_domain: 'mail.company-security.com',
    geo_region_name: '美国',
    cac_result: { tag: 'phishing', int_tag: 6, description: 'AI高管仿冒钓鱼' },
    email_type: 'phishing',
    disposal_basis: {
      policy_key: 'AI-SPOOF',
      rule_name: '高管仿冒识别',
      rule_id: 'AI-SPOOF-012',
      action: 'quarantine',
      hit_values: { spoof_type: '高管', confidence: '94' },
    },
    recipient_dispositions: [
      { recipient: 'finance@company.com', final_action: 'quarantine', status: 'quarantined' },
      { recipient: 'hr@company.com', final_action: 'deliver', status: 'delivery_failed', reason: 'mailbox full' },
    ],
    ...overrides,
  };
}

function rawLog(overrides: Partial<MailLifecycleLog> = {}): MailLifecycleLog {
  return {
    event_uid: 'event-101',
    message_uuid: '2540e741-0b50-4cf7-bbab-dc241df4e082',
    component: 'postfix',
    node: 'node-a',
    level: 'warn',
    event_time: '2026-07-20T09:16:00.000Z',
    raw_line: '2026-07-20T17:16:00+08:00 postfix/smtp[123]: 4hBFkl5xRBz1c41X: status=deferred (450 please try again)',
    source_file: '/var/log/postfix/mail.log',
    source_offset: 100,
    ...overrides,
  };
}

function rawLogs(): MailLifecycleLog[] {
  return [
    rawLog({
      component: 'antispam',
      event_uid: 'event-100',
      raw_line: '2026-07-20T17:15:00+08:00 postfix/smtpd[122]: [CONNECT] client=203.0.113.45',
      event_time: '2026-07-20T09:15:00.000Z',
    }),
    rawLog({
      event_uid: 'event-102',
      component: 'attachd',
      level: 'info',
      event_time: '2026-07-20T09:17:00.000Z',
      raw_line: '2026-07-20T17:17:00+08:00 postfix/smtp[124]: [DELIVERY] recipient=finance@company.com status=sent',
    }),
    rawLog({
      event_uid: 'event-103',
      component: 'postfix',
      level: 'error',
      event_time: '2026-07-20T09:18:00.000Z',
      raw_line: '2026-07-20T17:18:00+08:00 postfix/smtp[125]: [DELIVERY] recipient=hr@company.com status=failed',
    }),
  ];
}

function expandAllLogGroups() {
  for (const trigger of screen.getAllByTestId(/^raw-log-group-trigger-\d+$/)) {
    if (trigger.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(trigger);
    }
  }
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('RawLogsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:raw-logs-test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('is collapsed by default and delegates expansion to its owner', () => {
    const onExpandedChange = vi.fn();
    render(wrap(
      <RawLogsSection
        detail={baseDetail()}
        expanded={false}
        onExpandedChange={onExpandedChange}
        loaded={false}
        logs={rawLogs()}
      />,
    ));

    expect(screen.getByTestId('disposal-raw-logs-trigger')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('raw-logs-count-badge')).toHaveTextContent('未加载');
    expect(screen.queryByTestId('raw-logs-viewer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('disposal-raw-logs-trigger'));
    expect(onExpandedChange).toHaveBeenCalledOnce();
    expect(onExpandedChange.mock.calls[0][0]).toBe(true);
  });

  it('renders authoritative component raw_line values in chronological order', () => {
    const logs = [
      rawLog({
        event_uid: 'event-102',
        component: 'postfix',
        level: 'info',
        event_time: '2026-07-20T09:17:00.000Z',
        raw_line: '2026-07-20T17:17:00+08:00 postfix/smtp[124]: 4hBFkl5xRBz1c41X: status=sent (250 Mail OK)',
      }),
      rawLog(),
      rawLog({
        event_uid: 'event-103',
        component: 'antispam',
        event_time: '2026-07-20T09:15:30.000Z',
        raw_line: '',
      }),
    ];

    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={logs} />));
    expandAllLogGroups();

    const viewer = screen.getByTestId('raw-logs-viewer');
    const text = viewer.textContent ?? '';
    expect(text).toContain('status=deferred (450 please try again)');
    expect(text).toContain('status=sent (250 Mail OK)');
    expect(text.indexOf('status=deferred')).toBeLessThan(text.indexOf('status=sent'));
    expect(text).not.toContain('[CONNECT]');
    expect(text).not.toContain('[ACTION]');
    expect(screen.getByTestId('raw-logs-count-badge')).toHaveTextContent('2 条');
  });

  it('never synthesizes detail summaries when no component has a raw line', () => {
    render(wrap(
      <RawLogsSection
        detail={baseDetail()}
        expanded
        onExpandedChange={vi.fn()}
        loaded
        logs={[rawLog({ raw_line: '', component: 'antispam' })]}
      />,
    ));

    const text = screen.getByTestId('raw-logs-viewer').textContent ?? '';
    expect(text).toContain('暂无原始日志');
    expect(text).not.toContain('[CONNECT]');
    expect(text).not.toContain('[ACTION]');
    expect(screen.getByTestId('raw-logs-count-badge')).toHaveTextContent('0 条');
  });

  it('shows collection failures explicitly instead of misreporting an empty lifecycle', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} logs={[]} error />));

    expect(screen.getByTestId('raw-logs-viewer')).toHaveTextContent('原始日志加载失败');
    expect(screen.getByTestId('raw-logs-viewer')).not.toHaveTextContent('暂无原始日志');
  });

  it('shows the server truncation warning when disk search hits its limit', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} truncated />));
    expect(screen.getByText('已截断至 10,000 行')).toBeInTheDocument();
  });

  it('marks multi-node partial results and names the failed gateways', () => {
    render(wrap(
      <RawLogsSection
        detail={baseDetail()}
        expanded
        onExpandedChange={vi.fn()}
        loaded
        logs={rawLogs()}
        partial
        failedNodes={['node-b', 'node-c']}
      />,
    ));

    const warning = screen.getByTestId('raw-logs-partial-warning');
    expect(warning).toHaveTextContent('当前生命周期日志不完整');
    expect(warning).toHaveTextContent('node-b, node-c');
    expandAllLogGroups();
    expect(screen.getByTestId('raw-logs-viewer')).toHaveTextContent('status=failed');
  });

  it('does not give static log lines a false clickable hover affordance', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));
    expandAllLogGroups();
    const firstLine = screen.getAllByTestId(/^raw-log-line-\d+$/)[0];

    expect(firstLine).not.toHaveClass('hover:bg-slate-700/50', 'cursor-pointer');
    expect(firstLine).not.toHaveAttribute('data-hovered');
  });

  it('omits records without raw_line instead of fabricating a replacement', () => {
    render(wrap(
      <RawLogsSection
        detail={baseDetail()}
        expanded
        onExpandedChange={vi.fn()}
        loaded
        logs={[
          ...rawLogs(),
          rawLog({
            event_uid: 'event-104',
            component: 'apiserver',
            raw_line: '',
          }),
        ]}
      />,
    ));
    const text = screen.getByTestId('raw-logs-viewer').textContent ?? '';
    expect(screen.getByTestId('raw-logs-count-badge')).toHaveTextContent('3 条');
    expect(text).not.toContain('released');
  });

  it('badge shows the TOTAL line count, unaffected by search (gap 3.4)', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));
    const badge = screen.getByTestId('raw-logs-count-badge');
    const totalText = badge.textContent ?? '';
    const match = totalText.match(/(\d+)\s*条/);
    expect(match).not.toBeNull();
    const total = Number(match![1]);
    expect(total).toBeGreaterThan(0);

    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: 'CONNECT' } });
    expect(screen.getByTestId('raw-logs-count-badge').textContent).toBe(totalText);
  });

  it('filtered line numbers are renumbered contiguously 1..N of matches (gap 3.3)', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));
    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: 'DELIVERY' } });

    const rows = screen.getAllByTestId(/^raw-log-line-\d+$/);
    expect(rows).toHaveLength(2); // exactly the 2 [DELIVERY] lines
    expect(rows[0]).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('2');
    for (const row of rows) {
      expect(row.textContent).toContain('[DELIVERY]');
    }
  });

  it('shows 找到 X / N 条记录 only when the search box is non-empty (gap 3.5)', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));
    expect(screen.queryByTestId('disposal-raw-logs-found-count')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: 'DELIVERY' } });
    const counter = screen.getByTestId('disposal-raw-logs-found-count');
    expect(counter.textContent).toContain('找到 2');
    expect(counter.textContent).toContain('条记录');

    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: '' } });
    expect(screen.queryByTestId('disposal-raw-logs-found-count')).not.toBeInTheDocument();
  });

  it('copy-all emits search-scoped JSON grouped by component and toggles to 已复制', async () => {
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));
    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: 'DELIVERY' } });

    fireEvent.click(screen.getByTestId('disposal-raw-logs-copy'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const copied = JSON.parse(copiedText) as Record<string, Array<Record<string, unknown>>>;
    expect(Object.keys(copied)).toEqual(['attachd', 'postfix']);
    expect(copied.attachd).toHaveLength(1);
    expect(copied.postfix).toHaveLength(1);
    expect(copied.attachd[0].raw_line).toContain('[DELIVERY]');
    expect(copied.postfix[0].raw_line).toContain('[DELIVERY]');
    expect(copied.attachd[0]).not.toHaveProperty('component');
    expect(copied).not.toHaveProperty('antispam');

    expect(await screen.findByText('已复制')).toBeInTheDocument();
  });

  it('falls back to document copy when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    let fallbackText = '';
    const execCommand = vi.fn().mockImplementation((command: string) => {
      fallbackText = (document.activeElement as HTMLTextAreaElement | null)?.value ?? '';
      return command === 'copy';
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));

    fireEvent.click(screen.getByTestId('disposal-raw-logs-copy'));

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(toast.success).toHaveBeenCalledWith('已复制');
    });
    const copied = JSON.parse(fallbackText) as Record<string, Array<Record<string, unknown>>>;
    expect(Object.keys(copied)).toEqual(['antispam', 'attachd', 'postfix']);
    expect(copied.postfix).toHaveLength(1);
    expect(document.querySelector('textarea[aria-hidden="true"]')).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('uses the document copy fallback when the Clipboard API rejects the request', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));

    fireEvent.click(screen.getByTestId('disposal-raw-logs-copy'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(toast.success).toHaveBeenCalledWith('已复制');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows a localized error instead of throwing when no copy mechanism succeeds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    render(wrap(<RawLogsSection detail={baseDetail()} expanded onExpandedChange={vi.fn()} loaded logs={rawLogs()} />));

    fireEvent.click(screen.getByTestId('disposal-raw-logs-copy'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('复制失败，请手动选择并复制');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows the producing component and preserves source whitespace when copying', async () => {
    const exactRawLine = '  {\"time\":\"2026-07-20T09:15:00Z\",\"message_uuid\":\"2540e741-0b50-4cf7-bbab-dc241df4e082\"}  ';
    render(wrap(
      <RawLogsSection
        detail={baseDetail()}
        expanded
        onExpandedChange={vi.fn()}
        loaded
        logs={[rawLog({ component: 'antispam', raw_line: exactRawLine })]}
      />,
    ));

    expect(screen.getByTestId('raw-log-group-trigger-0')).toHaveTextContent('antispam');
    expect(screen.getByTestId('raw-log-group-trigger-0')).toHaveTextContent('node-a');
    fireEvent.click(screen.getByTestId('raw-log-group-trigger-0'));
    const jsonViewer = screen.getByTestId('raw-log-json-viewer-1');
    expect(jsonViewer).toHaveTextContent('"time"');
    expect(jsonViewer).toHaveTextContent('"2026-07-20T09:15:00Z"');
    expect(jsonViewer.querySelector('details[data-json-depth="0"]')).toHaveAttribute('open');
    fireEvent.click(screen.getByTestId('disposal-raw-logs-copy'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const copied = JSON.parse(copiedText) as Record<string, Array<Record<string, unknown>>>;
    expect(Object.keys(copied)).toEqual(['antispam']);
    expect(copied.antispam[0].node).toBe('node-a');
    expect(copied.antispam[0].raw_line).toBe(exactRawLine);
    expect(copied.antispam[0]).not.toHaveProperty('component');
  });

  it('downloads all logs as an application/json file grouped by component', async () => {
    let downloadedFilename = '';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
    });
    render(wrap(
      <RawLogsSection
        detail={baseDetail({ id: 42 })}
        expanded
        onExpandedChange={vi.fn()}
        loaded
        logs={rawLogs()}
      />,
    ));

    fireEvent.click(screen.getByTestId('disposal-raw-logs-download'));

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json;charset=utf-8');
    const downloaded = JSON.parse(await readBlob(blob)) as Record<string, Array<Record<string, unknown>>>;
    expect(Object.keys(downloaded)).toEqual(['antispam', 'attachd', 'postfix']);
    expect(downloaded.antispam[0].node).toBe('node-a');
    expect(downloaded.antispam[0]).not.toHaveProperty('component');
    expect(downloaded.attachd[0].raw_line).toContain('status=sent');
    expect(downloaded.postfix[0].raw_line).toContain('status=failed');
    expect(downloadedFilename).toMatch(/^email-log-42-\d{4}-\d{2}-\d{2}\.json$/);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:raw-logs-test');
    clickSpy.mockRestore();
  });

  it('uses a collapsible JSON tree for pure or prefixed JSON and leaves plain logs unchanged', () => {
    const prefixedJson = '2026-07-20T17:15:00+08:00 INFO {"event_uid":"event-json","payload":{"retry_count":2,"queued":true}}';
    const plainText = '2026-07-20T17:16:00+08:00 postfix/smtp[123]: status=deferred';
    render(wrap(
      <RawLogsSection
        detail={baseDetail()}
        expanded
        onExpandedChange={vi.fn()}
        loaded
        logs={[
          rawLog({
            event_uid: 'event-json',
            component: 'antispam',
            event_time: '2026-07-20T09:15:00.000Z',
            raw_line: prefixedJson,
          }),
          rawLog({
            event_uid: 'event-plain',
            component: 'antispam',
            event_time: '2026-07-20T09:16:00.000Z',
            raw_line: plainText,
          }),
        ]}
      />,
    ));

    fireEvent.click(screen.getByTestId('raw-log-group-trigger-0'));
    const jsonViewer = screen.getByTestId('raw-log-json-viewer-1');
    expect(jsonViewer).toHaveTextContent('2026-07-20T17:15:00+08:00 INFO');
    expect(jsonViewer).toHaveTextContent('"event_uid"');
    expect(jsonViewer).toHaveTextContent('"payload"');
    expect(jsonViewer.querySelector('details[data-json-depth="0"]')).toHaveAttribute('open');
    const nestedNode = jsonViewer.querySelector('details[data-json-depth="1"]');
    const nestedSummary = jsonViewer.querySelector('details[data-json-depth="1"] > summary');
    expect(nestedNode).not.toHaveAttribute('open');
    expect(nestedSummary).toHaveTextContent('… }');
    fireEvent.click(nestedSummary!);
    expect(nestedNode).toHaveAttribute('open');
    expect(screen.queryByTestId('raw-log-json-viewer-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('raw-log-line-2')).toHaveTextContent(plainText);
  });

  it('groups node/component logs into independently collapsible summaries', () => {
    render(wrap(
      <RawLogsSection
        detail={baseDetail()}
        expanded
        onExpandedChange={vi.fn()}
        loaded
        logs={rawLogs()}
      />,
    ));

    const groups = screen.getAllByTestId(/^raw-log-group-trigger-\d+$/);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('raw-log-line-1')).not.toBeInTheDocument();

    fireEvent.click(groups[0]);
    expect(groups[0]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('raw-log-line-1')).toHaveTextContent('[CONNECT]');
    expect(screen.queryByTestId('raw-log-line-2')).not.toBeInTheDocument();

    fireEvent.click(groups[0]);
    expect(screen.queryByTestId('raw-log-line-1')).not.toBeInTheDocument();
  });
});
