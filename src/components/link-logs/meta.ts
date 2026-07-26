// Badge meta for link-protection logs. labelKey points into the `linkLogs.*`
// i18n namespace; color is a Tailwind utility string carried over from the
// prototype (design/origin/demo/components/link-logs/link-logs-meta.ts), per
// spec §八 "彩色徽标沿用原型配色". The `sandbox` stage is intentionally absent
// (spec §五: detection is three stages only).

export type TriggerStage = 'cloud_intel' | 'local_blacklist' | 'phishing_agent' | 'none';
export type LinkVerdict = 'malicious' | 'phishing' | 'suspicious' | 'safe';
export type FinalResult = 'alerted' | 'passed' | 'pending';
export type UserAction = 'proceeded' | 'abandoned' | 'skipped_deep_inspect' | 'none';
export type DeepInspectState = 'skipped' | 'running' | 'cached' | 'done' | 'timeout' | 'user_skipped';

interface BadgeMeta {
  labelKey: string;
  color: string;
}

export const STAGE_META: Record<TriggerStage, BadgeMeta> = {
  cloud_intel: { labelKey: 'linkLogs.stages.cloud_intel', color: 'bg-blue-100 text-blue-800' },
  local_blacklist: { labelKey: 'linkLogs.stages.local_blacklist', color: 'bg-amber-100 text-amber-800' },
  phishing_agent: { labelKey: 'linkLogs.stages.phishing_agent', color: 'bg-red-100 text-red-800' },
  none: { labelKey: 'linkLogs.stages.none', color: 'bg-gray-100 text-gray-700' },
};

export const VERDICT_META: Record<LinkVerdict, BadgeMeta> = {
  malicious: { labelKey: 'linkLogs.verdicts.malicious', color: 'bg-red-100 text-red-800' },
  phishing: { labelKey: 'linkLogs.verdicts.phishing', color: 'bg-red-100 text-red-800' },
  suspicious: { labelKey: 'linkLogs.verdicts.suspicious', color: 'bg-yellow-100 text-yellow-800' },
  safe: { labelKey: 'linkLogs.verdicts.safe', color: 'bg-green-100 text-green-800' },
};

export const RESULT_META: Record<FinalResult, BadgeMeta> = {
  alerted: { labelKey: 'linkLogs.results.alerted', color: 'bg-red-100 text-red-800' },
  passed: { labelKey: 'linkLogs.results.passed', color: 'bg-green-100 text-green-800' },
  pending: { labelKey: 'linkLogs.results.pending', color: 'bg-gray-100 text-gray-500' },
};

export const ACTION_META: Record<UserAction, BadgeMeta> = {
  proceeded: { labelKey: 'linkLogs.actions.proceeded', color: 'bg-red-100 text-red-800' },
  abandoned: { labelKey: 'linkLogs.actions.abandoned', color: 'bg-green-100 text-green-800' },
  skipped_deep_inspect: { labelKey: 'linkLogs.actions.skippedDeepInspect', color: 'bg-orange-100 text-orange-800' },
  none: { labelKey: 'linkLogs.actions.none', color: 'bg-gray-100 text-gray-500' },
};

export const DEEP_INSPECT_STATE_META: Record<DeepInspectState, BadgeMeta> = {
  skipped: { labelKey: 'linkLogs.deepInspect.skipped', color: 'bg-gray-100 text-gray-500' },
  running: { labelKey: 'linkLogs.deepInspect.running', color: 'bg-blue-100 text-blue-800' },
  cached: { labelKey: 'linkLogs.deepInspect.cached', color: 'bg-green-100 text-green-800' },
  done: { labelKey: 'linkLogs.deepInspect.done', color: 'bg-green-100 text-green-800' },
  timeout: { labelKey: 'linkLogs.deepInspect.timeout', color: 'bg-amber-100 text-amber-800' },
  user_skipped: { labelKey: 'linkLogs.deepInspect.userSkipped', color: 'bg-orange-100 text-orange-800' },
};

export const SOURCE_LABEL_KEY: Record<'body' | 'attachment', string> = {
  body: 'linkLogs.sources.body',
  attachment: 'linkLogs.sources.attachment',
};

// Detection timeline order (spec §3.1: local_blacklist → cloud_intel → phishing_agent).
export const STAGE_ORDER: Exclude<TriggerStage, 'none'>[] = ['local_blacklist', 'cloud_intel', 'phishing_agent'];

// Lookup helper tolerant of unknown/empty values from the backend.
export function stageMeta(stage?: string): BadgeMeta {
  return STAGE_META[(stage as TriggerStage)] ?? STAGE_META.none;
}
export function verdictMeta(v?: string): BadgeMeta {
  return VERDICT_META[(v as LinkVerdict)] ?? VERDICT_META.safe;
}
export function resultMeta(r?: string): BadgeMeta {
  return RESULT_META[(r as FinalResult)] ?? RESULT_META.passed;
}
export function actionMeta(a?: string): BadgeMeta {
  return ACTION_META[(a as UserAction)] ?? ACTION_META.none;
}
export function deepInspectStateMeta(s?: string): BadgeMeta {
  return DEEP_INSPECT_STATE_META[(s as DeepInspectState)] ?? { labelKey: 'linkLogs.deepInspect.unknown', color: 'bg-gray-100 text-gray-500' };
}
