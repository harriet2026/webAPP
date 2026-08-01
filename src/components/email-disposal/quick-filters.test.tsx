import { render, screen } from "@testing-library/react";
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
          <button type="button" data-testid="tenant-selector">
            tenant
          </button>
        }
      />,
    );

    const grid = screen.getByTestId("disposal-quick-filters");
    const tenantSelector = screen.getByTestId("tenant-selector");

    expect(grid.firstElementChild).toContainElement(tenantSelector);
    expect(grid.firstElementChild).toHaveTextContent(
      "emailDisposal.filters.tenantScope",
    );
  });
});
