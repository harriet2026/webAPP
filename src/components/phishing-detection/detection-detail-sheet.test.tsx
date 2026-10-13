import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import en from '@/../messages/en.json';
import { groupRecipientDispositions } from '@/components/email-disposal/hooks/use-recipient-disposition';
import type { DetectionLogDetail } from '@/types/phishing-detection';
import { serviceMail7Zh, serviceMail8Zh } from '../../../tests/fixtures/phish-ui-real-data/zh';
import { cliMockDetail } from '../../../tests/fixtures/phish-ui-real-data/mock-detail';

const getDetail = vi.fn();
const recipientStatus = vi.fn();
const disposalDetail = vi.fn();
vi.mock('@/components/email-disposal/detail-modal', () => ({
  DetailModal: (props: unknown) => { disposalDetail(props); return <div data-testid="disposal-detail-stub" />; },
}));
const request = vi.fn().mockRejectedValue(new Error('mail log unavailable'));
vi.mock('@/lib/api/phishing-detection', () => ({ getDetectionLogDetail: (...args: unknown[]) => getDetail(...args) }));
vi.mock('@/lib/api/client', async (load) => ({ ...await load<typeof import('@/lib/api/client')>(), useApiRequest: () => ({ apiRequest: request, effectiveTenantId: 2 }) }));
vi.mock('./access', () => ({ usePhishingAccess: () => ({ canEdit: true, readOnly: false }) }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ isSystemAdmin: false }) }));
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
  beforeEach(() => { vi.clearAllMocks(); request.mockRejectedValue(new Error('mail log unavailable')); });

  it('GT-14345: shows actual audit separately from quarantine policy in the drawer', async () => {
    renderDetail({ ...detail, summary: { ...detail.summary, task_status: 'completed', policy_disposition: 'quarantine',
      recipient_dispositions: [{ recipient: 'outside@example.com', final_action: 'audit', status: 'delivered' }],
    } });
    expect(await screen.findByTestId('phishing-detail-actual-disposition')).toHaveTextContent('审核');
    expect(screen.getByTestId('phishing-detail-actual-disposition')).not.toHaveTextContent('隔离');
    expect(screen.getByTestId('phishing-detail-disposition')).toHaveTextContent('策略动作：隔离');
    expect(screen.queryByRole('button', { name: '查看处置过程' })).not.toBeInTheDocument();
  });

  it('GT-14345: opens the associated disposal history read-only', async () => {
    request.mockResolvedValue({ id: 17, message_uuid: 'message-17', sender: 'sender@example.com', recipients: ['a@example.com'], subject: 'audit mail', recipient_dispositions: [] });
    renderDetail({ ...detail, summary: { ...detail.summary, message_uuid: 'message-17' } });
    fireEvent.click(await screen.findByRole('button', { name: '查看处置过程' }));
    await screen.findByTestId('disposal-detail-stub');
    expect(disposalDetail.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ mailLogId: 17, open: true, readOnly: true, isTenantAdmin: true }));
  });

  it('GT-14345: does not expose history for a mismatched mail identity', async () => {
    request.mockResolvedValue({ id: 17, message_uuid: 'other-message' });
    renderDetail({ ...detail, summary: { ...detail.summary, message_uuid: 'message-17' } });
    await screen.findByTestId('phishing-recipient-actions');
    expect(screen.queryByRole('button', { name: '查看处置过程' })).not.toBeInTheDocument();
    expect(disposalDetail).not.toHaveBeenCalled();
  });

  it('keeps link detection, recipient disposal, config and run log in the CLI preview drawer', async () => {
    renderDetail(cliMockDetail);
    await screen.findByTestId('phishing-model-summary');
    expect(screen.getByTestId('phishing-url-findings')).toHaveTextContent('https://sakura-cat3.com/');
    expect(await screen.findByTestId('phishing-recipient-actions')).toBeInTheDocument();
    expect(recipientStatus.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      recipient_dispositions: cliMockDetail.summary.recipient_dispositions,
      mailLogId: cliMockDetail.summary.mail_log_id,
    }));
    fireEvent.click(screen.getByTestId('phishing-detail-config-snapshot'));
    expect(screen.getByTestId('phishing-detail-config-snapshot-body')).toHaveTextContent('risk_policy');
    fireEvent.click(screen.getByTestId('phishing-detail-run-log'));
    expect(screen.queryByTestId('phishing-detail-export')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^phishing-detail-step-/)).toHaveLength(9);
    expect(screen.getByTestId('phishing-detail-step-5')).toHaveTextContent('没有 Microsoft 品牌标识');
  });

  it.each([serviceMail7Zh, serviceMail8Zh])('preserves historical recipient facts and config while showing the new assessment', async (value) => {
    renderDetail(value);
    expect(await screen.findByTestId('phishing-policy-risk')).toHaveTextContent(zh.phishingDetection.riskLevel.medium);
    expect(screen.getByTestId('phishing-model-summary')).toHaveTextContent(value.investigation!.result!.summary!);
    expect(await screen.findByTestId('phishing-mail-context')).toHaveTextContent(value.summary.sender);
    expect(recipientStatus.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      mailLogId: value.summary.mail_log_id,
      recipient_dispositions: value.summary.recipient_dispositions,
    }));
    fireEvent.click(screen.getByTestId('phishing-detail-config-snapshot'));
    expect(screen.getByTestId('phishing-detail-config-snapshot-body')).toHaveTextContent('engine_config');
    expect(screen.queryByTestId('assessment-factor')).not.toBeInTheDocument();
  });

  it('passes mail_log_id and recipients to RecipientStatus but blocks actions while sideline is live', async () => {
    renderDetail(detail);
    expect(await screen.findByTestId('phishing-live-task-hint')).toHaveTextContent('请在旁路队列处置');
    await waitFor(() => expect(recipientStatus).toHaveBeenCalled());
    expect(recipientStatus.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ mailLogId: 17, readOnly: true, recipient_dispositions: detail.summary.recipient_dispositions }));
    expect(groupRecipientDispositions(detail.summary.recipient_dispositions)[0].actions).toEqual(['deliver', 'discard']);
  });

  it('GT-13173: renders the drawer when a legacy record carries recipients: null', async () => {
    // Recipients is typed string[], but the Go DTO has no omitempty and a nil slice
    // serializes to null; the drawer must keep rendering instead of throwing on join().
    renderDetail({ ...detail, summary: { ...detail.summary, recipients: null as unknown as string[] } });
    const context = await screen.findByTestId('phishing-mail-context');
    expect(context).toHaveTextContent(detail.summary.sender);
    expect(screen.getByTestId('phishing-mail-context-recipients')).toHaveTextContent('—');
    expect(screen.getByTestId('phishing-recipient-actions')).toBeInTheDocument();
  });

  it('GT-13173: lists every recipient in the mail context', async () => {
    renderDetail({ ...detail, summary: { ...detail.summary, recipients: ['a@example.com', 'b@example.com'] } });
    expect(await screen.findByTestId('phishing-mail-context-recipients')).toHaveTextContent('a@example.com, b@example.com');
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

  it.each([
    ['inbound', '入站', 'Inbound'],
    ['outbound', '外发', 'Outbound'],
    ['internal', '域内', 'Internal'],
    [null, '未知', 'Unknown'],
  ] as const)('renders public direction %s in both locales', async (direction, zhLabel, enLabel) => {
    const localized = structuredClone(detail);
    localized.summary.direction = direction;
    renderDetail(localized);
    expect(await screen.findByTestId('phishing-mail-context')).toHaveTextContent(zhLabel);
    const english = structuredClone(detail);
    english.summary.direction = direction;
    renderDetail(english, 'en', en);
    await waitFor(() => expect(screen.getAllByTestId('phishing-mail-context').at(-1)).toHaveTextContent(enLabel));
  });

  it('keeps historical evidence, URL findings and steps independent from report absence', async () => {
    renderDetail({ ...detail, investigation: {
      status: 'completed',
      steps: [{ name: 'legacy lookup', status: 'completed', message: 'Legacy step detail' }],
      result: {
        assessment_report_status: 'not_recorded', assessment_report_reason: 'legacy_result',
        evidence: [{ type: 'legacy', severity: 'high', title: 'Legacy factor title', detail: 'Legacy interpretation' }],
        details: { url_findings: [{ url: 'https://example.test/legacy', risk_level: 'low' }] },
      },
    } }, 'en', en);
    expect(await screen.findByText('Previous evidence representation')).toBeInTheDocument();
    expect(screen.getByText('Legacy factor title')).toBeInTheDocument();
    expect(screen.getByTestId('phishing-url-findings')).toHaveTextContent('https://example.test/legacy');
    fireEvent.click(screen.getByTestId('phishing-detail-run-log'));
    expect(screen.getByText('Legacy step detail')).toBeInTheDocument();
    expect(screen.getByText('Earlier result without a structured report.')).toBeInTheDocument();
    expect(screen.queryByTestId('assessment-factor')).not.toBeInTheDocument();
  });
  it('loads the associated original and lazy preview while respecting unavailable EML and redelivery', async () => {
    const value = structuredClone(detail);
    value.summary.task_status = 'completed';
    value.summary.message_uuid = 'same-message';
    const mail = { id: 17, message_uuid: 'same-message', sender: value.summary.sender, recipients: value.summary.recipients,
      subject: value.summary.subject, created_at: value.summary.sidelined_at, direction: null, action: 'accept', status: 'delivered',
      content: 'retained original body', eml_available: false, redeliver_available: false,
      redeliver_unavailable_reason: 'storage_unavailable', recipient_dispositions: [{ recipient: 'a@example.com', final_action: 'accept', status: 'delivered' }] };
    request.mockImplementation(async (path: string) => path.endsWith('/preview') ? { headers: { Subject: 'retained header' }, text_body: 'preview body' } : mail);
    renderDetail(value);
    expect(await screen.findByTestId('phishing-mail-original')).toHaveTextContent('retained original body');
    expect(screen.getByTestId('email-disposal-overview-recipient-action-redeliver')).toBeDisabled();
    expect(screen.getByTestId('email-disposal-workbench-download-eml')).toBeDisabled();
    expect(request).not.toHaveBeenCalledWith('/mail-logs/17/preview');
    fireEvent.click(screen.getByTestId('email-disposal-workbench-content-view-raw'));
    expect(await screen.findByText(/Subject: retained header/)).toBeInTheDocument();
  });

  it.each([{ id: 18, message_uuid: 'same-message' }, { id: 17, message_uuid: 'different-message' }])('falls back instead of showing an unrelated mail original: %j', async (identity) => {
    const value = structuredClone(detail);
    value.summary.message_uuid = 'same-message';
    request.mockResolvedValue({ ...identity, content: 'unrelated original body' });
    renderDetail(value);
    expect(await screen.findByTestId('phishing-recipient-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('phishing-mail-original')).not.toBeInTheDocument();
    expect(screen.queryByText('unrelated original body')).not.toBeInTheDocument();
  });

  it('GT-14290: shows readable failure text and keeps the raw codes only in the run log', async () => {
    const value: DetectionLogDetail = {
      ...detail,
      summary: { ...detail.summary, status: 'reinjected', task_status: 'failed', failure_reason: 'analysis_not_checked' },
      investigation: { status: 'failed', error_message: 'analysis runtime rejected the invocation', steps: [] },
    };
    renderDetail(value);
    const investigation = await screen.findByTestId('phishing-investigation');
    const context = await screen.findByTestId('phishing-mail-context');
    expect(context).toHaveTextContent(zh.phishingDetection.detail.failureReasonValue.analysis_not_checked);
    expect(investigation).toHaveTextContent(zh.phishingDetection.detail.analysisFailed);
    expect(investigation).toHaveTextContent('未判定');
    for (const raw of ['analysis_not_checked', 'analysis runtime rejected the invocation']) {
      expect(context).not.toHaveTextContent(raw);
      expect(investigation).not.toHaveTextContent(raw);
    }
    fireEvent.click(screen.getByTestId('phishing-detail-run-log'));
    const diagnostic = screen.getByTestId('phishing-detail-diagnostic');
    expect(diagnostic).toHaveTextContent('analysis runtime rejected the invocation');
    expect(diagnostic).toHaveTextContent('analysis_not_checked');
  });

  it('GT-14290: falls back to a generic sentence for an unknown failure code', async () => {
    renderDetail({ ...detail, summary: { ...detail.summary, failure_reason: 'brand_new_reason' } });
    const context = await screen.findByTestId('phishing-mail-context');
    expect(context).toHaveTextContent(zh.phishingDetection.detail.failureReasonValue.decision_undetermined);
    expect(context).not.toHaveTextContent('brand_new_reason');
  });

  it('keeps report failure reasons and business analysis visible after removing JSON export', async () => {
    const value: DetectionLogDetail = { ...detail, investigation: { status: 'completed', result: {
      verdict: 'phishing_suspected', summary: 'Independent business result',
      assessment_report_status: 'not_recorded', assessment_report_reason: 'report_reference_invalid',
      assessment_failure: { schema_version: 2, reason: 2 },
    } } };
    renderDetail(value, 'en', en);
    expect(await screen.findByText(en.assessment.reasons.report_reference_invalid)).toBeInTheDocument();
    expect(screen.getByText('Independent business result')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('phishing-detail-run-log'));
    expect(screen.queryByTestId('phishing-detail-export')).not.toBeInTheDocument();
  });
});
