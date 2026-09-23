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

  it('keeps link detection, recipient disposal, config and run log in the CLI preview drawer', async () => {
    renderDetail(cliMockDetail);
    await screen.findByTestId('phishing-model-summary');
    expect(screen.getByTestId('phishing-url-findings')).toHaveTextContent('https://sakura-cat3.com/');
    expect(screen.getByTestId('phishing-recipient-actions')).toBeInTheDocument();
    expect(recipientStatus.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      recipient_dispositions: cliMockDetail.summary.recipient_dispositions,
      mailLogId: cliMockDetail.summary.mail_log_id,
    }));
    fireEvent.click(screen.getByTestId('phishing-detail-config-snapshot'));
    expect(screen.getByTestId('phishing-detail-config-snapshot-body')).toHaveTextContent('risk_policy');
    fireEvent.click(screen.getByTestId('phishing-detail-run-log'));
    expect(screen.getByTestId('phishing-detail-export')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^phishing-detail-step-/)).toHaveLength(9);
    expect(screen.getByTestId('phishing-detail-step-5')).toHaveTextContent('没有 Microsoft 品牌标识');
  });

  it.each([serviceMail7Zh, serviceMail8Zh])('preserves historical recipient facts and config while showing the new assessment', async (value) => {
    renderDetail(value);
    expect(await screen.findByTestId('phishing-policy-risk')).toHaveTextContent(zh.phishingDetection.riskLevel.medium);
    expect(screen.getByTestId('phishing-model-summary')).toHaveTextContent(value.investigation!.result!.summary!);
    expect(screen.getByTestId('phishing-mail-context')).toHaveTextContent(value.summary.sender);
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
  it('exports report failure reasons alongside the retained business analysis', async () => {
    const value: DetectionLogDetail = { ...detail, investigation: { status: 'completed', result: {
      verdict: 'phishing_suspected', summary: 'Independent business result',
      assessment_report_status: 'not_recorded', assessment_report_reason: 'report_reference_invalid',
      assessment_failure: { schema_version: 2, reason: 2 },
    } } };
    const create = vi.fn((_blob: Blob) => 'blob:assessment-export');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderDetail(value, 'en', en);
      expect(await screen.findByText(en.assessment.reasons.report_reference_invalid)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('phishing-detail-run-log'));
      fireEvent.click(screen.getByTestId('phishing-detail-export'));
      const blob = create.mock.calls[0]?.[0] as unknown as Blob;
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob);
      });
      expect(JSON.parse(text).investigation.result).toEqual(value.investigation!.result);
      expect(click).toHaveBeenCalledOnce();
    } finally { click.mockRestore(); vi.unstubAllGlobals(); }
  });

});
