import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import { OverviewSection } from './overview-section';

const scrollIntoViewMock = vi.fn();

vi.mock('@/lib/api/client', () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

vi.mock('./overview/threat-summary-card', () => ({
  ThreatSummaryCard: ({ detail }: { detail: MailLogDetail }) => (
    detail.disposal_basis?.policy_key || detail.reason
      ? <div data-testid="email-disposal-overview-disposal-basis">处置依据</div>
      : <div data-testid="threat-summary-without-basis" />
  ),
}));

vi.mock('./overview/send-receive-context-card', () => ({
  SendReceiveContextCard: ({ onViewPolicyDetail }: { onViewPolicyDetail?: () => void }) => (
    <button
      type="button"
      data-testid="context-policy-entry-stub"
      data-has-target={onViewPolicyDetail ? 'true' : 'false'}
      onClick={onViewPolicyDetail}
    >
      查看策略命中详情
    </button>
  ),
}));

vi.mock('./overview/investigation-workbench', () => ({
  InvestigationWorkbench: ({ onViewPolicyDetail }: { onViewPolicyDetail?: () => void }) => (
    <div data-testid="workbench-policy-entry-stub" data-has-target={onViewPolicyDetail ? 'true' : 'false'} />
  ),
}));

function detail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: '<gt-12596@example.test>',
    message_uuid: 'gt-12596',
    client_ip: '203.0.113.10',
    sender: 'sender@example.test',
    recipients: ['recipient@example.test'],
    authenticated: false,
    subject: 'GT-12596',
    action: 'discard',
    status: 'discarded',
    received_at: '2026-08-18T02:06:18Z',
    disposal_basis: {
      policy_key: 'SENDER',
      rule_name: 'blocked sender',
      action: 'discard',
    },
    ...overrides,
  };
}

function renderSection(mail: MailLogDetail, onViewBasis?: () => void) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <OverviewSection detail={mail} onRefetch={vi.fn()} onViewBasis={onViewBasis} />
    </NextIntlClientProvider>,
  );
}

describe('OverviewSection policy-detail routing', () => {
  beforeEach(() => {
    scrollIntoViewMock.mockReset();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  it('GT-12596: falls back to the overview disposal basis when security analysis is hidden', () => {
    renderSection(detail());

    const entry = screen.getByTestId('context-policy-entry-stub');
    expect(entry).toHaveAttribute('data-has-target', 'true');
    expect(screen.getByTestId('workbench-policy-entry-stub')).toHaveAttribute('data-has-target', 'true');

    fireEvent.click(entry);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('prefers the full security-analysis target when that section is visible', () => {
    const onViewBasis = vi.fn();
    renderSection(detail(), onViewBasis);

    fireEvent.click(screen.getByTestId('context-policy-entry-stub'));
    expect(onViewBasis).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('does not expose a policy-detail target when neither analysis nor an overview basis exists', () => {
    renderSection(detail({ disposal_basis: undefined, reason: undefined }));

    expect(screen.getByTestId('context-policy-entry-stub')).toHaveAttribute('data-has-target', 'false');
    expect(screen.getByTestId('workbench-policy-entry-stub')).toHaveAttribute('data-has-target', 'false');
  });
});
