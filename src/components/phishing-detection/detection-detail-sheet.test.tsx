import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { DetectionLogDetail, DetectionLogItem, Disposition, RecallStatus } from '@/types/phishing-detection';
import { DetectionDetailSheet } from './detection-detail-sheet';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  API_BASE: '/api/v1',
  useApiRequest: () => ({ apiRequest: apiRequestMock }),
}));

function summaryFor(disposition: Disposition, recallStatus: RecallStatus = 'none'): DetectionLogItem {
  return {
    sideline_id: 'sideline-detail-1',
    message_id: 'message-detail-1',
    sender: 'sender@example.com',
    subject: 'Detail sheet action test',
    recipients: ['recipient@example.com'],
    direction: 'inbound',
    status: 'sidelined',
    sidelined_at: '2026-08-03T09:40:18+08:00',
    confidence: 0.7,
    recalls: [],
    disposition_actions: [],
    recipient_dispositions: [],
    disposition,
    detection_mode: 'realtime',
    recall_status: recallStatus,
    agent_rounds: 3,
    url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 },
    result_truncated: false,
  };
}

function detailFor(disposition: Disposition, recallStatus: RecallStatus = 'none'): DetectionLogDetail {
  return {
    summary: summaryFor(disposition, recallStatus),
    investigation: { steps: [], result: { evidence: [] } },
  };
}

function renderSheet(disposition: Disposition, recallStatus: RecallStatus = 'none', overrides: {
  isAdmin?: boolean;
  isLiveState?: (disposition: string) => boolean;
  onDeliver?: (id: string) => void;
  onDrop?: (id: string) => void;
  onRecall?: (id: string) => void;
} = {}) {
  apiRequestMock.mockReset();
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path === '/phishing-agent/detection-logs/sideline-detail-1') return detailFor(disposition, recallStatus);
    throw new Error(`unexpected request: ${path}`);
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onDeliver = overrides.onDeliver ?? vi.fn();
  const onDrop = overrides.onDrop ?? vi.fn();
  const onRecall = overrides.onRecall ?? vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <DetectionDetailSheet
          open
          onOpenChange={vi.fn()}
          detailId="sideline-detail-1"
          isAdmin={overrides.isAdmin ?? true}
          isLiveState={overrides.isLiveState ?? (() => false)}
          onDeliver={onDeliver}
          onDrop={onDrop}
          onRecall={onRecall}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

  return { onDeliver, onDrop, onRecall };
}

describe('DetectionDetailSheet action buttons', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('shows 投递/丢弃 (not 拦截/误报豁免) for an unread quarantine (quarantine_pending) mail and wires them to onDeliver/onDrop', async () => {
    const { onDeliver, onDrop } = renderSheet('quarantine');

    const deliverBtn = await screen.findByRole('button', { name: '投递' });
    const dropBtn = screen.getByRole('button', { name: '丢弃' });
    expect(screen.queryByRole('button', { name: '拦截' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '误报豁免' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '召回' })).not.toBeInTheDocument();

    fireEvent.click(deliverBtn);
    expect(onDeliver).toHaveBeenCalledWith('sideline-detail-1');

    fireEvent.click(dropBtn);
    expect(onDrop).toHaveBeenCalledWith('sideline-detail-1');
  });

  it('shows only 召回 for a delivered mail and wires it to onRecall', async () => {
    const { onRecall } = renderSheet('deliver');

    const recallBtn = await screen.findByRole('button', { name: '召回' });
    expect(screen.queryByRole('button', { name: '投递' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '丢弃' })).not.toBeInTheDocument();

    fireEvent.click(recallBtn);
    expect(onRecall).toHaveBeenCalledWith('sideline-detail-1');
  });

  it('shows 投递/丢弃 for an audit_pending (review) mail', async () => {
    renderSheet('review');
    await screen.findByRole('button', { name: '投递' });
    expect(screen.getByRole('button', { name: '丢弃' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '召回' })).not.toBeInTheDocument();
  });

  it('hides the whole action area for a terminal, non-recoverable state (block/rejected)', async () => {
    renderSheet('block');

    // 等待详情数据加载完成（主题字段会渲染两处：标题描述与正文，用
    // findAllByText 等待其出现），再断言操作按钮不存在。
    await screen.findAllByText('Detail sheet action test');
    expect(screen.queryByRole('button', { name: '投递' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '丢弃' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '召回' })).not.toBeInTheDocument();
  });

  it('disables (but still shows) the action buttons while the record is a live/in-flight state', async () => {
    renderSheet('quarantine', 'none', { isLiveState: () => true });

    const deliverBtn = await screen.findByRole('button', { name: '投递' });
    const dropBtn = screen.getByRole('button', { name: '丢弃' });
    expect(deliverBtn).toBeDisabled();
    expect(dropBtn).toBeDisabled();
    expect(screen.getByText('邮件仍在旁路处理中，请在旁路队列处置')).toBeInTheDocument();
  });

  it('hides the action area entirely for non-admin users', async () => {
    renderSheet('quarantine', 'none', { isAdmin: false });

    await screen.findAllByText('Detail sheet action test');
    expect(screen.queryByRole('button', { name: '投递' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '丢弃' })).not.toBeInTheDocument();
  });
});
