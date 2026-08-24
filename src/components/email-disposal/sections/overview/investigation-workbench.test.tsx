import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestigationWorkbench } from './investigation-workbench';
import type { MailLogDetail } from '@/types/email-disposal-detail';

// 右列子组件 EntityDetection 自 GT-12601 起用 useAuth 决定加黑规则 priority；
// 这里不在 AuthProvider 下渲染，按普通角色 mock（本套件不断言 priority 分支，
// 那在 entity-detection.test.tsx 里测）。
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: false }),
}));

// Identity translator (mirrors entity-detection.test.tsx): keeps namespace +
// key + interpolation params visible instead of resolving to real zh/en/th/ru
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
    content: 'This is urgent, needs 财务 approval right away.',
    html_content: '<p>Hello <b>World</b></p>',
    ...overrides,
  } as MailLogDetail;
}

function baseProps(overrides: Partial<React.ComponentProps<typeof InvestigationWorkbench>> = {}) {
  return {
    detail: baseDetail(),
    requestFn: vi.fn().mockResolvedValue({}) as never,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InvestigationWorkbench', () => {
  it('renders the three content-view tabs, defaulting to plain text', () => {
    render(<InvestigationWorkbench {...baseProps()} />);
    expect(screen.getByTestId('email-disposal-workbench-content-view-text')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-workbench-content-view-html')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-workbench-content-view-raw')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-workbench-text-content')).toBeInTheDocument();
  });

  it('switches to the HTML view and renders html_content via the sandboxed iframe', () => {
    render(<InvestigationWorkbench {...baseProps()} />);
    fireEvent.click(screen.getByTestId('email-disposal-workbench-content-view-html'));
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('srcdoc') ?? '').toContain('Hello');
    expect(iframe?.getAttribute('srcdoc') ?? '').toContain('World');
  });

  it('renders the 下载EML button', () => {
    render(<InvestigationWorkbench {...baseProps()} />);
    expect(screen.getByTestId('email-disposal-workbench-download-eml')).toBeInTheDocument();
  });

  it('renders the EntityDetection component as the right column', () => {
    render(<InvestigationWorkbench {...baseProps()} />);
    expect(screen.getByTestId('email-disposal-overview-entity-detection')).toBeInTheDocument();
  });

  it('highlights sensitive words in the plain-text view with <mark>', () => {
    render(<InvestigationWorkbench {...baseProps()} />);
    const el = screen.getByTestId('email-disposal-workbench-text-content');
    const mark = el.querySelector('mark');
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toBe('财务');
  });

  it('highlights a malicious URL from entity_urls in the plain-text view', () => {
    render(<InvestigationWorkbench {...baseProps({
      detail: baseDetail({
        content: 'Click http://evil.example/phish now.',
        entity_urls: [{ url: 'http://evil.example/phish', domain: 'evil.example', verdict: 'malicious', check_result: 'THREAT' }],
      }),
    })} />);
    const el = screen.getByTestId('email-disposal-workbench-text-content');
    const marks = Array.from(el.querySelectorAll('mark'));
    expect(marks.some((m) => m.textContent === 'http://evil.example/phish')).toBe(true);
  });

  it('shows the C1 blocked/discarded banner when a multi-recipient message has some blocked recipients', () => {
    render(<InvestigationWorkbench {...baseProps({
      detail: baseDetail({
        recipients: ['a@corp.com', 'b@corp.com'],
        recipient_dispositions: [
          { recipient: 'a@corp.com', final_action: 'deliver', status: 'delivered' },
          { recipient: 'b@corp.com', final_action: 'reject', status: 'blocked' },
        ],
      }),
    })} />);
    expect(screen.getByTestId('email-disposal-workbench-blocked-banner')).toBeInTheDocument();
  });

  it('does not show the C1 banner when every recipient is blocked (nothing to contrast) or none are', () => {
    render(<InvestigationWorkbench {...baseProps({
      detail: baseDetail({
        recipients: ['a@corp.com', 'b@corp.com'],
        recipient_dispositions: [
          { recipient: 'a@corp.com', final_action: 'deliver', status: 'delivered' },
          { recipient: 'b@corp.com', final_action: 'deliver', status: 'delivered' },
        ],
      }),
    })} />);
    expect(screen.queryByTestId('email-disposal-workbench-blocked-banner')).not.toBeInTheDocument();
  });

  it('shows the C5 blocked overlay when the single recipient is blocked/discarded', () => {
    render(<InvestigationWorkbench {...baseProps({
      detail: baseDetail({
        recipients: ['b@corp.com'],
        content: undefined,
        html_content: undefined,
        recipient_dispositions: [
          { recipient: 'b@corp.com', final_action: 'reject', status: 'discarded' },
        ],
      }),
    })} />);
    expect(screen.getByTestId('email-disposal-workbench-blocked-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-workbench-view-smtp-session')).toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-workbench-view-policy-detail')).not.toBeInTheDocument();
  });

  // GT-12600 防回归：阻断/丢弃遮罩上的两个入口不再是死按钮——分别调用
  // onViewSmtpSession（跳原始日志区）与 onViewPolicyDetail（跳安全分析区）。
  it('GT-12600: blocked overlay buttons invoke onViewSmtpSession / onViewPolicyDetail', async () => {
    const user = userEvent.setup();
    const onViewSmtpSession = vi.fn();
    const onViewPolicyDetail = vi.fn();
    render(<InvestigationWorkbench {...baseProps({
      onViewSmtpSession,
      onViewPolicyDetail,
      detail: baseDetail({
        recipients: ['b@corp.com'],
        content: undefined,
        html_content: undefined,
        recipient_dispositions: [
          { recipient: 'b@corp.com', final_action: 'reject', status: 'discarded' },
        ],
      }),
    })} />);

    await user.click(screen.getByTestId('email-disposal-workbench-view-smtp-session'));
    expect(onViewSmtpSession).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId('email-disposal-workbench-view-policy-detail'));
    expect(onViewPolicyDetail).toHaveBeenCalledTimes(1);
  });

  it('does not show the C5 overlay when the single recipient content is retained', () => {
    render(<InvestigationWorkbench {...baseProps({
      detail: baseDetail({
        recipients: ['b@corp.com'],
        recipient_dispositions: [
          { recipient: 'b@corp.com', final_action: 'deliver', status: 'delivered' },
        ],
      }),
    })} />);
    expect(screen.queryByTestId('email-disposal-workbench-blocked-overlay')).not.toBeInTheDocument();
  });
});
