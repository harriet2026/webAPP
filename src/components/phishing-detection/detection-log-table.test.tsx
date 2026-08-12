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
    // disposition: 'deliver' 派生的邮件状态为 delivered（已投递），按「邮件
    // 处置中心」canRecall 规则，已投递邮件只能召回——检测日志尚无独立召回
    // 接口，此处复用 onBlock（拦截，将邮件重新置为隔离态）承接同一条
    // 「状态决定操作」的规则，因此按钮文案是「拦截」而不是「隔离」。
    expect(screen.queryByRole('button', { name: '投递' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '豁免' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拦截' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(onOpenDetail).toHaveBeenCalledOnce();
    expect(onOpenDetail).toHaveBeenCalledWith('sideline-12743');
  });

  it('shows 豁免 for quarantined mail (quarantine_pending) and calls onExempt (release)', () => {
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

    // disposition: 'quarantine' → display_status: quarantine_pending，按
    // 「邮件处置中心」canRelease 规则可放行，检测日志用 onExempt（豁免）承接
    // 这一放行操作，按钮文案为「豁免」。
    const exemptButton = screen.getByRole('button', { name: '豁免' });
    expect(exemptButton).toBeInTheDocument();
    fireEvent.click(exemptButton);
    expect(onExempt).toHaveBeenCalledOnce();
  });

  it('disables (but still shows) the action button while the record is a live/in-flight state', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <DetectionLogTable
          data={[{ ...item, disposition: 'review' }]}
          isAdmin
          isLiveState={() => true}
          onOpenDetail={vi.fn()}
          onBlock={vi.fn()}
          onExempt={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    // 审核（review）派生的邮件状态为 audit_pending，可执行动作是「豁免」，但
    // 当记录处于 isLiveState（例如后端正在异步处理该邮件）时，按钮仍应渲染
    // 以保持列宽/布局稳定，只是禁止点击，避免与正在进行中的操作冲突。
    expect(screen.getByRole('button', { name: '豁免' })).toBeDisabled();
  });

  it('offers only 详情 for a terminal, non-recoverable state (block/rejected) with no further action available', () => {
    render(
      <NextIntlClientProvider locale="zh" messages={zh as never}>
        <DetectionLogTable
          data={[{ ...item, disposition: 'block' }]}
          isAdmin
          isLiveState={() => false}
          onOpenDetail={vi.fn()}
          onBlock={vi.fn()}
          onExempt={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    // disposition: 'block' → display_status: rejected（网关直接拒收，从未
    // 送达），既不在 canRelease 也不在 canRecall 覆盖的状态集合内，因此只能
    // 查看详情，与「邮件处置中心」批量工具栏对已拒收邮件的处理保持一致。
    expect(screen.queryByRole('button', { name: '豁免' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '拦截' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '详情' })).toBeInTheDocument();
  });
});
