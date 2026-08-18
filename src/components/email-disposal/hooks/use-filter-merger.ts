import { useCallback } from "react";
import type {
  AdvancedFilter,
  FilterCondition,
  FilterConditionGroup,
} from "@/types/log";
import type { DisposalQuickFilter, AICondition } from "@/types/email-disposal";
import { resolveExecutionActions } from "../lib/filter-state";

// GT-11618: the quick-filter "emailStatus" (display_status) is NO LONGER mapped
// to the backend "action" field here — that mapping was lossy (only 4 of the 13
// displayStatus values had a corresponding action, so picking "discarded" /
// "delay_detecting" / etc. silently did nothing). The display_status value is
// now passed through as its own top-level query param in getDisposalList
// (disposal-api.ts), and the backend maps it to the right combination of
// action / delivery_status_summary / workflow_outcome_summary predicates.

// GT-11610: the email-size (storage_size) advanced filter is entered in KB in
// the UI, but the backend compares against the storage_size column in bytes.
// Convert KB -> bytes for every storage_size condition value (scalar, and the
// array forms used by `between` / `in`) right before the filter is sent.
const KB = 1024;

function kbValueToBytes(v: unknown): unknown {
  if (v === "" || v === null || v === undefined) return v;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * KB) : v;
}

function convertSizeCondition(cond: FilterCondition): FilterCondition {
  if (cond.field !== "storage_size" && cond.field !== "attachment_total_size")
    return cond;
  if (cond.op === "is_null" || cond.op === "is_not_null") return cond;
  const value = Array.isArray(cond.value)
    ? cond.value.map(kbValueToBytes)
    : kbValueToBytes(cond.value);
  return { ...cond, value: value as FilterCondition["value"] };
}

export function useFilterMerger() {
  const merge = useCallback(
    (
      quick: DisposalQuickFilter,
      advanced: AdvancedFilter,
      aiConditions?: AICondition[],
    ): AdvancedFilter => {
      const groups: FilterConditionGroup[] = advanced.groups.map((g) => ({
        ...g,
        conditions: g.conditions.map(convertSizeCondition),
      }));

      const quickConditions: FilterCondition[] = [];

      // sender, subject, action, geo_region_name map directly to registered backend fields
      if (quick.senderIp) {
        quickConditions.push({
          field: "client_ip",
          op: "contains",
          value: quick.senderIp,
        });
      }
      if (quick.sender) {
        quickConditions.push({
          field: "sender",
          op: "contains",
          value: quick.sender,
        });
      }
      if (quick.subject) {
        quickConditions.push({
          field: "subject",
          op: "contains",
          value: quick.subject,
        });
      }
      const executionActions = resolveExecutionActions(quick);
      if (executionActions.length > 0) {
        quickConditions.push({
          field: "action",
          op: "in",
          value: executionActions,
        });
      }
      if (quick.ipLocation) {
        quickConditions.push({
          field: "geo_region_name",
          op: "contains",
          value: quick.ipLocation,
        });
      }

      // sendReceiveTime and recipient are passed as top-level query params (start_date,
      // end_date, recipient) in getDisposalList — not as AdvancedFilter conditions —
      // because the backend parses them separately from the advanced_filters JSON blob.
      // sendReceiveType (direction) is also a top-level query param — see
      // email-disposal-center-page.tsx searchParams.direction (GT-11614).
      // emailStatus (display_status) is likewise a top-level query param now (GT-11618).

      if (quickConditions.length > 0) {
        groups.unshift({ operator: "AND", conditions: quickConditions });
      }

      if (quick.disposalRuleIds && quick.disposalRuleIds.length > 0) {
        groups.unshift({
          operator: "OR",
          conditions: quick.disposalRuleIds.map((ruleId) => ({
            field: "disposal_rule_id",
            op: "eq",
            value: ruleId,
          })),
        });
      }

      if (aiConditions && aiConditions.length > 0) {
        const aiConds: FilterCondition[] = aiConditions.map((ac) => ({
          field: ac.field,
          op: ac.op as FilterCondition["op"],
          value: ac.value,
        }));
        groups.unshift({ operator: "AND", conditions: aiConds });
      }

      return { operator: "AND", groups };
    },
    [],
  );

  return { merge };
}
