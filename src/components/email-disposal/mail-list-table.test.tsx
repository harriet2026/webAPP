import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailListTable } from "./mail-list-table";
import type { DisposalMailItem } from "@/types/email-disposal";

// Identity translator (keeps `namespace.key` / `namespace.key:{params}` visible)
// so assertions stay decoupled from messages/*.json copy. `t.has` must exist
// because mail-list-table's localizeEnum probes it (GT-11917).
vi.mock("next-intl", () => {
  const useTranslations = (namespace: string) => {
    const fn = (key: string, params?: Record<string, unknown>) =>
      params
        ? `${namespace}.${key}:${JSON.stringify(params)}`
        : `${namespace}.${key}`;
    (fn as unknown as { has: () => boolean }).has = () => true;
    return fn;
  };
  return { useTranslations, useLocale: () => "zh" };
});

vi.mock("./lib/disposal-api", () => ({
  resolveDomainTypes: vi.fn(),
  recallMails: vi.fn(),
}));

function makeItem(id: number): DisposalMailItem {
  return {
    id,
    timestamp: "2026-07-15T10:00:00Z",
    direction: "inbound",
    sender: `s${id}@example.com`,
    recipient: `r${id}@example.com`,
    subject: `subject ${id}`,
    action: "quarantine",
    status: "quarantined",
    displayStatus: "quarantine_pending",
  };
}

function renderTable(
  overrides: Partial<React.ComponentProps<typeof MailListTable>> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props: React.ComponentProps<typeof MailListTable> = {
    items: [makeItem(1), makeItem(2)],
    loading: false,
    selectedIds: new Set<number>(),
    onSelectionChange: vi.fn(),
    onItemClick: vi.fn(),
    onBatchAction: vi.fn(),
    total: 2,
    aiEnabled: true,
    headerFilters: { directions: [], emailTypes: [], statuses: [] },
    onHeaderFiltersChange: vi.fn(),
    timeSort: "none",
    onTimeSortChange: vi.fn(),
    ...overrides,
  };
  return render(
    <QueryClientProvider client={qc}>
      <MailListTable {...props} />
    </QueryClientProvider>,
  );
}

describe("MailListTable toolbar (GT-11580)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the batch toolbar permanently even with no selection", () => {
    renderTable({ selectedIds: new Set<number>() });
    // Batch buttons are always present (spec §6.3 "启用条件" = disabled, not hidden).
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.release/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.delete/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.export/ }),
    ).toBeInTheDocument();
  });

  it("disables batch action buttons when nothing is selected", () => {
    renderTable({ selectedIds: new Set<number>() });
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.release/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.delete/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.export/ }),
    ).toBeDisabled();
  });

  it("enables batch action buttons when at least one row is selected", () => {
    renderTable({ selectedIds: new Set<number>([1]) });
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.release/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.delete/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.export/ }),
    ).toBeEnabled();
  });

  it('shows the total count ("共 N 条")', () => {
    renderTable({ total: 42 });
    expect(
      screen.getByText('emailDisposal.table.total:{"n":42}'),
    ).toBeInTheDocument();
  });

  it("renders the column-settings button", () => {
    renderTable();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.table\.settings/ }),
    ).toBeInTheDocument();
  });

  it("cycles the time sort control through the controlled callback", () => {
    const onTimeSortChange = vi.fn();
    renderTable({ timeSort: "none", onTimeSortChange });
    fireEvent.click(screen.getByTestId("disposal-time-sort"));
    expect(onTimeSortChange).toHaveBeenCalledWith("asc");
  });

  it("keeps the operations header and cells pinned to the right", () => {
    renderTable();

    expect(screen.getByTestId("disposal-operations-column")).toHaveClass(
      "sticky",
      "right-0",
    );
    expect(screen.getByTestId("disposal-view-1").closest("td")).toHaveClass(
      "sticky",
      "right-0",
    );
  });

  it("gives clickable rows pointer-compatible gentle hover feedback", () => {
    renderTable();
    const row = screen.getByTestId("disposal-mail-row-1");
    const operationsCell = screen.getByTestId("disposal-view-1").closest("td");

    expect(row).not.toHaveAttribute("data-hovered");
    expect(operationsCell).toHaveClass(
      "group-data-[hovered=true]:bg-muted/45",
      "duration-[180ms]",
    );

    fireEvent.pointerEnter(row, { pointerType: "mouse" });
    expect(row).toHaveAttribute("data-hovered", "true");

    fireEvent.pointerLeave(row, { pointerType: "mouse" });
    expect(row).not.toHaveAttribute("data-hovered");

    fireEvent.pointerEnter(row, { pointerType: "touch" });
    expect(row).not.toHaveAttribute("data-hovered");
  });

  it("keeps selected feedback stronger than hover across the sticky cell", () => {
    renderTable({ selectedIds: new Set<number>([1]) });
    const row = screen.getByTestId("disposal-mail-row-1");
    const operationsCell = screen.getByTestId("disposal-view-1").closest("td");

    expect(row).toHaveAttribute("data-state", "selected");
    expect(row).toHaveClass(
      "bg-primary/5",
      "data-[hovered=true]:bg-primary/10",
    );
    expect(operationsCell).toHaveClass(
      "bg-primary/5",
      "group-data-[hovered=true]:bg-primary/10",
    );

    fireEvent.pointerEnter(row, { pointerType: "mouse" });
    expect(row).toHaveAttribute("data-hovered", "true");
  });
});
