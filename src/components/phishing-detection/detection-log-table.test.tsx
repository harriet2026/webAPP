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

function renderTable(onOpenDetail = vi.fn(), data: DetectionLogItem[] = [item]) {
  render(
    <NextIntlClientProvider locale="zh" messages={zh as never}>
      <DetectionLogTable data={data} onOpenDetail={onOpenDetail} />
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

    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(onOpenDetail).toHaveBeenCalledOnce();
    expect(onOpenDetail).toHaveBeenCalledWith('sideline-12743');
  });

  // 操作栏仅保留「详情」这一查看入口——豁免/拦截/放行等执行动作统一在「邮件
  // 处置中心」完成，检测日志列表不再重复暴露这些按钮，因此无论执行动作/邮件
  // 状态取何值，操作栏都只应渲染「详情」按钮。
  it.each<[string, Partial<DetectionLogItem>]>([
    ['deliver (delivered)', { disposition: 'deliver' }],
    ['quarantine (quarantine_pending)', { disposition: 'quarantine' }],
    ['review (audit_pending)', { disposition: 'review' }],
    ['block (rejected)', { disposition: 'block' }],
  ])('shows only 详情 for disposition=%s with no other action button', (_label, overrides) => {
    renderTable(vi.fn(), [{ ...item, ...overrides }]);

    expect(screen.getByRole('button', { name: '详情' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '投递' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '豁免' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '拦截' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '隔离' })).not.toBeInTheDocument();
  });
});
