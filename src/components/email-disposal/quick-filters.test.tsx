import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuickFilters } from "./quick-filters";

vi.mock("next-intl", () => ({
  useLocale: () => "zh",
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

vi.mock("@/contexts/product-form-context", () => ({
  useProductForm: () => ({
    viewer: "tenant",
    capabilities: { multiTenant: false },
  }),
}));

vi.mock("@/hooks/use-hydrated", () => ({
  useHydrated: () => true,
}));

describe("QuickFilters grid layout", () => {
  it("does not reserve an empty grid cell when the tenant selector is absent", () => {
    render(<QuickFilters value={{}} onChange={vi.fn()} />);

    const grid = screen.getByTestId("disposal-quick-filters");
    const dateRange = screen.getByTestId("disposal-date-range");

    expect(grid.firstElementChild).toContainElement(dateRange);
  });

  it("keeps the tenant selector in the first grid cell when provided", () => {
    render(
      <QuickFilters
        value={{}}
        onChange={vi.fn()}
        tenantSelector={
          // 刻意**不**复用生产的 `tenant-selector` testid：QuickFilters 只关心
          // 传进来的节点被放在第一格，与它具体是谁无关。冒用生产 testid 会让
          // qc 的 testid 契约检查（scripts/playwright/lib/yml/testid-contract.mjs）
          // 认为该 testid 在全仓有两处定义，对每一条引用它的用例都报 ambiguous。
          <button type="button" data-testid="quick-filters-tenant-slot-stub">
            tenant
          </button>
        }
      />,
    );

    const grid = screen.getByTestId("disposal-quick-filters");
    const tenantSelector = screen.getByTestId("quick-filters-tenant-slot-stub");

    expect(grid.firstElementChild).toContainElement(tenantSelector);
    expect(grid.firstElementChild).toHaveTextContent(
      "emailDisposal.filters.tenantScope",
    );
  });

  it("forwards rule-search text so options can be searched globally", () => {
    const onDisposalRuleSearchChange = vi.fn();
    render(
      <QuickFilters
        value={{}}
        onChange={vi.fn()}
        onDisposalRuleSearchChange={onDisposalRuleSearchChange}
      />,
    );

    fireEvent.click(screen.getByTestId("disposal-policy-filter-trigger"));
    fireEvent.click(screen.getByTestId("disposal-policy-rule-mode"));
    fireEvent.change(screen.getByTestId("disposal-policy-rule-search"), {
      target: { value: "CR-77" },
    });
    expect(onDisposalRuleSearchChange).toHaveBeenLastCalledWith("CR-77");
  });
});
