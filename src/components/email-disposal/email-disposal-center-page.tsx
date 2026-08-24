"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, Inbox as InboxIcon, Info } from "lucide-react";
import { useScopedApiRequest } from "@/lib/api/client";
import { useTenant } from "@/hooks/use-tenant";
import { useProductForm } from "@/contexts/product-form-context";
import { useAuth } from "@/contexts/auth-context";
import { resolveSecurityScope } from "@/lib/security-scope";
import { TenantSelector } from "@/components/layout/tenant-selector";
import {
  getDisposalList,
  getDisposalRuleOptions,
  bulkDispose,
  findSimilar,
  recallMails,
} from "./lib/disposal-api";
import { useFilterMerger } from "./hooks/use-filter-merger";
import { useSearchTemplates } from "./hooks/use-search-templates";
import { backfillAiFilter } from "./lib/ai-backfill";
import {
  mergeAiQuickFilter,
  shouldAddDefaultSubject,
} from "./lib/ai-search-state";
import {
  countDisposalFilterConditions,
  getApplicableAdvancedFilter,
  getApplicableAiConditions,
  getDisposalFilterSignature,
  hasSavableDisposalFilters,
  resolvePositiveEnumFilterValues,
} from "./lib/filter-state";
import { resolveDisplayStatusHighlightKeys } from "@/lib/display-status";
import { formatRecipientDetail } from "./lib/csv-export";
import { SearchBar } from "./search-bar";
import { SaveTemplateDialog } from "./save-template-dialog";
import { QuickFilters } from "./quick-filters";
import { AdvancedFilters } from "./advanced-filters";
import { SelectedConditions } from "./selected-conditions";
import {
  MailListTable,
  type TableHeaderFilters,
  type TimeSortOrder,
} from "./mail-list-table";
import { DetailModal } from "./detail-modal";
import { ReclassifyDialog } from "./components/reclassify-dialog";
import { ServerPagination } from "@/components/shared/server-pagination";
import {
  PageShell,
  PageHeader,
  PageSurface,
} from "@/components/shared/page-shell";
import { SearchFilterPanel } from "@/components/shared/search-filter-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type {
  DisposalQuickFilter,
  AICondition,
  DisposalMailItem,
} from "@/types/email-disposal";
import type { AdvancedFilter } from "@/types/log";
import { pendingViewFilter } from "./lib/pending-filter";
import { mailTypeLabelKey } from "./lib/detail-helpers";
import { deliveryStatusLabel } from "@/components/logs/status-labels";
import { toast } from "sonner";

function getDefaultQuickFilter(): DisposalQuickFilter {
  return {};
}

// V2 默认展示全部邮件。筛选条件只能来自用户明确操作，避免首次进入时
// 悄悄丢掉已投递、已拒绝等处置态。
const DEFAULT_ADVANCED: AdvancedFilter = {
  operator: "AND",
  groups: [],
};

export function EmailDisposalCenterPage({
  mode = "disposal",
}: { mode?: "disposal" | "investigation" } = {}) {
  const t = useTranslations("emailDisposal");
  // GT-12763：导出 CSV 时状态翻译需要 logs 命名空间的 key，
  // emailDisposal 命名空间下没有 deliveryStatusValue.*。
  const tLogs = useTranslations("logs");
  const { effectiveTenantId } = useTenant();
  const { merge } = useFilterMerger();
  const { templates, saveTemplate, deleteTemplate, renameTemplate } = useSearchTemplates();
  const queryClient = useQueryClient();
  const { capabilities, viewer, switcherEnabled } = useProductForm();
  const { features, isSystemAdmin, isTenantAdmin, user, demoAuthBypassEnabled } = useAuth();
  const { selectedTenantId } = useTenant();
  const { effectiveViewer } = resolveSecurityScope({
    scopeTenantId: null,
    multiTenant: !!capabilities?.multiTenant,
    capabilitiesLoaded: capabilities != null,
    viewer,
    isSystemAdmin,
    isTenantAdmin,
    selectedTenantId,
    userTenantId: user?.tenant_id ?? null,
  });
  const showTenant =
    !!capabilities?.multiTenant && effectiveViewer === "platform";
  // Platform-wide (system_admin, all-tenant) drill-down is view-only (spec
  // §4.2/§6.1). Computed here from the SAME normalized effectiveViewer as
  // showTenant above and threaded down through DetailModal -> OverviewSection
  // -> RecipientStatus, instead of letting OverviewSection re-derive it from
  // the raw (non-normalized) useProductForm().viewer (review finding: that
  // re-derivation missed resolveSecurityScope's "viewer=tenant + system_admin
  // + no selected tenant" -> platform normalization, leaving detail-drawer
  // dispose actions enabled while the list page correctly showed
  // platform-wide/readonly).
  // Demo bypass 模式下超管未选租户会被规范为 platform 视角（只读），
  // 但 demo 需要展示完整操作功能，故跳过只读限制。
  const detailReadOnly =
    !demoAuthBypassEnabled &&
    !!capabilities?.multiTenant &&
    effectiveViewer === "platform";
  // Platform-wide mail investigation is read-only, but it still needs a
  // tenant filter. Keep that filter local to this page: reusing the global
  // selectedTenantId would turn a platform admin into a tenant-scoped
  // impersonation context and ProductFormProvider correctly clears it.
  const [platformScopeTenantId, setPlatformScopeTenantId] = useState<
    number | null
  >(null);
  const [appliedPlatformScopeTenantId, setAppliedPlatformScopeTenantId] =
    useState<number | null>(null);
  const disposalScopeTenantId =
    isSystemAdmin && effectiveViewer === "platform"
      ? appliedPlatformScopeTenantId
      : (effectiveTenantId ?? null);
  const { apiRequest } = useScopedApiRequest(disposalScopeTenantId);
  // AI 维度（相似搜索/相似度列/找相似/AI 解析/钓鱼智能体研判）的唯一事实源是产品形态
  // 能力 capabilities.ai（spec §3.2）。仅「AI 解读」（log-interpret SSE）这一项额外依赖
  // features.aiInterpret（日志解读服务开关）——两者解耦，避免关闭日志解读时连带隐藏
  // 与之无关的相似/钓鱼维度。
  const aiEnabled = capabilities?.ai ?? false;
  const aiInterpretEnabled = aiEnabled && features.aiInterpret;

  const [quickFilter, setQuickFilter] = useState<DisposalQuickFilter>(
    getDefaultQuickFilter,
  );
  // GT-12423: html_spec（index「按 demo（默认展开）落地」）要求高级筛选默认
  // 展开；「更多筛选条件」(AdvancedFilters) 仍默认折叠（PRD 口径）。
  const [quickFilterCollapsed, setQuickFilterCollapsed] = useState(false);
  // GT-12608/GT-12818：系统状态「待处置邮件 → 去处置」深链。?view=pending 时首载
  // 即应用与 KPI 卡同一口径的待处置筛选（display_status ∈ 隔离中 quarantine_pending
  // | 待审核 audit_pending），落地列表与卡片数字一致；无参数时维持 V2 默认全部邮件。
  const initialView = useSearchParams().get('view');
  const [advancedFilter, setAdvancedFilter] = useState<AdvancedFilter>(
    () => pendingViewFilter(initialView) ?? DEFAULT_ADVANCED,
  );
  const [aiConditions, setAiConditions] = useState<AICondition[]>([]);
  // Structured controls edit a local draft. Only an explicit Search action
  // copies that draft into these applied states and changes the list query.
  const [appliedQuickFilter, setAppliedQuickFilter] =
    useState<DisposalQuickFilter>(getDefaultQuickFilter);
  // GT-12608/GT-12818：applied 状态也须从 ?view=pending 深链初始化，否则列表查询
  // 仍用空的 DEFAULT_ADVANCED（= 全部邮件），只有 draft 筛选 UI 被填充、列表却没
  // 真正过滤，导致「默认展示待审核+隔离中」失效。其他入口 pendingViewFilter 返回
  // null，回落 DEFAULT_ADVANCED，行为不变。
  const [appliedAdvancedFilter, setAppliedAdvancedFilter] =
    useState<AdvancedFilter>(() => pendingViewFilter(initialView) ?? DEFAULT_ADVANCED);
  const [appliedAiConditions, setAppliedAiConditions] = useState<AICondition[]>(
    [],
  );
  const [aiParsedQuery, setAiParsedQuery] = useState<string | null>(null);
  // --- Template dialog state ---
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [renameTemplateId, setRenameTemplateId] = useState<string | null>(null);
  // When applying a template while current filters are non-empty, we first
  // show a confirmation AlertDialog. pendingTemplateId holds the id until
  // the user confirms or cancels.
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  // Ref so the apply-template callback can always read the latest aiParsedQuery
  // without being a stale closure.
  const aiParsedQueryRef = useRef(aiParsedQuery);
  aiParsedQueryRef.current = aiParsedQuery;
  // --- end template dialog state ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  // 跨页选中记忆：id → 完整 item 快照，翻页不清空。
  // 筛选条件变更时通过 resetSelection() 清空，避免导出与当前筛选不相关的历史选中。
  const [selectedItemMap, setSelectedItemMap] = useState<Map<number, DisposalMailItem>>(new Map());
  const selectedIds = useMemo(() => new Set(selectedItemMap.keys()), [selectedItemMap]);
  const mixedSelectionCount = useMemo(
    () =>
      Array.from(selectedItemMap.values()).filter(
        (item) => item.action === "mixed",
      ).length,
    [selectedItemMap],
  );
  const [exportLoading, setExportLoading] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [similarMode, setSimilarMode] = useState(false);
  const [similarItems, setSimilarItems] = useState<DisposalMailItem[]>([]);
  const [similarTotal, setSimilarTotal] = useState(0);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarSeedCount, setSimilarSeedCount] = useState(0);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "release" | "recall" | null
  >(null);
  const [reclassifyBusy, setReclassifyBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [headerFilters, setHeaderFilters] = useState<TableHeaderFilters>({
    directions: [],
    emailTypes: [],
    statuses: [],
  });
  const [timeSort, setTimeSort] = useState<TimeSortOrder>("none");
  const [disposalRuleSearch, setDisposalRuleSearch] = useState("");
  const [debouncedDisposalRuleSearch, setDebouncedDisposalRuleSearch] =
    useState("");

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedDisposalRuleSearch(disposalRuleSearch),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [disposalRuleSearch]);

  const activeFilterCount = useMemo(
    () =>
      countDisposalFilterConditions(quickFilter, advancedFilter, aiConditions) +
      (platformScopeTenantId !== null ? 1 : 0),
    [quickFilter, advancedFilter, aiConditions, platformScopeTenantId],
  );
  const canSaveTemplate = useMemo(
    () => hasSavableDisposalFilters(quickFilter, advancedFilter),
    [quickFilter, advancedFilter],
  );
  const appliedFilterCount = useMemo(
    () =>
      countDisposalFilterConditions(
        appliedQuickFilter,
        appliedAdvancedFilter,
        appliedAiConditions,
      ) + (appliedPlatformScopeTenantId !== null ? 1 : 0),
    [
      appliedQuickFilter,
      appliedAdvancedFilter,
      appliedAiConditions,
      appliedPlatformScopeTenantId,
    ],
  );
  const hasPendingFilters = useMemo(
    () =>
      getDisposalFilterSignature(
        quickFilter,
        advancedFilter,
        aiConditions,
        platformScopeTenantId,
      ) !==
      getDisposalFilterSignature(
        appliedQuickFilter,
        appliedAdvancedFilter,
        appliedAiConditions,
        appliedPlatformScopeTenantId,
      ),
    [
      quickFilter,
      advancedFilter,
      aiConditions,
      platformScopeTenantId,
      appliedQuickFilter,
      appliedAdvancedFilter,
      appliedAiConditions,
      appliedPlatformScopeTenantId,
    ],
  );
  const hasActiveFilters =
    activeFilterCount > 0 ||
    appliedFilterCount > 0 ||
    headerFilters.directions.length > 0 ||
    headerFilters.emailTypes.length > 0 ||
    headerFilters.statuses.length > 0 ||
    timeSort !== "none" ||
    similarMode ||
    platformScopeTenantId !== null;

  const mergedFilter = useMemo(() => {
    const base = merge(
      appliedQuickFilter,
      appliedAdvancedFilter,
      appliedAiConditions,
    );
    const groups = [...base.groups];
    if (headerFilters.directions.length > 0) {
      const directionMap: Record<string, string> = {
        incoming: "receive",
        outgoing: "send",
        internal: "internal",
      };
      groups.push({
        operator: "OR",
        conditions: headerFilters.directions.map((value) => ({
          field: "direction",
          op: "eq" as const,
          value: directionMap[value] ?? value,
        })),
      });
    }
    if (headerFilters.emailTypes.length > 0) {
      groups.push({
        operator: "OR",
        conditions: headerFilters.emailTypes.map((value) => ({
          field: "email_type",
          op: "eq" as const,
          value,
        })),
      });
    }
    return { ...base, groups };
  }, [
    appliedQuickFilter,
    appliedAdvancedFilter,
    appliedAiConditions,
    headerFilters,
    merge,
  ]);

  const searchParams = useMemo(
    () => ({
      advanced: mergedFilter,
      page,
      pageSize,
      startDate: appliedQuickFilter.sendReceiveTime?.start,
      endDate: appliedQuickFilter.sendReceiveTime?.end,
      recipient: appliedQuickFilter.recipient,
      // GT-11614: pass sendReceiveType to backend as direction param
      direction: appliedQuickFilter.sendReceiveType,
      // GT-11618: pass display_status through so the backend maps the canonical 17-value
      // UI concept to action / delivery / workflow predicates. The previous
      // frontend-side mapping only handled a small legacy subset.
      displayStatus:
        headerFilters.statuses.length > 0
          ? headerFilters.statuses.join(",")
          : (appliedQuickFilter.emailStatuses?.join(",") ??
            appliedQuickFilter.emailStatus),
      emailTypes: appliedQuickFilter.emailTypes,
      disposalPolicyKeys: appliedQuickFilter.disposalPolicyKeys,
      sortOrder: timeSort === "none" ? undefined : timeSort,
    }),
    [
      appliedQuickFilter,
      mergedFilter,
      headerFilters.statuses,
      timeSort,
      page,
      pageSize,
    ],
  );

  const { data, isLoading, refetch: refreshDisposalList } = useQuery({
    queryKey: ["email-disposal", searchParams, disposalScopeTenantId],
    queryFn: () => getDisposalList(searchParams, apiRequest),
  });

  const { data: disposalRuleOptions = [] } = useQuery({
    queryKey: [
      "email-disposal-rule-options",
      debouncedDisposalRuleSearch,
      disposalScopeTenantId,
    ],
    queryFn: () => getDisposalRuleOptions(debouncedDisposalRuleSearch, apiRequest),
    staleTime: 60 * 1000,
  });

  const activeExecutionActions = useMemo(
    () => resolvePositiveEnumFilterValues(mergedFilter, "action"),
    [mergedFilter],
  );
  const activeDisplayStatuses = useMemo(
    () =>
      resolveDisplayStatusHighlightKeys(
        new Set([
          ...(headerFilters.statuses.length > 0
            ? headerFilters.statuses
            : (appliedQuickFilter.emailStatuses ??
              (appliedQuickFilter.emailStatus
                ? [appliedQuickFilter.emailStatus]
                : []))),
          ...resolvePositiveEnumFilterValues(
            mergedFilter,
            "display_status",
          ),
        ]),
      ),
    [
      appliedQuickFilter.emailStatus,
      appliedQuickFilter.emailStatuses,
      headerFilters.statuses,
      mergedFilter,
    ],
  );
  const mixedMailCountInResults = useMemo(() => {
    if (activeExecutionActions.length === 0) return 0;
    return (data?.items ?? []).filter((item) => item.action === "mixed").length;
  }, [activeExecutionActions, data?.items]);

  // AI 解析结果三级回填（design spec §7）：quick 控件覆盖式合并、advanced 构建
  // 器组追加（受 5 组上限约束）、其余条件落回 aiConditions 兜底 chips。summary
  // 沿用现状——回调签名保留但当前页面不展示（与拍平前的既有行为一致）。
  const handleAiParsed = useCallback(
    (filter: AdvancedFilter | null, _summary: string, query: string) => {
      const result = backfillAiFilter(filter, advancedFilter.groups.length);
      const hasAiConditions =
        filter?.groups.some((group) => group.conditions.length > 0) ?? false;
      const nextQuickFilter =
        hasAiConditions || Object.keys(result.quick).length > 0
          ? mergeAiQuickFilter(
              quickFilter,
              result.quick,
              query,
              hasAiConditions,
            )
          : quickFilter;
      const nextAdvancedFilter =
        result.advanced.length > 0
          ? {
              ...advancedFilter,
              groups: [...advancedFilter.groups, ...result.advanced],
            }
          : advancedFilter;
      const nextAiConditions = result.residual;
      const applicableAdvancedFilter =
        getApplicableAdvancedFilter(nextAdvancedFilter);
      const applicableAiConditions =
        getApplicableAiConditions(nextAiConditions);

      setAiParsedQuery(hasAiConditions ? query.trim() : null);
      setQuickFilter(nextQuickFilter);
      setAdvancedFilter(nextAdvancedFilter);
      setAiConditions(nextAiConditions);
      setAppliedQuickFilter(nextQuickFilter);
      setAppliedAdvancedFilter(applicableAdvancedFilter);
      setAppliedAiConditions(applicableAiConditions);
      setAppliedPlatformScopeTenantId(platformScopeTenantId);
      setSelectedItemMap(new Map());
      setSimilarMode(false);
      setSimilarSeedCount(0);
      setPage(1);
    },
    [advancedFilter, platformScopeTenantId, quickFilter],
  );

  const handleSearch = useCallback(
    (query: string) => {
      const nextQuickFilter = shouldAddDefaultSubject(query, aiParsedQuery)
        ? {
            ...quickFilter,
            subject: query.trim() || undefined,
          }
        : quickFilter;
      const nextAdvancedFilter = getApplicableAdvancedFilter(advancedFilter);
      const nextAiConditions = getApplicableAiConditions(aiConditions);
      const nextFilterSignature = getDisposalFilterSignature(
        nextQuickFilter,
        nextAdvancedFilter,
        nextAiConditions,
        platformScopeTenantId,
      );
      const appliedFilterSignature = getDisposalFilterSignature(
        appliedQuickFilter,
        appliedAdvancedFilter,
        appliedAiConditions,
        appliedPlatformScopeTenantId,
      );

      setQuickFilter(nextQuickFilter);
      setAppliedQuickFilter(nextQuickFilter);
      setAppliedAdvancedFilter(nextAdvancedFilter);
      setAppliedAiConditions(nextAiConditions);
      setAppliedPlatformScopeTenantId(platformScopeTenantId);
      setSelectedItemMap(new Map());
      setSimilarMode(false);
      setSimilarSeedCount(0);
      setPage(1);

      // Applying different filters (or returning to page 1) changes the query
      // key and fetches automatically. If the effective query is unchanged,
      // Search acts as an explicit refresh instead of becoming a no-op.
      if (page === 1 && nextFilterSignature === appliedFilterSignature) {
        void refreshDisposalList();
      }
    },
    [
      advancedFilter,
      aiConditions,
      aiParsedQuery,
      appliedAdvancedFilter,
      appliedAiConditions,
      appliedPlatformScopeTenantId,
      appliedQuickFilter,
      page,
      platformScopeTenantId,
      quickFilter,
      refreshDisposalList,
    ],
  );

  const handleClearAll = useCallback(() => {
    setQuickFilter(getDefaultQuickFilter());
    setAdvancedFilter(DEFAULT_ADVANCED);
    setAiConditions([]);
    setAppliedQuickFilter(getDefaultQuickFilter());
    setAppliedAdvancedFilter(DEFAULT_ADVANCED);
    setAppliedAiConditions([]);
    setAiParsedQuery(null);
    setPlatformScopeTenantId(null);
    setAppliedPlatformScopeTenantId(null);
    setSelectedItemMap(new Map());
    setSimilarMode(false);
    setHeaderFilters({ directions: [], emailTypes: [], statuses: [] });
    setTimeSort("none");
    setPage(1);
  }, []);

  /** Apply a template's saved conditions and immediately trigger a search. */
  const applyTemplate = useCallback(
    (id: string) => {
      const template = templates.find((item) => item.id === id);
      if (!template) return;
      setQuickFilter(template.quickFilter);
      setAdvancedFilter(template.advancedFilter);
      // Restore the raw AI text so the user can re-trigger AI parsing if needed,
      // but do NOT auto-parse — clear any previously parsed AI conditions.
      setAiConditions([]);
      setAiParsedQuery(template.aiQuery ?? null);
      // Immediately commit and trigger search (mirrors handleSearch("")).
      setAppliedQuickFilter(template.quickFilter);
      setAppliedAdvancedFilter(getApplicableAdvancedFilter(template.advancedFilter));
      setAppliedAiConditions([]);
      setAppliedPlatformScopeTenantId(platformScopeTenantId);
      setSelectedItemMap(new Map());
      setSimilarMode(false);
      setSimilarSeedCount(0);
      setPage(1);
    },
    [templates, platformScopeTenantId],
  );

  const runFindSimilar = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      setSimilarMode(true);
      setSimilarSeedCount(ids.length);
      setSimilarLoading(true);
      setSimilarItems([]);
      setSimilarTotal(0);
      try {
        const result = await findSimilar(
          { mail_log_ids: ids, limit: 10 },
          apiRequest,
        );
        setSimilarItems(result.items);
        setSimilarTotal(result.total);
      } catch {
        toast.error(t("errors.similarFailed"));
        setSimilarMode(false);
        setSimilarSeedCount(0);
      } finally {
        setSimilarLoading(false);
      }
    },
    [apiRequest, t],
  );

  const handleRemoveChip = useCallback((key: string) => {
    if (key === "scope-tenant") {
      setPlatformScopeTenantId(null);
    } else if (key.startsWith("ai-")) {
      const idx = parseInt(key.slice(3), 10);
      setAiConditions((prev) => prev.filter((_, i) => i !== idx));
    } else if (key.startsWith("q-")) {
      const field = key.slice(2);
      if (field === "time") {
        setQuickFilter((prev) => ({ ...prev, sendReceiveTime: undefined }));
      } else if (field.includes(":")) {
        // Multi-value quick filters (emailTypes, disposalPolicyKeys) render one
        // chip per selected value as "q-<field>:<value>" — remove just that
        // value from the array, not the whole filter.
        const [arrayField, arrayValue] = field.split(":");
        setQuickFilter((prev) => {
          const current = (prev as Record<string, unknown>)[arrayField];
          if (!Array.isArray(current)) return prev;
          const next = current.filter((v) => v !== arrayValue);
          return { ...prev, [arrayField]: next.length > 0 ? next : undefined };
        });
      } else {
        setQuickFilter((prev) => {
          const next = { ...prev };
          delete (next as Record<string, unknown>)[field];
          return next;
        });
      }
    } else if (key.startsWith("a-")) {
      const [, gi, ci] = key.split("-").map(Number);
      setAdvancedFilter((prev) => {
        const groups = prev.groups
          .map((g, i) =>
            i === gi
              ? { ...g, conditions: g.conditions.filter((_, j) => j !== ci) }
              : g,
          )
          .filter((g) => g.conditions.length > 0);
        return { ...prev, groups };
      });
    }
  }, []);

  const handleItemClick = useCallback((id: number) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  // 将 DisposalMailItem 列表转 CSV Blob 并触发下载
  const exportToCsv = useCallback((items: DisposalMailItem[]) => {
    const escapeCsv = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      [
        "ID",
        t("table.time"),
        t("table.direction"),
        t("table.sender"),
        t("table.recipient"),
        t("table.subject"),
        t("table.senderIp"),
        t("table.disposalBasis"),
        t("table.mailType"),
        t("table.action"),
        t("table.status"),
        t("batch.csvRecipientDetail"),
      ],
      ...items.map((item) => [
        item.id,
        item.timestamp,
        item.direction ?? "",
        item.sender,
        item.recipientList?.join("; ") ?? item.recipient,
        item.subject,
        item.clientIp ?? "",
        item.disposalBasis?.policy_key ?? item.disposalBasis?.action ?? "",
        // GT-12763：邮件类型翻译为当前语言
        item.emailType ? t(mailTypeLabelKey(item.emailType)) : "",
        item.action ?? "",
        // GT-12763：状态翻译为当前语言
        (item.displayStatuses ?? []).length === 1
          ? deliveryStatusLabel(item.displayStatuses[0].status, (k: string) => tLogs(k))
          : (item.displayStatuses ?? [])
              .map((entry) => `${deliveryStatusLabel(entry.status, (k: string) => tLogs(k))}×${entry.count}`)
              .join("; "),
        formatRecipientDetail(item, (key) => t(key as never)),
      ]),
    ];
    const blob = new Blob(
      [`\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `email-disposal-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [t, tLogs]);

  // 导出全量筛选结果（无选中时）
  const EXPORT_MAX = 5000;
  const exportAllFiltered = useCallback(async () => {
    const total = similarMode ? similarTotal : (data?.total ?? 0);
    if (total === 0) return;
    if (total > EXPORT_MAX) {
      toast.warning(
        t("batch.exportLimitWarning", { n: total, limit: EXPORT_MAX }),
      );
    }
    setExportLoading(true);
    try {
      if (similarMode) {
        exportToCsv(similarItems);
      } else {
        // 后端 QueryMailLogs 把 page_size 硬顶在 200（QueryMailLogs 内部 clamp，
        // 见 internal/api/mail_logs.go）；以 200/页分页拉取到 EXPORT_MAX 或服务端
        // 数据取尽为止。原型曾误记为 100，已按后端事实修正。
        // 终止条件只使用"本页返回 0 条（数据已取尽）"，不依赖"本页数量 < 请求数量"，
        // 避免后端静默截断导致第 1 页就误判为最后一页（GT-12571 根因修复）。
        const EXPORT_PAGE_SIZE = 200;
        const target = Math.min(total, EXPORT_MAX);
        const items: DisposalMailItem[] = [];
        for (let page = 1; items.length < target; page++) {
          const result = await getDisposalList(
            { ...searchParams, page, pageSize: EXPORT_PAGE_SIZE },
            apiRequest,
          );
          items.push(...result.items);
          // 防御兜底：服务端总量已全部取回
          if (items.length >= result.total) break;
          // 空页：后端已无更多数据
          if (result.items.length === 0) break;
        }
        exportToCsv(items.slice(0, target));
      }
    } catch {
      toast.error(t("batch.failed"));
    } finally {
      setExportLoading(false);
    }
  }, [similarMode, similarTotal, similarItems, data?.total, searchParams, apiRequest, t, exportToCsv]);

  const handleBatchAction = useCallback(
    async (
      action: "find_similar" | "release" | "delete" | "export" | "recall",
    ) => {
      if (action === "export") {
        if (selectedIds.size === 0) {
          // 未选中 → 导出当前筛选全部
          void exportAllFiltered();
          return;
        }
        // 有选中 → 从跨页缓存 Map 直接读取，不依赖当前页数据
        exportToCsv(Array.from(selectedItemMap.values()));
        return;
      }

      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);

      if (action === "find_similar") {
        if (ids.length > 10) return;
        void runFindSimilar(ids);
        return;
      }

      if (action === "recall" && ids.length > 10) {
        toast.warning(t("batch.recallLimit"));
        return;
      }

      // GT-11780 (Task E5): release & recall open the ReclassifyDialog so the
      // operator can pick a corrected email_type for the batch. The actual
      // bulkDispose call is deferred to handleReclassifyConfirm.
      if (action === "release" || action === "recall") {
        setPendingAction(action);
        setReclassifyOpen(true);
        return;
      }

      if (action !== "delete") return;

      setDeleteConfirmOpen(true);
    },
    [selectedIds, selectedItemMap, t, runFindSimilar, exportToCsv, exportAllFiltered],
  );

  const executeDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    try {
      const result = await bulkDispose(
        { mail_log_ids: ids, action: "delete" },
        apiRequest,
      );
      const successCount = result.succeeded.length;
      const failCount = result.failed.length;
      const naCount = result.not_applicable.length;
      const partialCount = result.partial?.length ?? 0;
      if (partialCount > 0) {
        toast.warning(
          t("batch.partialRecipientResult", {
            succeeded: successCount,
            partial: partialCount,
            failed: failCount,
            notApplicable: naCount,
          }),
        );
      } else if (failCount > 0 || naCount > 0) {
        toast.warning(
          t("batch.partialResult", {
            succeeded: successCount,
            failed: failCount,
            notApplicable: naCount,
          }),
        );
      } else {
        toast.success(t("batch.allSucceeded", { n: successCount }));
      }
      setSelectedItemMap(new Map());
      void queryClient.invalidateQueries({ queryKey: ["email-disposal"] });
    } catch {
      toast.error(t("batch.failed"));
    } finally {
      setDeleteConfirmOpen(false);
    }
  }, [selectedIds, t, apiRequest, queryClient]);

  const handleReclassifyConfirm = useCallback(
    async (finalType: string | undefined) => {
      if (!pendingAction || selectedIds.size === 0) {
        setReclassifyOpen(false);
        setPendingAction(null);
        return;
      }
      const ids = Array.from(selectedIds);
      setReclassifyBusy(true);
      try {
        const result =
          pendingAction === "recall"
            ? await recallMails(
                { mail_log_ids: ids, final_type: finalType },
                apiRequest,
              )
            : await bulkDispose(
                { mail_log_ids: ids, action: "release", final_type: finalType },
                apiRequest,
              );
        const successCount = result.succeeded.length;
        const failCount = result.failed.length;
        const naCount =
          "not_applicable" in result && Array.isArray(result.not_applicable)
            ? result.not_applicable.length
            : 0;
        const partialCount =
          "partial" in result && Array.isArray(result.partial)
            ? result.partial.length
            : 0;
        if (partialCount > 0) {
          toast.warning(
            t("batch.partialRecipientResult", {
              succeeded: successCount,
              partial: partialCount,
              failed: failCount,
              notApplicable: naCount,
            }),
          );
        } else if (failCount > 0 || naCount > 0) {
          toast.warning(
            t("batch.partialResult", {
              succeeded: successCount,
              failed: failCount,
              notApplicable: naCount,
            }),
          );
        } else {
          toast.success(t("batch.allSucceeded", { n: successCount }));
        }
        if (result.reclassify_failed && result.reclassify_failed.length > 0) {
          toast.warning(
            t("batch.reclassifyPartial", {
              n: result.reclassify_failed.length,
            }),
          );
        }
        setSelectedItemMap(new Map());
        void queryClient.invalidateQueries({ queryKey: ["email-disposal"] });
        setReclassifyOpen(false);
        setPendingAction(null);
      } catch {
        toast.error(t("batch.failed"));
      } finally {
        setReclassifyBusy(false);
      }
    },
    [pendingAction, selectedIds, apiRequest, queryClient, t],
  );

  return (
    <PageShell
      className="min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]"
      data-testid={
        mode === "investigation"
          ? "mail-investigation-page"
          : "email-disposal-center-page"
      }
    >
      <PageHeader
        title={t(mode === "investigation" ? "investigationTitle" : "pageTitle")}
        description={t(
          mode === "investigation"
            ? "investigationSubtitle"
            : "pageDescription",
        )}
        icon={InboxIcon}
      />

      <SearchFilterPanel
        testId="disposal-search-workbench"
        toolbar={
          <SearchBar
            onAiParsed={handleAiParsed}
            onSearch={handleSearch}
            onReset={handleClearAll}
            aiEnabled={aiEnabled}
            templates={templates.map(({ id, name }) => ({ id, name }))}
            onSaveTemplate={() => setSaveTemplateOpen(true)}
            onLoadTemplate={(id) => {
              // If there are active filters, confirm before overwriting.
              if (hasActiveFilters) {
                setPendingTemplateId(id);
              } else {
                applyTemplate(id);
              }
            }}
            onDeleteTemplate={deleteTemplate}
            onRenameTemplate={(id) => setRenameTemplateId(id)}
            sampleCount={similarMode ? similarSeedCount : 0}
            onClearSamples={() => {
              setSimilarMode(false);
              setSimilarSeedCount(0);
              setSelectedItemMap(new Map());
            }}
            filtersExpanded={!quickFilterCollapsed}
            onToggleFilters={() => setQuickFilterCollapsed((value) => !value)}
            activeFilterCount={activeFilterCount}
            hasActiveFilters={hasActiveFilters}
            canSaveTemplate={canSaveTemplate}
            hasPendingFilters={hasPendingFilters}
          />
        }
        showConditions={!quickFilterCollapsed}
        conditionsTestId="disposal-structured-filters"
        conditionsSectionClassName="mt-4 border-t pt-4"
        conditionsContent={
          <>
            <QuickFilters
              value={quickFilter}
              onChange={setQuickFilter}
              disposalRuleOptions={disposalRuleOptions}
              onDisposalRuleSearchChange={setDisposalRuleSearch}
              tenantSelector={
                showTenant ? (
                  <TenantSelector
                    value={platformScopeTenantId}
                    onChange={setPlatformScopeTenantId}
                    className="h-9 w-full"
                  />
                ) : undefined
              }
            />
            <div className="mt-4 border-t pt-4">
              <AdvancedFilters
                value={advancedFilter}
                onChange={setAdvancedFilter}
              />
            </div>
          </>
        }
        actionsPlacement="none"
        onSearch={() => {
          if (hasPendingFilters) handleSearch("");
        }}
        footer={
          <SelectedConditions
            compact
            quick={quickFilter}
            advanced={advancedFilter}
            aiConditions={aiConditions}
            extraConditions={
              platformScopeTenantId === null
                ? []
                : [
                    {
                      key: "scope-tenant",
                      label: `${t("filters.tenantScope")}: #${platformScopeTenantId}`,
                    },
                  ]
            }
            onClearAll={handleClearAll}
            onRemoveChip={handleRemoveChip}
            pending={hasPendingFilters}
          />
        }
      />

      <PageSurface className="space-y-4">
        {!similarMode && mixedMailCountInResults > 0 && (
          <div
            data-testid="disposal-mixed-mail-hint"
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <Info className="h-4 w-4 shrink-0" />
            <span>
              {t("recipientStatusBar.mixedMailHint", {
                count: mixedMailCountInResults,
              })}
            </span>
          </div>
        )}
        {similarMode && (
          <div
            data-testid="disposal-similar-mode-banner"
            className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
          >
            <Search className="h-4 w-4" />
            <span className="font-medium">{t("similarResults.title")}</span>
            <span className="text-blue-700 dark:text-blue-300">
              {t("similarResults.description", { n: similarTotal })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              onClick={() => {
                setSimilarMode(false);
                setSimilarSeedCount(0);
                setSelectedItemMap(new Map());
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              {t("detail.close")}
            </Button>
          </div>
        )}
        <MailListTable
          items={similarMode ? similarItems : (data?.items ?? [])}
          total={similarMode ? similarTotal : (data?.total ?? 0)}
          loading={similarMode ? similarLoading : isLoading}
          activeExecutionActions={
            similarMode ? undefined : activeExecutionActions
          }
          activeDisplayStatuses={
            similarMode ? undefined : activeDisplayStatuses
          }
          activeDisposalPolicyKeys={
            similarMode ? undefined : appliedQuickFilter.disposalPolicyKeys
          }
          activeDisposalRuleIds={
            similarMode ? undefined : appliedQuickFilter.disposalRuleIds
          }
          requestFn={apiRequest}
          selectedIds={selectedIds}
          onSelectionChange={(newPageIds) => {
            // 跨页追加/移除：以当前页 items 的 id 集合作为"当前页范围"
            // newPageIds 是当前页用户选中的 id Set（已包含全选/取消逻辑）
            const currentPageItems = similarMode ? similarItems : (data?.items ?? []);
            const currentPageIdSet = new Set(currentPageItems.map((i) => i.id));
            setSelectedItemMap((prev) => {
              const next = new Map(prev);
              // 移除当前页所有 id 后再写入新选中的
              for (const id of currentPageIdSet) {
                next.delete(id);
              }
              for (const id of newPageIds) {
                const item = currentPageItems.find((i) => i.id === id);
                if (item) next.set(id, item);
              }
              return next;
            });
          }}
          onItemClick={handleItemClick}
          onBatchAction={handleBatchAction}
          exportLoading={exportLoading}
          onFindSimilar={(id) => void runFindSimilar([id])}
          aiEnabled={aiEnabled}
          similarMode={similarMode}
          headerFilters={headerFilters}
          onHeaderFiltersChange={(filters) => {
            setHeaderFilters(filters);
            setPage(1);
          }}
          timeSort={timeSort}
          onTimeSortChange={(sort) => {
            setTimeSort(sort);
            setPage(1);
          }}
        />
        {!similarMode && (
          <ServerPagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            pageSizeOptions={[50, 100, 200]}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      </PageSurface>

      <DetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        mailLogId={detailId}
        aiEnabled={aiEnabled}
        aiInterpretEnabled={aiInterpretEnabled}
        readOnly={detailReadOnly}
        showSecurityAnalysis={switcherEnabled}
        isTenantAdmin={isTenantAdmin}
        onFindSimilar={async (id) => {
          void runFindSimilar([id]);
        }}
      />

      <ReclassifyDialog
        open={reclassifyOpen}
        onOpenChange={setReclassifyOpen}
        defaultType={pendingAction === "recall" ? "spam" : "normal"}
        action={pendingAction ?? undefined}
        onConfirm={(finalType) => void handleReclassifyConfirm(finalType)}
        busy={reclassifyBusy}
        mixedSelectionCount={mixedSelectionCount}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        {/* html_spec layer-7: 弹窗 sm:max-w-md(448px)，写法说明见 reclassify-dialog.tsx */}
        <AlertDialogContent
          className="data-[size=default]:sm:max-w-md"
          data-testid="disposal-delete-dialog"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {t("batch.delete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("batch.confirmDelete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detail.overview.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              // html_spec layer-7: 删除确认按钮 bg-red-500 hover 600 白字
              className="border-red-500/20 bg-red-500 text-white data-[hovered=true]:bg-red-600 active:bg-red-600"
              onClick={(event) => {
                event.preventDefault();
                void executeDelete();
              }}
            >
              {t("batch.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* ── Save-as-template dialog ── */}
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        templateCount={templates.length}
        existingNames={templates.map((tmpl) => tmpl.name)}
        onConfirm={(name) => {
          const template = saveTemplate(name, quickFilter, advancedFilter, aiParsedQuery ?? undefined);
          setSaveTemplateOpen(false);
          toast.success(t("search.templateSaved", { name: template.name }));
        }}
      />

      {/* ── Rename-template dialog ── */}
      <SaveTemplateDialog
        open={renameTemplateId !== null}
        onOpenChange={(open) => { if (!open) setRenameTemplateId(null); }}
        templateCount={templates.length}
        existingNames={templates.map((tmpl) => tmpl.name)}
        initialName={templates.find((tmpl) => tmpl.id === renameTemplateId)?.name}
        mode="rename"
        onConfirm={(name) => {
          if (renameTemplateId) {
            const ok = renameTemplate(renameTemplateId, name);
            if (!ok) {
              toast.error(t("search.templateNameConflict"));
            }
          }
          setRenameTemplateId(null);
        }}
      />

      {/* ── Apply-template confirmation (only shown when active filters exist) ── */}
      <AlertDialog
        open={pendingTemplateId !== null}
        onOpenChange={(open) => { if (!open) setPendingTemplateId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("search.templateApplyConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("search.templateApplyConfirmDesc", {
                name: templates.find((tmpl) => tmpl.id === pendingTemplateId)?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTemplateId(null)}>
              {t("detail.overview.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTemplateId) applyTemplate(pendingTemplateId);
                setPendingTemplateId(null);
              }}
            >
              {t("search.templateApplyConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </PageShell>
  );
}
