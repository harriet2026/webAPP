import type { CACResult, EmailType, MailLogDetail } from '@/types/email-disposal-detail';
import { isAllowList } from './disposal-basis-config';

export type ThreatLevel = 'high' | 'medium' | 'low' | 'none';

export function deriveThreatLevel(cac?: CACResult): ThreatLevel {
  const t = cac?.int_tag ?? 0;
  if (t >= 5) return 'high';
  if (t >= 3) return 'medium';
  if (t >= 1) return 'low';
  return 'none';
}

export const THREAT_STYLES: Record<ThreatLevel, { bg: string; text: string; border: string }> = {
  high:   { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  medium: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  low:    { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
  none:   { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200' },
};

// Maps the phish agent's own risk_level (internal/models.InvestigationRiskLevel:
// low/medium/high/critical) to ThreatLevel. Returns null for an absent/
// unrecognized value so the caller can fall back to the cac_result-derived
// threat -- review finding: the AI verdict block's headline threat badge was
// ALWAYS cac_result-derived even when a real phish-agent verdict/risk_level
// was available, so it could disagree with the AI agent's own conclusion.
export function derivePhishAgentThreatLevel(riskLevel?: string): ThreatLevel | null {
  switch (riskLevel) {
    case 'critical':
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return null;
  }
}

export type MailType = 'normal' | 'spam' | 'phishing';

export function deriveMailType(cac: CACResult | undefined, action: string): MailType {
  const tag = (cac?.tag ?? '').toLowerCase();
  if (tag.includes('phish')) return 'phishing';
  if (tag.includes('spam') || tag.includes('market')) return 'spam';
  if (tag) return 'normal';
  if (action === 'reject' || action === 'bounce') return 'spam';
  return 'normal';
}

const INTENT_MAP: Record<string, string> = {
  nonspam: 'nonSpam',
  normalspam: 'spam',
  subscription: 'subscription',
  porngambling: 'pornGambling',
  political: 'political',
  virus: 'virus',
  phishing: 'phishing',
  socialengineering: 'socialEngineering',
  malware: 'malware',
  spam: 'spam',
  impersonation: 'impersonation',
  invoicefraud: 'invoiceFraud',
  accountcompromise: 'accountCompromise',
  accountcompromised: 'accountCompromise',
};

export function deriveIntentLabels(cac?: CACResult): string[] {
  const raw = (cac?.tag ?? '').trim();
  if (!raw) return [];
  const norm = raw.toLowerCase().replace(/[^a-z]/g, '');
  return [INTENT_MAP[norm] ?? raw];
}

// isNewSender reports whether this message is (within a small tolerance) the
// very first mail_log row ever seen from its Sender -- sender_first_seen_at
// is MIN(received_at) across that sender's own history, which necessarily
// includes this row, so a brand-new sender's first_seen_at equals its own
// received_at. The tolerance absorbs timestamp-precision/formatting drift
// between what the two fields serialize as, not a "recency window".
export function isNewSender(receivedAt?: string, firstSeenAt?: string): boolean {
  if (!receivedAt || !firstSeenAt) return false;
  const received = Date.parse(receivedAt);
  const firstSeen = Date.parse(firstSeenAt);
  if (Number.isNaN(received) || Number.isNaN(firstSeen)) return false;
  return Math.abs(received - firstSeen) < 60_000;
}

export function formatBytes(n?: number): string {
  if (n == null || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function tidOf(messageUuid?: string): string {
  if (!messageUuid) return '—';
  return messageUuid.replace(/-/g, '').slice(0, 8);
}

export function deriveDirection(authenticated: boolean, smtpUser?: string): 'inbound' | 'outbound' {
  return authenticated || !!smtpUser ? 'outbound' : 'inbound';
}

export type MailTypeTone = 'malicious' | 'graymail' | 'normal';

export const mailTypeConfig: Record<EmailType, { labelKey: string; tone: MailTypeTone; className: string }> = {
  phishing:            { labelKey: 'detail.mailType.phishing',           tone: 'malicious', className: 'bg-red-50 text-red-700 border-red-200' },
  virus:               { labelKey: 'detail.mailType.virus',              tone: 'malicious', className: 'bg-red-50 text-red-700 border-red-200' },
  account_compromised: { labelKey: 'detail.mailType.accountCompromised', tone: 'malicious', className: 'bg-red-50 text-red-700 border-red-200' },
  spoofing:            { labelKey: 'detail.mailType.spoofing',           tone: 'malicious', className: 'bg-red-50 text-red-700 border-red-200' },
  harmful:             { labelKey: 'detail.mailType.harmful',            tone: 'malicious', className: 'bg-red-50 text-red-700 border-red-200' },
  spam:                { labelKey: 'detail.mailType.spam',               tone: 'graymail',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  advertising:         { labelKey: 'detail.mailType.advertising',        tone: 'graymail',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  suspicious:          { labelKey: 'detail.mailType.suspicious',         tone: 'graymail',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  sensitive:           { labelKey: 'detail.mailType.sensitive',          tone: 'graymail',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
  normal:              { labelKey: 'detail.mailType.normal',             tone: 'normal',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  subscription:        { labelKey: 'detail.mailType.subscription',       tone: 'normal',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export function mailTypeTone(type: EmailType): MailTypeTone {
  return mailTypeConfig[type].tone;
}

// GT-12422: 改判下拉的展示顺序按原型（html_spec layer-6 opts-reclassify）：
// 正常 → 订阅 → 垃圾 → 广告 → 有害 → 钓鱼 → 账号被盗 → 可疑 → 身份仿冒 →
// 病毒 → 敏感。mailTypeConfig 的键序按 tone 分组（供徽标/图例使用），
// 与原型下拉顺序不同，勿直接 Object.keys 渲染下拉。
export const RECLASSIFY_TYPE_ORDER: EmailType[] = [
  "normal",
  "subscription",
  "spam",
  "advertising",
  "harmful",
  "phishing",
  "account_compromised",
  "suspicious",
  "spoofing",
  "virus",
  "sensitive",
];

// mailTypeConfig's labelKeys / correctionSourceLabelKey()'s return values are
// relative-to-`emailDisposal.detail` paths that literally start with the
// string "detail." (a DD-7 naming quirk) -- strip that prefix before handing
// them to a `useTranslations('emailDisposal.detail')` scoped `t`.
export function stripDetailPrefix(key: string): string {
  return key.slice('detail.'.length);
}

export function correctionSourceLabelKey(source?: string): string {
  switch (source) {
    case 'admin_release': return 'detail.correctionSource.adminRelease';
    case 'admin_recall':  return 'detail.correctionSource.adminRecall';
    case 'user_retrieval':return 'detail.correctionSource.userRetrieval';
    default: return 'detail.correctionSource.unknown';
  }
}

// mailTypeLabelKey resolves the (emailDisposal-scoped) i18n label key for a mail
// type via mailTypeConfig. The backend email_type is snake_case
// (`account_compromised`) while the message keys are camelCase
// (`detail.mailType.accountCompromised`), so building the key by string
// interpolation would miss the multi-word types. Falls back to the interpolated
// key for any unknown type. Shared so list column + detail views resolve labels
// identically (no snake/camel drift).
export function mailTypeLabelKey(type?: string): string {
  return (type && mailTypeConfig[type as EmailType]?.labelKey) || `detail.mailType.${type}`;
}

// hasObjectId is required (not defaulted to true) so every call site must
// consciously thread through whether the recipient group actually carries an
// addressable object_id -- review High-2: a quarantined/pending_review/
// sidelined group with no object_id has nothing for object-mode dispose to
// target, and silently exposing deliver/discard for it is what let the UI
// fall back to a whole-message dispose the operator never asked for.
export type ConfidenceKind = 'score' | 'blacklist' | 'rule' | 'none';

// CAC's prob array is indexed by intent: indexes 0/1 are non-spam classes and
// indexes >= 2 are spam classes. The intent engine's score is the sum of all
// spam-class probabilities, matching internal/cac.SpamProbability and the
// score used by intent-engine threshold rules. Reading prob[0] made malicious
// mail commonly render as "0%" because that slot is a non-spam probability.
export function deriveIntentEngineScore(cac?: CACResult): number | undefined {
  if (!cac?.prob || cac.prob.length < 3) return undefined;

  let score = 0;
  let hasNumericProbability = false;
  for (const item of cac.prob.slice(2)) {
    const value = item.trim() === '' ? Number.NaN : Number(item);
    if (!Number.isFinite(value)) continue;
    score += value;
    hasNumericProbability = true;
  }
  return hasNumericProbability ? score : undefined;
}

// The detail overview's confidence is specifically the intent-engine score.
// The phishing agent has a separate confidence display in the analysis stage
// and must not replace this value. Deterministic blacklist/rule hits without
// an intent score keep their fixed "no score" labels.
export function deriveConfidence(
  cac?: CACResult,
  hitSource?: string,
): { kind: ConfidenceKind; score?: number } {
  if (hitSource === 'blacklist') return { kind: 'blacklist' };
  if (hitSource === 'rule') return { kind: 'rule' };

  const score = deriveIntentEngineScore(cac);
  if (score === undefined || !Number.isFinite(score) || score < 0) return { kind: 'none' };

  // Keep the engine's original 0-1 score scale. Rounding only removes
  // floating-point addition noise; it is not a percentage conversion.
  return { kind: 'score', score: Number(score.toFixed(6)) };
}

// G3 (v2 html_spec §①): a deterministic (blacklist/rule) hit must show
// 「黑名单命中（无置信度）」/「规则命中（无置信度）」 instead of a fabricated
// score. This maps disposal_basis.policy_key (see lib/disposal-basis-config.ts's
// DISPOSAL_POLICY_MAP for the full catalogue) into the hitSource deriveConfidence
// expects.
//
// BLACKLIST_POLICY_KEYS -- sender/IP/user/RBL allow-block lists: these carry
// no probability at all, only a static list-membership hit.
const BLACKLIST_POLICY_KEYS = new Set(['SBL', 'IPBL', 'UBL', 'RBL']);

// AI_POLICY_KEYS -- the intelligent-analysis-layer agents (钓鱼/仿冒/回溯
// 智能体). Their own confidence is surfaced in the corresponding analysis
// result rather than being described as a deterministic rule hit here.
const AI_POLICY_KEYS = new Set(['AI-PHISH', 'AI-SPOOF', 'AI-TRACE']);

// Every other cataloged policy_key (IPFREQ/OVERSEAS/AUTH/BEHAVIOR/RCPT/CR/
// ATT-*/URL/INTENT/SIM/ACF, i.e. connection/identity/content/comprehensive
// stage deterministic rule engines -- explicitly incl. content rules/
// advanced-filter/overseas/intent/attachment/url per the task's mapping)
// is a non-AI rule-engine hit and maps to 'rule'.
export function deriveHitSource(detail: MailLogDetail): 'blacklist' | 'rule' | undefined {
  // A real intent-engine score already exists -- prefer it over any hitSource
  // label. deriveConfidence gives hitSource precedence, so this function must
  // defer before returning a policy-derived label.
  if (deriveIntentEngineScore(detail.cac_result) !== undefined) return undefined;

  const policyKey = detail.disposal_basis?.policy_key;
  if (!policyKey) return undefined;
  if (BLACKLIST_POLICY_KEYS.has(policyKey)) {
    // GT-12214: SBL/IPBL/UBL/RBL are shared black/allow-list policy_keys --
    // an allow-listed (accept) hit is not a blacklist hit at all, and there
    // is no allow-list confidence badge, so it must resolve to undefined
    // rather than the misleading 「黑名单命中（无置信度）」.
    if (isAllowList(detail.disposal_basis?.hit_values)) return undefined;
    return 'blacklist';
  }
  if (AI_POLICY_KEYS.has(policyKey)) return undefined;
  return 'rule';
}

// deriveDomainName resolves the sender display name shown next to the sender
// address in the overview module: prefer the explicit sender_name header,
// falling back to the local-part of the address (before "@") when absent.
export function deriveDomainName(sender: string, senderName?: string): string {
  return senderName || sender.split('@')[0];
}

// isSensitiveUrgent surfaces the backend-computed sensitive-keyword hit flag
// (detail.sensitive_keyword_hit) for the overview module's urgent-attention
// styling -- a thin named accessor so call sites don't read the raw boolean
// field directly and so absence (undefined, historical rows predating this
// field) reads as false rather than throwing/uncoercing.
export function isSensitiveUrgent(detail: MailLogDetail): boolean {
  return detail.sensitive_keyword_hit === true;
}

// deriveDomainAge surfaces the 命中特征「域名年龄」badge's underlying value: a
// newly-registered sender domain is a strong phishing/spoofing signal, so
// only a "new enough" age (<= DOMAIN_AGE_ALERT_THRESHOLD_DAYS, matching the
// demo's html_spec ≤7-day example) is worth surfacing as a hit feature --
// an old, established domain isn't a hit and should render nothing rather
// than a reassuring badge nobody asked for. Also collapses missing/invalid
// input (no whois/RDAP lookup available -- the real backend doesn't
// populate domain_age_days yet) to undefined so callers can render
// conditionally without their own null-checking.
export const DOMAIN_AGE_ALERT_THRESHOLD_DAYS = 7;

export function deriveDomainAge(detail: MailLogDetail): number | undefined {
  const days = detail.domain_age_days;
  if (days === undefined || days === null || Number.isNaN(days) || days < 0) return undefined;
  if (days > DOMAIN_AGE_ALERT_THRESHOLD_DAYS) return undefined;
  return days;
}

export function recipientActionsForStatus(status: string, hasObjectId: boolean): string[] {
  switch (status) {
    case 'delivered':
    case 'marked_delivered':
      // GT-12880 裁决"只要邮件还在就支持重投"：已投递邮件也提供重新投递
      //（弹窗对已成功收件人给重复邮件警示；原文超保留期由后端如实 404）。
      return ['recall', 'notify', 'redeliver'];
    case 'quarantined':
    case 'sidelined':
      // Already quarantined -- the demo prototype exposes only 投递/丢弃
      // here (隔离/阻断 don't apply to a recipient that's already sitting
      // in quarantine).
      return hasObjectId ? ['deliver', 'discard'] : [];
    // inbound_audit's real recipient status (review Medium-1): milter's
    // audit branch writes status="audited" / object_kind="inbound_audit",
    // and ApproveInboundAuditItemByObjectKey*/RejectInboundAuditItemByObjectKey*
    // already implement the same release/delete object-mode contract as
    // quarantine/sideline, so it belongs in the same operable bucket.
    //
    // 待审核(pending_review/audited) additionally exposes 隔离/阻断
    // (demo-parity, task RA-5): DEMO-PARITY buttons -- functional in MOCK
    // mode (immediate state change), gracefully degrading to a toast in
    // REAL mode since the backend action enum is only release|delete|recall
    // (see hooks/use-recipient-disposition.tsx's dispatchQuarantineOrBlock).
    case 'pending_review':
    case 'audited':
      return hasObjectId ? ['deliver', 'quarantine', 'block', 'discard'] : [];
    case 'deferred':
      // GT-12880 review F10：暂缓（milter tempfail，上游在自动重试）≠ 拦截族，
      // 不提供动作但展示层不得落"未保留原文"文案（recipient-status 单独分支）。
      return [];
    case 'delivery_failed':
      // GT-12880：投递失败 ≠ 拦截族（展示层见 SendReceiveContextCard 的
      // singleDeliveryFailed 分支）。B 部分落地重新投递入口。
      return ['redeliver'];
    default:
      // blocked/rejected/discarded (no original content) -- not operable,
      // per spec §5.3's canOperate=✗ row.
      return [];
  }
}
