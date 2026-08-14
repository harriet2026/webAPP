export type IntentDirection = 'receive' | 'send' | 'internal';
export type IntentType = 'porn_gambling' | 'political' | 'phishing' | 'spam' | 'subscription';
export type IntentAction = 'accept' | 'quarantine' | 'audit' | 'discard';
export type UIIntentAction = 'mark_deliver' | 'quarantine' | 'audit' | 'discard';
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

export const RECEIVE_ACTIONS: IntentAction[] = ['accept', 'quarantine', 'audit', 'discard'];
export const NON_RECEIVE_ACTIONS: IntentAction[] = ['quarantine', 'audit', 'discard'];

export const RECEIVE_UI_ACTIONS: UIIntentAction[] = ['mark_deliver', 'quarantine', 'audit', 'discard'];
export const NON_RECEIVE_UI_ACTIONS: UIIntentAction[] = ['quarantine', 'audit', 'discard'];

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

/**
 * GT-12171 D-06 裁决（2026-07-28）：阈值区间必须无间隙、无重叠地完整覆盖 [0,1]；
 * 重叠不做"后输入覆盖"自动归一，由前端校验报错并阻止保存，与后端
 * validateThresholdCoverage 的 gap/overlap 双拒绝契约一致。
 * 返回值区分问题种类，报错文案必须与实际问题对应（重叠时提示"未覆盖"会误导排查）。
 * 判定顺序：空集/起点缺口 → gap；相邻段按 min 升序扫描，遇到的第一个越界
 * （差值 > 容差为 gap、< -容差为 overlap）即返回；最后检查终点缺口。
 */
export type SegmentCoverageIssue = 'gap' | 'overlap';

const SEGMENT_EPS = 0.001;

export function segmentCoverageIssue(segments: ThresholdSegment[] | undefined): SegmentCoverageIssue | null {
  const segs = segments ?? [];
  if (segs.length === 0) return 'gap';
  const s = [...segs].sort((a, b) => a.min - b.min);
  if (s[0].min > SEGMENT_EPS) return 'gap';
  for (let i = 0; i < s.length - 1; i++) {
    const d = s[i + 1].min - s[i].max;
    if (d > SEGMENT_EPS) return 'gap';
    if (d < -SEGMENT_EPS) return 'overlap';
  }
  if (s[s.length - 1].max < 1 - SEGMENT_EPS) return 'gap';
  return null;
}

/**
 * "智能填充"的统一修复：按 min 升序把每段起点接到上一段终点（间隙向下补齐、
 * 重叠向上钳掉），被上一段完全吞没的段丢弃，最后一段终点延伸到 1。
 * 旧实现只补间隙、对重叠原样保留，导致重叠时按钮点击无效且警告不消失。
 */
export function fixSegmentCoverage(segments: ThresholdSegment[]): ThresholdSegment[] {
  const s = [...segments].sort((a, b) => a.min - b.min);
  if (s.length === 0) return [{ min: 0, max: 1, action: 'quarantine' }];
  const fixed: ThresholdSegment[] = [];
  let lastMax = 0;
  for (const seg of s) {
    if (seg.max <= lastMax + SEGMENT_EPS) continue;
    fixed.push(seg.min === lastMax ? seg : { ...seg, min: lastMax });
    lastMax = seg.max;
  }
  if (fixed.length === 0) return [{ min: 0, max: 1, action: s[s.length - 1].action }];
  if (lastMax < 1 - SEGMENT_EPS) {
    fixed[fixed.length - 1] = { ...fixed[fixed.length - 1], max: 1 };
  }
  return fixed;
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
