import type {
  IntentDirection,
  IntentType,
  IntentSingleConfig,
  IntentDirectionConfig,
  IntentEngineConfig,
  IntentRiskLevel,
  ThresholdSegment,
} from '@/types/intent-engine';
import { RISK_LEVEL_OF, INTENT_TYPES, createDefaultMarkConfig } from '@/types/intent-engine';

function defaultThresholdSegments(risk: IntentRiskLevel, dir: IntentDirection): ThresholdSegment[] {
  const isReceive = dir === 'receive';
  const downgrade = (action: ThresholdSegment['action']): ThresholdSegment['action'] =>
    !isReceive && action === 'accept' ? 'quarantine' : action;
  if (risk === 'high') {
    return [
      { min: 0, max: 0.3, action: 'audit' },
      { min: 0.3, max: 0.6, action: 'quarantine' },
      { min: 0.6, max: 1, action: 'discard' },
    ];
  }
  if (risk === 'medium') {
    return [
      { min: 0, max: 0.2, action: downgrade('accept') },
      { min: 0.2, max: 0.6, action: 'quarantine' },
      { min: 0.6, max: 1, action: 'discard' },
    ];
  }
  return [
    { min: 0, max: 0.5, action: downgrade('accept') },
    { min: 0.5, max: 0.8, action: 'quarantine' },
    { min: 0.8, max: 1, action: 'audit' },
  ];
}

/** 供 API 层调用的包装函数，按意图类型+方向归一化 threshold_segments。 */
export function defaultThresholdSegmentsFor(it: IntentType, dir: IntentDirection): ThresholdSegment[] {
  return defaultThresholdSegments(RISK_LEVEL_OF[it], dir);
}

export function createDefaultIntentConfig(it: IntentType, dir: IntentDirection): IntentSingleConfig {
  const risk = RISK_LEVEL_OF[it];
  const isReceive = dir === 'receive';
  let action: IntentSingleConfig['action'];
  if (risk === 'high') {
    action = isReceive ? 'quarantine' : 'discard';
  } else if (risk === 'medium') {
    action = isReceive ? 'quarantine' : 'audit';
  } else {
    action = isReceive ? 'accept' : 'audit';
  }
  // Non-receive directions don't support 'accept' (proceed)
  if (!isReceive && action === 'accept') {
    action = 'quarantine';
  }
  return {
    enabled: true,
    action,
    detection_mode: 'classification',
    threshold_segments: defaultThresholdSegments(risk, dir),
    mark_config: action === 'accept' ? createDefaultMarkConfig(it) : undefined,
  };
}

export function createDefaultDirectionConfig(dir: IntentDirection): IntentDirectionConfig {
  return INTENT_TYPES.reduce((acc, it) => {
    acc[it] = createDefaultIntentConfig(it, dir);
    return acc;
  }, {} as IntentDirectionConfig);
}

export function createDefaultIntentEngineConfig(): IntentEngineConfig {
  return {
    engine_enabled: { receive: true, send: true, internal: true },
    directions: {
      receive: createDefaultDirectionConfig('receive'),
      send: createDefaultDirectionConfig('send'),
      internal: createDefaultDirectionConfig('internal'),
    },
  };
}

export function downgradeForNonReceive(cfg: IntentSingleConfig): IntentSingleConfig {
  const next: IntentSingleConfig = { ...cfg };
  if (next.action === 'accept') {
    next.action = 'quarantine';
    delete next.mark_config;
  }
  if (next.threshold_segments) {
    next.threshold_segments = next.threshold_segments.map((s) => ({
      ...s,
      action: s.action === 'accept' ? 'quarantine' : s.action,
    }));
  }
  return next;
}
