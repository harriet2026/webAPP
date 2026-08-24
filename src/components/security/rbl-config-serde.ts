import type { DetectionProfile } from '@/lib/api/detection-profiles';
import type { RBLFilterRuleView, RBLFilterProductAction, RBLGreylistConfig } from '@/types/rbl-filter';

/** 本配置面板拥有的唯一 rbl_filter 规则。绝不触碰其他（用户自建）规则。 */
export const RBL_CANONICAL_RULE_NAME = '__rbl_default__';

/**
 * 即时处置动作：reject / quarantine / audit / discard。
 * greylist 已从即时动作中分离，作为独立策略通过 greylistEnabled 控制。
 */
export type RblImmediateAction = 'reject' | 'quarantine' | 'audit' | 'discard';

export interface RblConfig {
  enabled: boolean;
  servers: string[];
  timeout: string; // 秒，字符串形式以适配输入控件
  action: RblImmediateAction; // 即时处置动作：reject | quarantine | audit | discard
  greylistEnabled: boolean;   // 灰名单策略开关（独立于即时动作）
  greylist?: RBLGreylistConfig; // 仅当 greylistEnabled 为 true 时有意义
}

export interface GreylistFormConfig {
  mode: 'delay' | 'rateLimit';
  delaySeconds: string;
  windowSeconds: string;
  maxRequests: string;
  whitelistTTL: string;
  exemptAuthenticated: boolean;
  exemptWhitelisted: boolean;
  exemptInternal: boolean;
}

export type GreylistValidationError =
  | 'delay'
  | 'window'
  | 'windowBeforeDelay'
  | 'maxRequests'
  | 'ttl';

/** Mirrors the API's greylist numeric validation before the dialog is accepted. */
export function validateGreylistForm(config: GreylistFormConfig): GreylistValidationError | null {
  const delay = Number(config.delaySeconds);
  const windowSeconds = Number(config.windowSeconds);
  const maxRequests = Number(config.maxRequests);
  const ttl = Number(config.whitelistTTL);

  if (config.mode === 'delay' && (!Number.isInteger(delay) || delay < 10)) return 'delay';
  if (!Number.isInteger(windowSeconds) || windowSeconds < 10) return 'window';
  if (config.mode === 'delay' && windowSeconds < delay) return 'windowBeforeDelay';
  if (config.mode === 'rateLimit' && (!Number.isInteger(maxRequests) || maxRequests < 1)) return 'maxRequests';
  if (!Number.isInteger(ttl) || ttl < 1) return 'ttl';
  return null;
}

export function mapGreylistConfig(config: GreylistFormConfig): RBLGreylistConfig {
  return {
    mode: config.mode,
    delay_seconds: Number(config.delaySeconds) || 0,
    window_seconds: Number(config.windowSeconds) || 0,
    max_requests: Number(config.maxRequests) || 0,
    whitelist_ttl: Number(config.whitelistTTL) || 0,
    exempt_authenticated: config.exemptAuthenticated,
    exempt_whitelisted: config.exemptWhitelisted,
    exempt_internal: config.exemptInternal,
  };
}

export function unmapGreylistConfig(config: RBLGreylistConfig): GreylistFormConfig {
  return {
    mode: config.mode || 'delay',
    delaySeconds: String(config.delay_seconds ?? 600),
    windowSeconds: String(config.window_seconds ?? 600),
    maxRequests: String(config.max_requests ?? 5),
    whitelistTTL: String(config.whitelist_ttl ?? 24),
    exemptAuthenticated: config.exempt_authenticated ?? true,
    exemptWhitelisted: config.exempt_whitelisted ?? true,
    exemptInternal: config.exempt_internal ?? false,
  };
}

interface RblProfileValue {
  timeout_seconds?: number;
  retry_count?: number;
}

export function parseProfileValue(value?: string): RblProfileValue {
  if (!value) return {};
  try {
    const v = JSON.parse(value);
    return typeof v === 'object' && v !== null ? (v as RblProfileValue) : {};
  } catch {
    return {};
  }
}

export function findCanonicalRule(rules: RBLFilterRuleView[]): RBLFilterRuleView | undefined {
  return rules.find((r) => r.name === RBL_CANONICAL_RULE_NAME && r.match_mode === 'any');
}

export function parseRblConfig(
  profiles: DetectionProfile[],
  rules: RBLFilterRuleView[],
  fallback: { timeout: string; action: RblImmediateAction },
): RblConfig {
  const servers = profiles.map((p) => p.name);
  let timeout = fallback.timeout;
  for (const p of profiles) {
    const v = parseProfileValue(p.value);
    if (v.timeout_seconds != null) {
      timeout = String(v.timeout_seconds);
      break;
    }
  }
  const canonical = findCanonicalRule(rules);
  // greylist 作为独立策略开关回填，即时动作回落为 reject。
  const rawAction = canonical?.product_action ?? fallback.action;
  const isLegacyGreylist = (rawAction as string) === 'greylist';
  const action: RblImmediateAction = isLegacyGreylist ? 'reject' : (rawAction as RblImmediateAction);
  return {
    // The global rbl_filter module is enabled independently by
    // ModuleMasterSwitch.  A missing canonical rule means this is the first
    // configuration, not that the form should be disabled or saved inactive.
    enabled: canonical?.is_active ?? true,
    servers,
    timeout,
    action,
    greylistEnabled: isLegacyGreylist || !!(canonical?.greylist),
    greylist: canonical?.greylist,
  };
}

export function buildProfileValue(timeout: string): string {
  const n = Number(timeout);
  return JSON.stringify({ timeout_seconds: Number.isFinite(n) && n > 0 ? n : 5, retry_count: 1 });
}

export interface RblSaveDiff {
  serversToAdd: string[];
  profileIdsToDelete: number[];
  profilesToRetime: number[];
  /** 写入 API 的 product_action：greylistEnabled=true 时固定写 'greylist'，否则写即时动作 */
  action: RBLFilterProductAction;
  greylist?: RBLGreylistConfig;
  enabled: boolean;
}

export function diffRblConfig(
  profiles: DetectionProfile[],
  draft: RblConfig,
  timeoutChanged: boolean,
): RblSaveDiff {
  const byName = new Map(profiles.map((p) => [p.name, p]));
  const draftSet = new Set(draft.servers);
  const serversToAdd = draft.servers.filter((s) => !byName.has(s));
  const profileIdsToDelete = profiles.filter((p) => !draftSet.has(p.name)).map((p) => p.id);
  const profilesToRetime = timeoutChanged
    ? profiles.filter((p) => draftSet.has(p.name)).map((p) => p.id)
    : [];
  // 灰名单开启时 API action 保持 'greylist'，关闭时使用即时动作值
  const apiAction: RBLFilterProductAction = draft.greylistEnabled ? 'greylist' : draft.action;
  return {
    serversToAdd,
    profileIdsToDelete,
    profilesToRetime,
    action: apiAction,
    greylist: draft.greylistEnabled ? draft.greylist : undefined,
    enabled: draft.enabled,
  };
}
