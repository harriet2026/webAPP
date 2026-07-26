"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { useScopedApiRequest } from "@/lib/api/client";
import { useTenant } from "@/hooks/use-tenant";
import { useProductForm } from "@/contexts/product-form-context";
import { useAuth } from "@/contexts/auth-context";
import { resolveSecurityScope } from "@/lib/security-scope";
import { TenantSelector } from "@/components/layout/tenant-selector";
import {
  getDisposalList,
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
import { SearchBar } from "./search-bar";
import { QuickFilters } from "./quick-filters";
import { AdvancedFilters } from "./advanced-filters";
import { SelectedConditions } from "./selected-conditions";
import { MailListTable, type TableHeaderFilters, type TimeSortOrder } from "./mail-list-table";
import { DetailModal } from "./detail-modal";
import { ReclassifyDialog } from "./components/reclassify-dialog";
import { ServerPagination } from "@/components/shared/server-pagination";
import { FramedPage, PageSurface } from "@/components/shared/page-shell";
import { PageFilters } from "@/components/shared/page-filters";
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
  const { effectiveTenantId } = useTenant();
  const { merge } = useFilterMerger();
  const { templates, saveTemplate, deleteTemplate } = useSearchTemplates();
  const queryClient = useQueryClient();
  const { capabilities, viewer } = useProductForm();
  const { features, isSystemAdmin, user } = useAuth();
  const { selectedTenantId } = useTenant();
  const { effectiveViewer } = resolveSecurityScope({
    scopeTenantId: null,
    multiTenant: !!capabilities?.multiTenant,
    capabilitiesLoaded: capabilities != null,
    viewer,
    isSystemAdmin,
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
  const detailReadOnly =
    !!capabilities?.multiTenant && effectiveViewer === "platform";
  // Platform-wide mail investigation is read-only, but it still needs a
  // tenant filter. Keep that filter local to this page: reusing the global
  // selectedTenantId would turn a platform admin into a tenant-scoped
  // impersonation context and ProductFormProvider correctly clears it.
  const [platformScopeTenantId, setPlatformScopeTenantId] = useState<number | null>(null);
  const disposalScopeTenantId =
    isSystemAdmin && effectiveViewer === "platform"
      ? platformScopeTenantId
      : effectiveTenantId ?? null;
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
  const [quickFilterCollapsed, setQuickFilterCollapsed] = useState(true);
  const [advancedFilter, setAdvancedFilter] =
    useState<AdvancedFilter>(DEFAULT_ADVANCED);
  const [aiConditions, setAiConditions] = useState<AICondition[]>([]);
  const [aiParsedQuery, setAiParsedQuery] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
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
  const [timeSort, setTimeSort] = useState<TimeSortOrder>('none');

  const mergedFilter = useMemo(() => {
    const base = merge(quickFilter, advancedFilter, aiConditions);
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
  }, [quickFilter, advancedFilter, aiConditions, headerFilters, merge]);

  const searchParams = useMemo(
    () => ({
      advanced: mergedFilter,
      page,
      pageSize,
      startDate: quickFilter.sendReceiveTime?.start,
      endDate: quickFilter.sendReceiveTime?.end,
      recipient: quickFilter.recipient,
      // GT-11614: pass sendReceiveType to backend as direction param
      direction: quickFilter.sendReceiveType,
      // GT-11618: pass display_status through so the backend maps the canonical 17-value
      // UI concept to action / delivery / workflow predicates. The previous
      // frontend-side mapping only handled a small legacy subset.
      displayStatus:
        headerFilters.statuses.length > 0
          ? headerFilters.statuses.join(",")
          : (quickFilter.emailStatuses?.join(',') ?? quickFilter.emailStatus),
      emailTypes: quickFilter.emailTypes,
      disposalPolicyKeys: quickFilter.disposalPolicyKeys,
      sortOrder: timeSort === 'none' ? undefined : timeSort,
    }),
    [quickFilter, mergedFilter, headerFilters.statuses, timeSort, page, pageSize],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["email-disposal", searchParams, disposalScopeTenantId],
    queryFn: () => getDisposalList(searchParams, apiRequest),
  });

  const disposalRuleOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of data?.items ?? []) {
      const ruleId = item.disposalBasis?.rule_id;
      if (ruleId) unique.set(ruleId, item.disposalBasis?.rule_name || ruleId);
    }
    return Array.from(unique, ([id, name]) => ({ id, name })).slice(0, 12);
  }, [data?.items]);

  // AI 解析结果三级回填（design spec §7）：quick 控件覆盖式合并、advanced 构建
  // 器组追加（受 5 组上限约束）、其余条件落回 aiConditions 兜底 chips。summary
  // 沿用现状——回调签名保留但当前页面不展示（与拍平前的既有行为一致）。
  const handleAiParsed = useCallback(
    (filter: AdvancedFilter | null, _summary: string, query: string) => {
      const result = backfillAiFilter(filter, advancedFilter.groups.length);
      const hasAiConditions =
        filter?.groups.some((group) => group.conditions.length > 0) ?? false;
      setAiParsedQuery(hasAiConditions ? query.trim() : null);
      if (hasAiConditions || Object.keys(result.quick).length > 0) {
        setQuickFilter((prev) =>
          mergeAiQuickFilter(prev, result.quick, query, hasAiConditions),
        );
      }
      if (result.advanced.length > 0) {
        setAdvancedFilter((prev) => ({ ...prev, groups: [...prev.groups, ...result.advanced] }));
      }
      setAiConditions(result.residual);
      setPage(1);
    },
    [advancedFilter.groups.length],
  );

  const handleSearch = useCallback((query: string) => {
    if (shouldAddDefaultSubject(query, aiParsedQuery)) {
      setQuickFilter((prev) => ({ ...prev, subject: query.trim() || undefined }));
    }
    setSimilarMode(false);
    setSimilarSeedCount(0);
    setPage(1);
  }, [aiParsedQuery]);

  const handleClearAll = useCallback(() => {
    setQuickFilter(getDefaultQuickFilter());
    setAdvancedFilter(DEFAULT_ADVANCED);
    setAiConditions([]);
    setAiParsedQuery(null);
    setSelectedIds(new Set());
    setSimilarMode(false);
    setHeaderFilters({ directions: [], emailTypes: [], statuses: [] });
    setTimeSort('none');
    setPage(1);
  }, []);

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

  useEffect(() => {
    setSelectedIds(new Set());
    setQuickFilter(getDefaultQuickFilter());
    setAdvancedFilter(DEFAULT_ADVANCED);
    setAiConditions([]);
    setAiParsedQuery(null);
    setSimilarMode(false);
    setSimilarSeedCount(0);
    setHeaderFilters({ directions: [], emailTypes: [], statuses: [] });
    setTimeSort('none');
    setPage(1);
  }, [disposalScopeTenantId]);

  const handleRemoveChip = useCallback((key: string) => {
    if (key.startsWith("ai-")) {
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
    setPage(1);
  }, []);

  const handleItemClick = useCallback((id: number) => {
    setDetailId(id);
    setDetailOpen(true);
  }, []);

  const handleBatchAction = useCallback(
    async (
      action: "find_similar" | "release" | "delete" | "export" | "recall",
    ) => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);

      if (action === "find_similar") {
        if (ids.length > 10) return;
        void runFindSimilar(ids);
        return;
      }

      if (action === "export") {
        const selected = (
          similarMode ? similarItems : (data?.items ?? [])
        ).filter((item) => selectedIds.has(item.id));
        const escapeCsv = (value: unknown) =>
          `"${String(value ?? "").replaceAll('"', '""')}"`;
        const rows = [
          [
            "ID",
            t("table.time"),
            t("table.sender"),
            t("table.recipient"),
            t("table.subject"),
            t("table.mailType"),
            t("table.status"),
          ],
          ...selected.map((item) => [
            item.id,
            item.timestamp,
            item.sender,
            item.recipientList?.join(", ") ?? item.recipient,
            item.subject,
            item.emailType ?? "",
            item.displayStatus,
          ]),
        ];
        const blob = new Blob(
          [
            `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`,
          ],
          { type: "text/csv;charset=utf-8" },
        );
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `email-disposal-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
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
    [selectedIds, t, runFindSimilar, similarMode, similarItems, data?.items],
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
      if (failCount > 0 || naCount > 0) {
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
      setSelectedIds(new Set());
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
        if (failCount > 0 || naCount > 0) {
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
        setSelectedIds(new Set());
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
    <FramedPage
      title={t(mode === "investigation" ? "investigationTitle" : "pageTitle")}
      description={t(
        mode === "investigation"
          ? "investigationSubtitle"
          : "pageDescription",
      )}
      data-testid={
        mode === "investigation"
          ? "mail-investigation-page"
          : "email-disposal-center-page"
      }
    >
      <PageFilters data-testid="disposal-search-workbench">
        <SearchBar
          onAiParsed={handleAiParsed}
          onSearch={handleSearch}
          onReset={handleClearAll}
          aiEnabled={aiEnabled}
          templates={templates.map(({ id, name }) => ({ id, name }))}
          onSaveTemplate={() => {
            const template = saveTemplate(
              `${t("search.templateDefaultName")} ${templates.length + 1}`,
              quickFilter,
              advancedFilter,
            );
            toast.success(t("search.templateSaved", { name: template.name }));
          }}
          onLoadTemplate={(id) => {
            const template = templates.find((item) => item.id === id);
            if (!template) return;
            setQuickFilter(template.quickFilter);
            setAdvancedFilter(template.advancedFilter);
            setAiParsedQuery(null);
            setSimilarMode(false);
            setPage(1);
          }}
          onDeleteTemplate={deleteTemplate}
          sampleCount={similarMode ? similarSeedCount : 0}
          onClearSamples={() => {
            setSimilarMode(false);
            setSimilarSeedCount(0);
            setSelectedIds(new Set());
          }}
          filtersExpanded={!quickFilterCollapsed}
          onToggleFilters={() => setQuickFilterCollapsed((value) => !value)}
        />
        {!quickFilterCollapsed && (
          <div data-testid="disposal-structured-filters" className="mt-4 border-t pt-4">
            <QuickFilters
              value={quickFilter}
              onChange={(v) => {
                setQuickFilter(v);
                setPage(1);
              }}
              disposalRuleOptions={disposalRuleOptions}
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
                onChange={(v) => {
                  setAdvancedFilter(v);
                  setPage(1);
                }}
              />
            </div>
          </div>
        )}
        {quickFilterCollapsed && (
          <SelectedConditions
            compact
            quick={quickFilter}
            advanced={advancedFilter}
            aiConditions={aiConditions}
            onClearAll={handleClearAll}
            onRemoveChip={handleRemoveChip}
          />
        )}
      </PageFilters>

      <PageSurface className="space-y-4">
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
                setSelectedIds(new Set());
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
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onItemClick={handleItemClick}
          onBatchAction={handleBatchAction}
          onFindSimilar={(id) => void runFindSimilar([id])}
          aiEnabled={aiEnabled}
          similarMode={similarMode}
          headerFilters={headerFilters}
          onHeaderFiltersChange={(filters) => {
            setHeaderFilters(filters);
            setPage(1);
          }}
          timeSort={timeSort}
          onTimeSortChange={(sort) => { setTimeSort(sort); setPage(1); }}
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
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent data-testid="disposal-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">{t("batch.delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("batch.confirmDelete")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detail.overview.cancel")}</AlertDialogCancel>
            <AlertDialogAction
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
    </FramedPage>
  );
}
