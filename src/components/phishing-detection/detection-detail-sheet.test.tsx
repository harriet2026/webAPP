import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import { groupRecipientDispositions } from '@/components/email-disposal/hooks/use-recipient-disposition';
import type { DetectionLogDetail } from '@/types/phishing-detection';

const getDetail = vi.fn();
const recipientStatus = vi.fn();
vi.mock('@/lib/api/phishing-detection', () => ({ getDetectionLogDetail: (...args: unknown[]) => getDetail(...args) }));
vi.mock('@/lib/api/client', () => ({ useApiRequest: () => ({ apiRequest: vi.fn(), effectiveTenantId: 2 }) }));
vi.mock('./access', () => ({ usePhishingAccess: () => ({ canEdit: true, readOnly: false }) }));
vi.mock('@/components/email-disposal/components/recipient-status', () => ({
  RecipientStatus: (props: unknown) => { recipientStatus(props); return <div data-testid="recipient-status-stub" />; },
}));

import { DetectionDetailSheet } from './detection-detail-sheet';

const detail: DetectionLogDetail = {
  summary: {
    sideline_id: 's-1', message_id: 'm-1', sender: 'sender@example.com', subject: 'pending mail', recipients: ['a@example.com'], direction: 'inbound', status: 'pending', sidelined_at: '2026-08-18T00:00:00Z',
    risk_level: null, policy_disposition: null, task_status: 'processing', failure_reason: null, mail_log_id: 17,
    display_statuses: [{ status: 'sideline_pending', count: 1 }], recipient_dispositions: [{ recipient: 'a@example.com', final_action: 'sideline', status: 'sidelined', object_id: 's-1' }],
    disposition: 'processing', detection_mode: 'realtime', recall_status: 'pending_processing', agent_rounds: 0, url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 }, result_truncated: false,
  },
  investigation: null,
  config_snapshot: null,
};

function renderDetail(value: DetectionLogDetail, locale = 'zh', messages: unknown = zh) {
  getDetail.mockResolvedValue(value);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<NextIntlClientProvider locale={locale} messages={messages as never}><QueryClientProvider client={client}><DetectionDetailSheet open onOpenChange={vi.fn()} detailId="s-1" /></QueryClientProvider></NextIntlClientProvider>);
}

describe('DetectionDetailSheet disposal capability chain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes mail_log_id and recipients to RecipientStatus but blocks actions while sideline is live', async () => {
    renderDetail(detail);
    expect(await screen.findByTestId('phishing-live-task-hint')).toHaveTextContent('请在旁路队列处置');
    await waitFor(() => expect(recipientStatus).toHaveBeenCalled());
    expect(recipientStatus.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ mailLogId: 17, readOnly: true, recipient_dispositions: detail.summary.recipient_dispositions }));
    expect(groupRecipientDispositions(detail.summary.recipient_dispositions)[0].actions).toEqual(['deliver', 'discard']);
  });

  it('relies on the shared status chain to expose no operations for terminal recipients', async () => {
    const terminal = structuredClone(detail);
    terminal.summary.task_status = 'completed';
    terminal.summary.recipient_dispositions = [{ recipient: 'a@example.com', final_action: 'discard', status: 'discarded' }];
    renderDetail(terminal);
    await screen.findByTestId('recipient-status-stub');
    expect(screen.queryByTestId('phishing-live-task-hint')).not.toBeInTheDocument();
    expect(groupRecipientDispositions(terminal.summary.recipient_dispositions)[0].actions).toEqual([]);
    expect(recipientStatus.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ readOnly: false }));
  });

  it('localizes dates, directions, and investigation statuses', async () => {
    const localized = structuredClone(detail);
    localized.summary.task_status = 'completed';
    localized.investigation = {
      status: 'completed',
      steps: [{ name: 'provider_analysis', status: 'completed', message: 'done' }],
    };
    renderDetail(localized, 'en', en);

    expect(await screen.findByText('Inbound')).toBeInTheDocument();
    expect(screen.getAllByText('Completed')).not.toHaveLength(0);
    expect(screen.getByText(/2026\/08\/18/)).toBeInTheDocument();
  });
});
