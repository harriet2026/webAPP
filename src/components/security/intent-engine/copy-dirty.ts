import type { IntentDirection, IntentEngineConfig } from '@/types/intent-engine';
import { INTENT_TYPES } from '@/types/intent-engine';
import { downgradeForNonReceive } from './defaults';

type Directions = IntentEngineConfig['directions'];

/**
 * 按方向追踪的未保存标记。
 *
 * GT-11753 / GT-12208：早期实现是整个模块共用一个布尔 dirty，「复制到其他方向」
 * 无条件置 true。html_spec 层级5（v2 / 2026-07-17，差异 D-07）把这判为缺陷——
 * 提示挂在*当前*方向的操作栏上，令人误以为当前方向被改；目标方向配置本来就与
 * 源一致时还会误报「配置已修改未保存」。v2 要求按方向追踪，且只对配置**实际
 * 发生变化**的目标方向标脏（深比较）。
 */
export type DirtyDirections = Record<IntentDirection, boolean>;

export const NO_DIRTY: DirtyDirections = { receive: false, send: false, internal: false };

export function anyDirty(d: DirtyDirections): boolean {
  return d.receive || d.send || d.internal;
}

export interface CopyResult {
  /** 复制后的完整 directions（未变化的方向保持原引用）。 */
  directions: Directions;
  /** 配置确实发生变化、因而需要标脏的目标方向。 */
  changed: IntentDirection[];
}

/**
 * 把 `source` 方向的配置复制到 `targets`，并算出哪些方向真的变了。
 *
 * 深比较用 JSON 序列化：配置树是纯 JSON（数字/字符串/布尔/数组/对象），
 * 且由同一套构造逻辑产出，键序稳定，足以判等；这里刻意不引第三方 deep-equal。
 */
export function applyCopyToDirections(
  prev: Directions,
  source: IntentDirection,
  targets: IntentDirection[],
): CopyResult {
  const next: Directions = { ...prev };
  const changed: IntentDirection[] = [];

  for (const target of targets) {
    // 复制到自己没有意义，直接跳过（也不该标脏）。
    if (target === source) continue;

    const copied = structuredClone(prev[source]);
    // 接收方向独有的能力在外发/域内不适用，需降级后再落地。
    if (source === 'receive') {
      for (const it of INTENT_TYPES) {
        copied[it] = downgradeForNonReceive(copied[it]);
      }
    }

    // 目标方向本来就等于复制结果时不标脏，避免 v1 的「无需修改却报未保存」误报。
    if (JSON.stringify(prev[target]) === JSON.stringify(copied)) continue;

    next[target] = copied;
    changed.push(target);
  }

  return { directions: changed.length > 0 ? next : prev, changed };
}

export function markDirty(prev: DirtyDirections, dirs: IntentDirection[]): DirtyDirections {
  if (dirs.length === 0) return prev;
  const next = { ...prev };
  for (const d of dirs) next[d] = true;
  return next;
}
