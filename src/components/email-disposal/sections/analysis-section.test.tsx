import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import type { MailLogAnalysis, MailLogDetail } from '@/types/email-disposal-detail';
import type { MailChildEvent } from '@/types/log';
import { buildDetectionStages, deriveFinalVerdict } from '../hooks/use-detection-stages';
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
      connection: 12,
      identity: 45,
      content: 156,
      comprehensive: 89,
      ai: 234,
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

function multiRecipientDetail(): MailLogDetail {
  return baseDetail({
    recipients: ['blocked@example.test', 'review@example.test'],
    recipient_dispositions: [
      { recipient: 'blocked@example.test', final_action: 'discard', status: 'discarded' },
      { recipient: 'review@example.test', final_action: 'audit', status: 'auditing' },
    ],
    disposal_basis: {
      policy_key: 'CR',
      rule_name: '恶意链接规则',
      rule_id: 'CR-10',
      action: 'discard',
      modules: [
        {
          policy_key: 'CR',
          rule_name: '恶意链接规则',
          rule_id: 'CR-10',
          action: 'discard',
          recipients: ['blocked@example.test'],
          effective_for: ['blocked@example.test'],
        },
        {
          policy_key: 'ACF',
          rule_name: '财务审核规则',
          rule_id: 'ACF-20',
          action: 'audit',
          recipients: ['review@example.test'],
          effective_for: ['review@example.test'],
        },
      ],
    },
  });
}

// Component tests receive the same already-folded shape as production. The
// legacy client builder is used only to keep unrelated rendering fixtures
// compact; recipient correctness is covered by the backend Go tests and the
// explicit contract fixture tests below.
function analysisFor(detail: MailLogDetail): MailLogAnalysis {
  const stages = buildDetectionStages(detail);
  const total = Object.values(detail.stage_timings ?? {}).reduce((sum, value) => sum + value, 0) || detail.processing_time_ms || 0;
  return {
    scope: 'all',
    final_verdict: deriveFinalVerdict(stages),
    total_elapsed_ms: total,
    stages,
  };
}

function TestAnalysisSection(props: React.ComponentProps<typeof AnalysisSection>) {
  return <AnalysisSection {...props} analysis={props.analysis ?? analysisFor(props.detail)} />;
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
  it('shows a multi-recipient selector with disposal actions and reports the selected value', async () => {
    const user = userEvent.setup();
    const onSelectedRecipientChange = vi.fn();

    render(wrap(
      <TestAnalysisSection
        detail={multiRecipientDetail()}
        aiEnabled
        events={[]}
        onSelectedRecipientChange={onSelectedRecipientChange}
      />,
    ));

    const selector = screen.getByTestId('analysis-recipient-switcher');
    expect(selector).toHaveTextContent('全部收件人（2）');

    await user.click(selector);
    await user.click(await screen.findByRole('option', { name: /review@example\.test.*审核/ }));
    expect(onSelectedRecipientChange).toHaveBeenCalledWith('review@example.test');
  });

  it('hides the recipient selector when the message only has one recipient', () => {
    render(wrap(
      <TestAnalysisSection
        detail={baseDetail()}
        aiEnabled
        events={[]}
        onSelectedRecipientChange={vi.fn()}
      />,
    ));

    expect(screen.queryByTestId('analysis-recipient-switcher')).not.toBeInTheDocument();
  });

  it('narrows disposal basis and hit modules to the selected recipient', () => {
    const detail = multiRecipientDetail();
    const authoritative = analysisFor(detail);
    authoritative.scope = 'recipient';
    authoritative.recipient = 'review@example.test';
    authoritative.action = 'audit';
    authoritative.status = 'auditing';

    render(wrap(
      <TestAnalysisSection
        detail={detail}
        analysis={authoritative}
        aiEnabled
        events={[]}
        selectedRecipient="review@example.test"
        onSelectedRecipientChange={vi.fn()}
      />,
    ));

    expect(screen.queryByTestId('analysis-multi-basis-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('analysis-disposal-basis-groups')).not.toBeInTheDocument();
    const basis = screen.getByTestId('analysis-disposal-basis');
    expect(basis).toHaveTextContent('财务审核规则');
    expect(basis).not.toHaveTextContent('恶意链接规则');
    const modules = screen.getByTestId('analysis-hit-modules');
    expect(modules).toHaveTextContent('财务审核规则');
    expect(modules).not.toHaveTextContent('恶意链接规则');
    expect(screen.queryByTestId('analysis-stage-3-recipient-split-badge')).not.toBeInTheDocument();
  });

  it('renders the current email type instead of the broad analysis verdict (GT-12977)', () => {
    const detail = baseDetail({
      action: 'quarantine',
      status: 'quarantined',
      email_type: 'phishing',
    });
    const authoritative = analysisFor(detail);
    authoritative.final_verdict = 'safe';
    authoritative.stages = authoritative.stages.map((stage) => ({
      ...stage,
      status: 'pass',
      checks: stage.checks.map((check) => ({ ...check, status: 'pass' })),
    }));

    render(wrap(<TestAnalysisSection detail={detail} analysis={authoritative} aiEnabled events={[]} />));

    expect(screen.getByTestId('analysis-verdict-card')).toHaveTextContent('钓鱼邮件');
    expect(screen.getByTestId('analysis-verdict-card')).not.toHaveTextContent('安全邮件');
    expect(screen.getByTestId('analysis-stage-3')).toHaveTextContent('通过');
  });

  it('shows phishing investigation details inline under the stage-4 agent row', () => {
    const detail = baseDetail({
      phish_agent_check: {
        status: 'completed',
        checked: true,
        verdict: 'phishing',
        risk_level: 'high',
        confidence: 0.94,
        summary: '发现凭据窃取页面',
        details: { target: 'login.example.test' },
        steps: [{ name: '链接研判', status: 'completed', message: '命中仿冒登录页' }],
        recommended_actions: [{ type: 'recall', scope: 'recipient', target_count: 1, reason: '降低暴露面' }],
      },
    });

    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));

    expect(screen.queryByText('AI 智能研判')).not.toBeInTheDocument();
    const toggle = screen.getByTestId('analysis-ai-verdict-detail-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByTestId('analysis-check-phishingAgent-detail')).toHaveTextContent('发现凭据窃取页面');
    expect(screen.getByTestId('analysis-check-phishingAgent-detail')).toHaveTextContent('链接研判');
    expect(screen.getByTestId('analysis-check-phishingAgent-detail')).toHaveTextContent('降低暴露面');
  });

  it('renders multi-recipient basis groups as collapsed rows and expands one row on demand', () => {
    const detail = baseDetail({
      recipients: ['blocked@example.test', 'review@example.test'],
      disposal_basis: {
        policy_key: 'CR',
        rule_name: '恶意链接规则',
        rule_id: 'CR-10',
        action: 'quarantine',
        modules: [
          {
            policy_key: 'CR',
            rule_name: '恶意链接规则',
            rule_id: 'CR-10',
            action: 'quarantine',
            recipients: ['blocked@example.test'],
            effective_for: ['blocked@example.test'],
          },
          {
            policy_key: 'ACF',
            rule_name: '财务审核规则',
            rule_id: 'ACF-20',
            action: 'audit',
            recipients: ['review@example.test'],
            effective_for: ['review@example.test'],
          },
        ],
      },
    });
    const authoritative = analysisFor(detail);
    authoritative.stages = authoritative.stages.map((stage) => stage.key === 'content'
      ? {
          ...stage,
          status: 'threat',
          checks: stage.checks.map((check) => check.key === 'contentRules'
            ? {
                ...check,
                status: 'threat',
                ruleIds: [10],
                recipientGroups: [
                  { recipients: ['blocked@example.test'], status: 'threat', ruleIds: [10] },
                  { recipients: ['review@example.test'], status: 'pass', ruleIds: [] },
                ],
              }
            : check),
        }
      : stage);

    render(wrap(<TestAnalysisSection detail={detail} analysis={authoritative} aiEnabled events={[]} />));

    expect(screen.getByTestId('analysis-multi-basis-summary')).toHaveTextContent('2 位收件人 · 2 类处置依据');
    expect(screen.getByTestId('analysis-stage-3-recipient-split-badge')).toHaveTextContent('2 组');
    expect(screen.getByTestId('analysis-check-contentRules-recipient-groups')).toHaveTextContent('blocked@example.test');
    expect(screen.getByTestId('analysis-check-contentRules-recipient-groups')).toHaveTextContent('review@example.test');
    expect(screen.getByTestId('analysis-disposal-basis-row-0')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('analysis-disposal-basis-row-1')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('analysis-disposal-basis-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('analysis-disposal-basis-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('analysis-disposal-basis-row-0'));
    expect(screen.getByTestId('analysis-disposal-basis-row-0')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('analysis-disposal-basis-0')).toHaveTextContent('恶意链接规则');
    expect(screen.getByTestId('analysis-disposal-basis-scope-0')).toHaveTextContent('blocked@example.test');
    expect(screen.queryByTestId('analysis-disposal-basis-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('analysis-disposal-basis-row-0'));
    expect(screen.queryByTestId('analysis-disposal-basis-0')).not.toBeInTheDocument();
  });

  it('limits stage basis details to three rows and reports the remaining count', () => {
    const detail = baseDetail({
      recipients: ['a@example.test', 'b@example.test', 'c@example.test', 'd@example.test'],
      disposal_basis: {
        policy_key: 'ATT-AV',
        rule_name: '恶意附件哈希黑名单',
        rule_id: 'ATT-AV-001',
        action: 'discard',
        modules: [
          {
            policy_key: 'ATT-BASIC',
            rule_name: '附件类型策略',
            rule_id: 'ATT-BASIC-001',
            action: 'accept',
            recipients: ['a@example.test'],
            effective_for: ['a@example.test'],
          },
          {
            policy_key: 'ATT-AV',
            rule_name: '恶意附件哈希黑名单',
            rule_id: 'ATT-AV-001',
            action: 'discard',
            recipients: ['b@example.test'],
            effective_for: ['b@example.test'],
          },
          {
            policy_key: 'ATT-QR',
            rule_name: '二维码风险识别',
            rule_id: 'ATT-QR-001',
            action: 'quarantine',
            recipients: ['c@example.test'],
            effective_for: ['c@example.test'],
          },
          {
            policy_key: 'ATT-ENC',
            rule_name: '加密附件策略',
            rule_id: 'ATT-ENC-001',
            action: 'sideline',
            recipients: ['d@example.test'],
            effective_for: ['d@example.test'],
          },
        ],
      },
    });

    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));

    const stageGroups = screen.getByTestId('analysis-stage-3-basis-groups');
    expect(stageGroups).toHaveTextContent('附件类型策略');
    expect(stageGroups).toHaveTextContent('恶意附件哈希黑名单');
    expect(stageGroups).toHaveTextContent('二维码风险识别');
    expect(stageGroups).not.toHaveTextContent('加密附件策略');
    expect(screen.getByTestId('analysis-stage-3-basis-groups-overflow')).toHaveTextContent('及其他 1 项');
  });

  it('prefers structured legacy basis over a stale no-rules-matched reason', () => {
    const detail = baseDetail({
      reason: 'no rules matched',
      disposal_basis: {
        policy_key: '',
        rule_name: 'baseline:cac_high_score',
        action: 'quarantine',
        modules: [{
          policy_key: 'INTENT',
          rule_name: 'sysrule:intent_engine:spam:receive',
          action: 'quarantine',
          effective_for: [],
        }],
      },
    });

    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));

    const card = screen.getByTestId('analysis-disposal-basis');
    expect(card).toHaveTextContent('baseline:cac_high_score');
    expect(card).not.toHaveTextContent('no rules matched');
  });

  it('renders all 5 stage cards default-expanded (gap 2.1/2.2)', () => {
    const detail = baseDetail({
      matched_tag_rule_pages: { identity: { auth_spoofing: [22] } },
    });
    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`analysis-stage-${n}`)).toBeInTheDocument();
      // Inline hit-strategy detail is present without any click (default expanded).
      expect(screen.getByTestId(`analysis-stage-${n}-detail`)).toBeInTheDocument();
    }
    // 阶段 4/5 已交换（GT-12575 与策略流水线对齐）：智能体研判(ai)为阶段 4，
    // 是命中阶段 -- 威胁 badge; others 通过.
    expect(screen.getByTestId('analysis-stage-4').textContent).toContain('威胁');
    expect(screen.getByTestId('analysis-stage-1').textContent).toContain('通过');
    expect(screen.getByTestId('analysis-stage-2-detail')).not.toHaveTextContent('#22');

    // Clicking a card collapses only that card's own detail.
    fireEvent.click(screen.getByTestId('analysis-stage-1'));
    expect(screen.queryByTestId('analysis-stage-1-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-stage-2-detail')).toBeInTheDocument();
  });

  it('uses pointer-compatible card feedback without relying on CSS hover', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    const stage = screen.getByTestId('analysis-stage-1');
    const stageCard = stage.parentElement!;

    expect(stageCard).toHaveClass('duration-[240ms]', 'motion-reduce:transition-none', 'data-[hovered=true]:shadow-md');
    fireEvent.pointerEnter(stageCard, { pointerType: 'mouse' });
    expect(stageCard).toHaveAttribute('data-hovered', 'true');
    fireEvent.pointerLeave(stageCard, { pointerType: 'mouse' });
    expect(stageCard).not.toHaveAttribute('data-hovered');
    fireEvent.pointerEnter(stageCard, { pointerType: 'touch' });
    expect(stageCard).not.toHaveAttribute('data-hovered');
  });

  it('shows 总耗时 as the sum of stage_timings (gap 2.3)', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-total-elapsed').textContent).toContain('总耗时: 536ms');
    expect(screen.getByTestId('analysis-verdict-card').textContent).toContain('耗时: 536ms');
  });

  it('verdict card 时间线 button toggles the post-detection timeline (gap 2.4/2.5)', () => {
    // 时间线现在默认展开（原型优化一：默认收起会让已有事件不可见），
    // 按钮仍需双向切换。
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={sampleEvents()} />));
    expect(screen.getByTestId('analysis-timeline-body')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('analysis-verdict-timeline-btn'));
    expect(screen.queryByTestId('analysis-timeline-body')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('analysis-verdict-timeline-btn'));
    expect(screen.getByTestId('analysis-timeline-body')).toBeInTheDocument();
  });

  it('timeline renders events at L1 (summary only) and event detail at L2 on click', () => {
    // 时间线默认展开，无需先点 toggle。
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={sampleEvents()} />));

    const eventRow = screen.getByTestId('analysis-timeline-event-501');
    expect(eventRow).toBeInTheDocument();
    expect(eventRow.textContent).toContain('victim@company.com');
    // L1: no detail (操作对象/操作类型/执行结果) until the card itself is clicked.
    expect(screen.queryByTestId('analysis-timeline-event-501-detail')).not.toBeInTheDocument();

    fireEvent.click(eventRow);
    const detail = screen.getByTestId('analysis-timeline-event-501-detail');
    // 优化五：标签从召回专用（召回范围/召回动作）改为通用（操作对象/操作类型），
    // 因为时间线要承载召回之外的处置动作；「查看召回日志」同步改为「查看原始日志」。
    expect(detail.textContent).toContain('操作对象');
    expect(detail.textContent).toContain('操作类型');
    expect(detail.textContent).toContain('执行结果');
    expect(screen.getByTestId('analysis-timeline-event-501-view-log')).toHaveTextContent('查看原始日志');
  });

  it('does not classify the Graph A initial delivery as post-disposal, but keeps a later sideline release', () => {
    const event = (id: number, source: string): MailChildEvent => ({
      id,
      event_source: source,
      event_type: 'workflow',
      event_result: 'released',
      queue_id: `q${id}`,
      event_time: `2026-07-20T09:2${id - 700}:00.000Z`,
      correlation_status: 'matched',
    });

    render(wrap(
      <TestAnalysisSection
        detail={baseDetail()}
        aiEnabled
        events={[
          event(700, 'workflow.sideline.initial_delivery'),
          event(701, 'workflow.sideline'),
        ]}
      />,
    ));

    expect(screen.queryByTestId('analysis-timeline-event-700')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-timeline-event-701')).toHaveTextContent('旁路处置');
    expect(screen.getByText('1 个事件')).toBeInTheDocument();
  });

  it('does not duplicate basic, sender, URL, and attachment data in 内容详情', () => {
    render(
      wrap(
        <TestAnalysisSection
          detail={baseDetail({
            message_uuid: '0d9c2f4e-8a31-4b6b-9f0e-1234567890ab',
            session_id: 'a1b2c3d4-e5f',
            queue_id: '4XyZ12AbCd',
          })}
          aiEnabled
          events={[]}
        />,
      ),
    );

    expect(screen.queryByText('内容详情')).not.toBeInTheDocument();
    expect(screen.queryByText('0d9c2f4e-8a31-4b6b-9f0e-1234567890ab')).not.toBeInTheDocument();
  });

  // 召回回调超时（后端 internal/api/recall_timeout_worker.go）：同一次召回的
  // 「处置中」与补写的「超时」共用 source_ref，折叠成一行且显示超时；真实回调
  // 后到时那一行必须变回真实结果，即便它的 event_time 更早（对方系统自己戳的
  // report_time 可能有时钟偏移）。
  function recallEvents(...rows: Array<[number, string, string]>): MailChildEvent[] {
    return rows.map(([id, result, at]) => ({
      id,
      event_source: 'admin_api',
      event_type: 'recall',
      event_result: result,
      source_ref: 'recall_req:77',
      queue_id: 'q1',
      event_time: at,
      recipient: 'victim@company.com',
      correlation_status: 'matched',
    })) as MailChildEvent[];
  }

  it('召回超时补写后，时间线那一行折叠为一条并显示「超时未回执」', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={recallEvents([601, 'handling', '2026-07-20T09:20:00.000Z'], [602, 'timeout', '2026-07-21T09:20:00.000Z'])} />));
    expect(screen.queryByTestId('analysis-timeline-event-601')).not.toBeInTheDocument();
    const row = screen.getByTestId('analysis-timeline-event-602');
    fireEvent.click(row);
    expect(screen.getByTestId('analysis-timeline-event-602-detail').textContent).toContain('超时未回执');
  });

  it('迟到的真实回调盖过超时那一行，即便它的 event_time 更早', () => {
    render(
      wrap(
        <TestAnalysisSection
          detail={baseDetail()}
          aiEnabled
          events={recallEvents([601, 'handling', '2026-07-20T09:20:00.000Z'], [602, 'timeout', '2026-07-21T09:20:00.000Z'], [603, 'success', '2026-07-21T08:00:00.000Z'])}
        />,
      ),
    );
    expect(screen.queryByTestId('analysis-timeline-event-602')).not.toBeInTheDocument();
    const row = screen.getByTestId('analysis-timeline-event-603');
    fireEvent.click(row);
    expect(screen.getByTestId('analysis-timeline-event-603-detail').textContent).toContain('成功');
  });

  it('shows 暂无事件 when there are no events', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-timeline-empty')).toHaveTextContent('暂无事件');
  });

  it('处置依据 header has the action badge top-right and a combined rule link (gap 2.7)', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-disposal-basis-action')).toHaveTextContent('隔离');

    const ruleLink = screen.getByTestId('analysis-disposal-basis-rule-link');
    expect(ruleLink.textContent).toContain('高管仿冒识别');
    expect(ruleLink.textContent).toContain('AI-SPOOF-012');
    expect(ruleLink).toHaveAttribute('title', '前往策略配置页');

    fireEvent.click(ruleLink);
    expect(routerPush).toHaveBeenCalledWith('/agent-center/overview');
  });
});
