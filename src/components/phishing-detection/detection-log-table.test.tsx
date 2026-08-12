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
  disposition: 'deliver',
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
    // disposition: 'deliver' 表示邮件已投递、未被隔离，操作栏应给出与之互补的
    // 「隔离」动作（对应邮件处置中心的执行动作语义），而不再是固定的
    // 「拦截」/「豁免」两个按钮。
    expect(screen.queryByRole('button', { name: '拦截' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '豁免' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '隔离' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(onOpenDetail).toHaveBeenCalledOnce();
    expect(onOpenDetail).toHaveBeenCalledWith('sideline-12743');
  });

  it('shows 投递 for quarantined/audit-held mail and calls onExempt (release)', () => {
    const onExempt = vi.fn();
    render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <DetectionLogTable
          data={[{ ...item, disposition: 'quarantine' }]}
          isAdmin
          isLiveState={() => false}
          onOpenDetail={vi.fn()}
          onBlock={vi.fn()}
          onExempt={onExempt}
        />
      </NextIntlClientProvider>,
    );

    const deliverButton = screen.getByRole('button', { name: '投递' });
    expect(deliverButton).toBeInTheDocument();
    fireEvent.click(deliverButton);
    expect(onExempt).toHaveBeenCalledOnce();
  });

  it('hides the action button for still-processing (live) mail, keeping only 详情', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <DetectionLogTable
          data={[{ ...item, disposition: 'audit' }]}
          isAdmin
          isLiveState={() => true}
          onOpenDetail={vi.fn()}
          onBlock={vi.fn()}
          onExempt={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByRole('button', { name: '投递' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '隔离' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '详情' })).toBeInTheDocument();
  });
});
