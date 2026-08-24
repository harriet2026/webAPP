import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type HTMLAttributes } from "react";

// TEST-3 (review): switching the platform page's private tenant scope must
// clear the list selection and re-fetch under the new X-Tenant-ID without
// changing the global impersonation context.

const apiRequestMock = vi.fn();
const getDisposalListMock = vi.fn();
const useScopedApiRequestMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
  useScopedApiRequest: (tenantId: number | null) =>
    useScopedApiRequestMock(tenantId),
}));

vi.mock("next-intl", () => ({
  useTranslations: (_ns?: string) => {
    const translate = Object.assign(
      (key: string, params?: Record<string, string | number>) => {
        void _ns;
        if (params) {
          return Object.entries(params).reduce(
            (s, [k, v]) => s.replace(`{${k}}`, String(v)),
            key,
          );
        }
        return key;
      },
      { has: () => false },
    );
    return translate;
  },
  useLocale: () => "zh",
  useFormatter: () => ({
    relativeTime: (value: Date) => value.toISOString(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  // GT-12608：中心页首载读 ?view= 深链参数。
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const useTenantMock = vi.fn();
vi.mock("@/hooks/use-tenant", () => ({
  useTenant: () => useTenantMock(),
}));

const useProductFormMock = vi.fn();
vi.mock("@/contexts/product-form-context", () => ({
  useProductForm: () => useProductFormMock(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    isSystemAdmin: true,
    selectedTenantId: null,
    user: { role: "system_admin" },
    hasPermission: () => true,
    features: { aiInterpret: true },
  }),
}));

// Capture getDisposalList invocations so we can assert the tenant scope.
vi.mock("@/components/email-disposal/lib/disposal-api", () => ({
  getDisposalList: (...args: unknown[]) =>
    getDisposalListMock(...(args as [unknown])),
  bulkDispose: vi.fn(),
  findSimilar: vi.fn(),
}));

vi.mock("@/components/shared/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    createElement("div", null, children),
  PageHeader: () => null,
  PageSurface: ({ children }: { children: React.ReactNode }) =>
    createElement("div", null, children),
  // 页面已改用 FramedPage 包裹（master 侧改动），mock 缺该导出会让本用例恒红。
  FramedPage: ({ children }: { children: React.ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/shared/page-filters", () => ({
  PageFilters: ({
    children,
    ...props
  }: HTMLAttributes<HTMLDivElement>) => createElement("div", props, children),
}));
vi.mock("@/components/shared/server-pagination", () => ({
  ServerPagination: () => null,
}));
vi.mock("@/components/layout/tenant-selector", () => ({
  TenantSelector: ({
    onChange,
  }: {
    onChange?: (tenantId: number | null) => void;
  }) =>
    createElement(
      "button",
      { onClick: () => onChange?.(2) },
      "select tenant B",
    ),
}));
// 09ee6b4cdd：结构化筛选（含平台租户选择器）折叠进「高级筛选」开关后面。展开开关在
// SearchBar 里、租户选择器作为 tenantSelector 传给 QuickFilters —— 两者都要在 mock 里
// 渲染出来，否则页面本地平台作用域切换无从触发。
vi.mock("@/components/email-disposal/search-bar", () => ({
  SearchBar: ({
    onToggleFilters,
    onSearch,
    hasPendingFilters,
  }: {
    onToggleFilters?: () => void;
    onSearch?: (query: string) => void;
    hasPendingFilters?: boolean;
  }) =>
    createElement(
      "div",
      null,
      createElement(
        "button",
        {
          "data-testid": "disposal-filters-toggle",
          onClick: onToggleFilters,
        },
        "toggle filters",
      ),
      createElement(
        "button",
        {
          "data-testid": "disposal-search-submit",
          "data-has-pending-filters": hasPendingFilters ? "true" : "false",
          onClick: () => onSearch?.(""),
        },
        "apply filters",
      ),
    ),
}));
vi.mock("@/components/email-disposal/quick-filters", () => ({
  QuickFilters: ({
    tenantSelector,
    value,
    onChange,
  }: {
    tenantSelector?: import("react").ReactNode;
    value: { sender?: string };
    onChange: (value: { sender?: string }) => void;
  }) =>
    createElement(
      "div",
      null,
      tenantSelector,
      createElement("input", {
        "aria-label": "sender draft",
        value: value.sender ?? "",
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          onChange({ ...value, sender: event.target.value }),
      }),
    ),
}));
vi.mock("@/components/email-disposal/advanced-filters", () => ({
  AdvancedFilters: () => null,
}));
vi.mock("@/components/email-disposal/selected-conditions", () => ({
  SelectedConditions: () => null,
}));
vi.mock("@/components/email-disposal/detail-modal", () => ({
  DetailModal: () => null,
}));
vi.mock("@/components/email-disposal/similar-results-sheet", () => ({
  SimilarResultsSheet: () => null,
}));

import { EmailDisposalCenterPage } from "@/components/email-disposal/email-disposal-center-page";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(EmailDisposalCenterPage),
    ),
  );
}

function item(id: number) {
  return {
    id,
    sender: `s${id}@x.com`,
    recipients: [`r${id}@y.com`],
    subject: `subj ${id}`,
    action: "quarantine",
    status: "",
    authenticated: false,
    received_at: "2026-01-01T00:00:00Z",
    // GT-12782 Task 4：DisposalMailItem 的展示状态来自后端下发列表。
    displayStatuses: [{ status: "quarantine_pending", count: 1 }],
  };
}

describe("EmailDisposalCenterPage tenant-switch reset (review TEST-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProductFormMock.mockReturnValue({
      capabilities: { multiTenant: true, ai: false },
      viewer: "platform",
    });
    useScopedApiRequestMock.mockImplementation(() => ({
      apiRequest: apiRequestMock,
    }));
    apiRequestMock.mockResolvedValue({});
    getDisposalListMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
  });

  it("applies a page-local platform scope only after Search is clicked", async () => {
    useTenantMock.mockReturnValue({
      effectiveTenantId: null,
      selectedTenantId: null,
    });
    getDisposalListMock.mockResolvedValueOnce({
      items: [item(1)],
      total: 1,
      page: 1,
      page_size: 20,
    });

    const { findByRole, getByTestId } = renderPage();

    await waitFor(() => expect(getDisposalListMock).toHaveBeenCalled());
    const firstCall = getDisposalListMock.mock.calls.length;

    // 筛选区按最新规格默认展开，平台租户选择器可直接操作。
    fireEvent.click(await findByRole("button", { name: "select tenant B" }));

    await waitFor(() =>
      expect(getByTestId("disposal-search-submit")).toBeEnabled(),
    );
    expect(getDisposalListMock).toHaveBeenCalledTimes(firstCall);

    fireEvent.click(getByTestId("disposal-search-submit"));
    await waitFor(() => {
      expect(getDisposalListMock.mock.calls.length).toBeGreaterThan(firstCall);
    });
    expect(useScopedApiRequestMock).toHaveBeenLastCalledWith(2);
  });

  it("does not re-fetch while editing and applies the draft on Enter", async () => {
    useTenantMock.mockReturnValue({
      effectiveTenantId: null,
      selectedTenantId: null,
    });
    const { getByLabelText, getByTestId } = renderPage();

    await waitFor(() => expect(getDisposalListMock).toHaveBeenCalled());
    const firstCall = getDisposalListMock.mock.calls.length;
    fireEvent.change(getByLabelText("sender draft"), {
      target: { value: "billing@example.com" },
    });

    await waitFor(() =>
      expect(getByTestId("disposal-search-submit")).toBeEnabled(),
    );
    expect(getDisposalListMock).toHaveBeenCalledTimes(firstCall);

    fireEvent.keyDown(getByLabelText("sender draft"), {
      key: "Enter",
      code: "Enter",
    });
    await waitFor(() =>
      expect(getDisposalListMock.mock.calls.length).toBeGreaterThan(firstCall),
    );
  });

  it("keeps Search enabled and refreshes an unchanged effective query", async () => {
    useTenantMock.mockReturnValue({
      effectiveTenantId: null,
      selectedTenantId: null,
    });
    const { getByTestId } = renderPage();

    await waitFor(() => expect(getDisposalListMock).toHaveBeenCalled());
    const firstCall = getDisposalListMock.mock.calls.length;
    const search = getByTestId("disposal-search-submit");

    expect(search).toBeEnabled();
    expect(search).toHaveAttribute("data-has-pending-filters", "false");

    fireEvent.click(search);

    await waitFor(() =>
      expect(getDisposalListMock.mock.calls.length).toBeGreaterThan(firstCall),
    );
  });
});
