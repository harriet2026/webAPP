import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import { SendReceiveContextCard } from './send-receive-context-card';

// Real zh messages (not an identity mock) -- assertions read actual rendered
// copy (展开完整信息/etc), which is the point of this suite.
const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as never}>
    {ui}
  </NextIntlClientProvider>
);

// GT-12628: SenderActions/useRecipientDisposition 现从 useAuth 取角色决定
// 规则 priority（tenant_admin 上限 1000），测试按平台管理员形态 mock。
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSystemAdmin: true }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../lib/disposal-detail-api', async () => {
  const actual = await vi.importActual('../../lib/disposal-detail-api');
  return {
    ...actual,
    addSenderFilterRule: vi.fn(),
    notifyRecipient: vi.fn(),
    disposeByObject: vi.fn(),
  };
});

vi.mock('../../lib/disposal-api', async () => {
  const actual = await vi.importActual('../../lib/disposal-api');
  return {
    ...actual,
    recallMails: vi.fn(),
  };
});

function baseDetail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: '<abc123@mail.company-security.com>',
    message_uuid: 'uuid-1',
    client_ip: '203.0.113.5',
    sender: 'attacker@evil.com',
    sender_name: 'CEO',
    recipients: ['victim@company.com'],
    authenticated: false,
    subject: 'Q2财务报表 - 紧急审批',
    action: 'quarantine',
    status: 'quarantined',
    email_type: 'phishing',
    received_at: '2026-07-20T10:00:00Z',
    delivered_at: '2026-07-20T10:00:05Z',
    geo_city: '上海',
    storage_size: 20480,
    return_path: 'bounce@company-security.com',
    reply_to: 'ceo@company-security.com',
    x_mailer: 'Microsoft Outlook 16.0',
    ptr_domain: 'mail.company-security.com',
    geo_asn: 12345,
    recipient_dispositions: [
      { recipient: 'victim@company.com', final_action: 'quarantine', status: 'quarantined', object_id: 'obj-1' },
    ],
    ...overrides,
  };
}

function renderCard(detail: MailLogDetail, overrides: Partial<React.ComponentProps<typeof SendReceiveContextCard>> = {}) {
  return render(wrap(
    <SendReceiveContextCard
      detail={detail}
      apiRequest={vi.fn() as never}
      onDisposed={vi.fn()}
      readOnly={false}
      {...overrides}
    />,
  ));
}

describe('SendReceiveContextCard', () => {
  it('renders 发件人 row with domain name, IP, and geo (B1)', () => {
    renderCard(baseDetail());
    const senderRow = screen.getByTestId('email-disposal-overview-context-sender');
    expect(senderRow.textContent).toContain('CEO');
    expect(senderRow.textContent).toContain('attacker@evil.com');
    expect(senderRow.textContent).toContain('203.0.113.5');
    expect(senderRow.textContent).toContain('上海');
  });

  // 状态文案取自组件实际使用的那棵 i18n 子树（emailDisposal.detail.overview.
  // recipientStatus.status.*，与 RecipientStatus 表格共用同一套 key）。早先这里
  // 硬编码了 '已投递'/'已隔离'——那是 investigations.*/logs.* 命名空间的措辞，
  // emailDisposal 下从来是 '投递成功'/'隔离中'，于是断言恒红。改成引用 key 本身：
  // 组件换错 key 或不渲染状态依旧会红，纯文案微调则不再误报。
  const STATUS = zh.emailDisposal.detail.overview.recipientStatus.status;

  it('renders single-recipient pill with status (B2)', () => {
    renderCard(baseDetail());
    const row = screen.getByTestId('email-disposal-overview-context-recipient');
    expect(row.textContent).toContain('victim@company.com');
    expect(row.textContent).toContain(STATUS.quarantined);
  });

  it('renders multi-recipient status distribution and RecipientStatus table (B2/B3)', () => {
    renderCard(baseDetail({
      recipient_dispositions: [
        { recipient: 'a@company.com', final_action: 'deliver', status: 'delivered', object_id: '' },
        { recipient: 'b@company.com', final_action: 'quarantine', status: 'quarantined', object_id: 'obj-2' },
      ],
    }));
    const row = screen.getByTestId('email-disposal-overview-context-recipient');
    expect(row.textContent).toContain('2 个收件人');
    expect(row.textContent).toContain(`${STATUS.delivered}: 1`);
    expect(row.textContent).toContain(`${STATUS.quarantined}: 1`);
    // B3: RecipientStatus's own table renders both recipients as rows.
    expect(screen.getByText('a@company.com')).toBeInTheDocument();
    expect(screen.getByText('b@company.com')).toBeInTheDocument();
  });

  it('shows the 单投不可操作 warning for a blocked single recipient (B4)', () => {
    renderCard(baseDetail({
      recipient_dispositions: [
        { recipient: 'victim@company.com', final_action: 'reject', status: 'blocked', object_id: '' },
      ],
    }));
    expect(screen.getByTestId('email-disposal-overview-context-not-operable')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-overview-context-view-policy')).toHaveTextContent('查看策略命中详情');
  });

  // GT-12596 防回归：B4「查看策略命中详情」注入 onViewPolicyDetail 后必须走
  // 跳转回调（滚到安全分析处置依据卡），不能再落「暂未实现」toast。
  it('GT-12596: B4 查看策略命中详情 invokes onViewPolicyDetail when provided', () => {
    const onViewPolicyDetail = vi.fn();
    renderCard(baseDetail({
      recipient_dispositions: [
        { recipient: 'victim@company.com', final_action: 'reject', status: 'blocked', object_id: '' },
      ],
    }), { onViewPolicyDetail });
    fireEvent.click(screen.getByTestId('email-disposal-overview-context-view-policy'));
    expect(onViewPolicyDetail).toHaveBeenCalledTimes(1);
  });

  it('does NOT show the 单投不可操作 warning for an operable single recipient', () => {
    renderCard(baseDetail());
    expect(screen.queryByTestId('email-disposal-overview-context-not-operable')).not.toBeInTheDocument();
  });

  it('renders 时间/大小 row (B5) with timestamps formatted via formatTimestamp (POLISH-A), not raw ISO', () => {
    const row = renderCard(baseDetail()).getByTestId('email-disposal-overview-context-time-size');
    // 2026-07-20T10:00:00Z / T10:00:05Z -> local (UTC+8, this repo's test TZ)
    // "2026-07-20 18:00:00" / "18:00:05", matching the demo's "YYYY-MM-DD HH:mm:ss" look.
    expect(row.textContent).toContain('2026-07-20 18:00:00');
    expect(row.textContent).toContain('2026-07-20 18:00:05');
    expect(row.textContent).not.toContain('2026-07-20T10:00:00Z');
    expect(row.textContent).not.toContain('2026-07-20T10:00:05Z');
    expect(row.textContent).toContain('20.0 KB');
  });

  it('expands to show full info (Message-ID/Return-Path/PTR/ASN) and NOT TLS (B6/B7, §9-A)', () => {
    renderCard(baseDetail());
    expect(screen.queryByTestId('email-disposal-overview-context-fullinfo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('email-disposal-overview-context-expand-fullinfo'));

    const full = screen.getByTestId('email-disposal-overview-context-fullinfo');
    expect(full.textContent).toContain('Message-ID: <abc123@mail.company-security.com>');
    expect(full.textContent).toContain('Return-Path: bounce@company-security.com');
    expect(full.textContent).toContain('Reply-To: ceo@company-security.com');
    expect(full.textContent).toContain('X-Mailer: Microsoft Outlook 16.0');
    expect(full.textContent).toContain('PTR: mail.company-security.com');
    expect(full.textContent).toContain('ASN: AS12345');
    expect(full.textContent).not.toContain('TLS');

    fireEvent.click(screen.getByTestId('email-disposal-overview-context-expand-fullinfo'));
    expect(screen.queryByTestId('email-disposal-overview-context-fullinfo')).not.toBeInTheDocument();
  });
});
