import { describe, expect, it } from "vitest";

import {
  countAdvancedFilterConditions,
  countDisposalFilterConditions,
  countQuickFilterConditions,
  getApplicableAdvancedFilter,
  getDisposalFilterSignature,
  hasSavableDisposalFilters,
  isCompleteFilterCondition,
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
        emailStatuses: ["rejected", "bounced"],
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
});
