import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import type { MailLogDetail } from '@/types/email-disposal-detail';
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

describe('RawLogsSection (v2 spec alignment)', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('synthesizes level-tagged lines from real detail fields (CONNECT/AUTH/ACTION)', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} />));
    const viewer = screen.getByTestId('raw-logs-viewer');
    const text = viewer.textContent ?? '';
    expect(text).toContain('[CONNECT]');
    expect(text).toContain('client=203.0.113.45');
    expect(text).toContain('[AUTH]');
    expect(text).toContain('SPF=softfail');
    expect(text).toContain('DKIM=fail');
    expect(text).toContain('[ACTION]');
    expect(text).toContain('status=quarantined');
    // No fabricated data: a detail with no delivered_at should still not
    // crash and must not invent a [DELIVERY] line beyond real
    // recipient_dispositions entries (there are 2 above -> 2 lines).
    expect((text.match(/\[DELIVERY\]/g) ?? []).length).toBe(2);
  });

  it('does not give static log lines a false clickable hover affordance', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} />));
    const firstLine = screen.getAllByTestId(/^raw-log-line-\d+$/)[0];

    expect(firstLine).not.toHaveClass('hover:bg-slate-700/50', 'cursor-pointer');
    expect(firstLine).not.toHaveAttribute('data-hovered');
  });

  it('omits a whole line when its source fields are entirely absent (no fabrication)', () => {
    const detail = baseDetail({ spf_valid: undefined, dkim_valid: undefined, dmarc_valid: undefined });
    render(wrap(<RawLogsSection detail={detail} />));
    const text = screen.getByTestId('raw-logs-viewer').textContent ?? '';
    expect(text).not.toContain('[AUTH]');
  });

  it('badge shows the TOTAL line count, unaffected by search (gap 3.4)', () => {
    render(wrap(<RawLogsSection detail={baseDetail()} />));
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
    render(wrap(<RawLogsSection detail={baseDetail()} />));
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
    render(wrap(<RawLogsSection detail={baseDetail()} />));
    expect(screen.queryByTestId('disposal-raw-logs-found-count')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: 'DELIVERY' } });
    const counter = screen.getByTestId('disposal-raw-logs-found-count');
    expect(counter.textContent).toContain('找到 2');
    expect(counter.textContent).toContain('条记录');

    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: '' } });
    expect(screen.queryByTestId('disposal-raw-logs-found-count')).not.toBeInTheDocument();
  });

  it('copy-all copies only the FILTERED (search-scoped) lines and toggles to 已复制 (gap 3.6)', async () => {
    render(wrap(<RawLogsSection detail={baseDetail()} />));
    fireEvent.change(screen.getByTestId('disposal-raw-logs-search'), { target: { value: 'DELIVERY' } });

    fireEvent.click(screen.getByTestId('disposal-raw-logs-copy'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    const copiedText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(copiedText.split('\n')).toHaveLength(2);
    expect(copiedText).toContain('[DELIVERY]');
    expect(copiedText).not.toContain('[CONNECT]');

    expect(await screen.findByText('已复制')).toBeInTheDocument();
  });
});
