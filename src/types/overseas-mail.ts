export type OverseasMailDirection = 'inbound' | 'outbound' | 'internal';

export type OverseasMailAction = 'accept' | 'quarantine' | 'audit' | 'reject' | 'discard';

export interface OverseasMailDirConfig {
  enabled: boolean;
  action: OverseasMailAction;
  mark_enabled?: boolean;
}

export interface OverseasMailConfigResponse {
  directions: Record<OverseasMailDirection, OverseasMailDirConfig>;
  hit_stats: OverseasMailHitStats;
  /** GT-12114 Q-10：乐观锁版本，保存时回传 expected_version。 */
  version?: string;
}

export interface OverseasMailHitStats {
  inbound: number;
  outbound: number;
  internal: number;
}

export interface OverseasMailConfig {
  directions: Record<OverseasMailDirection, OverseasMailDirConfig>;
}

export interface GeoIpRule {
  id: number;
  tenant_id?: number;
  ip_range: string;
  region_code: string;
  region_name: string;
  created_at?: string;
  updated_at: string;
}

export interface GeoIpRuleListResponse {
  items: GeoIpRule[];
  total: number;
  page: number;
  page_size: number;
}

export const OverseasMailActionLabels: Record<OverseasMailAction, string> = {
  accept: 'overseasMail.actionDeliver',
  quarantine: 'overseasMail.actionQuarantine',
  audit: 'overseasMail.actionReview',
  reject: 'overseasMail.actionBlock',
  discard: 'overseasMail.actionDrop',
};

export const OverseasMailActionDescriptions: Record<OverseasMailAction, string> = {
  accept: 'overseasMail.actionDeliverDesc',
  quarantine: 'overseasMail.actionQuarantineDesc',
  audit: 'overseasMail.actionReviewDesc',
  reject: 'overseasMail.actionBlockDesc',
  discard: 'overseasMail.actionDropDesc',
};

/** Placeholder shown in the action column while a direction is switched off. */
export const OVERSEAS_MAIL_ACTION_NONE = '--';

/**
 * Directions ship switched off, so a fresh gateway performs no geo filtering
 * until an operator opts in. The pre-selected action is a real one all the
 * same: flipping a direction on must do the protective thing the operator
 * meant, rather than silently resolving to `accept`, which is
 * indistinguishable from leaving the direction off. `reject` matches the
 * inbound default (see `defaultOverseasMailInboundDirConfig`) and the demo
 * prototype's default for outbound/internal, keeping the three directions'
 * pre-selected action consistent.
 */
export function defaultOverseasMailDirConfig(): OverseasMailDirConfig {
  return { enabled: false, action: 'reject', mark_enabled: false };
}

/**
 * Inbound ships switched on with the strict `reject` action: unsolicited
 * overseas mail into the org is the highest-risk direction, so a fresh
 * gateway protects it out of the box rather than waiting for an operator to
 * opt in (unlike outbound/internal, which stay off — see
 * `defaultOverseasMailDirConfig`).
 */
export function defaultOverseasMailInboundDirConfig(): OverseasMailDirConfig {
  return { enabled: true, action: 'reject', mark_enabled: false };
}

export function defaultOverseasMailConfig(): OverseasMailConfig {
  return {
    directions: {
      inbound: defaultOverseasMailInboundDirConfig(),
      outbound: defaultOverseasMailDirConfig(),
      internal: defaultOverseasMailDirConfig(),
    },
  };
}

/**
 * How one direction row renders. A switched-off direction is skipped entirely
 * by the milter, so showing its stored action (and letting it be edited) states
 * an effect that never happens.
 */
export interface OverseasMailDirectionView {
  /** i18n key for the action column, or the literal `--` placeholder. */
  actionLabel: string;
  /** i18n key describing what the direction does to matching mail. */
  effectKey: string;
  /** Whether the action dropdown accepts input. */
  actionEditable: boolean;
  /** Whether the row is rendered in a muted style. */
  muted: boolean;
}

export function overseasMailDirectionView(dir: OverseasMailDirConfig | undefined): OverseasMailDirectionView {
  const config = dir ?? defaultOverseasMailDirConfig();
  if (!config.enabled) {
    return {
      actionLabel: OVERSEAS_MAIL_ACTION_NONE,
      effectKey: 'overseasMail.effectSkipped',
      actionEditable: false,
      muted: true,
    };
  }
  return {
    actionLabel: OverseasMailActionLabels[config.action],
    effectKey: OverseasMailActionDescriptions[config.action],
    actionEditable: true,
    muted: false,
  };
}

/**
 * GT-12114 Q-04（产品拍板）：三个方向全部启用且动作均为阻断类（reject/discard）
 * 时，所有海外邮件流都会被切断——保存前必须弹窗提示并禁止保存。
 * 任一方向禁用（该方向邮件正常放行）或使用非阻断动作则不构成"全阻断"。
 */
export function isOverseasBlockAllConfig(config: OverseasMailConfig): boolean {
  const dirs = Object.values(config.directions);
  if (dirs.length === 0) return false;
  return dirs.every((d) => d.enabled && (d.action === 'reject' || d.action === 'discard'));
}
