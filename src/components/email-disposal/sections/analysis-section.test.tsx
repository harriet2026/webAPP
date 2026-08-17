 import { render, screen, fireEvent } from '@testing-library/react';
 import userEvent from '@testing-library/user-event';
 import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import type { MailLogDetail } from '@/types/email-disposal-detail';
import type { MailChildEvent } from '@/types/log';
import { AnalysisSection } from './analysis-section';

// Real zh messages (not an identity mock) -- assertions read actual rendered
// copy (检测流程/总耗时/事后处置时间线/etc), matching the pattern established
// by send-receive-context-card.test.tsx.
const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as never}>
    {ui}
  </NextIntlClientProvider>
);

const routerPush = vi.fn();
// GT-12583：组件改用 next-intl 的 locale-aware router（@/i18n/navigation），
// mock 对应模块（真实实现会向 push 的路径自动补 /zh 前缀，这里按透传断言）。
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

function baseDetail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: '<abc123@mail.company-security.com>',
    message_uuid: 'uuid-1',
    client_ip: '203.0.113.45',
    sender: 'ceo@company-secure.com',
    recipients: ['victim@company.com'],
    authenticated: false,
    subject: 'Q2财务报表 - 紧急审批（多投信）',
    action: 'quarantine',
    status: 'quarantined',
    received_at: '2026-07-20T09:15:00.000Z',
    processed_at: '2026-07-20T09:15:34.500Z',
    // Matches the v2 html_spec sample exactly: 12+45+156+89+234 = 536ms.
    stage_timings: {
      connection: 12, identity: 45, content: 156, comprehensive: 89, ai: 234,
    },
    cac_result: { tag: 'phishing', int_tag: 6 },
    disposal_basis: {
      policy_key: 'AI-SPOOF',
      rule_name: '高管仿冒识别',
      rule_id: 'AI-SPOOF-012',
      action: 'quarantine',
      hit_values: { spoof_type: '高管', confidence: '94' },
    },
    ...overrides,
  };
}

function sampleEvents(): MailChildEvent[] {
  return [
    {
      id: 501,
      event_source: 'admin_api',
      event_type: 'recall',
      event_result: 'completed',
      queue_id: 'q1',
      event_time: '2026-07-20T09:20:00.000Z',
      recipient: 'victim@company.com',
      dsn: '2.0.0',
      correlation_status: 'matched',
    },
  ];
}

describe('AnalysisSection (v2 spec alignment)', () => {
  it('renders all 5 stage cards default-expanded (gap 2.1/2.2)', () => {
    render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`analysis-stage-${n}`)).toBeInTheDocument();
      // Inline hit-strategy detail is present without any click (default expanded).
      expect(screen.getByTestId(`analysis-stage-${n}-detail`)).toBeInTheDocument();
    }
    // 阶段 4/5 已交换（GT-12575 与策略流水线对齐）：智能体研判(ai)为阶段 4，
    // 是命中阶段 -- 威胁 badge; others 通过.
    expect(screen.getByTestId('analysis-stage-4').textContent).toContain('威胁');
    expect(screen.getByTestId('analysis-stage-1').textContent).toContain('通过');

    // Clicking a card collapses only that card's own detail.
    fireEvent.click(screen.getByTestId('analysis-stage-1'));
    expect(screen.queryByTestId('analysis-stage-1-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-stage-2-detail')).toBeInTheDocument();
  });

  it('uses pointer-compatible card feedback without relying on CSS hover', () => {
    render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    const stage = screen.getByTestId('analysis-stage-1');

    expect(stage).toHaveClass(
      'duration-[240ms]',
      'motion-reduce:transition-none',
      'data-[hovered=true]:shadow-md',
    );
    fireEvent.pointerEnter(stage, { pointerType: 'mouse' });
    expect(stage).toHaveAttribute('data-hovered', 'true');
    fireEvent.pointerLeave(stage, { pointerType: 'mouse' });
    expect(stage).not.toHaveAttribute('data-hovered');
    fireEvent.pointerEnter(stage, { pointerType: 'touch' });
    expect(stage).not.toHaveAttribute('data-hovered');
  });

  it('shows 总耗时 as the sum of stage_timings (gap 2.3)', () => {
    render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-total-elapsed').textContent).toContain('总耗时: 536ms');
    expect(screen.getByTestId('analysis-verdict-card').textContent).toContain('耗时: 536ms');
  });

  it('verdict card 时间线 button toggles the post-detection timeline (gap 2.4/2.5)', () => {
    render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={sampleEvents()} />));
    expect(screen.queryByTestId('analysis-timeline-body')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('analysis-verdict-timeline-btn'));
    expect(screen.getByTestId('analysis-timeline-body')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('analysis-verdict-timeline-btn'));
    expect(screen.queryByTestId('analysis-timeline-body')).not.toBeInTheDocument();
  });

  it('timeline renders events at L1 (summary only) and event detail at L2 on click', () => {
    render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={sampleEvents()} />));
    fireEvent.click(screen.getByTestId('analysis-timeline-toggle'));

    const eventRow = screen.getByTestId('analysis-timeline-event-501');
    expect(eventRow).toBeInTheDocument();
    expect(eventRow.textContent).toContain('victim@company.com');
    // L1: no detail (召回范围/召回动作/执行结果) until the card itself is clicked.
    expect(screen.queryByTestId('analysis-timeline-event-501-detail')).not.toBeInTheDocument();

    fireEvent.click(eventRow);
    const detail = screen.getByTestId('analysis-timeline-event-501-detail');
    expect(detail.textContent).toContain('召回范围');
    expect(detail.textContent).toContain('召回动作');
    expect(detail.textContent).toContain('执行结果');
    expect(screen.getByTestId('analysis-timeline-event-501-view-log')).toHaveTextContent('查看召回日志');
  });

  // GT-12977：原「内容详情」折叠区块（含此处曾验证的 message_uuid/session_id/
  // queue_id 完整关联ID展示）已删除，相关用例随之移除；「邮件ID」的常驻展示
  // 位置改为 detail-modal.tsx 页头，已在该文件对应测试中覆盖。

  it('shows 暂无事件 when there are no events', () => {
    render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    fireEvent.click(screen.getByTestId('analysis-timeline-toggle'));
    expect(screen.getByTestId('analysis-timeline-empty')).toHaveTextContent('暂无事件');
  });

  it('处置依据 header has the action badge top-right and a combined rule link (gap 2.7)', () => {
    render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-disposal-basis-action')).toHaveTextContent('隔离');

    const ruleLink = screen.getByTestId('analysis-disposal-basis-rule-link');
    expect(ruleLink.textContent).toContain('高管仿冒识别');
    expect(ruleLink.textContent).toContain('AI-SPOOF-012');
    expect(ruleLink).toHaveAttribute('title', '前往策略配置页');

    fireEvent.click(ruleLink);
    expect(routerPush).toHaveBeenCalledWith('/agent-center/overview');
  });

  it('群发多处置依据默认渲染为折叠行，点击后才展开完整详情', () => {
    render(wrap(<AnalysisSection
      detail={baseDetail({
        disposal_basis: {
          policy_key: 'ATT-AV',
          rule_name: '恶意附件哈希黑名单',
          rule_id: 'ATT-AV-001',
          action: 'discard',
          per_recipient: [
            { policy_key: 'ATT-BASIC', rule_name: '附件类型策略', rule_id: 'ATT-BASIC-001', action: 'accept', recipient: 'a@company.com' },
            { policy_key: 'ATT-AV', rule_name: '恶意附件哈希黑名单', rule_id: 'ATT-AV-001', action: 'discard', recipient: 'b@company.com' },
            { policy_key: 'ATT-QR', rule_name: '二维码风险识别', rule_id: 'ATT-QR-001', action: 'quarantine', recipient: 'c@company.com' },
            { policy_key: 'ATT-ENC', rule_name: '加密附件策略', rule_id: 'ATT-ENC-001', action: 'sideline', recipient: 'd@company.com' },
          ],
        },
      })}
      aiEnabled
      events={[]}
    />));

    // 不再是逐条铺开的完整卡片：单卡专用 testid（无 groups 容器）不存在。
    expect(screen.queryByTestId('analysis-disposal-basis')).not.toBeInTheDocument();
    const container = screen.getByTestId('analysis-disposal-basis-groups');
    expect(container).toBeInTheDocument();

    // 4 组都渲染为一行摘要，默认全部收起——完整详情（规则跳转按钮）尚未出现。
    for (const i of [0, 1, 2, 3]) {
      expect(screen.getByTestId(`analysis-disposal-basis-row-${i}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`analysis-disposal-basis-${i}`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('analysis-disposal-basis-row-1').textContent).toContain('丢弃');

    // 点击一行后才展开该组完整详情，其余行仍保持收起。
    fireEvent.click(screen.getByTestId('analysis-disposal-basis-row-1'));
    expect(screen.getByTestId('analysis-disposal-basis-1')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-disposal-basis-1').textContent).toContain('恶意附件哈希黑名单');
    expect(screen.queryByTestId('analysis-disposal-basis-0')).not.toBeInTheDocument();

    // 再次点击收起。
    fireEvent.click(screen.getByTestId('analysis-disposal-basis-row-1'));
    expect(screen.queryByTestId('analysis-disposal-basis-1')).not.toBeInTheDocument();
  });

  it('阶段卡片内分组明细最多展示3条，超出部分收进"及其他N项"提示', () => {
    render(wrap(<AnalysisSection
      detail={baseDetail({
        disposal_basis: {
          policy_key: 'ATT-AV',
          rule_name: '恶意附件哈希黑名单',
          rule_id: 'ATT-AV-001',
          action: 'discard',
          per_recipient: [
            { policy_key: 'ATT-BASIC', rule_name: '附件类型策略', rule_id: 'ATT-BASIC-001', action: 'accept', recipient: 'a@company.com' },
            { policy_key: 'ATT-AV', rule_name: '恶意附件哈希黑名单', rule_id: 'ATT-AV-001', action: 'discard', recipient: 'b@company.com' },
            { policy_key: 'ATT-QR', rule_name: '二维码风险识别', rule_id: 'ATT-QR-001', action: 'quarantine', recipient: 'c@company.com' },
            { policy_key: 'ATT-ENC', rule_name: '加密附件策略', rule_id: 'ATT-ENC-001', action: 'sideline', recipient: 'd@company.com' },
          ],
        },
      })}
      aiEnabled
      events={[]}
    />));

    // 4组全部归属阶段3（内容层）：明细只展示前3条，第4条收进溢出提示。
    const stage3Groups = screen.getByTestId('analysis-stage-3-basis-groups');
    expect(stage3Groups.textContent).toContain('附件类型策略');
    expect(stage3Groups.textContent).toContain('恶意附件哈希黑名单');
    expect(stage3Groups.textContent).toContain('二维码风险识别');
    expect(stage3Groups.textContent).not.toContain('加密附件策略');
    expect(screen.getByTestId('analysis-stage-3-basis-groups-overflow')).toHaveTextContent('及其他 1 项');
  });

  describe('收件人切换器（多投信按人切换安全分析/处置依据）', () => {
    const multiRecipientDetail = () => baseDetail({
      recipients: ['a@company.com', 'b@company.com', 'c@company.com', 'd@company.com'],
      disposal_basis: {
        policy_key: 'ATT-AV',
        rule_name: '恶意附件哈希黑名单',
        rule_id: 'ATT-AV-001',
        action: 'discard',
        per_recipient: [
          { policy_key: 'ATT-BASIC', rule_name: '附件类型策略', rule_id: 'ATT-BASIC-001', action: 'accept', recipient: 'a@company.com' },
          { policy_key: 'ATT-AV', rule_name: '恶意附件哈希黑名单', rule_id: 'ATT-AV-001', action: 'discard', recipient: 'b@company.com' },
          { policy_key: 'ATT-QR', rule_name: '二维码风险识别', rule_id: 'ATT-QR-001', action: 'quarantine', recipient: 'c@company.com' },
          { policy_key: 'ATT-ENC', rule_name: '加密附件策略', rule_id: 'ATT-ENC-001', action: 'sideline', recipient: 'd@company.com' },
        ],
      },
    });

    it('单收件人邮件不渲染切换器；群发邮件默认停在"全部收件人"', () => {
      render(wrap(<AnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
      expect(screen.queryByTestId('analysis-recipient-switcher')).not.toBeInTheDocument();
    });

    it('群发邮件渲染切换器，默认全部收件人视图仍是折叠列表', () => {
      render(wrap(<AnalysisSection detail={multiRecipientDetail()} aiEnabled events={[]} />));
      expect(screen.getByTestId('analysis-recipient-switcher')).toBeInTheDocument();
      expect(screen.getByTestId('analysis-disposal-basis-groups')).toBeInTheDocument();
      expect(screen.queryByTestId('analysis-disposal-basis')).not.toBeInTheDocument();
    });

    it('切到某个收件人后，处置依据变为该人专属单卡，且不再是折叠列表', async () => {
      const user = userEvent.setup();
      render(wrap(<AnalysisSection detail={multiRecipientDetail()} aiEnabled events={[]} />));

      await user.click(screen.getByTestId('analysis-recipient-switcher'));
      await user.click(screen.getByRole('option', { name: 'c@company.com · 隔离' }));

      expect(screen.queryByTestId('analysis-disposal-basis-groups')).not.toBeInTheDocument();
      const card = screen.getByTestId('analysis-disposal-basis');
      expect(card.textContent).toContain('二维码风险识别');
      expect(card.textContent).not.toContain('恶意附件哈希黑名单');
    });

    it('切到收件人后，事后处置时间线只保留该收件人相关事件', async () => {
      const user = userEvent.setup();
      const events = [
        { id: 601, event_source: 'quarantine', event_type: 'quarantine', event_result: 'completed', event_time: '2024-01-01T00:00:00Z', recipient: 'b@company.com' },
        { id: 602, event_source: 'quarantine', event_type: 'quarantine', event_result: 'completed', event_time: '2024-01-01T00:00:01Z', recipient: 'c@company.com' },
      ] as unknown as MailChildEvent[];

      render(wrap(<AnalysisSection detail={multiRecipientDetail()} aiEnabled events={events} />));

      fireEvent.click(screen.getByTestId('analysis-timeline-toggle'));
      expect(screen.getByTestId('analysis-timeline-event-601')).toBeInTheDocument();
      expect(screen.getByTestId('analysis-timeline-event-602')).toBeInTheDocument();

      await user.click(screen.getByTestId('analysis-recipient-switcher'));
      await user.click(screen.getByRole('option', { name: 'b@company.com · 丢弃' }));

      expect(screen.getByTestId('analysis-timeline-event-601')).toBeInTheDocument();
      expect(screen.queryByTestId('analysis-timeline-event-602')).not.toBeInTheDocument();
    });
  });
});
