import { apiRequest, type ApiRequestFn } from './client';
import type {
  IntentDirection,
  IntentEngineConfig,
  IntentSingleConfig,
  IntentType,
} from '@/types/intent-engine';
import { INTENT_TYPES } from '@/types/intent-engine';
import { defaultThresholdSegmentsFor } from '@/components/security/intent-engine/defaults';

const DIRECTIONS: IntentDirection[] = ['receive', 'send', 'internal'];

/** 归一化单个意图配置，用于 GET 时的向后兼容（旧数据可能缺少 detection_mode / threshold_segments）。 */
function normalizeSingle(cfg: IntentSingleConfig, it: IntentType, dir: IntentDirection): IntentSingleConfig {
  return {
    ...cfg,
    detection_mode: cfg.detection_mode === 'threshold' ? 'threshold' : 'classification',
    threshold_segments: cfg.threshold_segments?.length ? cfg.threshold_segments : defaultThresholdSegmentsFor(it, dir),
  };
}

function normalizeConfig(cfg: IntentEngineConfig): IntentEngineConfig {
  for (const dir of DIRECTIONS) {
    const dirCfg = cfg.directions[dir];
    for (const it of INTENT_TYPES) {
      dirCfg[it] = normalizeSingle(dirCfg[it], it, dir);
    }
  }
  return cfg;
}

export async function getIntentEngineConfig(requestFn: ApiRequestFn = apiRequest): Promise<IntentEngineConfig> {
  const cfg = await requestFn<IntentEngineConfig>('/security/intent-engine');
  return normalizeConfig(cfg);
}

export async function putIntentEngineConfig(
  cfg: IntentEngineConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn<void>('/security/intent-engine', { method: 'PUT', body: cfg });
}
