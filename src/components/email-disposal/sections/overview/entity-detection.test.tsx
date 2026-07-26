import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityDetection } from './entity-detection';
import type { MailLogDetail } from '@/types/email-disposal-detail';

// Identity translator (mirrors sender-actions.test.tsx): keeps namespace + key
// + interpolation params visible instead of resolving to real zh/en/th/ru
// copy, so this test stays decoupled from messages/*.json content.
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => (
    params ? `${namespace}.${key}:${JSON.stringify(params)}` : `${namespace}.${key}`
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function baseDetail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: 'm1',
    message_uuid: 'u1',
    client_ip: '1.2.3.4',
    sender: 'attacker@evil.com',
    recipients: ['victim@corp.com'],
    authenticated: false,
    subject: 'test',
    action: 'sideline',
    status: 'sidelined',
    received_at: '2026-07-23T00:00:00Z',
    ...overrides,
  } as MailLogDetail;
}

function baseProps(overrides: Partial<React.ComponentProps<typeof EntityDetection>> = {}) {
  return {
    detail: baseDetail(),
    requestFn: vi.fn().mockResolvedValue({}) as never,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EntityDetection', () => {
  it('renders the links/attachments tab toggle buttons with counts', () => {
    render(<EntityDetection {...baseProps({
      detail: baseDetail({
        entity_urls: [{ url: 'https://evil.com/a', domain: 'evil.com', check_result: 'THREAT', threat_type: 'MALWARE' }],
        attachments: [{ filename: 'report.pdf', size: 1024, md5sum: 'abc123', content_type: 'application/pdf', inline: false, content_length: 1024 }],
      }),
    })} />);
    expect(screen.getByTestId('email-disposal-overview-entity-tab-links')).toHaveTextContent('1');
    expect(screen.getByTestId('email-disposal-overview-entity-tab-attachments')).toHaveTextContent('1');
  });

  it('renders the global-effect hint', () => {
    render(<EntityDetection {...baseProps()} />);
    expect(screen.getByTestId('email-disposal-overview-entity-global-hint')).toBeInTheDocument();
  });

  it('shows empty state when there are no links', () => {
    render(<EntityDetection {...baseProps()} />);
    expect(screen.getByTestId('email-disposal-overview-entity-links-empty')).toBeInTheDocument();
  });

  it('shows a THREAT url and a safe url on the links tab, with a threat badge (text, not a VT number) on the THREAT one', () => {
    const urls = [
      { url: 'https://evil.com/phish', domain: 'evil.com', check_result: 'THREAT', threat_type: 'MALWARE' },
      { url: 'https://safe.com/ok', domain: 'safe.com', check_result: 'SAFE' },
    ];
    render(<EntityDetection {...baseProps({ detail: baseDetail({ entity_urls: urls }) })} />);

    const threatKey = encodeURIComponent('https://evil.com/phish').slice(0, 64);
    const safeKey = encodeURIComponent('https://safe.com/ok').slice(0, 64);
    const threatRow = screen.getByTestId(`email-disposal-overview-entity-link-${threatKey}`);
    const safeRow = screen.getByTestId(`email-disposal-overview-entity-link-${safeKey}`);

    expect(within(threatRow).getByText('evil.com')).toBeInTheDocument();
    expect(within(threatRow).getByText('MALWARE')).toBeInTheDocument();
    expect(within(threatRow).queryByText(/^\d+(\.\d+)?%?\/\d+$/)).not.toBeInTheDocument();
    expect(within(threatRow).getByTestId(`email-disposal-overview-entity-link-${threatKey}-blacklist-domain`)).toBeInTheDocument();
    expect(within(threatRow).getByTestId(`email-disposal-overview-entity-link-${threatKey}-blacklist-url`)).toBeInTheDocument();
    expect(within(safeRow).getByText('safe.com')).toBeInTheDocument();
  });

  it('renders a VirusTotal score badge (red/bold) when vt_score has a positive numerator', () => {
    const urls = [{ url: 'https://evil.com/phish', domain: 'evil.com', check_result: 'THREAT', threat_type: 'MALWARE', vt_score: '47/90' }];
    render(<EntityDetection {...baseProps({ detail: baseDetail({ entity_urls: urls }) })} />);

    const key = encodeURIComponent('https://evil.com/phish').slice(0, 64);
    const badge = screen.getByTestId(`email-disposal-overview-entity-link-${key}-vt-score`);
    expect(badge.textContent).toContain('47/90');
    expect(badge.className).toContain('text-red-700');
  });

  it('renders a neutral VirusTotal score badge when vt_score has a zero numerator', () => {
    const urls = [{ url: 'https://safe.company.com/x', domain: 'safe.company.com', vt_score: '0/90' }];
    render(<EntityDetection {...baseProps({ detail: baseDetail({ entity_urls: urls }) })} />);

    const key = encodeURIComponent('https://safe.company.com/x').slice(0, 64);
    const badge = screen.getByTestId(`email-disposal-overview-entity-link-${key}-vt-score`);
    expect(badge.textContent).toContain('0/90');
    expect(badge.className).not.toContain('text-red-700');
  });

  it('does NOT render a VirusTotal score badge when vt_score is absent', () => {
    const urls = [{ url: 'https://evil.com/phish', domain: 'evil.com', check_result: 'THREAT', threat_type: 'MALWARE' }];
    render(<EntityDetection {...baseProps({ detail: baseDetail({ entity_urls: urls }) })} />);

    const key = encodeURIComponent('https://evil.com/phish').slice(0, 64);
    expect(screen.queryByTestId(`email-disposal-overview-entity-link-${key}-vt-score`)).not.toBeInTheDocument();
  });

  it('clicking 域名加黑 calls requestFn with a POST to /unified-rules, page=url_protection, field=urls', async () => {
    const user = userEvent.setup();
    const requestFn = vi.fn().mockResolvedValue({}) as never;
    const urls = [{ url: 'https://evil.com/phish', domain: 'evil.com', check_result: 'THREAT', threat_type: 'MALWARE' }];
    render(<EntityDetection {...baseProps({ requestFn, detail: baseDetail({ entity_urls: urls }) })} />);

    const key = encodeURIComponent('https://evil.com/phish').slice(0, 64);
    await user.click(screen.getByTestId(`email-disposal-overview-entity-link-${key}-blacklist-domain`));

    await waitFor(() => expect(requestFn).toHaveBeenCalledTimes(1));
    const [url, opts] = (requestFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/unified-rules');
    expect(opts.method).toBe('POST');
    expect(opts.body.page).toBe('url_protection');
    expect(opts.body.action).toBe('reject');
    expect(opts.body.condition_tree).toEqual({ type: 'condition', field: 'urls', operator: 'contain', value: 'evil.com' });
  });

  it('clicking URL加黑 sends the full URL as the condition value', async () => {
    const user = userEvent.setup();
    const requestFn = vi.fn().mockResolvedValue({}) as never;
    const urls = [{ url: 'https://evil.com/phish', domain: 'evil.com', check_result: 'THREAT' }];
    render(<EntityDetection {...baseProps({ requestFn, detail: baseDetail({ entity_urls: urls }) })} />);

    const key = encodeURIComponent('https://evil.com/phish').slice(0, 64);
    await user.click(screen.getByTestId(`email-disposal-overview-entity-link-${key}-blacklist-url`));

    await waitFor(() => expect(requestFn).toHaveBeenCalledTimes(1));
    const [, opts] = (requestFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.body.condition_tree).toEqual({ type: 'condition', field: 'urls', operator: 'contain', value: 'https://evil.com/phish' });
  });

  it('shows the report.pdf attachment with its hash-blacklist button on the attachments tab', async () => {
    const user = userEvent.setup();
    const attachments = [{ filename: 'report.pdf', size: 2048, md5sum: 'deadbeef', content_type: 'application/pdf', inline: false, content_length: 2048 }];
    render(<EntityDetection {...baseProps({ detail: baseDetail({ attachments }) })} />);

    await user.click(screen.getByTestId('email-disposal-overview-entity-tab-attachments'));
    const row = screen.getByTestId('email-disposal-overview-entity-attachment-deadbeef');
    expect(within(row).getByText('report.pdf')).toBeInTheDocument();
    expect(within(row).getByTestId('email-disposal-overview-entity-attachment-deadbeef-blacklist-hash')).toBeInTheDocument();
    expect(within(row).getByTestId('email-disposal-overview-entity-attachment-deadbeef-download')).toBeInTheDocument();
  });

  it('clicking 哈希加黑 calls requestFn with page=attachment_security, field=attachment_md5, operator=eq', async () => {
    const user = userEvent.setup();
    const requestFn = vi.fn().mockResolvedValue({}) as never;
    const attachments = [{ filename: 'report.pdf', size: 2048, md5sum: 'deadbeef', content_type: 'application/pdf', inline: false, content_length: 2048 }];
    render(<EntityDetection {...baseProps({ requestFn, detail: baseDetail({ attachments }) })} />);

    await user.click(screen.getByTestId('email-disposal-overview-entity-tab-attachments'));
    await user.click(screen.getByTestId('email-disposal-overview-entity-attachment-deadbeef-blacklist-hash'));

    await waitFor(() => expect(requestFn).toHaveBeenCalledTimes(1));
    const [url, opts] = (requestFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain('/unified-rules');
    expect(opts.body.page).toBe('attachment_security');
    expect(opts.body.stage).toBe('sideline');
    expect(opts.body.condition_tree).toEqual({ type: 'condition', field: 'attachment_md5', operator: 'eq', value: 'deadbeef' });
  });

  it('shows an AV verdict badge when scan_results has a matching virus_name', async () => {
    const user = userEvent.setup();
    const attachments = [{ filename: 'invoice.exe', size: 512, md5sum: 'badc0de', content_type: 'application/octet-stream', inline: false, content_length: 512 }];
    const scan_results = [{ scan_id: 's1', message_id: 'm1', direction: 'receive', final_disposition: 'blocked', is_encrypted: false, attachment_md5: 'badc0de', qr_code_count: 0, is_zip_bomb: false, virus_name: 'Trojan.Generic', duration_ms: 10 }];
    render(<EntityDetection {...baseProps({ detail: baseDetail({ attachments, scan_results }) })} />);

    await user.click(screen.getByTestId('email-disposal-overview-entity-tab-attachments'));
    const row = screen.getByTestId('email-disposal-overview-entity-attachment-badc0de');
    expect(within(row).getByText('Trojan.Generic')).toBeInTheDocument();
  });

  it('disables the hash-blacklist button when the attachment has no md5sum', async () => {
    const user = userEvent.setup();
    const attachments = [{ filename: 'no-hash.txt', size: 10, content_type: 'text/plain', inline: false, content_length: 10 }];
    render(<EntityDetection {...baseProps({ detail: baseDetail({ attachments }) })} />);

    await user.click(screen.getByTestId('email-disposal-overview-entity-tab-attachments'));
    expect(screen.getByTestId('email-disposal-overview-entity-attachment-0-blacklist-hash')).toBeDisabled();
  });
});
