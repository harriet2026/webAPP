import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdvancedFilter } from "@/types/log";
import { AdvancedFilters, MAX_ADVANCED_GROUPS } from "./advanced-filters";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

const emptyFilter: AdvancedFilter = { operator: "AND", groups: [] };

describe("AdvancedFilters progressive interaction", () => {
  it("creates the first editable row when the section is opened", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AdvancedFilters value={emptyFilter} onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId("disposal-advanced-filter-trigger"));
    expect(onChange).toHaveBeenCalledWith({
      operator: "AND",
      groups: [
        {
          operator: "AND",
          conditions: [{ field: "", op: "eq" }],
        },
      ],
    });

    rerender(
      <AdvancedFilters value={onChange.mock.calls[0][0]} onChange={onChange} />,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("disposal-advanced-condition-0-0"),
      ).toBeVisible();
    });
    expect(
      screen.getByRole("combobox", {
        name: "emailDisposal.filters.operator",
      }),
    ).toBeDisabled();
    expect(
      screen.getByPlaceholderText(
        "emailDisposal.filters.placeholder.selectFieldFirst",
      ),
    ).toBeDisabled();
  });

  it("adds a usable row together with every new condition group", async () => {
    const initial: AdvancedFilter = {
      operator: "AND",
      groups: [
        {
          operator: "AND",
          conditions: [{ field: "sender", op: "contains", value: "demo" }],
        },
      ],
    };
    const onChange = vi.fn();
    render(<AdvancedFilters value={initial} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("disposal-advanced-filter-trigger"));
    fireEvent.click(screen.getByTestId("disposal-advanced-add-group"));

    expect(onChange).toHaveBeenCalledWith({
      ...initial,
      groups: [
        ...initial.groups,
        {
          operator: "AND",
          conditions: [{ field: "", op: "eq" }],
        },
      ],
    });
  });

  it("removes the group when its final condition is deleted", () => {
    const initial: AdvancedFilter = {
      operator: "AND",
      groups: [
        {
          operator: "AND",
          conditions: [{ field: "sender", op: "contains", value: "demo" }],
        },
      ],
    };
    const onChange = vi.fn();
    render(<AdvancedFilters value={initial} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("disposal-advanced-filter-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "common.delete" }));

    expect(onChange).toHaveBeenCalledWith({
      operator: "AND",
      groups: [],
    });
  });

  it("enforces the five-group product limit in the builder itself", () => {
    const value: AdvancedFilter = {
      operator: "AND",
      groups: Array.from({ length: MAX_ADVANCED_GROUPS }, () => ({
        operator: "AND" as const,
        conditions: [{ field: "", op: "eq" as const }],
      })),
    };
    render(<AdvancedFilters value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("disposal-advanced-filter-trigger"));

    expect(screen.getByTestId("disposal-advanced-add-group")).toBeDisabled();
  });

  it("only offers exact and presence operators for similarity clusters", () => {
    const value: AdvancedFilter = {
      operator: "AND",
      groups: [
        {
          operator: "AND",
          conditions: [
            { field: "similar_cluster", op: "eq", value: "default:42" },
          ],
        },
      ],
    };
    render(<AdvancedFilters value={value} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("disposal-advanced-filter-trigger"));
    fireEvent.click(screen.getByTestId("disposal-advanced-operator-0-0"));

    for (const op of ["eq", "neq", "is_null", "is_not_null", "in", "not_in"]) {
      expect(
        screen.getByTestId(`disposal-advanced-operator-option-${op}`),
      ).toBeInTheDocument();
    }
    for (const op of [
      "contains",
      "not_contains",
      "starts_with",
      "ends_with",
      "regex",
    ]) {
      expect(
        screen.queryByTestId(`disposal-advanced-operator-option-${op}`),
      ).not.toBeInTheDocument();
    }
  });
});
