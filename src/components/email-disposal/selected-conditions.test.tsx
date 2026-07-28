import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import type { DisposalQuickFilter, AICondition } from "@/types/email-disposal";
import type { AdvancedFilter } from "@/types/log";
import zh from "../../../messages/zh.json";
import { SelectedConditions } from "./selected-conditions";

// Identity translator: chip assertions key off the translated label text, so
// this returns the raw i18n key (namespace-qualified) rather than resolving
// real zh/en/th/ru copy — keeps most assertions decoupled from
// messages/*.json content.
//
// GT-12368 fix round 1: `.has()` is the one exception — it's backed by the
// REAL zh dictionary (same technique as
// tests/unit/email-disposal-size-unit-i18n.test.tsx) so the
// missing-i18n-key-falls-back-to-raw-value behavior in formatCondLabel is
// exercised against actual key presence. A plain identity mock can never
// "miss" a key, so it would silently pass even if the production code never
// checked `ft.has()` at all.
function dig(obj: unknown, dotted: string): unknown {
  return dotted
    .split(".")
    .reduce<unknown>(
      (o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]),
      obj,
    );
}
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string) => `${namespace}.${key}`;
    translate.has = (key: string) => {
      const root = namespace ? dig(zh, namespace) : zh;
      return typeof dig(root, key) === "string";
    };
    return translate;
  },
  useLocale: () => "zh",
}));

const emptyAdvanced: AdvancedFilter = { operator: "AND", groups: [] };

function baseQuick(
  overrides: Partial<DisposalQuickFilter> = {},
): DisposalQuickFilter {
  return { ...overrides };
}

describe("SelectedConditions - multi-value quick filter chips (review finding 3/7)", () => {
  it("renders and removes page-level scope conditions with the regular chip interactions", async () => {
    const onRemoveChip = vi.fn();
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={[]}
        extraConditions={[{ key: "scope-tenant", label: "租户范围: #18" }]}
        onClearAll={vi.fn()}
        onRemoveChip={onRemoveChip}
      />,
    );

    expect(screen.getByText("租户范围: #18")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: /emailDisposal\.search\.clearAll: 租户范围: #18/,
      }),
    );
    expect(onRemoveChip).toHaveBeenCalledWith("scope-tenant");
  });

  it("renders one chip per selected mail type", () => {
    render(
      <SelectedConditions
        quick={baseQuick({ emailTypes: ["spam", "phishing"] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/emailDisposal\.filters\.mailTypes\.spam/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/emailDisposal\.filters\.mailTypes\.phishing/),
    ).toBeInTheDocument();
  });

  it("renders one chip per selected disposal policy key with the module name", () => {
    render(
      <SelectedConditions
        quick={baseQuick({ disposalPolicyKeys: ["IPBL", "CR"] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    expect(screen.getByText(/IP黑白名单/)).toBeInTheDocument();
    expect(screen.getByText(/内容规则/)).toBeInTheDocument();
  });

  it("removing one mail-type chip calls onRemoveChip with a per-value key, leaving the other value alone", async () => {
    const onRemoveChip = vi.fn();
    render(
      <SelectedConditions
        quick={baseQuick({ emailTypes: ["spam", "phishing"] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={onRemoveChip}
      />,
    );
    const removeButtons = screen.getAllByRole("button", {
      name: /emailDisposal\.search\.clearAll:/,
    });
    await userEvent.click(removeButtons[0]);
    expect(onRemoveChip).toHaveBeenCalledWith("q-emailTypes:spam");
  });

  it("removing one disposal-policy-key chip calls onRemoveChip with a per-value key", async () => {
    const onRemoveChip = vi.fn();
    render(
      <SelectedConditions
        quick={baseQuick({ disposalPolicyKeys: ["IPBL", "CR"] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={onRemoveChip}
      />,
    );
    const removeButtons = screen.getAllByRole("button", {
      name: /emailDisposal\.search\.clearAll:/,
    });
    await userEvent.click(removeButtons[1]);
    expect(onRemoveChip).toHaveBeenCalledWith("q-disposalPolicyKeys:CR");
  });

  it("renders nothing when there are no conditions", () => {
    const { container } = render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not expose incomplete builder rows as applied condition chips", () => {
    const { container } = render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={{
          operator: "AND",
          groups: [
            {
              operator: "AND",
              conditions: [
                { field: "", op: "eq" },
                { field: "sender", op: "contains", value: "" },
              ],
            },
          ],
        }}
        aiConditions={[]}
        onClearAll={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("uses shared pointer feedback for removable condition controls", () => {
    render(
      <SelectedConditions
        quick={baseQuick({ emailTypes: ["spam"] })}
        advanced={emptyAdvanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
        onRemoveChip={vi.fn()}
      />,
    );
    const remove = screen.getByRole("button", {
      name: /emailDisposal\.search\.clearAll:/,
    });

    fireEvent.pointerEnter(remove, { pointerType: "mouse" });
    expect(remove).toHaveAttribute("data-hovered", "true");
    fireEvent.pointerLeave(remove, { pointerType: "mouse" });
    expect(remove).not.toHaveAttribute("data-hovered");
  });
});

// GT-12368: AI 智能搜索 filter 全覆盖新增了三个 AI 专用字段（received_at 日期/
// display_status 17 值枚举/disposal_policy_key 模块 key）；解析结果原先直接以
// `${field}: ${value}` 渲染裸字段名，本组用例锁定它们改走与 advanced chips 相同
// 的本地化格式（field/op/value 三段皆本地化）。
describe("SelectedConditions - AI condition chips localization (GT-12368)", () => {
  it("renders AI condition chips with localized field/op/value labels, not raw field keys", () => {
    const aiConditions: AICondition[] = [
      // parse-query 对 between/in 的多值结果在 search-bar.tsx 里已 String() 展平
      // 为逗号拼接串（AICondition.value 的声明类型就是 string），此处如实还原
      // 该运行时形态，而不是直接喂 array。
      {
        field: "received_at",
        op: "between",
        value: "2026-07-18,2026-07-25",
        source: "ai",
      },
      { field: "display_status", op: "in", value: "delivered", source: "ai" },
    ];
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={aiConditions}
        onClearAll={vi.fn()}
      />,
    );
    // 字段名走 FIELD_LABEL_KEYS -> sendReceiveTime / emailStatus，而不是裸的
    // "received_at"/"display_status"。
    expect(
      screen.getByText(/emailDisposal\.filters\.sendReceiveTime/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/emailDisposal\.filters\.emailStatus/),
    ).toBeInTheDocument();
    // display_status 的值走 ENUM_VALUE_MAP -> statuses.delivered，而不是裸的 "delivered"。
    expect(
      screen.getByText(/emailDisposal\.filters\.statuses\.delivered/),
    ).toBeInTheDocument();
    // 操作符本地化：between -> "~"。
    expect(screen.getByText(/~/)).toBeInTheDocument();
    // 不应再出现旧的裸格式 "received_at: ..." / "display_status: ...".
    expect(screen.queryByText(/^received_at:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^display_status:/)).not.toBeInTheDocument();
  });

  it("localizes every value of a comma-flattened multi-value AI enum condition individually (fix round 1)", () => {
    // Regression for the reviewer-found gap: search-bar.tsx flattens a
    // backend `in` array via String(cond.value), so an AI condition like
    // display_status in ["delivered","rejected"] reaches formatCondLabel as
    // the single string "delivered,rejected" — not an array. Before the fix,
    // that whole string was used as one i18n key
    // ("statuses.delivered,rejected"), which next-intl's default fallback
    // resolves to the dot-joined path instead of throwing, so the old
    // try/catch never caught it and the chip rendered the literal
    // "emailDisposal.filters.statuses.delivered,rejected" garbage string.
    const aiConditions: AICondition[] = [
      {
        field: "display_status",
        op: "in",
        value: "delivered,rejected",
        source: "ai",
      },
    ];
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={aiConditions}
        onClearAll={vi.fn()}
      />,
    );
    // Both values localized individually and joined with ",".
    expect(
      screen.getByText(
        /emailDisposal\.filters\.statuses\.delivered,emailDisposal\.filters\.statuses\.rejected/,
      ),
    ).toBeInTheDocument();
    // The pre-fix garbled combined-key form must never appear.
    expect(
      screen.queryByText(/statuses\.delivered,rejected/),
    ).not.toBeInTheDocument();
  });

  it("falls back to the raw enum value when the i18n key does not exist, instead of showing the dot-joined path", () => {
    // With a real (non-identity) next-intl fallback, ft() on a missing key
    // returns the dot-joined path rather than throwing — so a try/catch
    // around ft() can never observe the miss. formatCondLabel must check
    // ft.has() explicitly (same pattern as investigations/page.tsx's
    // formatTargetType) and fall back to the raw value.
    const aiConditions: AICondition[] = [
      {
        field: "display_status",
        op: "eq",
        value: "totally_bogus_status_xyz",
        source: "ai",
      },
    ];
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={aiConditions}
        onClearAll={vi.fn()}
      />,
    );
    // Raw value shown as-is.
    expect(screen.getByText(/totally_bogus_status_xyz/)).toBeInTheDocument();
    // Never the resolved-looking dot-joined i18n path for the missing key.
    expect(
      screen.queryByText(
        /emailDisposal\.filters\.statuses\.totally_bogus_status_xyz/,
      ),
    ).not.toBeInTheDocument();
  });

  it("renders an AI disposal_policy_key condition chip with the real module name (not the enum i18n table)", () => {
    const aiConditions: AICondition[] = [
      { field: "disposal_policy_key", op: "eq", value: "IPBL", source: "ai" },
    ];
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={aiConditions}
        onClearAll={vi.fn()}
      />,
    );
    // getModuleName 不走 next-intl mock，直接产出真实中文模块名。
    expect(screen.getByText(/IP黑白名单/)).toBeInTheDocument();
  });

  // Task 11: AICondition.value 从 string 改为结构化 FilterCondition['value']
  // 后，AI chips 应直接命中 formatCondLabel 现有的 Array.isArray 分支逐元素
  // 本地化——不再需要先 String() 拍平再逗号拆分（上面几个用例保留的是历史遗
  // 留的逗号拆分兼容路径，服务旧模板数据）。
  it("localizes a structured (real array) AI condition value via the Array.isArray branch, not the comma-split fallback", () => {
    const aiConditions: AICondition[] = [
      {
        field: "display_status",
        op: "in",
        value: ["delivered", "rejected"],
        source: "ai",
      },
    ];
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={emptyAdvanced}
        aiConditions={aiConditions}
        onClearAll={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /emailDisposal\.filters\.statuses\.delivered,emailDisposal\.filters\.statuses\.rejected/,
      ),
    ).toBeInTheDocument();
  });
});

// GT-12368 刻意的小改进：advanced chips 的数组值原先是"先 join 成逗号串再整体
// 查枚举表"，多值 `in` 条件永远查不中（表里没有 "quarantine,discard" 这个
// key），只会原样落回逗号拼接的裸枚举值。现在改成逐元素 map 后再 join，让每个
// 值都单独走 i18n。
describe("SelectedConditions - advanced chip multi-value enum mapping (GT-12368)", () => {
  it("uses the localized label for advanced-builder field keys", () => {
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={{
          operator: "AND",
          groups: [
            {
              operator: "AND",
              conditions: [
                {
                  field: "header_sender",
                  op: "contains",
                  value: "billing@example.com",
                },
              ],
            },
          ],
        }}
        aiConditions={[]}
        onClearAll={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "emailDisposal.filters.headerSender ∼ billing@example.com",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/header_sender/)).not.toBeInTheDocument();
  });

  it("localizes every value of a multi-value `in` enum condition individually", () => {
    const advanced: AdvancedFilter = {
      operator: "AND",
      groups: [
        {
          operator: "AND",
          conditions: [
            {
              field: "action",
              op: "in" as never,
              value: ["quarantine", "discard"] as never,
            },
          ],
        },
      ],
    };
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={advanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /emailDisposal\.filters\.actions\.quarantine,emailDisposal\.filters\.actions\.discard/,
      ),
    ).toBeInTheDocument();
  });

  it("renders the not_in operator with a localized symbol instead of the raw op code", () => {
    const advanced: AdvancedFilter = {
      operator: "AND",
      groups: [
        {
          operator: "AND",
          conditions: [
            {
              field: "action",
              op: "not_in" as never,
              value: ["quarantine"] as never,
            },
          ],
        },
      ],
    };
    render(
      <SelectedConditions
        quick={baseQuick()}
        advanced={advanced}
        aiConditions={[]}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByText(/∉/)).toBeInTheDocument();
    expect(screen.queryByText(/not_in/)).not.toBeInTheDocument();
  });
});
