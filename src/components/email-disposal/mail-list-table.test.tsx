import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MailListTable } from "./mail-list-table";
import type { DisposalMailItem } from "@/types/email-disposal";
import { formatDate } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const { relativeTimeMock } = vi.hoisted(() => ({
  relativeTimeMock: vi.fn(),
}));

// Identity translator (keeps `namespace.key` / `namespace.key:{params}` visible)
// so assertions stay decoupled from messages/*.json copy. `t.has` must exist
// because mail-list-table's localizeEnum probes it (GT-11917).
vi.mock("next-intl", () => {
  const useTranslations = (namespace: string) => {
    const fn = (key: string, params?: Record<string, unknown>) =>
      params
        ? `${namespace}.${key}:${JSON.stringify(params)}`
        : `${namespace}.${key}`;
    (fn as unknown as { has: (key: string) => boolean }).has = (key: string) =>
      key !== "filters.external-relay";
    return fn;
  };
  return {
    useTranslations,
    useLocale: () => "zh",
    useFormatter: () => ({ relativeTime: relativeTimeMock }),
  };
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
    // GT-12782 Task 4：后端下发的展示状态列表（一致邮件单元素）。
    displayStatuses: [{ status: "quarantine_pending", count: 1 }],
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
    requestFn: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  return render(
    <TooltipProvider>
      <QueryClientProvider client={qc}>
        <MailListTable {...props} />
      </QueryClientProvider>
    </TooltipProvider>,
  );
}

describe("MailListTable toolbar (GT-11580)", () => {
  beforeEach(() => {
    localStorage.clear();
    relativeTimeMock.mockReset();
    relativeTimeMock.mockImplementation((date: Date) => `relative:${date.toISOString()}`);
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

  it("shows localized relative time with the absolute timestamp in a tooltip", async () => {
    const item = makeItem(1);
    renderTable({ items: [item], total: 1 });

    const relativeText = `relative:${new Date(item.timestamp).toISOString()}`;
    const timeCell = screen.getByTestId("disposal-cell-1-time");
    await waitFor(() => expect(timeCell).toHaveTextContent(relativeText));
    expect(relativeTimeMock).toHaveBeenCalledWith(new Date(item.timestamp));

    const timeTrigger = screen.getByText(relativeText);
    fireEvent.pointerEnter(timeTrigger, { pointerType: "mouse" });
    fireEvent.mouseEnter(timeTrigger);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(formatDate(item.timestamp));
  });

  it("keeps the existing absolute fallback for an invalid timestamp", () => {
    const item = { ...makeItem(1), timestamp: "not-a-date" };
    renderTable({ items: [item], total: 1 });

    expect(screen.getByTestId("disposal-cell-1-time")).toHaveTextContent(formatDate(item.timestamp));
    expect(relativeTimeMock).not.toHaveBeenCalled();
  });

  it("renders unambiguous localized direction badges with a safe unknown fallback", () => {
    const items = [
      { ...makeItem(1), direction: "incoming" },
      { ...makeItem(2), direction: "outgoing" },
      { ...makeItem(3), direction: "internal" },
      { ...makeItem(4), direction: "external-relay" },
    ];
    renderTable({ items, total: items.length });

    expect(screen.getByTestId("disposal-cell-1-direction")).toHaveTextContent(
      "emailDisposal.filters.incoming",
    );
    expect(screen.getByTestId("disposal-cell-2-direction")).toHaveTextContent(
      "emailDisposal.filters.outgoing",
    );
    expect(screen.getByTestId("disposal-cell-3-direction")).toHaveTextContent(
      "emailDisposal.filters.internal",
    );
    expect(screen.getByTestId("disposal-cell-4-direction")).toHaveTextContent(
      "external-relay",
    );
  });

  it("applies distinct direction colors and a compact neutral fallback", () => {
    const items = [
      { ...makeItem(1), direction: "incoming" },
      { ...makeItem(2), direction: "outgoing" },
      { ...makeItem(3), direction: "internal" },
      { ...makeItem(4), direction: "external-relay" },
    ];
    renderTable({ items, total: items.length });

    const badgeOf = (id: number) =>
      screen.getByTestId(`disposal-cell-${id}-direction`).querySelector('[data-slot="badge"]');

    expect(badgeOf(1)).toHaveClass("border-blue-500", "text-blue-600", "h-5", "font-normal");
    expect(badgeOf(2)).toHaveClass("border-emerald-500", "text-emerald-600", "h-5", "font-normal");
    expect(badgeOf(3)).toHaveClass("border-border", "text-muted-foreground", "h-5", "font-normal");
    expect(badgeOf(4)).toHaveClass("border-border", "text-muted-foreground", "h-5", "font-normal");
  });

  it("combines the sender and all recipients into one column with a complete tooltip", async () => {
    const item = {
      ...makeItem(1),
      recipientList: ["first@example.com", "second@example.com"],
    };
    renderTable({ items: [item], total: 1 });

    expect(
      screen.getByTestId("disposal-column-header-senderRecipient"),
    ).toHaveTextContent("emailDisposal.table.senderRecipient");
    expect(screen.queryByTestId("disposal-column-header-sender")).not.toBeInTheDocument();
    expect(screen.queryByTestId("disposal-column-header-recipient")).not.toBeInTheDocument();

    const cell = screen.getByTestId("disposal-cell-1-senderRecipient");
    expect(cell).toHaveTextContent(item.sender);
    expect(cell).toHaveTextContent("first@example.com, second@example.com");
    expect(cell.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByTestId("disposal-cell-1-sender")).not.toBeInTheDocument();
    expect(screen.queryByTestId("disposal-cell-1-recipient")).not.toBeInTheDocument();

    const trigger = cell.querySelector<HTMLElement>('[data-slot="tooltip-trigger"]');
    expect(trigger).not.toBeNull();
    fireEvent.pointerEnter(trigger!, { pointerType: "mouse" });
    fireEvent.mouseEnter(trigger!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      `${item.sender} → first@example.com, second@example.com`,
    );
  });

  it("falls back to the single recipient in the combined column", () => {
    const item = makeItem(1);
    renderTable({ items: [item], total: 1 });

    expect(screen.getByTestId("disposal-cell-1-senderRecipient")).toHaveTextContent(
      item.recipient,
    );
  });

  it("offers one combined sender-recipient option in column settings", async () => {
    renderTable();
    fireEvent.click(screen.getByTestId("disposal-column-settings"));

    expect(
      await screen.findByTestId("disposal-column-toggle-senderRecipient"),
    ).toHaveTextContent("emailDisposal.table.senderRecipient");
    expect(screen.queryByTestId("disposal-column-toggle-sender")).not.toBeInTheDocument();
    expect(screen.queryByTestId("disposal-column-toggle-recipient")).not.toBeInTheDocument();
  });

  it("switches to compact density without shrinking table text and persists the preference", async () => {
    renderTable();

    const timeHead = screen.getByTestId("disposal-column-header-time");
    const timeCell = screen.getByTestId("disposal-cell-1-time");
    expect(timeHead).toHaveClass("h-11", "text-xs");
    expect(timeCell).toHaveClass("py-3", "text-xs");

    fireEvent.click(screen.getByTestId("disposal-column-settings"));
    expect(await screen.findByText("emailDisposal.table.densitySettings")).toBeInTheDocument();
    const toggle = screen.getByTestId("disposal-density-toggle");
    expect(toggle).toHaveTextContent("emailDisposal.table.compactDensity");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(localStorage.getItem("osg.disposal.density")).toBe("compact");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(timeHead).toHaveClass("h-8", "text-xs");
    expect(timeCell).toHaveClass("py-1.5", "text-xs");
    expect(screen.getByTestId("disposal-select-column")).toHaveClass("h-8");
    expect(screen.getByTestId("disposal-operations-column")).toHaveClass("h-8");
    expect(screen.getByTestId("disposal-cell-1-select")).toHaveClass("py-1.5");
    expect(screen.getByTestId("disposal-cell-1-operations")).toHaveClass("py-1.5");
  });

  it("restores compact density from localStorage after client hydration", async () => {
    localStorage.setItem("osg.disposal.density", "compact");
    renderTable();

    await waitFor(() =>
      expect(screen.getByTestId("disposal-column-header-time")).toHaveClass("h-8"),
    );
    expect(screen.getByTestId("disposal-cell-1-time")).toHaveClass("py-1.5");

    fireEvent.click(screen.getByTestId("disposal-column-settings"));
    expect(await screen.findByTestId("disposal-density-toggle")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("ignores an unsupported stored density and keeps the comfortable default", async () => {
    localStorage.setItem("osg.disposal.density", "ultra-compact");
    renderTable();

    await waitFor(() =>
      expect(localStorage.getItem("osg.disposal.hiddenColumns")).not.toBeNull(),
    );
    expect(screen.getByTestId("disposal-column-header-time")).toHaveClass("h-11");
    expect(screen.getByTestId("disposal-cell-1-time")).toHaveClass("py-3");

    fireEvent.click(screen.getByTestId("disposal-column-settings"));
    expect(await screen.findByTestId("disposal-density-toggle")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("renders the compact view action as an accessible icon with a tooltip", async () => {
    const onItemClick = vi.fn();
    renderTable({ items: [makeItem(1)], total: 1, onItemClick });

    const viewButton = screen.getByTestId("disposal-view-1");
    expect(viewButton).toHaveAccessibleName("emailDisposal.table.view");
    expect(viewButton.textContent).toBe("");

    fireEvent.pointerEnter(viewButton, { pointerType: "mouse" });
    fireEvent.mouseEnter(viewButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "emailDisposal.table.view",
    );

    fireEvent.click(viewButton);
    expect(onItemClick).toHaveBeenCalledWith(1);
  });

  it("renders find-similar as an accessible icon without changing its action", async () => {
    const onFindSimilar = vi.fn();
    renderTable({
      items: [makeItem(1)],
      total: 1,
      onFindSimilar,
    });

    const findSimilarButton = screen.getByTestId("disposal-find-similar-1");
    expect(findSimilarButton).toHaveAccessibleName(
      "emailDisposal.table.findSimilar",
    );
    expect(findSimilarButton.textContent).toBe("");

    fireEvent.pointerEnter(findSimilarButton, { pointerType: "mouse" });
    fireEvent.mouseEnter(findSimilarButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "emailDisposal.table.findSimilarTooltip",
    );

    fireEvent.click(findSimilarButton);
    expect(onFindSimilar).toHaveBeenCalledWith(1);
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

// GT-12782 Task 4：门禁与状态列改读后端下发的 display_statuses 列表。
// 门禁语义 = 「列表包含待处置/已投递类状态」——mixed 邮件按包含语义参与
// （信里有待处置/已投递的收件人即可用），与筛选同源，刻意设计。
describe("MailListTable display_statuses list consumption (GT-12782)", () => {
  it("enables 批量放行 when every selected item's list contains a pending status (mixed containment)", () => {
    const mixed: DisposalMailItem = {
      ...makeItem(1),
      action: "mixed",
      displayStatuses: [
        { status: "quarantine_pending", count: 1 },
        { status: "delivered", count: 2 },
      ],
    };
    renderTable({ items: [mixed], selectedIds: new Set([1]) });
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.release/ }),
    ).toBeEnabled();
    // 同一封信含已投递收件人 → 召回门禁同样按包含语义放开。
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.recall/ }),
    ).toBeEnabled();
  });

  it("disables 批量放行/召回 when the list contains neither pending nor delivered statuses", () => {
    const rejected: DisposalMailItem = {
      ...makeItem(1),
      action: "reject",
      displayStatuses: [{ status: "rejected", count: 1 }],
    };
    renderTable({ items: [rejected], selectedIds: new Set([1]) });
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.release/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /emailDisposal\.batch\.recall/ }),
    ).toBeDisabled();
  });

  it("renders a single badge for a single-element list (existing look)", () => {
    renderTable({ items: [makeItem(1)] });
    expect(
      screen.getByText("emailDisposal.filters.statuses.quarantine_pending"),
    ).toBeInTheDocument();
  });

  it("renders the risk-primary badge from a multi-element authoritative list", () => {
    const mixed: DisposalMailItem = {
      ...makeItem(1),
      action: "mixed",
      displayStatuses: [
        { status: "quarantine_pending", count: 1 },
        { status: "delivered", count: 2 },
      ],
    };
    const { container } = renderTable({ items: [mixed] });
    expect(container.textContent).toContain(
      "emailDisposal.filters.statuses.quarantine_pending 1",
    );
    expect(container.textContent).toContain("+1");
    expect(container.textContent).not.toContain(
      "emailDisposal.filters.statuses.delivered 2",
    );
  });

  it("prioritizes the active display-status filter without deriving from recipients", () => {
    const mixed: DisposalMailItem = {
      ...makeItem(1),
      action: "mixed",
      displayStatuses: [
        { status: "quarantine_pending", count: 1 },
        { status: "delivered", count: 6 },
      ],
    };
    const { container } = renderTable({
      items: [mixed],
      activeDisplayStatuses: ["delivered"],
    });
    expect(container.textContent).toContain(
      "emailDisposal.filters.statuses.delivered 6",
    );
  });

  it("renders authoritative recall status for mixed mail even when recipient dispositions exist", () => {
    const recalled: DisposalMailItem = {
      ...makeItem(1),
      action: "mixed",
      displayStatuses: [{ status: "recall_success", count: 1 }],
      recipientDispositions: [
        { recipient: "ok@example.com", final_action: "accept", status: "delivered" },
        { recipient: "held@example.com", final_action: "quarantine", status: "quarantined" },
      ],
    };

    renderTable({ items: [recalled] });
    expect(screen.getByText("emailDisposal.filters.statuses.recall_success")).toBeInTheDocument();
    expect(screen.queryByText("emailDisposal.filters.statuses.delivered")).not.toBeInTheDocument();
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

// GT-12970：只命中非终态/加工规则时，结构化 modules[] 已明确说明“有命中但
// 没有最终处置依据”。此时不能再用 reason 把命中规则冒充为处置依据。
describe("处置依据列：结构化 hit-only facts 不回退 reason (GT-12970)", () => {
  it("disposalBasis 只有命中模块时显示占位符，不显示 reason", () => {
    const item: DisposalMailItem = {
      ...makeItem(1),
      disposalBasis: {
        policy_key: "",
        modules: [
          { policy_key: "", rule_name: "接收标记规则", action: "accept" },
        ],
      },
      reason: "rule f01-receive-mark-001 matched at data stage",
    };
    renderTable({ items: [item] });
    expect(screen.queryByText("rule f01-receive-mark-001 matched at data stage")).not.toBeInTheDocument();
  });

  it("policy_key 非空时照常走 formatListReason", () => {
    const item: DisposalMailItem = {
      ...makeItem(1),
      disposalBasis: {
        policy_key: "CR",
        rule_name: "内容规则A",
        rule_id: "CR-66",
        action: "quarantine",
        hit_values: { match_method: "keyword", match_content: "发票" },
      },
      reason: "should not be used",
    };
    const { container } = renderTable({ items: [item] });
    expect(container.textContent).toContain("内容规则A");
    expect(container.textContent).not.toContain("should not be used");
  });
});
