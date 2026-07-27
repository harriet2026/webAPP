import { describe, expect, it } from "vitest";
import {
  mergeAiQuickFilter,
  shouldAddDefaultSubject,
} from "./ai-search-state";

describe("shouldAddDefaultSubject", () => {
  it("does not add a subject when the current query produced the AI conditions", () => {
    expect(
      shouldAddDefaultSubject("有风险的邮件", "有风险的邮件"),
    ).toBe(false);
  });

  it("adds a subject for a plain query or after the input changes", () => {
    expect(shouldAddDefaultSubject("普通查询", null)).toBe(true);
    expect(
      shouldAddDefaultSubject("有风险的邮件（今天）", "有风险的邮件"),
    ).toBe(true);
  });

  it("does not add an empty subject", () => {
    expect(shouldAddDefaultSubject("   ", null)).toBe(false);
  });
});

describe("mergeAiQuickFilter", () => {
  it("removes a stale default subject for the same query after AI parsing succeeds", () => {
    expect(
      mergeAiQuickFilter(
        { subject: "有风险的邮件", sender: "keep@example.test" },
        {},
        "有风险的邮件",
        true,
      ),
    ).toEqual({ sender: "keep@example.test" });
  });

  it("preserves a subject explicitly produced by AI", () => {
    expect(
      mergeAiQuickFilter(
        { subject: "主题包含 invoice" },
        { subject: "invoice" },
        "主题包含 invoice",
        true,
      ),
    ).toEqual({ subject: "invoice" });
  });

  it("does not remove an unrelated manual subject", () => {
    expect(
      mergeAiQuickFilter(
        { subject: "季度报告" },
        {},
        "有风险的邮件",
        true,
      ),
    ).toEqual({ subject: "季度报告" });
  });
});
