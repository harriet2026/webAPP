"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Download, Upload, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageHeader,
  PageShell,
} from "@/components/shared/page-shell";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  complexContentRuleEditHref,
  ContentRulesTable,
} from "@/components/security/content-rules/ContentRulesTable";
import { ContentRuleDrawer } from "@/components/security/content-rules/ContentRuleDrawer";
import { useApiRequest } from "@/lib/api/client";
import {
  listContentRules,
  resolveContentRulesRule,
  buildConditionTree,
} from "@/lib/api/content-rules";
import type {
  ContentRuleRuleView,
  ContentRuleFormData,
} from "@/types/content-rules";
import type {
  CreateRuleRequest,
  UpdateRuleRequest,
} from "@/types/unified-rules";
import type { Group } from "@/types/groups";
import { GROUPS_LIST_QUERY, ruleToGroup } from "@/lib/api/groups";
import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import { useProductForm } from "@/contexts/product-form-context";
import { canManageContentRules } from "@/components/security/content-rules/access";
// GT-11698: 必须用 i18n 的 locale-aware router。仓库没有 middleware.ts，next-intl
// 不做 locale 重写，所有路由都要显式 locale 段；用 next/navigation 的 router.push
// 推 "/rules/data?..." 会被匹配成 [locale]="rules" + (dashboard)/data 而 404。
import { useRouter } from "@/i18n/navigation";
import { RuleImportExportDialog } from "@/components/rules/RuleImportExportDialog";
import {
  exportUnifiedRules,
  previewUnifiedRulesImport,
  executeUnifiedRulesImport,
} from "@/lib/api/unified-rules";
import { ApiError } from "@/lib/api/client";
import { ModuleMasterSwitch } from "@/components/security/ModuleMasterSwitch";
import { useApiErrorMessage } from "@/lib/api/use-api-error-message";

function toRFC3339(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ContentRulesPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin, isTenantAdmin, user, selectedTenantId } = useAuth();
  const { capabilities } = useProductForm();
  const router = useRouter();

  // GT-12174 / GT-12334: 内容规则是策略流水线阶段3（模块A），tenant 级安全模块。
  // 租户管理员应能配置本租户规则；多租户下平台管理员在*平台视角*不可管理（后端
  // 无租户上下文时对其写入 403），但*以租户管理下钻*某租户时后端放行（返回 201），
  // 入口必须出现。故入口按*产品形态 + 下钻租户*判定而非仅按角色，否则要么多租户
  // 平台视角闪现随后 403 的入口、要么下钻后该出现的入口消失。判定逻辑与用例见
  // ./content-rules/access.ts（委托 canEditSecurityModule 作为单一事实源）。
  const isContentRulesAdmin = canManageContentRules({
    isSystemAdmin,
    isTenantAdmin,
    multiTenant: !!capabilities?.multiTenant,
    capabilitiesLoaded: capabilities != null,
    // GT-12334: 平台管理员"以租户管理"下钻某租户时后端放行内容规则写入，入口必须出现。
    selectedTenantId,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ContentRuleRuleView | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importExportTab, setImportExportTab] = useState<"export" | "import">("export");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const queryKey = useMemo(() => [
    "content-rules-rules",
    search,
    statusFilter,
    page,
    pageSize,
  ], [page, pageSize, search, statusFilter]);

  const { data: rulesData, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      listContentRules(
        {
          q: search || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          page,
          page_size: pageSize,
        },
        apiRequest,
      ),
    enabled: embedded || isSystemAdmin || user?.role === "tenant_admin",
  });

  const { data: groupsData } = useQuery<{ items: unknown[] }>({
    queryKey: ["content-groups"],
    queryFn: () => {
      const qs = new URLSearchParams({
        ...GROUPS_LIST_QUERY,
        group_type: "content",
      }).toString();
      return apiRequest(`/unified-rules?${qs}`);
    },
    enabled: embedded || isSystemAdmin || user?.role === "tenant_admin",
  });

  const { data: tenantOptions = [] } = useQuery({
    queryKey: ["tenants", "options"],
    queryFn: async () => {
      const response = await apiRequest<{ items: Array<{ id: number; name: string }> }>("/tenants");
      return response.items.map((tenant) => ({ id: tenant.id, name: tenant.name }));
    },
    enabled: isSystemAdmin,
  });

  const contentGroups = useMemo<Group[]>(() => {
    if (!groupsData?.items) return [];
    return (groupsData.items as unknown[])
      .map((r) => ruleToGroup(r as import("@/types/unified-rules").Rule))
      .filter(
        (g): g is NonNullable<typeof g> => g !== null && g.type === "content",
      );
  }, [groupsData]);

  const ruleViews = useMemo<ContentRuleRuleView[]>(() => {
    if (!rulesData?.items) return [];
    return rulesData.items.map((rule) => {
      const resolved = resolveContentRulesRule(rule);
      return {
        rule,
        resolved,
        is_complex: resolved === null,
      };
    });
  }, [rulesData]);

  const totalFiltered = rulesData?.total ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(totalFiltered / (rulesData?.page_size ?? pageSize)),
  );

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/unified-rules/${id}?scope=content_rules`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t("common.deleteSuccess"));
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest(`/unified-rules/${id}/status?scope=content_rules`, {
        method: "PUT",
        body: { is_active: isActive } as UpdateRuleRequest,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t("common.updateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, active }: { ids: number[]; active: boolean }) =>
      apiRequest("/unified-rules/bulk?scope=content_rules", {
        method: "POST",
        body: { ids, action: active ? "enable" : "disable" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setSelectedIds([]);
      toast.success(t("common.updateSuccess"));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      return apiRequest(`/unified-rules/${ruleId}/copy?scope=content_rules`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t("common.copySuccess"));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const handleOpenDrawer = useCallback((rule?: ContentRuleRuleView) => {
    setEditingRule(rule || null);
    setDrawerOpen(true);
  }, []);

  const handleSubmit = useCallback(
    async (data: ContentRuleFormData) => {
      const conditionTree = buildConditionTree(data);
      const metadata = {
        feature: "content_rules" as const,
        match_type: data.match_type,
        match_content: data.match_content,
        scopes: data.scopes,
        directions: data.directions,
        ...(data.mark_config ? { mark_config: data.mark_config } : {}),
        ...(data.block_alert_config
          ? { block_alert_config: data.block_alert_config }
          : {}),
      };

      const firstAction =
        data.directions.receive?.action ||
        data.directions.send?.action ||
        data.directions.internal?.action ||
        "reject";

      try {
        if (editingRule) {
          const payload: UpdateRuleRequest = {
            name: data.name,
            description: data.description,
            priority: data.priority,
            condition_tree: conditionTree,
            action: firstAction,
            metadata,
            is_active: data.is_active,
            page: "content_rules",
            valid_from: toRFC3339(data.valid_from),
            valid_until: toRFC3339(data.valid_until),
            expected_updated_at: editingRule.rule.updated_at,
            email_type: data.email_type,
          };
          await apiRequest(`/unified-rules/${editingRule.rule.id}?scope=content_rules`, {
            method: "PUT",
            body: payload,
          });
        } else {
          const payload: CreateRuleRequest = {
            name: data.name,
            description: data.description,
            page: "content_rules",
            rule_class: "action",
            stage: "data",
            priority: data.priority,
            condition_tree: conditionTree,
            action: firstAction,
            metadata,
            is_active: data.is_active,
            valid_from: toRFC3339(data.valid_from),
            valid_until: toRFC3339(data.valid_until),
            email_type: data.email_type,
          };
          await apiRequest("/unified-rules?scope=content_rules", { method: "POST", body: payload });
        }
        queryClient.invalidateQueries({ queryKey });
        toast.success(
          t(editingRule ? "common.updateSuccess" : "common.createSuccess"),
        );
      } catch (error) {
        const message =
          error instanceof ApiError && error.message
            ? error.message
            : t("common.error");
        toast.error(message);
        throw error;
      }
    },
    [apiRequest, editingRule, queryClient, queryKey, t],
  );

  const handleCopy = useCallback(
    (ruleId: number) => {
      copyMutation.mutate(ruleId);
    },
    [copyMutation],
  );

  const handleBulkDelete = useCallback(() => {
    apiRequest("/unified-rules/bulk?scope=content_rules", {
      method: "POST",
      body: { ids: selectedIds, action: "delete" },
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey });
        setSelectedIds([]);
        toast.success(t("common.deleteSuccess"));
      })
      .catch((error: Error) => {
        toast.error(apiErrorMessage(error));
      });
  }, [selectedIds, apiRequest, queryClient, queryKey, t, apiErrorMessage]);

  if (!embedded && !isSystemAdmin && user?.role !== "tenant_admin") {
    return (
      <PageShell>
        <PageHeader title={t("contentRules.title")} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t("common.notAuthorized")}
        </div>
      </PageShell>
    );
  }

  const actionButtons = (
    <div className="flex gap-2">
      {isContentRulesAdmin && (
        <Button variant="outline" onClick={() => {
          setImportExportTab("import");
          setImportExportOpen(true);
        }}>
          <Upload className="h-4 w-4 mr-2" />
          {t("common.import")}
        </Button>
      )}
      {isContentRulesAdmin && (
        <Button variant="outline" onClick={() => {
          setImportExportTab("export");
          setImportExportOpen(true);
        }}>
          <Download className="h-4 w-4 mr-2" />
          {t("common.export")}
        </Button>
      )}
      {isContentRulesAdmin && (
        <Button onClick={() => handleOpenDrawer()}>
          <Plus className="h-4 w-4 mr-2" />
          {t("contentRules.createRule")}
        </Button>
      )}
    </div>
  );

  const content = (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder={t("contentRules.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
              setSelectedIds([]);
            }}
            className="max-w-xs"
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v ?? "all");
              setPage(1);
              setSelectedIds([]);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("contentRules.statusAll")}</SelectItem>
              <SelectItem value="enabled">
                {t("contentRules.statusEnabled")}
              </SelectItem>
              <SelectItem value="disabled">
                {t("contentRules.statusDisabled")}
              </SelectItem>
            </SelectContent>
          </Select>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("contentRules.resetFilters")}
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                      setPage(1);
                      setSelectedIds([]);
                    }}
                  />
                }
              >
                <RotateCcw className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>{t("contentRules.resetFilters")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isContentRulesAdmin && selectedIds.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  bulkMutation.mutate({ ids: selectedIds, active: true })
                }
              >
                {t("common.enable")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  bulkMutation.mutate({ ids: selectedIds, active: false })
                }
              >
                {t("common.disabled")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
              >
                {t("common.delete")}
              </Button>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <ContentRulesTable
            data={ruleViews}
            pageCount={totalPages}
            pageIndex={page - 1}
            pageSize={pageSize}
            onPageChange={(idx) => {
              setPage(idx + 1);
              setSelectedIds([]);
            }}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
              setSelectedIds([]);
            }}
            onEdit={(rule) => handleOpenDrawer(rule)}
            onEditComplex={(ruleId) => router.push(complexContentRuleEditHref(ruleId))}
            onDelete={(rule) =>
              setDeleteTarget({ id: rule.rule.id, name: rule.rule.name })
            }
            onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
            onCopy={handleCopy}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            isLoading={isLoading}
            canEdit={isContentRulesAdmin}
            totalCount={totalFiltered}
          />
        )}
      </div>

      <ContentRuleDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editingRule={editingRule}
        contentGroups={contentGroups}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("contentRules.deleteRule")}
        description={t("contentRules.deleteConfirm")}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
        variant="destructive"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t("contentRules.batchDelete")}
        description={t("contentRules.batchDeleteConfirm", { count: selectedIds.length })}
        onConfirm={() => {
          setBulkDeleteOpen(false);
          handleBulkDelete();
        }}
        variant="destructive"
      />

      <RuleImportExportDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
        initialTab={importExportTab}
        scopeLabel={t("contentRules.title")}
        variant="unified-rules"
        adminContext={isSystemAdmin ? "system-admin" : "tenant-admin"}
        tenantOptions={tenantOptions}
        onExport={(selection) =>
          exportUnifiedRules(selection, apiRequest, "content_rules")
        }
        onPreviewImport={(payload) =>
          previewUnifiedRulesImport(payload, apiRequest, "content_rules")
        }
        onExecuteImport={async (payload) => {
          const response = await executeUnifiedRulesImport(
            payload,
            apiRequest,
            "content_rules",
          );
          queryClient.invalidateQueries({ queryKey });
          return response;
        }}
      />
    </>
  );

  if (embedded) {
    return (
      <ModuleMasterSwitch
        page="content_rules"
        title={t("contentRules.title")}
        actions={actionButtons}
      >
        {content}
      </ModuleMasterSwitch>
    );
  }

  return (
    <PageShell>
      <PageHeader title={t("contentRules.title")} />
      <ModuleMasterSwitch page="content_rules" actions={actionButtons}>{content}</ModuleMasterSwitch>
    </PageShell>
  );
}
