import { disabledAddons, type AddonKey, type PrimaryAction } from './conflict-matrix';

export type AddonsState = {
  [k in AddonKey]?: { enabled: boolean; params: Record<string, unknown> };
};

/**
 * A rule's actions are savable when either:
 * - the primary action is not 'none' (an action alone is enough), or
 * - at least one non-detailedLog addon is enabled AND not disabled by the
 *   current primary action's conflict matrix (detailedLog carries no UI and
 *   never counts as an "effective" addon on its own).
 */
export function canSaveActions(action: PrimaryAction, addons: AddonsState): boolean {
  if (action !== 'none') return true;
  const disabled = new Set(disabledAddons(action));
  return (Object.keys(addons) as AddonKey[]).some((k) => {
    if (k === 'detailedLog') return false;
    if (disabled.has(k)) return false;
    return addons[k]?.enabled === true;
  });
}

/**
 * GT-12182: 条件为空时前端此前没有任何校验——点「确定」会直接发请求，靠后端
 * 返回 {{condition_tree must not be empty}} 才提示。两个分组都为空即无条件
 * （serde.ts: 两个空组序列化为 null，即不产生 condition_tree）。
 */
export function hasNoConditions(conditions: { any: unknown[]; all: unknown[] }): boolean {
  return conditions.any.length === 0 && conditions.all.length === 0;
}

export function validateBasics(
  name: string,
  scope: string[],
  priority?: number,
  priorityRange?: { min: number; max: number },
): { nameError: boolean; scopeError: boolean; priorityError: boolean } {
  // GT-12181: reject out-of-range priorities client-side (parameterized by the
  // logged-in role's range) so the user gets an inline field error instead of a
  // raw API 400. Only validate when a range is supplied.
  const priorityError =
    priorityRange !== undefined &&
    priority !== undefined &&
    (!Number.isFinite(priority) || priority < priorityRange.min || priority > priorityRange.max);
  return {
    nameError: name.trim() === '',
    scopeError: scope.length === 0,
    priorityError,
  };
}
