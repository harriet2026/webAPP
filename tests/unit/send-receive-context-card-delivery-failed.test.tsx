// GT-12880 A 部分：投递失败（delivery_failed）单投邮件的收发信上下文卡不得
// 显示"该邮件已被阻断/丢弃，系统未保留原文"——那是网关拦截族（rejected/
// discarded 等）的文案；投递失败是"网关已放行投递、下游接收失败"，误用会让
// 管理员以为网关删了邮件。
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../messages/zh.json';
import { SendReceiveContextCard } from '@/components/email-disposal/sections/overview/send-receive-context-card';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

function renderCard(status: string) {
  const detail = {
    id: 1,
    sender: 'user@tenant.example',
    recipients: ['ext@partner.com'],
    subject: 'gt12880',
    action: 'accept',
    recipient_dispositions: [
      { recipient: 'ext@partner.com', final_action: 'accept', status },
    ],
  } as never;
  return render(
    <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
      <SendReceiveContextCard detail={detail} apiRequest={vi.fn()} onDisposed={vi.fn()} events={[]} readOnly={false} />
    </NextIntlClientProvider>,
  );
}

describe('SendReceiveContextCard delivery_failed (GT-12880)', () => {
  it('delivery_failed 显示"投递失败"真实提示，不显示阻断/丢弃文案', () => {
    renderCard('delivery_failed');
    expect(screen.getByTestId('email-disposal-overview-context-delivery-failed')).toBeTruthy();
    expect(screen.queryByText(/该邮件已被阻断\/丢弃/)).toBeNull();
    // 文案必须表达"已投递、下游接收失败"，绝不能说"未保留原文/已被阻断"。
    const tip = screen.getByTestId('email-disposal-overview-context-delivery-failed').textContent ?? '';
    expect(tip).toContain('投递');
    expect(tip).not.toContain('阻断');
    expect(tip).not.toContain('丢弃');
  });

  it('拦截族（rejected）保持原有阻断/丢弃提示不变', () => {
    renderCard('rejected');
    expect(screen.getByText(/该邮件已被阻断\/丢弃/)).toBeTruthy();
    expect(screen.queryByTestId('email-disposal-overview-context-delivery-failed')).toBeNull();
  });
});
