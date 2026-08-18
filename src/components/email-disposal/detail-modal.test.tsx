import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { MailLogAnalysis, MailLogDetail } from '@/types/email-disposal-detail';
import { DetailModal } from './detail-modal';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  API_BASE: '/api/v1',
  useApiRequest: () => ({ apiRequest: apiRequestMock }),
}));

vi.mock('./sections/overview-section', () => ({
  OverviewSection: ({ onViewBasis }: { onViewBasis?: () => void }) => <div data-testid="overview-section-stub" data-has-view-basis={onViewBasis ? 'true' : 'false'} />,
}));

vi.mock('./sections/analysis-section', () => ({
  AnalysisSection: ({ analysis, analysisLoading }: { analysis?: MailLogAnalysis; analysisLoading?: boolean }) => (
    <div data-testid="analysis-section-stub" data-analysis-scope={analysis?.scope ?? ''} data-analysis-loading={analysisLoading ? 'true' : 'false'} />
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function detail(): MailLogDetail {
  return {
    id: 1,
    message_id: '<lazy-raw-log@example.test>',
    message_uuid: 'uuid-lazy-raw-log',
    client_ip: '203.0.113.10',
    sender: 'sender@example.test',
    recipients: ['recipient@example.test'],
    authenticated: false,
    subject: 'Lazy raw lifecycle log',
    action: 'accept',
    status: 'delivered',
    received_at: '2026-07-31T07:00:00.000Z',
    processed_at: '2026-07-31T07:00:01.000Z',
    delivered_at: '2026-07-31T07:00:02.000Z',
    processing_time_ms: 1000,
  };
}

function rawLogRequestCount(): number {
  return apiRequestMock.mock.calls.filter(([path]) => path === '/mail-logs/1/lifecycle-logs').length;
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
    apiRequestMock.mockReset();
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === '/mail-logs/1') return detail();
      if (path === '/mail-logs/1/analysis') return analysisResponse();
      if (path === '/mail-logs/1/events?page=1&page_size=100') return { items: [] };
      if (path === '/mail-logs/1/lifecycle-logs') {
        return {
          items: [],
          total: 0,
          truncated: false,
          partial: false,
          searched_nodes: ['node-a'],
          failed_nodes: [],
        };
      }
      throw new Error(`unexpected request: ${path}`);
    });
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
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('raw-logs-count-badge')).toHaveTextContent('未加载');
    expect(rawLogRequestCount()).toBe(0);

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(rawLogRequestCount()).toBe(1);
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
    expect(screen.getByTestId('disposal-detail-analysis')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-section-stub')).toBeInTheDocument();
    expect(screen.getByTestId('overview-section-stub')).toHaveAttribute('data-has-view-basis', 'true');
    await waitFor(() => {
      expect(screen.getByTestId('analysis-section-stub')).toHaveAttribute('data-analysis-scope', 'all');
    });

    expect(apiRequestMock.mock.calls.filter(([path]) => path === '/mail-logs/1/analysis')).toHaveLength(1);
  });
});
