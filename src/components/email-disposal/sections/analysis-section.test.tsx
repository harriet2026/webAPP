import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import type { MailLogAnalysis, MailLogDetail } from '@/types/email-disposal-detail';
import type { MailChildEvent } from '@/types/log';
import { AnalysisSection } from './analysis-section';

const productFormState = {
  capabilities: { ai: true, multiTenant: true, saas: false },
  viewer: 'platform' as const,
  switcherEnabled: false,
};

vi.mock('@/contexts/product-form-context', () => ({
  useProductForm: () => productFormState,
}));

const ALL_AGENT_ACCESS = {
  phishingAgent: 'enabled',
  spoofingAgent: 'enabled',
  threatRetroAgent: 'enabled',
} as const;

// Real zh messages (not an identity mock) -- assertions read actual rendered
// copy (检测流程/总耗时/事后处置时间线/etc), matching the pattern established
// by send-receive-context-card.test.tsx.
const wrap = (ui: React.ReactNode) => (
  <NextIntlClientProvider locale="zh" messages={zh as never}>
    {ui}
  </NextIntlClientProvider>
);

const routerPush = vi.fn();
const scrollIntoViewMock = vi.fn();
// GT-12583：组件改用 next-intl 的 locale-aware router（@/i18n/navigation），
// mock 对应模块（真实实现会向 push 的路径自动补 /zh 前缀，这里按透传断言）。
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
  productFormState.switcherEnabled = false;
  scrollIntoViewMock.mockReset();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoViewMock,
  });
});

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

// Explicit API projection, independent of MailLogDetail. These tests exercise
// rendering, not rule/action/risk inference; backend tests own that contract.
function baseAnalysis(overrides: Partial<MailLogAnalysis> = {}): MailLogAnalysis {
  return {
    scope: 'all',
    final_verdict: 'malicious',
    total_elapsed_ms: 536,
    stages: [
      {
        stage: 1, key: 'connection', status: 'pass', durationMs: 12,
        checks: [
          { key: 'ipRateLimit', status: 'pass', ruleIds: [] },
          { key: 'ipFilter', status: 'pass', ruleIds: [] },
          { key: 'rblFilter', status: 'pass', ruleIds: [] },
          { key: 'overseasDetection', status: 'pass', ruleIds: [] },
        ],
      },
      {
        stage: 2, key: 'identity', status: 'pass', durationMs: 45,
        checks: [
          { key: 'senderList', status: 'pass', ruleIds: [] },
          { key: 'authSpoofing', status: 'pass', ruleIds: [] },
          { key: 'behaviorControl', status: 'pass', ruleIds: [] },
          { key: 'recipientCheck', status: 'pass', ruleIds: [] },
          { key: 'personalList', status: 'pass', ruleIds: [] },
        ],
      },
      {
        stage: 3, key: 'content', status: 'pass', durationMs: 156,
        checks: [
          { key: 'attachmentSecurity', status: 'pass', ruleIds: [] },
          { key: 'urlProtection', status: 'pass', ruleIds: [] },
          { key: 'contentRules', status: 'pass', ruleIds: [] },
          { key: 'intentEngine', status: 'pass', ruleIds: [] },
        ],
      },
      {
        stage: 4, key: 'ai', status: 'threat', durationMs: 234,
        checks: [
          { key: 'phishingAgent', status: 'skipped', ruleIds: [] },
          { key: 'spoofingAgent', status: 'threat', ruleIds: [] },
          { key: 'threatRetroAgent', status: 'skipped', ruleIds: [] },
        ],
      },
      {
        stage: 5, key: 'comprehensive', status: 'pass', durationMs: 89,
        checks: [
          { key: 'similarityDetection', status: 'pass', ruleIds: [] },
          { key: 'advancedRules', status: 'pass', ruleIds: [] },
          { key: 'mailMarking', status: 'pass', ruleIds: [] },
        ],
      },
    ],
    ...overrides,
  };
}

function TestAnalysisSection(props: React.ComponentProps<typeof AnalysisSection>) {
  const projectedDetail: MailLogDetail = {
    ...props.detail,
    post_detection_timeline: {
      schema_version: 1,
      events: (props.events ?? []).map((event, index) => ({
        event_id: `event-${event.id}`,
        event_type: event.event_type === 'recall' ? 'recall_state_changed' : 'workflow_action',
        occurred_at: event.event_time,
        operation_id: event.source_ref || `operation-${event.id}`,
        revision: index + 1,
        source: event.event_source,
        status: event.event_result,
        display: event.event_source !== 'workflow.sideline.initial_delivery',
        data: event.recipient ? { recipients: [event.recipient] } : undefined,
      })),
    },
  };
  return (
    <AnalysisSection
      visibleAgentAccess={ALL_AGENT_ACCESS}
      {...props}
      detail={projectedDetail}
      analysis={props.analysis ?? baseAnalysis()}
    />
  );
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
  it('shows only enabled agents and labels an unexecuted phishing check as skipped', () => {
    const detail = baseDetail({ email_type: 'phishing' });
    const authoritative = baseAnalysis();
    authoritative.stages = authoritative.stages.map((stage) => stage.key !== 'ai' ? stage : ({
      ...stage,
      status: 'threat',
      checks: [
        { key: 'phishingAgent', status: 'skipped', ruleIds: [] },
        { key: 'spoofingAgent', status: 'threat', ruleIds: [41] },
        { key: 'threatRetroAgent', status: 'threat', ruleIds: [99] },
      ],
    }));

    render(wrap(
      <AnalysisSection
        detail={detail}
        analysis={authoritative}
        aiEnabled
        visibleAgentAccess={{ phishingAgent: 'enabled' }}
        events={[]}
      />,
    ));

    const aiStage = screen.getByTestId('analysis-stage-4');
    expect(aiStage).toHaveTextContent('1 项策略');
    expect(aiStage).toHaveTextContent('跳过');
    expect(aiStage).not.toHaveTextContent('威胁');
    expect(screen.getByTestId('analysis-check-phishingAgent')).toHaveTextContent('跳过');
    expect(screen.getByTestId('analysis-check-phishingAgent')).not.toHaveTextContent('未接入');
    expect(screen.queryByTestId('analysis-check-spoofingAgent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('analysis-check-threatRetroAgent')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-stage-5')).toBeInTheDocument();
  });

  it('omits the AI stage while visibility is unresolved and when no agent is visible', () => {
    const detail = baseDetail();
    const authoritative = baseAnalysis();
    const { rerender } = render(wrap(
      <AnalysisSection detail={detail} analysis={authoritative} aiEnabled events={[]} />,
    ));

    expect(screen.queryByText('AI 智能分析')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-stage-4')).toHaveTextContent('综合分析');

    rerender(wrap(
      <AnalysisSection
        detail={detail}
        analysis={authoritative}
        aiEnabled
        visibleAgentAccess={{}}
        events={[]}
      />,
    ));

    expect(screen.queryByText('AI 智能分析')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-stage-4')).toHaveTextContent('综合分析');
    expect(screen.queryByTestId('analysis-stage-5')).not.toBeInTheDocument();
  });

  it('uses access and reason independently for locked, skipped, and module-disabled agents', () => {
    const detail = baseDetail();
    const authoritative = baseAnalysis();
    authoritative.stages = authoritative.stages.map((stage) => stage.key !== 'ai' ? stage : ({
      ...stage,
      status: 'skipped',
      checks: [
        { key: 'phishingAgent', status: 'skipped', ruleIds: [] },
        { key: 'spoofingAgent', status: 'skipped', reason: 'module_disabled', ruleIds: [] },
        { key: 'threatRetroAgent', status: 'threat', ruleIds: [99] },
      ],
    }));

    render(wrap(
      <AnalysisSection
        detail={detail}
        analysis={authoritative}
        aiEnabled
        visibleAgentAccess={{
          phishingAgent: 'enabled',
          spoofingAgent: 'enabled',
          threatRetroAgent: 'locked',
        }}
        events={[]}
      />,
    ));

    expect(screen.getByTestId('analysis-check-phishingAgent')).toHaveTextContent('跳过');
    expect(screen.getByTestId('analysis-check-spoofingAgent')).toHaveTextContent('已禁用');
    expect(screen.getByTestId('analysis-check-threatRetroAgent')).toHaveTextContent('未接入');
  });

  it.each([
    ['pass', '通过'],
    ['observed', '观察'],
    ['suspicious', '可疑'],
    ['threat', '威胁'],
    ['timeout', '超时'],
    ['processing', '处理中'],
  ] as const)('renders the authoritative phishing %s result without deriving risk in the browser', (status, label) => {
    const detail = baseDetail();
    const authoritative = baseAnalysis();
    authoritative.stages = authoritative.stages.map((stage) => stage.key !== 'ai' ? stage : ({
      ...stage,
      status,
      checks: [{ key: 'phishingAgent', status, ruleIds: [] }],
    }));

    render(wrap(
      <AnalysisSection
        detail={detail}
        analysis={authoritative}
        aiEnabled
        visibleAgentAccess={{ phishingAgent: 'enabled' }}
        events={[]}
      />,
    ));

    expect(screen.getByTestId('analysis-check-phishingAgent')).toHaveTextContent(label);
  });

  it.each([
    ['content', 'attachmentSecurity', 'attachment_security'],
    ['content', 'intentEngine', 'intent_engine'],
    ['comprehensive', 'similarityDetection', 'similar_detection'],
    ['ai', 'phishingAgent', 'phishing_disposition'],
    ['ai', 'spoofingAgent', 'spoofing_disposition'],
  ])('renders %s/%s from the projection despite conflicting detail evidence', (stageKey, checkKey, page) => {
    const detail = baseDetail({
      matched_action_rule_pages: { sideline: { [page]: [99] } },
      phish_agent_check: { status: 'completed', checked: true, verdict: 'phishing', risk_level: 'high' },
    });
    const authoritative = baseAnalysis({
      final_verdict: 'safe',
      stages: [{
        stage: 1, key: stageKey, status: 'timeout',
        checks: [{ key: checkKey, status: 'timeout', ruleIds: [] }],
      }],
    });
    const { rerender } = render(wrap(
      <AnalysisSection detail={detail} analysis={authoritative} aiEnabled visibleAgentAccess={ALL_AGENT_ACCESS} events={[]} />,
    ));

    expect(screen.getByTestId(`analysis-check-${checkKey}`)).toHaveTextContent('超时');
    expect(screen.getByTestId('analysis-stage-1')).toHaveTextContent('超时');

    // A newer successful projection must also clear timeout without consulting
    // the legacy rule pages, whole-mail action, or phishing risk summary.
    rerender(wrap(
      <AnalysisSection
        detail={detail}
        analysis={baseAnalysis({
          final_verdict: 'safe',
          stages: [{
            stage: 1, key: stageKey, status: 'pass',
            checks: [{ key: checkKey, status: 'pass', ruleIds: [] }],
          }],
        })}
        aiEnabled
        visibleAgentAccess={ALL_AGENT_ACCESS}
        events={[]}
      />,
    ));
    expect(screen.getByTestId(`analysis-check-${checkKey}`)).toHaveTextContent('通过');
    expect(screen.getByTestId(`analysis-check-${checkKey}`)).not.toHaveTextContent('超时');
    expect(screen.getByTestId('analysis-stage-1')).toHaveTextContent('通过');
  });

  it.each([
    ['missing', {}, 'analysis-error'],
    ['loading', { analysisLoading: true }, 'analysis-loading'],
    ['failed', { analysisError: true }, 'analysis-error'],
  ] as const)('does not derive stages from detail when the projection is %s', (_state, props, testId) => {
    render(wrap(
      <AnalysisSection detail={baseDetail()} aiEnabled visibleAgentAccess={ALL_AGENT_ACCESS} events={[]} {...props} />,
    ));
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByTestId('analysis-stage-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('analysis-check-spoofingAgent')).not.toBeInTheDocument();
  });

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
    const authoritative = baseAnalysis();
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
    const authoritative = baseAnalysis();
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

  it('renders a disabled module as 已禁用 instead of pass or 未接入 (GT-13158)', () => {
    const detail = baseDetail({ email_type: 'phishing' });
    const authoritative = baseAnalysis();
    authoritative.stages = authoritative.stages.map((stage) => stage.key !== 'content' ? stage : ({
      ...stage,
      checks: stage.checks.map((check) => check.key !== 'intentEngine' ? check : ({
        ...check,
        status: 'skipped',
        reason: 'module_disabled',
        ruleIds: [],
      })),
    }));

    render(wrap(<TestAnalysisSection detail={detail} analysis={authoritative} aiEnabled events={[]} />));

    const contentDetail = screen.getByTestId('analysis-stage-3-detail');
    expect(contentDetail).toHaveTextContent('意图引擎');
    expect(contentDetail).toHaveTextContent('已禁用');
    expect(contentDetail).not.toHaveTextContent('未接入');
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
    const authoritative = baseAnalysis();
    authoritative.stages[3].checks[0] = { key: 'phishingAgent', status: 'threat', ruleIds: [] };

    render(wrap(<TestAnalysisSection detail={detail} analysis={authoritative} aiEnabled events={[]} />));

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
    const authoritative = baseAnalysis();
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

  it('GT-13709：意图引擎命中显示配置页友好名称且隐藏内部标识', () => {
    const detail = baseDetail({
      disposal_basis: {
        modules: [{
          policy_key: 'INTENT',
          rule_name: 'sysrule:intent_engine:spam:receive',
          rule_id: 'config:antispam:tenant:1:intent.spam.receive:615acc3a5021',
          action: 'quarantine',
          hit_values: { tag_id: 'Tag4', tag_label: '广告', confidence: '37.8' },
          recipients: ['victim@company.com'],
          effective_for: ['victim@company.com'],
        }],
      },
    });

    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));

    const modules = screen.getByTestId('analysis-hit-modules');
    const item = within(modules).getByTestId('analysis-hit-module-item');
    expect(within(item).getByTestId('analysis-hit-module-rule-label')).toHaveTextContent('垃圾（接收）');
    expect(item).toHaveTextContent('Tag4 判定为广告（置信度：37.8%）');
    expect(item).not.toHaveTextContent('sysrule:intent_engine');
    expect(item).not.toHaveTextContent('config:antispam:tenant');
  });

  it('GT-13981：收件人存在性命中显示友好名称且隐藏内部标识', () => {
    const detail = baseDetail({
      disposal_basis: {
        policy_key: 'RCPT',
        rule_name: 'sysrule:recipient_check_existence',
        rule_id: 'config:antispam:tenant:2:existence:615acc3a5021',
        action: 'reject',
        modules: [{
          policy_key: 'RCPT',
          rule_name: 'sysrule:recipient_check_existence',
          rule_id: 'config:antispam:tenant:2:existence:615acc3a5021',
          action: 'reject',
          recipients: ['invalid@company.com'],
          effective_for: ['invalid@company.com'],
        }],
      },
    });

    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));

    const card = screen.getByTestId('analysis-disposal-basis');
    expect(card).toHaveTextContent('存在性验证策略');
    expect(card).toHaveTextContent('命中收件人存在性验证规则');
    expect(card).not.toHaveTextContent('sysrule:recipient_check_existence');
    expect(card).not.toHaveTextContent('config:antispam:tenant');
    fireEvent.click(screen.getByTestId('analysis-disposal-basis-rule-link'));
    expect(routerPush).toHaveBeenCalledWith('/security/pipeline?module=recipientCheck');
  });

  it('GT-13981：收件人接收数量限制命中显示方向化业务名称且隐藏内部标识', () => {
    const detail = baseDetail({
      disposal_basis: {
        policy_key: 'RCPT',
        rule_name: 'sysrule:recipient_check_limit_inbound',
        rule_id: 'config:antispam:tenant:1:limit.inbound:aaf0126f3a63',
        action: 'reject',
        modules: [{
          policy_key: 'RCPT',
          rule_name: 'sysrule:recipient_check_limit_inbound',
          rule_id: 'config:antispam:tenant:1:limit.inbound:aaf0126f3a63',
          action: 'reject',
          recipients: ['excess@company.com'],
          effective_for: ['excess@company.com'],
        }],
      },
    });

    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));

    const card = screen.getByTestId('analysis-disposal-basis');
    expect(card).toHaveTextContent('数量限制策略（接收方向）');
    expect(card).toHaveTextContent('命中收件人检测规则');
    expect(card).not.toHaveTextContent('sysrule:recipient_check_limit_inbound');
    expect(card).not.toHaveTextContent('config:antispam:tenant');
    const hitModule = screen.getByTestId('analysis-hit-module-item');
    expect(hitModule).toHaveTextContent('数量限制策略（接收方向）');
    expect(hitModule).not.toHaveTextContent('sysrule:recipient_check_limit_inbound');
    expect(hitModule).not.toHaveTextContent('config:antispam:tenant');
    fireEvent.click(screen.getByTestId('analysis-disposal-basis-rule-link'));
    expect(routerPush).toHaveBeenCalledWith('/security/pipeline?module=recipientCheck');
  });

  it('GT-14105：附件病毒处置依据显示业务名称且隐藏内部配置身份', () => {
    const attachmentVirusDisposition = {
      policy_key: 'ATT-BASIC',
      rule_name: 'attachment virus disposition',
      rule_id: 'config:attachd:platform:0:disposition.virus:89a569b163b4',
      action: 'quarantine',
      hit_values: { virus_name: 'EICAR-Test-File' },
      recipients: ['alice@example.test'],
      effective_for: ['alice@example.test'],
    };
    const detail = baseDetail({
      disposal_basis: {
        ...attachmentVirusDisposition,
        modules: [attachmentVirusDisposition],
      },
    });

    render(wrap(<TestAnalysisSection detail={detail} aiEnabled events={[]} />));

    const card = screen.getByTestId('analysis-disposal-basis');
    expect(card).toHaveTextContent('附件病毒处置规则');
    expect(card).toHaveTextContent('附件安全检测');
    expect(card).toHaveTextContent('EICAR-Test-File');
    expect(card).not.toHaveTextContent('attachment virus disposition');
    expect(card).not.toHaveTextContent('config:attachd:');
    expect(screen.getByTestId('analysis-hit-modules')).toBeInTheDocument();
    expect(screen.getAllByTestId('analysis-hit-module-item')).toHaveLength(1);
    const hit = screen.getByTestId('analysis-hit-module-item');
    expect(hit).toHaveTextContent('附件安全检测');
    expect(hit).toHaveTextContent('附件病毒处置规则');
    expect(hit).toHaveTextContent('EICAR-Test-File');
    expect(hit).not.toHaveTextContent('config:attachd:');
    fireEvent.click(screen.getByTestId('analysis-disposal-basis-rule-link'));
    expect(routerPush).toHaveBeenLastCalledWith('/security/pipeline?module=attachment');
  });

  it('renders all 5 stage cards default-expanded (gap 2.1/2.2)', () => {
    const authoritative = baseAnalysis();
    authoritative.stages[1].status = 'suspicious';
    authoritative.stages[1].checks[1] = { key: 'authSpoofing', status: 'suspicious', ruleIds: [22] };
    render(wrap(<TestAnalysisSection detail={baseDetail()} analysis={authoritative} aiEnabled events={[]} />));
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`analysis-stage-${n}`)).toBeInTheDocument();
      // Inline hit-strategy detail is present without any click (default expanded).
      expect(screen.getByTestId(`analysis-stage-${n}-detail`)).toBeInTheDocument();
    }
    // 阶段 4/5 已交换（GT-12575 与策略流水线对齐）：智能体研判(ai)为阶段 4，
    // 是命中阶段 -- 威胁 badge；阶段 2 可疑，阶段 1 通过。
    expect(screen.getByTestId('analysis-stage-4').textContent).toContain('威胁');
    expect(screen.getByTestId('analysis-stage-1').textContent).toContain('通过');
    expect(screen.getByTestId('analysis-check-authSpoofing')).toHaveTextContent('可疑');
    expect(screen.getByTestId('analysis-stage-2-detail')).not.toHaveTextContent('#22');

    // Clicking a card collapses only that card's own detail.
    fireEvent.click(screen.getByTestId('analysis-stage-1'));
    expect(screen.queryByTestId('analysis-stage-1-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-stage-2-detail')).toBeInTheDocument();
  });

  it('renders each stage connector as one continuous decorative path', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));

    for (const n of [1, 2, 3, 4]) {
      const connector = screen.getByTestId(`analysis-stage-connector-${n}`);
      expect(connector.tagName).toBe('svg');
      expect(connector).toHaveAttribute('aria-hidden', 'true');
      expect(connector.querySelectorAll('path')).toHaveLength(1);
    }
  });

  it('uses the policy pipeline canonical names for shared security modules', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));

    const expectedNames = {
      authSpoofing: '身份认证与仿冒检测',
      attachmentSecurity: '附件安全检测',
      urlProtection: 'URL检测与防护',
      mailMarking: '邮件标记与声明',
    };
    for (const [key, name] of Object.entries(expectedNames)) {
      expect(screen.getByTestId(`analysis-check-${key}`)).toHaveTextContent(name);
    }
  });

  it('hides advanced rules from the disposal analysis pipeline and recalculates the visible stage (GT-14247)', () => {
    const authoritative = baseAnalysis();
    authoritative.stages = authoritative.stages.map((stage) => stage.key !== 'comprehensive' ? stage : ({
      ...stage,
      status: 'threat',
      checks: stage.checks.map((check) => check.key === 'advancedRules'
        ? { ...check, status: 'threat' as const }
        : check),
    }));

    render(wrap(
      <AnalysisSection
        detail={baseDetail()}
        analysis={authoritative}
        aiEnabled
        visibleAgentAccess={ALL_AGENT_ACCESS}
        events={[]}
      />,
    ));

    const comprehensive = screen.getByTestId('analysis-stage-5');
    expect(comprehensive).toHaveTextContent('2 项策略');
    expect(comprehensive).toHaveTextContent('通过');
    expect(comprehensive).not.toHaveTextContent('威胁');
    expect(screen.queryByTestId('analysis-check-advancedRules')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-check-similarityDetection')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-check-mailMarking')).toBeInTheDocument();
  });

  it('keeps advanced rules visible when the product form switcher is enabled (GT-14247)', () => {
    productFormState.switcherEnabled = true;
    const authoritative = baseAnalysis();
    authoritative.stages = authoritative.stages.map((stage) => stage.key !== 'comprehensive' ? stage : ({
      ...stage,
      status: 'threat',
      checks: stage.checks.map((check) => check.key === 'advancedRules'
        ? { ...check, status: 'threat' as const }
        : check),
    }));

    render(wrap(
      <AnalysisSection
        detail={baseDetail()}
        analysis={authoritative}
        aiEnabled
        visibleAgentAccess={ALL_AGENT_ACCESS}
        events={[]}
      />,
    ));

    const comprehensive = screen.getByTestId('analysis-stage-5');
    expect(comprehensive).toHaveTextContent('3 项策略');
    expect(comprehensive).toHaveTextContent('威胁');
    expect(screen.getByTestId('analysis-check-advancedRules')).toHaveTextContent('高级过滤规则');
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

  it('uses the projected total elapsed time instead of summing detail.stage_timings', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} analysis={baseAnalysis({ total_elapsed_ms: 777 })} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-total-elapsed').textContent).toContain('总耗时: 777ms');
    expect(screen.getByTestId('analysis-verdict-card').textContent).toContain('耗时: 777ms');
  });

  it('verdict card 时间线 button expands and scrolls to the post-detection timeline', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={sampleEvents()} />));
    expect(screen.getByTestId('analysis-timeline-body')).toBeInTheDocument();

    // 默认已展开时，入口用于定位，不能反向把目标收起。
    fireEvent.click(screen.getByTestId('analysis-verdict-timeline-btn'));
    expect(screen.getByTestId('analysis-timeline-body')).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

    // 用户从时间线标题收起后，入口应先恢复展开，再定位到目标。
    fireEvent.click(screen.getByTestId('analysis-timeline-toggle'));
    expect(screen.queryByTestId('analysis-timeline-body')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('analysis-verdict-timeline-btn'));
    expect(screen.getByTestId('analysis-timeline-body')).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
  });

  it('timeline renders events at L1 (summary only) and event detail at L2 on click', () => {
    // 时间线默认展开，无需先点 toggle。
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={sampleEvents()} />));

    const eventRow = screen.getByTestId('analysis-timeline-event-event-501');
    expect(eventRow).toBeInTheDocument();
    expect(eventRow.textContent).toContain('victim@company.com');
    // L1: no detail (操作对象/操作类型/执行结果) until the card itself is clicked.
    expect(screen.queryByTestId('analysis-timeline-event-event-501-detail')).not.toBeInTheDocument();

    fireEvent.click(eventRow);
    const detail = screen.getByTestId('analysis-timeline-event-event-501-detail');
    // 优化五：标签从召回专用（召回范围/召回动作）改为通用（操作对象/操作类型），
    // 因为时间线要承载召回之外的处置动作；「查看召回日志」同步改为「查看原始日志」。
    expect(detail.textContent).toContain('操作对象');
    expect(detail.textContent).toContain('操作类型');
    expect(detail.textContent).toContain('执行结果');
    expect(screen.getByTestId('analysis-timeline-event-event-501-view-log')).toHaveTextContent('查看原始日志');
  });

  it('GT-13657: gives the timeline a distinct start, aligned rail, and event cards', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={sampleEvents()} />));

    expect(screen.getByTestId('analysis-timeline-start-node')).toHaveClass('h-6', 'w-6', 'border-2');
    expect(screen.getByTestId('analysis-timeline-start-card')).toHaveClass('border-emerald-200', 'bg-emerald-50/50');
    expect(screen.getByTestId('analysis-timeline-start-connector')).toBeInTheDocument();

    expect(screen.getByTestId('analysis-timeline-event-event-501-node')).toHaveClass('h-4', 'w-4', 'ring-4');
    expect(screen.getByTestId('analysis-timeline-event-event-501-connector-in')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-timeline-event-event-501')).toHaveClass('bg-card', 'shadow-sm');
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

    expect(screen.queryByTestId('analysis-timeline-event-event-700')).not.toBeInTheDocument();
    expect(screen.getByTestId('analysis-timeline-event-event-701')).toHaveTextContent('旁路处置');
    expect(screen.getByText('1 个事件')).toBeInTheDocument();
  });

  it('keeps every workflow transition even when they share one operation id', () => {
    const detail = baseDetail({
      post_detection_timeline: {
        schema_version: 1,
        events: [
          {
            event_id: 'workflow-started',
            event_type: 'workflow_action',
            occurred_at: '2026-07-20T09:20:00.000Z',
            operation_id: 'audit-1',
            revision: 1,
            source: 'workflow.audit',
            status: 'rejected',
            display: true,
          },
          {
            event_id: 'workflow-finished',
            event_type: 'workflow_action',
            occurred_at: '2026-07-20T09:21:00.000Z',
            operation_id: 'audit-1',
            revision: 2,
            source: 'workflow.audit',
            status: 'released',
            display: true,
          },
        ],
      },
    });
    render(wrap(<AnalysisSection detail={detail} analysis={baseAnalysis()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-timeline-event-workflow-started')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-timeline-event-workflow-finished')).toBeInTheDocument();
    expect(screen.getByText('2 个事件')).toBeInTheDocument();
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
    expect(screen.queryByTestId('analysis-timeline-event-event-601')).not.toBeInTheDocument();
    const row = screen.getByTestId('analysis-timeline-event-event-602');
    fireEvent.click(row);
    expect(screen.getByTestId('analysis-timeline-event-event-602-detail').textContent).toContain('超时未回执');
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
    expect(screen.queryByTestId('analysis-timeline-event-event-602')).not.toBeInTheDocument();
    const row = screen.getByTestId('analysis-timeline-event-event-603');
    fireEvent.click(row);
    expect(screen.getByTestId('analysis-timeline-event-event-603-detail').textContent).toContain('成功');
  });

  it('shows 暂无事件 when there are no events', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-timeline-empty')).toHaveTextContent('暂无事件');
  });

  it('does not fall back to generic delivery events when the mail timeline is absent', () => {
    const detail = baseDetail();
    render(wrap(
      <AnalysisSection
        detail={detail}
        analysis={baseAnalysis()}
        aiEnabled
        events={sampleEvents()}
      />,
    ));
    expect(screen.getByTestId('analysis-timeline-empty')).toHaveTextContent('暂无事件');
    expect(screen.queryByTestId('analysis-timeline-event-event-501')).not.toBeInTheDocument();
  });

  it.each([
    ['explicit null', null],
    ['empty document', { schema_version: 1 as const, events: [] }],
  ])('renders %s timeline as empty without falling back to delivery events', (_label, timeline) => {
    const detail = { ...baseDetail(), post_detection_timeline: timeline };
    render(wrap(
      <AnalysisSection
        detail={detail}
        analysis={baseAnalysis()}
        aiEnabled
        events={sampleEvents()}
      />,
    ));
    expect(screen.getByTestId('analysis-timeline-empty')).toHaveTextContent('暂无事件');
    expect(screen.queryByTestId('analysis-timeline-event-event-501')).not.toBeInTheDocument();
  });

  it('处置依据 header has the action badge top-right and a combined rule link (gap 2.7)', () => {
    render(wrap(<TestAnalysisSection detail={baseDetail()} aiEnabled events={[]} />));
    expect(screen.getByTestId('analysis-disposal-basis-action')).toHaveTextContent('隔离');

    const ruleLink = screen.getByTestId('analysis-disposal-basis-rule-link');
    expect(ruleLink.textContent).toContain('高管仿冒识别');
    expect(ruleLink.textContent).toContain('AI-SPOOF-012');
    expect(ruleLink).toHaveAttribute('title', '前往策略配置页');

    fireEvent.click(ruleLink);
    expect(routerPush).toHaveBeenCalledWith(
      '/agent-center/overview?agent=spoofing&tab=sender-name&rule_id=AI-SPOOF-012',
    );
  });
});
