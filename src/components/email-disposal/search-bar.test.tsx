import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "./search-bar";
import { parseQuery } from "./lib/disposal-api";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const translate = (key: string) => `${namespace}.${key}`;
    translate.raw = (key: string) =>
      key === "samples" ? ["sample query"] : [];
    return translate;
  },
}));

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api/client", () => ({
  useApiRequest: () => ({ apiRequest: vi.fn() }),
}));

vi.mock("./lib/disposal-api", () => ({
  parseQuery: vi.fn(),
}));

const mockedParseQuery = vi.mocked(parseQuery);

function renderSearchBar(
  overrides: Partial<React.ComponentProps<typeof SearchBar>> = {},
) {
  const props: React.ComponentProps<typeof SearchBar> = {
    onAiParsed: vi.fn(),
    onSearch: vi.fn(),
    onReset: vi.fn(),
    aiEnabled: false,
    ...overrides,
  };
  return { props, ...render(<SearchBar {...props} />) };
}

describe("SearchBar actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables empty search and applies a non-empty plain query", () => {
    const { props } = renderSearchBar();
    const submit = screen.getByTestId("disposal-search-submit");

    expect(submit).toBeDisabled();
    expect(submit).toHaveClass(
      "h-9",
      "gap-1.5",
      "px-4",
      "disabled:bg-muted",
      "disabled:opacity-100",
    );
    fireEvent.change(screen.getByTestId("disposal-natural-language-input"), {
      target: { value: "Q2 report" },
    });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(props.onSearch).toHaveBeenCalledWith("Q2 report");
  });

  it("enables the primary action for a pending structured-filter draft", () => {
    const { props } = renderSearchBar({ hasPendingFilters: true });

    fireEvent.click(screen.getByTestId("disposal-search-submit"));

    expect(props.onSearch).toHaveBeenCalledWith("");
  });

  it("uses one compact visual rhythm for the search action group", () => {
    renderSearchBar();

    expect(screen.getByTestId("disposal-natural-language-input")).toHaveClass(
      "h-9",
    );
    for (const testId of [
      "disposal-search-reset",
      "disposal-template-menu",
      "disposal-filters-toggle",
    ]) {
      const button = screen.getByTestId(testId);
      expect(button).toHaveClass("h-9", "gap-1.5", "px-3");
      expect(button.querySelector("svg")).not.toHaveClass("mr-2", "ml-2");
    }
    expect(screen.getByTestId("disposal-filters-toggle")).toHaveClass(
      "min-w-[7.875rem]",
    );
  });

  it("clears the local query and every parent filter when reset is clicked", () => {
    const { props } = renderSearchBar();
    const input = screen.getByTestId("disposal-natural-language-input");
    fireEvent.change(input, { target: { value: "phishing" } });
    expect(screen.getByTestId("disposal-search-reset")).toBeEnabled();

    fireEvent.click(screen.getByTestId("disposal-search-reset"));

    expect(input).toHaveValue("");
    expect(props.onAiParsed).toHaveBeenCalledWith(null, "", "");
    expect(props.onReset).toHaveBeenCalledOnce();
    expect(screen.getByTestId("disposal-search-reset")).toBeDisabled();
  });

  it("uses the same template menu before and after templates exist", async () => {
    const onSaveTemplate = vi.fn();
    const { rerender, props } = renderSearchBar({
      onSaveTemplate,
      canSaveTemplate: true,
    });

    fireEvent.click(screen.getByTestId("disposal-template-menu"));
    await screen.findByTestId("disposal-template-save");
    fireEvent.click(screen.getByTestId("disposal-template-save"));
    expect(onSaveTemplate).toHaveBeenCalledOnce();

    rerender(
      <SearchBar
        {...props}
        canSaveTemplate
        templates={[{ id: "template-1", name: "Finance search" }]}
      />,
    );
    expect(screen.getByTestId("disposal-template-menu")).toBeInTheDocument();
  });

  it("opens the unified template menu and supports save and load actions", async () => {
    const onSaveTemplate = vi.fn();
    const onLoadTemplate = vi.fn();
    renderSearchBar({
      templates: [{ id: "template-1", name: "Finance search" }],
      canSaveTemplate: true,
      onSaveTemplate,
      onLoadTemplate,
    });

    fireEvent.click(screen.getByTestId("disposal-template-menu"));
    await waitFor(() => {
      expect(screen.getByText("Finance search")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("disposal-template-save"));
    expect(onSaveTemplate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("disposal-template-menu"));
    await waitFor(() => {
      expect(
        screen.getByTestId("disposal-template-load-template-1"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("disposal-template-load-template-1"));
    expect(onLoadTemplate).toHaveBeenCalledWith("template-1");
  });

  it("shows the demo-style filter toggle and reports its expanded state", () => {
    const onToggleFilters = vi.fn();
    const { rerender, props } = renderSearchBar({ onToggleFilters });
    const toggle = screen.getByTestId("disposal-filters-toggle");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("emailDisposal.search.advancedFilter");
    fireEvent.click(toggle);
    expect(onToggleFilters).toHaveBeenCalledOnce();

    rerender(<SearchBar {...props} filtersExpanded />);
    expect(screen.getByTestId("disposal-filters-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByTestId("disposal-filters-toggle")).toHaveTextContent(
      "emailDisposal.search.collapse",
    );
  });

  it("disables reset and templates when there is no useful action", () => {
    renderSearchBar();

    expect(screen.getByTestId("disposal-search-reset")).toBeDisabled();
    expect(screen.getByTestId("disposal-template-menu")).toBeDisabled();
  });

  it("shows the active filter count on the structured-filter toggle", () => {
    renderSearchBar({ activeFilterCount: 4, hasActiveFilters: true });

    expect(screen.getByTestId("disposal-filters-toggle")).toHaveTextContent(
      "4",
    );
    expect(screen.getByTestId("disposal-search-reset")).toBeEnabled();
  });

  it("gives sample-query links pointer-compatible gentle feedback", () => {
    renderSearchBar();
    const sample = screen.getByTestId("disposal-search-sample-1");

    fireEvent.pointerEnter(sample, { pointerType: "mouse" });
    expect(sample).toHaveAttribute("data-hovered", "true");

    fireEvent.pointerLeave(sample, { pointerType: "mouse" });
    expect(sample).not.toHaveAttribute("data-hovered");

    fireEvent.pointerEnter(sample, { pointerType: "touch" });
    expect(sample).not.toHaveAttribute("data-hovered");
  });

  // 现存 bug 的回归用例：search-bar 此前把 parse-query 的结构化结果 String()
  // 拍平，in/between 的数组值变成逗号拼接字符串，导致后端 400。修复后这里必须
  // 原样透传结构化 filter，不做任何拍平。
  it("passes the parsed structured filter through untouched, without flattening array values to strings", async () => {
    const structuredFilter = {
      operator: "AND" as const,
      groups: [
        {
          operator: "AND" as const,
          conditions: [
            {
              field: "display_status",
              op: "in" as const,
              value: ["delivered", "rejected"],
            },
          ],
        },
      ],
    };
    mockedParseQuery.mockResolvedValue({
      filter: structuredFilter,
      summary: "AI 摘要",
      source: "llm",
    });
    const { props } = renderSearchBar({ aiEnabled: true });

    fireEvent.change(screen.getByTestId("disposal-natural-language-input"), {
      target: { value: "上周被召回的邮件" },
    });
    fireEvent.click(screen.getByTestId("disposal-search-submit"));

    await waitFor(() => {
      expect(props.onAiParsed).toHaveBeenCalledWith(
        structuredFilter,
        "AI 摘要",
        "上周被召回的邮件",
      );
    });
    // 值必须仍是数组，不是拍平后的 "delivered,rejected" 字符串。
    const [passedFilter] = (props.onAiParsed as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(Array.isArray(passedFilter.groups[0].conditions[0].value)).toBe(
      true,
    );
  });

  it("uses the primary search button as the single AI-search action", async () => {
    mockedParseQuery.mockResolvedValue({
      filter: {
        operator: "AND",
        groups: [
          {
            operator: "AND",
            conditions: [
              { field: "sender", op: "starts_with", value: "192.168" },
              { field: "email_type", op: "eq", value: "advertisement" },
            ],
          },
        ],
      },
      summary: "AI 摘要",
      source: "llm",
    });
    const { props } = renderSearchBar({ aiEnabled: true });
    const input = screen.getByTestId("disposal-natural-language-input");

    fireEvent.change(input, { target: { value: "192.168 段营销邮件" } });
    expect(screen.queryByTestId("disposal-ai-parse")).not.toBeInTheDocument();
    expect(screen.getByTestId("disposal-ai-indicator")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("disposal-search-submit"));
    await waitFor(() => {
      expect(props.onAiParsed).toHaveBeenCalled();
    });

    expect(props.onAiParsed).toHaveBeenCalledWith(
      expect.any(Object),
      "AI 摘要",
      "192.168 段营销邮件",
    );
    expect(props.onSearch).not.toHaveBeenCalled();
  });

  it("applies edited structured filters without reparsing an unchanged successful query", async () => {
    mockedParseQuery.mockResolvedValue({
      filter: {
        operator: "AND",
        groups: [
          {
            operator: "AND",
            conditions: [{ field: "sender", op: "contains", value: "demo" }],
          },
        ],
      },
      summary: "AI 摘要",
      source: "llm",
    });
    const { props, rerender } = renderSearchBar({ aiEnabled: true });
    const input = screen.getByTestId("disposal-natural-language-input");

    fireEvent.change(input, { target: { value: "demo query" } });
    fireEvent.click(screen.getByTestId("disposal-search-submit"));
    await waitFor(() => expect(mockedParseQuery).toHaveBeenCalledOnce());

    rerender(<SearchBar {...props} aiEnabled hasPendingFilters />);
    fireEvent.click(screen.getByTestId("disposal-search-submit"));

    expect(mockedParseQuery).toHaveBeenCalledOnce();
    expect(props.onSearch).toHaveBeenLastCalledWith("");
  });

  it("falls back to subject search when AI returns no conditions", async () => {
    mockedParseQuery.mockResolvedValue({
      filter: { operator: "AND", groups: [] },
      summary: "",
      source: "llm",
    });
    const { props } = renderSearchBar({ aiEnabled: true });

    fireEvent.change(screen.getByTestId("disposal-natural-language-input"), {
      target: { value: "quarterly invoice" },
    });
    fireEvent.click(screen.getByTestId("disposal-search-submit"));

    await waitFor(() => {
      expect(props.onSearch).toHaveBeenCalledWith("quarterly invoice");
    });
  });

  it("keeps existing parent filters intact on AI parse failure", async () => {
    mockedParseQuery.mockRejectedValue(new Error("boom"));
    const { props } = renderSearchBar({ aiEnabled: true });

    fireEvent.change(screen.getByTestId("disposal-natural-language-input"), {
      target: { value: "phishing last week" },
    });
    fireEvent.click(screen.getByTestId("disposal-search-submit"));

    await waitFor(() => {
      expect(screen.getByText("emailDisposal.search.aiError")).toBeVisible();
    });
    expect(props.onAiParsed).not.toHaveBeenCalled();
  });

  it("lets reset cancel an in-flight AI search and ignores its late response", async () => {
    let resolveParse:
      ((value: Awaited<ReturnType<typeof parseQuery>>) => void) | undefined;
    mockedParseQuery.mockReturnValue(
      new Promise((resolve) => {
        resolveParse = resolve;
      }),
    );
    const { props } = renderSearchBar({ aiEnabled: true });

    fireEvent.change(screen.getByTestId("disposal-natural-language-input"), {
      target: { value: "slow query" },
    });
    fireEvent.click(screen.getByTestId("disposal-search-submit"));
    expect(screen.getByTestId("disposal-search-reset")).toBeEnabled();

    fireEvent.click(screen.getByTestId("disposal-search-reset"));
    resolveParse?.({
      filter: {
        operator: "AND",
        groups: [
          {
            operator: "AND",
            conditions: [{ field: "subject", op: "eq", value: "late" }],
          },
        ],
      },
      summary: "late result",
      source: "llm",
    });

    await waitFor(() => {
      expect(props.onReset).toHaveBeenCalledOnce();
    });
    expect(props.onAiParsed).toHaveBeenCalledTimes(1);
    expect(props.onAiParsed).toHaveBeenLastCalledWith(null, "", "");
  });
});
