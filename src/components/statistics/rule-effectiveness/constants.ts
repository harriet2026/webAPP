import type { PolicyModule, PromotionSuggestion, WouldBeAction } from '@/lib/api/rule-effectiveness';

// 规则效能统计（观察模式）页面的共享常量。
// 颜色沿用安全总览「威胁语义色阶」token，不新增配色。

export const POLICY_MODULES: PolicyModule[] = ['auth_spoofing', 'similar_detection', 'phishing_detection'];

export const OBSERVE_DURATION_BUCKETS = ['lt7', '7to30', 'gt30'] as const;

/** 超过该观察天数视为「待评估」，触发超时告警条。 */
export const OBSERVE_TIMEOUT_DAYS = 30;

export const MODULE_COLORS: Record<PolicyModule, string> = {
  auth_spoofing: '#3B82F6',
  similar_detection: '#8B5CF6',
  phishing_detection: '#F59E0B',
};

export function moduleColor(module: PolicyModule): string {
  return MODULE_COLORS[module] ?? '#6b7280';
}

export const WOULD_BE_ACTION_COLORS: Record<WouldBeAction, string> = {
  reject: '#EF4444',
  quarantine: '#F59E0B',
  discard: '#DC2626',
  bounce: '#F97316',
  sideline: '#EAB308',
  recall: '#0EA5E9',
  tag: '#8B5CF6',
};

export function actionColor(action: WouldBeAction): string {
  return WOULD_BE_ACTION_COLORS[action] ?? '#6b7280';
}

/** 拦截缺口口径：这些动作若发生在非观察模式下，均代表本应拦截。 */
export const BLOCKING_ACTIONS: WouldBeAction[] = ['reject', 'quarantine', 'discard', 'bounce', 'sideline', 'recall'];

export type SuggestionTone = 'success' | 'muted' | 'warning' | 'neutral';

export const SUGGESTION_TONE: Record<PromotionSuggestion, SuggestionTone> = {
  confirm_promote: 'success',
  keep_observing: 'muted',
  needs_tuning: 'warning',
  needs_more_data: 'neutral',
};

export const SUGGESTION_BADGE_CLASS: Record<SuggestionTone, string> = {
  success: 'bg-success/10 text-success border-success/20',
  muted: 'bg-muted text-muted-foreground border-border',
  warning: 'bg-warning-soft text-warning border-warning/20',
  neutral: 'bg-muted/50 text-muted-foreground border-border/60',
};
