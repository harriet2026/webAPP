import type { ThreatRetroStrategy, DetectMode } from '@/types/threat-retro';

// LOOKBACK_OPTIONS — single-scan window minutes, ≤24h (spec §3.2).
export const LOOKBACK_OPTIONS = [30, 60, 120, 240, 480, 720, 1440];

// QUICK_ADD — quick-add buttons for deep-mode run-times (spec §6.2 §2).
export const QUICK_ADD = [
  { key: 'every30', stepMinutes: 30, testId: 'strategy-quickadd-30m' },
  { key: 'everyHour', stepMinutes: 60, testId: 'strategy-quickadd-1h' },
  { key: 'every2Hours', stepMinutes: 120, testId: 'strategy-quickadd-2h' },
];

export function quickAddTimes(stepMinutes: number): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += stepMinutes) {
    out.push(
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    );
  }
  return out;
}

export function makeStrategy(mode: DetectMode = 'deep'): ThreatRetroStrategy {
  return {
    name: '',
    feature: 'threat_retro_strategy',
    mode,
    status: 'disabled',
    color_dot: '#1677FF',
    schedule: { run_times: mode === 'deep' ? ['09:00'] : [], weekdays: [], month_days: [] },
    lookback_window_minutes: 60,
    realtime: {
      listen_sources: [],
      confidence_threshold: 80,
      cooldown_minutes: 30,
      fixed_lookback_minutes: 1440,
    },
    resource_limits: { max_tool_calls: 20, max_url_fetches: 10 },
    disposition: {
      decision_mode: 'conservative',
      auto_confidence_threshold: 90,
      decision_timeout_hours: 24,
      recall_actions: ['soft_delete'],
      unread_policy: 'recall',
      read_policy: 'notify',
      circuit_breaker_threshold: 100,
      max_recall_per_run: 500,
    },
    exclusions: { exclude_rcpt_sys_tags: [], exclude_email_list: [] },
    notify: {
      enabled: false,
      recipients: [],
      high: { enabled: true },
      medium: { enabled: true, min_confidence: 80 },
      low: { enabled: true, digest_time: '20:00' },
    },
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StrategyErrors = Partial<
  Record<
    | 'name'
    | 'confidence'
    | 'cooldown'
    | 'listenSources'
    | 'runTimes'
    | 'lookback'
    | 'recipients'
    | 'maxToolCalls'
    | 'maxUrlFetches'
    | 'autoConfidence'
    | 'decisionTimeout'
    | 'maxRecall'
    | 'circuitBreaker'
    | 'exclusionTags'
    | 'exclusionEmails',
    string
  >
>;

export function validateStrategy(s: ThreatRetroStrategy): StrategyErrors {
  const e: StrategyErrors = {};
  if (!s.name.trim() || s.name.length > 50) e.name = 'name';
  if (s.mode === 'deep') {
    if (s.schedule.run_times.length === 0) e.runTimes = 'runTimes';
    if (s.lookback_window_minutes < 30 || s.lookback_window_minutes > 1440)
      e.lookback = 'lookback';
  }
  if (!Number.isInteger(s.resource_limits.max_tool_calls) || s.resource_limits.max_tool_calls < 1 || s.resource_limits.max_tool_calls > 1000) e.maxToolCalls = 'maxToolCalls';
  if (!Number.isInteger(s.resource_limits.max_url_fetches) || s.resource_limits.max_url_fetches < 1 || s.resource_limits.max_url_fetches > 1000) e.maxUrlFetches = 'maxUrlFetches';
  if (!Number.isInteger(s.disposition.auto_confidence_threshold) || s.disposition.auto_confidence_threshold < 1 || s.disposition.auto_confidence_threshold > 100) e.autoConfidence = 'autoConfidence';
  if (!Number.isInteger(s.disposition.decision_timeout_hours) || s.disposition.decision_timeout_hours < 1 || s.disposition.decision_timeout_hours > 24) e.decisionTimeout = 'decisionTimeout';
  if (!Number.isInteger(s.disposition.max_recall_per_run) || s.disposition.max_recall_per_run < 1 || s.disposition.max_recall_per_run > 100000) e.maxRecall = 'maxRecall';
  if (!Number.isInteger(s.disposition.circuit_breaker_threshold) || s.disposition.circuit_breaker_threshold < 1 || s.disposition.circuit_breaker_threshold > 100000) e.circuitBreaker = 'circuitBreaker';
  const bad = s.notify.recipients.filter((r) => r.trim() && !EMAIL_RE.test(r.trim()));
  if (bad.length > 0) e.recipients = 'recipients';
  if (s.notify.enabled && s.notify.recipients.length === 0) e.recipients = 'recipients';
  if (!Number.isInteger(s.notify.medium.min_confidence) || s.notify.medium.min_confidence < 70 || s.notify.medium.min_confidence > 89)
    e.confidence = 'confidence';
  if (s.exclusions.exclude_rcpt_sys_tags.some((tag) => !/^sys:.+/.test(tag))) e.exclusionTags = 'exclusionTags';
  if (s.exclusions.exclude_email_list.some((address) => !EMAIL_RE.test(address))) e.exclusionEmails = 'exclusionEmails';
  return e;
}

// overlapWarn: deep strategies sharing any run_time → yellow warning (allowed to save).
export function overlapWarn(
  draft: ThreatRetroStrategy,
  list: ThreatRetroStrategy[],
): string | null {
  if (draft.mode !== 'deep') return null;
  const conflict = list.find(
    (o) =>
      o.id !== draft.id &&
      o.mode === 'deep' &&
      o.schedule.run_times.some((t) => draft.schedule.run_times.includes(t)),
  );
  return conflict ? conflict.name : null;
}
