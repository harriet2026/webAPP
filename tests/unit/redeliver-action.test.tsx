// GT-12880 B：重新投递入口与确认弹窗（前端）。
// - recipientActionsForStatus：delivery_failed → ['redeliver']；delivered 追加 redeliver。
// - 单收件人动作条（SingleRecipientActions）点"重新投递"→ 弹窗默认勾选失败收件人，
//   确认后 POST /mail-logs/:id/redeliver；对已投递成功收件人的勾选显示重复警示。
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import zh from '../../messages/zh.json';
import { recipientActionsForStatus } from '@/components/email-disposal/lib/detail-helpers';
import { SingleRecipientActions } from '@/components/email-disposal/sections/overview/single-recipient-actions';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));

describe('recipientActionsForStatus (GT-12880 B)', () => {
  it('delivery_failed 提供 redeliver；delivered 追加 redeliver', () => {
    expect(recipientActionsForStatus('delivery_failed', false)).toEqual(['redeliver']);
    expect(recipientActionsForStatus('delivered', false)).toContain('redeliver');
    expect(recipientActionsForStatus('marked_delivered', false)).toContain('redeliver');
    // 拦截族仍无动作
    expect(recipientActionsForStatus('rejected', false)).toEqual([]);
  });
});

function renderStrip(status: string, apiRequest = vi.fn().mockResolvedValue({ queue_id: 'Q1' })) {
  const utils = render(
    <NextIntlClientProvider locale="zh" messages={zh as unknown as Record<string, unknown>}>
      <SingleRecipientActions
        recipient_dispositions={[{ recipient: 'ext@partner.com', final_action: 'accept', status }]}
        mailLogId={99}
        sender="user@tenant.example"
        apiRequest={apiRequest}
        onDisposed={vi.fn()}
        readOnly={false}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, apiRequest };
}

describe('SingleRecipientActions redeliver dialog (GT-12880 B)', () => {
  it('delivery_failed：点重新投递 → 弹窗默认勾选该收件人 → 确认 POST 正确端点', async () => {
    const { apiRequest } = renderStrip('delivery_failed');
    fireEvent.click(screen.getByRole('button', { name: /重新投递/ }));
    const dialog = await screen.findByTestId('email-disposal-redeliver-dialog');
    expect(dialog).toBeTruthy();
    // 默认勾选失败收件人 → 确认可点
    const confirm = screen.getByTestId('email-disposal-redeliver-confirm');
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('/mail-logs/99/redeliver', {
        method: 'POST',
        body: { recipients: ['ext@partner.com'] },
      });
    });
  });

  it('delivered：勾选已成功收件人显示重复邮件警示', async () => {
    renderStrip('delivered');
    fireEvent.click(screen.getByRole('button', { name: /重新投递/ }));
    await screen.findByTestId('email-disposal-redeliver-dialog');
    // delivered 无失败者 → 默认全选（即该收件人已勾选）→ 警示可见
    expect(await screen.findByTestId('email-disposal-redeliver-duplicate-warning')).toBeTruthy();
  });
});
