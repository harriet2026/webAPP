import { describe, expect, it } from "vitest";

import {
  countAdvancedFilterConditions,
  countDisposalFilterConditions,
  countQuickFilterConditions,
  getApplicableAdvancedFilter,
  getDisposalFilterSignature,
  hasSavableDisposalFilters,
  isCompleteFilterCondition,
  resolvePositiveEnumFilterValues,
} from "./filter-state";

describe("email disposal filter state", () => {
  it("does not count placeholder rows as active conditions", () => {
    expect(
      isCompleteFilterCondition({ field: "", op: "eq", value: undefined }),
    ).toBe(false);
    expect(
      countAdvancedFilterConditions({
        operator: "AND",
        groups: [
          {
            operator: "AND",
            conditions: [
              { field: "", op: "eq" },
              { field: "sender", op: "contains", value: " " },
              { field: "sender", op: "is_not_null" },
            ],
          },
        ],
      }),
    ).toBe(1);
  });

  it("counts every visible quick-filter chip without double-counting legacy status", () => {
    expect(
      countQuickFilterConditions({
        subject: "invoice",
        emailStatus: "delivered",
        emailStatuses: ["rejected", "delivery_failed"],
        emailTypes: ["spam", "phishing"],
        sendReceiveTime: { start: "2026-07-01", end: "" },
      }),
    ).toBe(6);
  });

  it("separates resettable AI conditions from filters that templates can persist", () => {
    const quick = {};
    const advanced = { operator: "AND" as const, groups: [] };
    const ai = [
      {
        field: "display_status",
        op: "eq",
        value: "rejected",
        source: "ai" as const,
      },
    ];

    expect(countDisposalFilterConditions(quick, advanced, ai)).toBe(1);
    expect(hasSavableDisposalFilters(quick, advanced)).toBe(false);
  });

  it("ignores placeholder rows when comparing and applying a draft", () => {
    const empty = { operator: "AND" as const, groups: [] };
    const withPlaceholder = {
      operator: "AND" as const,
      groups: [
        {
          operator: "AND" as const,
          conditions: [{ field: "", op: "eq" as const }],
        },
      ],
    };

    expect(getDisposalFilterSignature({}, empty, [], null)).toBe(
      getDisposalFilterSignature({}, withPlaceholder, [], null),
    );
    expect(getApplicableAdvancedFilter(withPlaceholder).groups).toEqual([]);
  });

  it("collects positive enum eq/in values for mixed-badge explanations", () => {
    expect(
      resolvePositiveEnumFilterValues(
        {
          operator: "AND",
          groups: [
            {
              operator: "AND",
              conditions: [
                { field: "action", op: "eq", value: "deliver" },
                { field: "action", op: "in", value: ["quarantine", "deliver"] },
                { field: "action", op: "neq", value: "drop" },
                { field: "display_status", op: "eq", value: "delivered" },
              ],
            },
          ],
        },
        "action",
      ),
    ).toEqual(["deliver", "quarantine"]);
  });

  it("does not treat positive conditions inside a negated group as badge highlights", () => {
    expect(
      resolvePositiveEnumFilterValues(
        {
          operator: "OR",
          groups: [
            {
              not: true,
              operator: "AND",
              conditions: [
                { field: "display_status", op: "eq", value: "delivered" },
              ],
            },
            {
              operator: "AND",
              conditions: [{ field: "subject", op: "contains", value: "report" }],
            },
          ],
        },
        "display_status",
      ),
    ).toEqual([]);
  });
});
