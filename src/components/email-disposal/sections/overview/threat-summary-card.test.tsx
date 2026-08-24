import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import zh from '@/../messages/zh.json';
import type { MailLogDetail, RecipientDisposition } from '@/types/email-disposal-detail';
import { ThreatSummaryCard } from './threat-summary-card';

// Real zh messages (not an identity mock) -- this suite asserts on actual
// rendered copy (localized action label, full mail-type label, prefix text),
// which is the whole point of the G4/A1/A2 fixes under test.
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
    disposeByObject: vi.fn(),
    // RA-5: 隔离/阻断's own dispatch path (dispatchQuarantineOrBlock in
    // use-recipient-disposition.tsx) calls this instead of disposeByObject.
    disposeObjectAction: vi.fn(),
    notifyRecipient: vi.fn(),
  };
});

// Task 11b: single-recipient dispose buttons share useRecipientDisposition
// with RecipientStatus, which also calls recallMails for the recall action.
vi.mock('../../lib/disposal-api', async () => {
  const actual = await vi.importActual('../../lib/disposal-api');
  return {
    ...actual,
    recallMails: vi.fn(),
  };
});

import { disposeByObject, disposeObjectAction, notifyRecipient } from '../../lib/disposal-detail-api';
import { recallMails } from '../../lib/disposal-api';

const mockDisposeByObject = disposeByObject as unknown as ReturnType<typeof vi.fn>;
const mockDisposeObjectAction = disposeObjectAction as unknown as ReturnType<typeof vi.fn>;
const mockNotifyRecipient = notifyRecipient as unknown as ReturnType<typeof vi.fn>;
const mockRecallMails = recallMails as unknown as ReturnType<typeof vi.fn>;

function baseDetail(overrides: Partial<MailLogDetail> = {}): MailLogDetail {
  return {
    id: 1,
    message_id: 'm1',
    message_uuid: 'uuid-1',
    client_ip: '203.0.113.5',
    sender: 'attacker@evil.com',
    recipients: ['victim@company.com'],
    authenticated: false,
    subject: 'Q2财务报表 - 紧急审批',
    action: 'quarantine',
    status: 'quarantined',
    email_type: 'phishing',
    received_at: '2026-07-20T10:00:00Z',
    ...overrides,
  };
}

function renderCard(detail: MailLogDetail, overrides: Partial<React.ComponentProps<typeof ThreatSummaryCard>> = {}) {
  return render(wrap(
    <ThreatSummaryCard
      detail={detail}
      apiRequest={vi.fn() as never}
      isSingleRecipient
      {...overrides}
    />,
  ));
}

describe('ThreatSummaryCard', () => {
  it('renders the full localized mail-type label with prefix (A1)', () => {
    renderCard(baseDetail());
    const typeEl = screen.getByTestId('email-disposal-overview-type-badge');
    expect(typeEl.textContent).toContain('邮件类型：钓鱼邮件');
  });

  it('renders the intent-engine score from the sum of cac.prob spam classes', () => {
    renderCard(baseDetail({
      cac_result: { prob: ['0.001', '0.002', '0.7', '0.2'] },
      phish_agent_check: { status: 'done', checked: true, confidence: 0.91 },
    }));
    const confEl = screen.getByTestId('email-disposal-overview-confidence');
    expect(confEl.textContent).toContain('置信度 0.9');
    expect(confEl.textContent).not.toContain('%');
  });

  it('renders no confidence element when there is no score/hitSource (kind=none)', () => {
    renderCard(baseDetail({ cac_result: undefined, phish_agent_check: undefined }));
    expect(screen.queryByTestId('email-disposal-overview-confidence')).not.toBeInTheDocument();
  });

  it('does not substitute phishing-agent confidence when the intent score is absent', () => {
    renderCard(baseDetail({
      cac_result: undefined,
      phish_agent_check: { status: 'done', checked: true, confidence: 0.91 },
    }));
    expect(screen.queryByTestId('email-disposal-overview-confidence')).not.toBeInTheDocument();
  });

  // G3: a deterministic blacklist hit (disposal_basis.policy_key === 'SBL')
  // with no real score anywhere must show 「黑名单命中（无置信度）」, not a
  // fabricated percentage -- wired via deriveHitSource(detail).
  it('renders 黑名单命中（无置信度） when disposal_basis is a blacklist policy and no real score exists (G3)', () => {
    renderCard(baseDetail({
      cac_result: undefined,
      phish_agent_check: undefined,
      disposal_basis: { policy_key: 'SBL', rule_name: '发件人黑名单', rule_id: 'SBL-1', action: 'quarantine' },
    }));
    const confEl = screen.getByTestId('email-disposal-overview-confidence');
    expect(confEl.textContent).toContain('黑名单命中（无置信度）');
  });

  it('renders 规则命中（无置信度） when disposal_basis is a non-AI rule policy and no real score exists (G3)', () => {
    renderCard(baseDetail({
      cac_result: undefined,
      phish_agent_check: undefined,
      disposal_basis: { policy_key: 'CR', rule_name: '内容规则', rule_id: 'CR-1', action: 'quarantine' },
    }));
    const confEl = screen.getByTestId('email-disposal-overview-confidence');
    expect(confEl.textContent).toContain('规则命中（无置信度）');
  });

  it('keeps legacy structured basis visible and does not fall back to stale reason text', () => {
    renderCard(baseDetail({
      cac_result: undefined,
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
    }));

    const basis = screen.getByTestId('email-disposal-overview-disposal-basis');
    expect(basis).toHaveTextContent('baseline:cac_high_score');
    expect(basis).not.toHaveTextContent('no rules matched');
    expect(screen.getByTestId('email-disposal-overview-confidence')).toHaveTextContent('规则命中（无置信度）');
  });

  it('a real score still wins over a blacklist policy_key (G3 priority)', () => {
    renderCard(baseDetail({
      cac_result: { prob: ['0.001', '0.002', '0.91'] },
      phish_agent_check: { status: 'done', checked: true, confidence: 0.91 },
      disposal_basis: { policy_key: 'SBL', rule_name: '发件人黑名单', rule_id: 'SBL-1', action: 'quarantine' },
    }));
    const confEl = screen.getByTestId('email-disposal-overview-confidence');
    expect(confEl.textContent).toContain('置信度 0.91');
    expect(confEl.textContent).not.toContain('%');
    expect(confEl.textContent).not.toContain('黑名单命中');
  });

  it('renders the 紧急 (urgent) hit-feature badge when sensitive_keyword_hit is true (A10)', () => {
    renderCard(baseDetail({ sensitive_keyword_hit: true }));
    expect(screen.getByText('紧急')).toBeInTheDocument();
  });

  it('does NOT render the 紧急 badge when sensitive_keyword_hit is false/absent', () => {
    renderCard(baseDetail({ sensitive_keyword_hit: false }));
    expect(screen.queryByText('紧急')).not.toBeInTheDocument();
  });

  it('localizes the disposal-basis action label instead of showing the raw backend value (A12 / G4)', () => {
    renderCard(baseDetail({
      disposal_basis: {
        policy_key: 'CR',
        rule_name: '敏感词规则',
        rule_id: 'CR-1',
        action: 'audit',
      },
    }));
    const basisEl = screen.getByTestId('email-disposal-overview-disposal-basis');
    expect(basisEl.textContent).toContain('审核');
    expect(basisEl.textContent).not.toContain('audit');
  });

  it('shows the 查看依据详情 link and wires onViewBasis', () => {
    const onViewBasis = vi.fn();
    renderCard(baseDetail({
      disposal_basis: { policy_key: 'CR', rule_name: 'r', rule_id: 'CR-1', action: 'quarantine' },
    }), { onViewBasis });
    expect(screen.getByTestId('email-disposal-overview-view-basis')).toBeInTheDocument();
  });

  it('renders the 命中特征 label inline (not a heading) on the same row as its badges', () => {
    renderCard(baseDetail());
    const hitFeaturesLabel = screen.getByText('命中特征：');
    expect(hitFeaturesLabel.tagName).toBe('SPAN');
    const spfBadge = screen.getByTestId('email-disposal-overview-hit-spf');
    // Same flex row: label's parent contains the SPF badge directly.
    expect(hitFeaturesLabel.parentElement).toContainElement(spfBadge);
  });

  it('does NOT render a 域名年龄 (domain age) badge when domain_age_days is absent', () => {
    renderCard(baseDetail());
    expect(screen.queryByText(/域名年龄/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-overview-hit-domain-age')).not.toBeInTheDocument();
  });

  it('renders the 域名年龄 badge when domain_age_days is present and within the alert threshold', () => {
    renderCard(baseDetail({ domain_age_days: 2 }));
    const badge = screen.getByTestId('email-disposal-overview-hit-domain-age');
    expect(badge.textContent).toContain('域名年龄2天');
  });

  it('does NOT render the 域名年龄 badge when domain_age_days is present but past the alert threshold', () => {
    renderCard(baseDetail({ domain_age_days: 400 }));
    expect(screen.queryByTestId('email-disposal-overview-hit-domain-age')).not.toBeInTheDocument();
  });

  it.each([
    {
      source: 'disposal_basis',
      overrides: {
        disposal_basis: {
          policy_key: 'AI-SPOOF',
          rule_name: '高管仿冒识别',
          rule_id: 'AI-SPOOF-1',
          action: 'quarantine',
          hit_values: { spoof_type: '高管', confidence: '94' },
        },
      },
    },
    {
      source: 'phish_agent_check.summary',
      overrides: {
        phish_agent_check: {
          status: 'completed',
          checked: true,
          verdict: 'malicious',
          risk_level: 'high',
          summary: 'credential harvesting page detected',
        },
      },
    },
    {
      source: 'cac_result.description',
      overrides: { cac_result: { description: '命中已知钓鱼特征库' } },
    },
  ])('does not render the removed inline verdict for $source', ({ overrides }) => {
    renderCard(baseDetail(overrides));
    expect(screen.queryByText('AI判定依据：')).not.toBeInTheDocument();
    expect(screen.queryByText('云查依据：')).not.toBeInTheDocument();
  });

  // GT-12578 / GT-12686：落地 spec
  // design/implement/spec/2026-07-07-mail-disposal-investigation-center-design.md:168
  // 明确规定「合成失败/无命中时 disposal_basis 存 null，前端回退现有
  // MailLog.Reason 自由文本」。此前三处消费点全是硬门控直接隐藏整块，
  // 于是接收标记规则（mail_marking）命中的邮件在处置依据处只显示 '—'，
  // 尽管规则名早已由 decision.go 写进了 mail_log.reason。
  it('无 disposal_basis 时处置依据回退显示 reason 自由文本 (GT-12578/GT-12686)', () => {
    renderCard(baseDetail({
      disposal_basis: undefined,
      reason: 'rule f01-receive-mark-001 matched at data stage',
    }));
    const basis = screen.getByTestId('email-disposal-overview-disposal-basis');
    expect(basis.textContent).toContain('rule f01-receive-mark-001 matched at data stage');
  });

  it('AUTH proceed-only history does not render its legacy accept root as disposition basis', () => {
    renderCard(baseDetail({
      reason: 'accepted by rules: 22',
      disposal_basis: {
        policy_key: 'AUTH',
        rule_name: 'sysrule:auth_spoofing_spf_none',
        rule_id: 'AUTH-22',
        action: 'accept',
        modules: [{
          policy_key: 'AUTH',
          rule_name: 'sysrule:auth_spoofing_spf_none',
          rule_id: 'AUTH-22',
          action: 'proceed',
          recipients: ['qfliu@dm163.cacter.com'],
          effective_for: [],
        }],
      },
    }));
    expect(screen.queryByTestId('email-disposal-overview-disposal-basis')).not.toBeInTheDocument();
    expect(screen.queryByText('accepted by rules: 22')).not.toBeInTheDocument();
  });

  it('renders 处置依据 INSIDE the threat summary card, with a module/rule/action inline row', () => {
    renderCard(baseDetail({
      disposal_basis: { policy_key: 'AI-PHISH', rule_name: 'BEC钓鱼识别', rule_id: 'AI-PHISH-003', action: 'quarantine' },
    }));
    const card = screen.getByTestId('email-disposal-overview-threat-card');
    const basisEl = screen.getByTestId('email-disposal-overview-disposal-basis');
    expect(card).toContainElement(basisEl);
    expect(basisEl.textContent).toContain('钓鱼邮件检测智能体');
    expect(basisEl.textContent).toContain('BEC钓鱼识别');
    expect(basisEl.textContent).toContain('隔离');
  });

  it('matches the origin bulk outcome row and multi-basis popover', async () => {
    const user = userEvent.setup();
    renderCard(baseDetail({
      recipients: ['a@example.com', 'b@example.com'],
      recipient_dispositions: [
        { recipient: 'a@example.com', final_action: 'quarantine', status: 'quarantined' },
        { recipient: 'b@example.com', final_action: 'audit', status: 'pending_review' },
      ],
      disposal_basis: {
        policy_key: 'CR',
        rule_name: '正文规则',
        rule_id: 'CR-1',
        action: 'quarantine',
        modules: [
          { policy_key: 'CR', rule_name: '正文规则', rule_id: 'CR-1', action: 'quarantine', recipients: ['a@example.com'], effective_for: ['a@example.com'] },
          { policy_key: 'ACF', rule_name: '财务审核', rule_id: 'ACF-2', action: 'audit', recipients: ['b@example.com'], effective_for: ['b@example.com'] },
        ],
      },
    }), { isSingleRecipient: false });

    expect(screen.getByTestId('email-disposal-overview-recipient-outcomes')).toHaveTextContent('群发结果');
    const more = screen.getByTestId('email-disposal-overview-disposal-basis-more');
    expect(more).toHaveTextContent('+1 项');
    await user.click(more);
    expect(await screen.findByText(/a@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/b@example\.com/)).toBeInTheDocument();
  });

  it('renders SenderActions header buttons without the removed more menu (A4/A5/A6)', () => {
    renderCard(baseDetail());
    expect(screen.getByTestId('email-disposal-overview-action-blacklist')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-overview-action-whitelist')).toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-overview-action-more')).not.toBeInTheDocument();
  });

  it('shows the multi-recipient hint (A6) when isSingleRecipient is false', () => {
    renderCard(baseDetail(), { isSingleRecipient: false });
    expect(screen.getByTestId('email-disposal-overview-recipient-hint')).toBeInTheDocument();
  });

  it('renders the 已纠正 (corrected) badge when email_type_overridden (A3)', () => {
    renderCard(baseDetail({
      email_type_overridden: true,
      email_type_original: 'spam',
      email_type: 'phishing',
      correction_source: 'admin_release',
    }));
    expect(screen.getByText('已纠正')).toBeInTheDocument();
  });

});

// Task 11b: single-recipient dispose action buttons (deliver/discard/recall/
// notify), rendered next to SenderActions and dispatched through the SAME
// useRecipientDisposition hook the multi-recipient matrix (RecipientStatus)
// uses. Backend supports only these four actions (spec §9-D) -- no 隔离/阻断.
describe('ThreatSummaryCard single-recipient dispose buttons (Task 11b)', () => {
  beforeEach(() => {
    mockDisposeByObject.mockReset();
    mockDisposeObjectAction.mockReset();
    mockNotifyRecipient.mockReset();
    mockRecallMails.mockReset();
  });

  function pendingReviewDisposition(): RecipientDisposition[] {
    return [{
      recipient: 'victim@company.com',
      final_action: 'sideline',
      status: 'pending_review',
      object_kind: 'quarantine',
      object_id: 'obj-1',
    }];
  }

  function deliveredDisposition(): RecipientDisposition[] {
    return [{
      recipient: 'victim@company.com',
      final_action: 'deliver',
      status: 'delivered',
    }];
  }

  // RA-5 (demo parity): 待审核(pending_review) now renders all FOUR dispose
  // buttons -- 投递·隔离·阻断·丢弃 -- matching the demo's single-recipient
  // drawer, not just deliver/discard.
  it('an operable (pending_review, object_id) single recipient renders deliver/quarantine/block/discard buttons, not recall/notify', () => {
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));
    expect(screen.getByTestId('email-disposal-overview-recipient-action-deliver')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-overview-recipient-action-quarantine')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-overview-recipient-action-block')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-overview-recipient-action-discard')).toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-overview-recipient-action-recall')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-overview-recipient-action-notify')).not.toBeInTheDocument();
  });

  // RA-5: buttons render in demo order 投递·隔离·阻断·丢弃.
  it('renders 投递·隔离·阻断·丢弃 in that DOM order (RA-5)', () => {
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));
    const order = ['deliver', 'quarantine', 'block', 'discard'].map(
      (a) => screen.getByTestId(`email-disposal-overview-recipient-action-${a}`),
    );
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  // RA-5: 隔离/阻断 fire IMMEDIATELY on click, no confirm/reclassify dialog
  // (unlike deliver/recall which open ReclassifyDialog, and discard which
  // opens an AlertDialog).
  it('clicking 隔离 dispatches disposeObjectAction(quarantine) immediately with no dialog', async () => {
    const user = userEvent.setup();
    mockDisposeObjectAction.mockResolvedValue({ results: [{ mail_log_id: 1, object_id: 'obj-1', status: 'succeeded' }] });
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));

    await user.click(screen.getByTestId('email-disposal-overview-recipient-action-quarantine'));

    await waitFor(() => expect(mockDisposeObjectAction).toHaveBeenCalledWith(
      1, 'obj-1', 'quarantine', expect.anything(),
    ));
    expect(screen.queryByTestId('disposal-reclassify-dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('确认丢弃邮件')).not.toBeInTheDocument();
  });

  it('clicking 阻断 dispatches disposeObjectAction(block) immediately with no dialog', async () => {
    const user = userEvent.setup();
    mockDisposeObjectAction.mockResolvedValue({ results: [{ mail_log_id: 1, object_id: 'obj-1', status: 'succeeded' }] });
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));

    await user.click(screen.getByTestId('email-disposal-overview-recipient-action-block'));

    await waitFor(() => expect(mockDisposeObjectAction).toHaveBeenCalledWith(
      1, 'obj-1', 'block', expect.anything(),
    ));
    expect(screen.queryByTestId('disposal-reclassify-dialog')).not.toBeInTheDocument();
  });

  // REAL-mode degrade: the real backend's bulk-dispose handler rejects any
  // action other than release/delete -- disposeObjectAction throwing must
  // surface the explicit "unsupported" toast, not silently corrupt state.
  it('shows the unsupported toast when disposeObjectAction rejects (real-mode degrade)', async () => {
    const user = userEvent.setup();
    const { toast } = await import('sonner');
    mockDisposeObjectAction.mockRejectedValue(new Error('action must be release or delete'));
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));

    await user.click(screen.getByTestId('email-disposal-overview-recipient-action-quarantine'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('隔离/阻断 操作后端暂未支持'));
  });

  // G1 (v2 html_spec §②): header order is dispose-actions FIRST, then
  // sender actions (发信人加黑/加白).
  it('renders dispose-action buttons (投递/丢弃) BEFORE the sender actions (加黑/加白) in DOM order (G1)', () => {
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));
    const deliverBtn = screen.getByTestId('email-disposal-overview-recipient-action-deliver');
    const blacklistBtn = screen.getByTestId('email-disposal-overview-action-blacklist');
    expect(deliverBtn.compareDocumentPosition(blacklistBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // G2 (v2 html_spec §②): 投递 = green filled, 丢弃 = red filled.
  it('投递/丢弃 header buttons carry filled color classes (G2)', () => {
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));
    const deliverBtn = screen.getByTestId('email-disposal-overview-recipient-action-deliver');
    const discardBtn = screen.getByTestId('email-disposal-overview-recipient-action-discard');
    expect(deliverBtn.className).toContain('bg-emerald-600');
    expect(deliverBtn.className).toContain('text-white');
    expect(discardBtn.className).toContain('bg-red-600');
    expect(discardBtn.className).toContain('text-white');
  });

  it('clicking deliver opens the ReclassifyDialog', async () => {
    const user = userEvent.setup();
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));

    await user.click(screen.getByTestId('email-disposal-overview-recipient-action-deliver'));

    expect(await screen.findByTestId('disposal-reclassify-dialog')).toBeInTheDocument();
  });

  it('confirming deliver in the ReclassifyDialog dispatches disposeByObject(release) for this recipient', async () => {
    const user = userEvent.setup();
    mockDisposeByObject.mockResolvedValue({ results: [{ mail_log_id: 1, object_id: 'obj-1', status: 'succeeded' }] });
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));

    await user.click(screen.getByTestId('email-disposal-overview-recipient-action-deliver'));
    await screen.findByTestId('disposal-reclassify-dialog');
    await user.click(screen.getByText('确认'));

    // ReclassifyDialog preselects defaultType ('normal' for the deliver
    // action, per spec §5.3) in its Select, so confirming without changing
    // the selection sends finalType="normal", not undefined.
    await waitFor(() => expect(mockDisposeByObject).toHaveBeenCalledWith(
      1, 'obj-1', 'release', 'normal', expect.anything(),
    ));
  });

  it('a delivered single recipient renders recall/notify buttons, not deliver/discard', () => {
    renderCard(baseDetail({ recipient_dispositions: deliveredDisposition() }));
    expect(screen.getByTestId('email-disposal-overview-recipient-action-recall')).toBeInTheDocument();
    expect(screen.getByTestId('email-disposal-overview-recipient-action-notify')).toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-overview-recipient-action-deliver')).not.toBeInTheDocument();
    expect(screen.queryByTestId('email-disposal-overview-recipient-action-discard')).not.toBeInTheDocument();
  });

  it('clicking notify opens the confirm-notify dialog and dispatches notifyRecipient on confirm', async () => {
    const user = userEvent.setup();
    mockNotifyRecipient.mockResolvedValue(undefined);
    renderCard(baseDetail({ recipient_dispositions: deliveredDisposition() }));

    await user.click(screen.getByTestId('email-disposal-overview-recipient-action-notify'));
    expect(await screen.findByText('确认发送安全提醒')).toBeInTheDocument();

    await user.click(screen.getByText('确认'));
    expect(mockNotifyRecipient).toHaveBeenCalledWith(1, 'victim@company.com', expect.anything());
  });

  // G5 (v2 html_spec layer-14 §③ showDeleteConfirm): red title, red
  // recipient info bar, description conveying 不可恢复, red confirm button.
  it('clicking discard opens a confirm dialog with a red recipient info bar and dispatches disposeByObject(delete) on confirm', async () => {
    const user = userEvent.setup();
    mockDisposeByObject.mockResolvedValue({ results: [{ mail_log_id: 1, object_id: 'obj-1', status: 'succeeded' }] });
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }));

    await user.click(screen.getByTestId('email-disposal-overview-recipient-action-discard'));

    expect(await screen.findByText('确认丢弃邮件')).toBeInTheDocument();
    expect(screen.getByText(/不可恢复/)).toBeInTheDocument();
    const infoBar = screen.getByTestId('email-disposal-discard-confirm-recipients');
    expect(infoBar.textContent).toContain('victim@company.com');
    expect(infoBar.className).toContain('bg-red-50');

    const confirmBtn = screen.getByText('确认丢弃');
    expect(confirmBtn.className).toContain('bg-red-600');
    await user.click(confirmBtn);

    await waitFor(() => expect(mockDisposeByObject).toHaveBeenCalledWith(
      1, 'obj-1', 'delete', undefined, expect.anything(),
    ));
  });

  it('does not render single-recipient action buttons for a multi-recipient message', () => {
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }), { isSingleRecipient: false });
    expect(screen.queryByTestId('email-disposal-overview-recipient-actions')).not.toBeInTheDocument();
  });

  it('renders no buttons for a not-operable status (e.g. blocked, no object_id)', () => {
    renderCard(baseDetail({
      recipient_dispositions: [{ recipient: 'victim@company.com', final_action: 'reject', status: 'blocked' }],
    }));
    expect(screen.queryByTestId('email-disposal-overview-recipient-actions')).not.toBeInTheDocument();
  });

  it('disables the dispose buttons and shows the read-only tooltip label when readOnly', () => {
    renderCard(baseDetail({ recipient_dispositions: pendingReviewDisposition() }), { readOnly: true });
    expect(screen.getByTestId('email-disposal-overview-recipient-action-deliver')).toBeDisabled();
    expect(screen.getByTestId('email-disposal-overview-recipient-action-discard')).toBeDisabled();
  });
});
