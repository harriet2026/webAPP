import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import zh from '@/../messages/zh.json';
import type { DetectionLogItem } from '@/types/phishing-detection';
import { DetectionLogTable } from './detection-log-table';

const item: DetectionLogItem = {
  sideline_id: 'sideline-12743',
  message_id: 'message-12743',
  sender: 'sender@example.com',
  subject: 'GT-12743 regression',
  recipients: ['recipient@example.com'],
  direction: 'inbound',
  status: 'reinjected',
  sidelined_at: '2026-08-03T09:40:18+08:00',
  confidence: 0.55,
  recalls: [],
  disposition_actions: [],
  recipient_dispositions: [],
  disposition: 'pass',
  detection_mode: 'realtime',
  recall_status: 'none',
  agent_rounds: 5,
  url_summary: { total: 0, phishing: 0, suspicious: 0, normal: 0 },
  result_truncated: false,
};

function renderTable(onOpenDetail = vi.fn()) {
  render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <DetectionLogTable
        data={[item]}
        isAdmin
        isLiveState={() => false}
        onOpenDetail={onOpenDetail}
        onBlock={vi.fn()}
        onExempt={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return onOpenDetail;
}

describe('DetectionLogTable', () => {
  it('GT-12743 keeps one detail entry and removes the duplicate evidence column', () => {
    const onOpenDetail = renderTable();

    expect(screen.queryByRole('columnheader', { name: '判定依据' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看依据' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '详情' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '拦截' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '豁免' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(onOpenDetail).toHaveBeenCalledOnce();
    expect(onOpenDetail).toHaveBeenCalledWith('sideline-12743');
  });
});
