export type IntentDirection = 'receive' | 'send' | 'internal';
export type IntentType = 'porn_gambling' | 'political' | 'phishing' | 'spam' | 'subscription';
export type IntentAction = 'accept' | 'quarantine' | 'audit' | 'reject' | 'discard';
export type UIIntentAction = 'mark_deliver' | 'quarantine' | 'audit' | 'reject' | 'discard';
export type IntentRiskLevel = 'high' | 'medium' | 'low';
export type DetectionMode = 'classification' | 'threshold';

export interface ThresholdSegment {
  min: number;
  max: number;
  action: IntentAction;
}

export type MarkPosition = 'prefix' | 'suffix';

export interface IntentMark {
  enabled: boolean;
  text: string;
  position: MarkPosition;
}

export interface IntentMarkConfig {
  delivery_target: 'inbox' | 'spam_folder';
  subject_mark?: IntentMark;
  body_mark?: IntentMark;
}

export interface IntentSingleConfig {
  enabled: boolean;
  action: IntentAction;
  mark_config?: IntentMarkConfig;
  detection_mode: DetectionMode;
  threshold_segments?: ThresholdSegment[];
}

export interface IntentDirectionConfig {
  porn_gambling: IntentSingleConfig;
  political: IntentSingleConfig;
  phishing: IntentSingleConfig;
  spam: IntentSingleConfig;
  subscription: IntentSingleConfig;
}

export interface IntentEngineConfig {
  engine_enabled: { receive: boolean; send: boolean; internal: boolean };
  directions: {
    receive: IntentDirectionConfig;
    send: IntentDirectionConfig;
    internal: IntentDirectionConfig;
  };
}

export const INTENT_TYPES: IntentType[] = ['porn_gambling', 'political', 'phishing', 'spam', 'subscription'];

export const RISK_LEVEL_OF: Record<IntentType, IntentRiskLevel> = {
  porn_gambling: 'high',
  political: 'high',
  phishing: 'high',
  spam: 'medium',
  subscription: 'low',
};

export const HIGH_RISK_INTENTS: IntentType[] = ['porn_gambling', 'political', 'phishing'];
export const MEDIUM_RISK_INTENTS: IntentType[] = ['spam'];
export const LOW_RISK_INTENTS: IntentType[] = ['subscription'];

export const RECEIVE_ACTIONS: IntentAction[] = ['accept', 'quarantine', 'audit', 'reject', 'discard'];
export const NON_RECEIVE_ACTIONS: IntentAction[] = ['quarantine', 'audit', 'reject', 'discard'];

export const RECEIVE_UI_ACTIONS: UIIntentAction[] = ['mark_deliver', 'quarantine', 'audit', 'reject', 'discard'];
export const NON_RECEIVE_UI_ACTIONS: UIIntentAction[] = ['quarantine', 'audit', 'reject', 'discard'];

export function toUIAction(cfg: IntentSingleConfig): UIIntentAction {
  if (cfg.action === 'accept') {
    return 'mark_deliver';
  }
  return cfg.action;
}

/**
 * GT-12171 D-03：分段阈值模式下卡头 Badge 的"区间处置摘要"。
 * 按阈值区间升序取各段的处置动作（accept 归一到 mark_deliver 与卡内一致），
 * 去重后保留出现顺序，让管理员一眼看清该意图在不同置信度区间会被怎么处置，
 * 而不是像分类模式那样只显示单一动作。
 */
export function thresholdActionSummary(segments: ThresholdSegment[] | undefined): UIIntentAction[] {
  if (!segments || segments.length === 0) {
    return [];
  }
  const sorted = [...segments].sort((a, b) => a.min - b.min);
  const seen = new Set<UIIntentAction>();
  const out: UIIntentAction[] = [];
  for (const seg of sorted) {
    const ui: UIIntentAction = seg.action === 'accept' ? 'mark_deliver' : seg.action;
    if (!seen.has(ui)) {
      seen.add(ui);
      out.push(ui);
    }
  }
  return out;
}

export const DEFAULT_MARK_TEXT: Record<IntentType, string> = {
  porn_gambling: '[涉黄/赌]',
  political: '[涉政/反动]',
  phishing: '[钓鱼]',
  spam: '[垃圾]',
  subscription: '[订阅]',
};

export function createDefaultMarkConfig(intent: IntentType): IntentMarkConfig {
  const text = DEFAULT_MARK_TEXT[intent];
  return {
    delivery_target: 'spam_folder',
    subject_mark: { enabled: true, text, position: 'prefix' },
    body_mark: { enabled: false, text, position: 'prefix' },
  };
}

export function applyUIAction(cfg: IntentSingleConfig, ui: UIIntentAction, intent: IntentType): IntentSingleConfig {
  if (ui === 'mark_deliver') {
    return { ...cfg, action: 'accept', mark_config: cfg.mark_config || createDefaultMarkConfig(intent) };
  }
  const next: IntentSingleConfig = { ...cfg, action: ui };
  delete next.mark_config;
  return next;
}

/** Threshold segment action options per direction (exclude 'accept' for non-receive). */
export function thresholdActionsForDirection(direction: IntentDirection): IntentAction[] {
  return direction === 'receive' ? RECEIVE_ACTIONS : NON_RECEIVE_ACTIONS;
}
