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

  it("disables batch action buttons when nothing is selected (export stays enabled for export-all)", () => {
    renderTable({ selectedIds: new Set<number>() });
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.release/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.delete/ }),
    ).toBeDisabled();
    // 未选中时导出按钮变为「导出全部筛选」，保持可用（仅 exportLoading 时禁用）
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.export/ }),
    ).toBeEnabled();
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
      "group-data-[hovered=true]:bg-[color-mix(in_srgb,var(--muted)_45%,var(--card))]",
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
      "data-[state=selected]:data-[hovered=true]:bg-primary/10",
    );
    expect(operationsCell).toHaveClass(
      "bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]",
      "group-data-[hovered=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]",
    );

    fireEvent.pointerEnter(row, { pointerType: "mouse" });
    expect(row).toHaveAttribute("data-hovered", "true");
  });
});

// GT-12585: 勾选列在横向滚动时固定在表格左侧（与右侧 sticky 操作列同款
// 模式：sticky + 不透明背景遮挡滚过的内容 + border 分隔）。
describe("MailListTable sticky select column (GT-12585)", () => {
  it("pins the header select cell to the left with an opaque background", () => {
    renderTable();
    const head = screen.getByTestId("disposal-select-column");
    expect(head).toHaveClass("sticky", "left-0", "z-30", "border-r", "bg-card");
  });

  it("pins each row's select cell with hover/selected backgrounds mirroring the operations column", () => {
    renderTable({ selectedIds: new Set([1]) });
    const cell = screen.getByLabelText("Select email 1").closest("td")!;
    // 选中态下 tailwind-merge 用 primary 混色背景替换 bg-card（与操作列一致）。
    expect(cell).toHaveClass("sticky", "left-0", "z-10", "border-r");
    expect(cell).toHaveClass(
      "bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]",
      "group-data-[hovered=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]",
    );
    const unselected = screen.getByLabelText("Select email 2").closest("td")!;
    expect(unselected).toHaveClass("sticky", "left-0", "bg-card");
    expect(unselected).not.toHaveClass("bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]");
  });
});

// GT-12578 / GT-12686：落地 spec
// design/implement/spec/2026-07-07-mail-disposal-investigation-center-design.md:168
// 规定「合成失败/无命中时 disposal_basis 存 null，前端回退现有 MailLog.Reason
// 自由文本」。此前列表这一列在 disposalBasis 缺失时直接落 '—'，于是
// mail_marking（接收标记）这类不参与 disposal_basis 合成的规则命中后，
// 管理员在列表上看不到任何线索——尽管规则名早已由 decision.go 写进
// mail_log.reason，并且后端列表接口一直在返回该字段。
describe("处置依据列的 reason 回退 (GT-12578/GT-12686)", () => {
  it("disposalBasis 缺失但有 reason 时显示 reason 而不是 —", () => {
    const item: DisposalMailItem = {
      ...makeItem(1),
      disposalBasis: undefined,
      reason: "rule f01-receive-mark-001 matched at data stage",
    };
    renderTable({ items: [item] });
    expect(
      screen.getAllByText("rule f01-receive-mark-001 matched at data stage").length,
    ).toBeGreaterThan(0);
  });

  it("disposalBasis 与 reason 都缺失时仍显示 —", () => {
    const item: DisposalMailItem = {
      ...makeItem(1),
      disposalBasis: undefined,
      reason: undefined,
    };
    const { container } = renderTable({ items: [item] });
    expect(container.textContent).toContain("—");
  });
});
