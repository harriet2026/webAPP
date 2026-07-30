import type { AICondition, DisposalQuickFilter } from "@/types/email-disposal";
import type { AdvancedFilter } from "@/types/log";

const VALUELESS_OPERATORS = new Set(["is_null", "is_not_null"]);

function hasScalarValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return typeof value === "number" || typeof value === "boolean";
}

export function isCompleteFilterCondition(condition: {
  field: string;
  op: string;
  value?: unknown;
}): boolean {
  if (!condition.field.trim()) return false;
  if (VALUELESS_OPERATORS.has(condition.op)) return true;

  if (Array.isArray(condition.value)) {
    if (condition.op === "between") {
      return (
        condition.value.length === 2 && condition.value.every(hasScalarValue)
      );
    }
    return condition.value.some(hasScalarValue);
  }

  return hasScalarValue(condition.value);
}

export function countQuickFilterConditions(quick: DisposalQuickFilter): number {
  let count = 0;

  if (quick.sendReceiveTime?.start || quick.sendReceiveTime?.end) count += 1;
  for (const key of [
    "sendReceiveType",
    "senderIp",
    "sender",
    "recipient",
    "subject",
    "executionAction",
    "ipLocation",
  ] as const) {
    if (quick[key]?.trim()) count += 1;
  }

  const statuses =
    quick.emailStatuses && quick.emailStatuses.length > 0
      ? quick.emailStatuses
      : quick.emailStatus
        ? [quick.emailStatus]
        : [];
  count += statuses.filter(Boolean).length;
  count += (quick.emailTypes ?? []).filter(Boolean).length;
  count += (quick.disposalPolicyKeys ?? []).filter(Boolean).length;
  count += (quick.disposalRuleIds ?? []).filter(Boolean).length;

  return count;
}

export function countAdvancedFilterConditions(
  advanced: AdvancedFilter,
): number {
  return advanced.groups.reduce(
    (total, group) =>
      total + group.conditions.filter(isCompleteFilterCondition).length,
    0,
  );
}

export function getApplicableAdvancedFilter(
  advanced: AdvancedFilter,
): AdvancedFilter {
  return {
    ...advanced,
    groups: advanced.groups
      .map((group) => ({
        ...group,
        conditions: group.conditions.filter(isCompleteFilterCondition),
      }))
      .filter((group) => group.conditions.length > 0),
  };
}

export function getApplicableAiConditions(
  aiConditions: AICondition[],
): AICondition[] {
  return aiConditions.filter(isCompleteFilterCondition);
}

export function getDisposalFilterSignature(
  quick: DisposalQuickFilter,
  advanced: AdvancedFilter,
  aiConditions: AICondition[],
  tenantId: number | null,
): string {
  const normalizedQuick = Object.fromEntries(
    Object.entries(quick).flatMap(([key, value]) => {
      if (typeof value === "string") {
        return value.trim() ? [[key, value.trim()]] : [];
      }
      if (Array.isArray(value)) {
        const values = value.filter(Boolean);
        return values.length > 0 ? [[key, values]] : [];
      }
      if (key === "sendReceiveTime" && value && typeof value === "object") {
        const range = value as { start?: string; end?: string };
        return range.start || range.end ? [[key, range]] : [];
      }
      return value === undefined || value === null ? [] : [[key, value]];
    }),
  );

  return JSON.stringify({
    quick: normalizedQuick,
    advanced: getApplicableAdvancedFilter(advanced),
    aiConditions: getApplicableAiConditions(aiConditions),
    tenantId,
  });
}

export function countDisposalFilterConditions(
  quick: DisposalQuickFilter,
  advanced: AdvancedFilter,
  aiConditions: AICondition[] = [],
): number {
  return (
    countQuickFilterConditions(quick) +
    countAdvancedFilterConditions(advanced) +
    aiConditions.filter(isCompleteFilterCondition).length
  );
}

export function hasSavableDisposalFilters(
  quick: DisposalQuickFilter,
  advanced: AdvancedFilter,
): boolean {
  return (
    countQuickFilterConditions(quick) +
      countAdvancedFilterConditions(advanced) >
    0
  );
}
