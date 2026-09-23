'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Download, Upload, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SenderFilterTable } from '@/components/security/sender-filter/SenderFilterTable';
import { SenderFilterDrawer } from '@/components/security/sender-filter/SenderFilterDrawer';
import { useApiRequest } from '@/lib/api/client';
import { listSenderFilterGroups, listSenderFilterRules, resolveSenderFilterRule, buildConditionTree, formatListId, filterSenderFilterRules } from '@/lib/api/sender-filter';
import { listTenantDomains } from '@/lib/api/mail-routing';
import type { SenderFilterStatusFilter } from '@/lib/api/sender-filter';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SenderFilterRuleView, SenderFilterFormData, ListType, SenderFilterGroups } from '@/types/sender-filter';
import type { CreateRuleRequest, UpdateRuleRequest, Rule } from '@/types/unified-rules';
import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { RuleImportExportDialog } from '@/components/rules/RuleImportExportDialog';
import { exportUnifiedRules, previewUnifiedRulesImport, executeUnifiedRulesImport } from '@/lib/api/unified-rules';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';
import { toRFC3339 } from '@/lib/format-time';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { buildSenderFilterImportTemplate } from '@/lib/security-rule-import-templates';
import { RULE_LIST_DEFAULT_PAGE_SIZE } from '@/components/shared/rule-list-pagination';

export function SenderFilterPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { isSystemAdmin, user } = useAuth();

  const [listTypeTab, setListTypeTab] = useState<string>('blacklist');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SenderFilterStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(RULE_LIST_DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<SenderFilterRuleView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importExportTab, setImportExportTab] = useState<'export' | 'import'>('export');
  // 观察模式：本次为纯前端交付（mock），后端尚无承载字段，先用本地态记录每条
  // 规则的开关值，按 rule.id 索引；不参与任何 CRUD 请求体。
  const [observeModeById, setObserveModeById] = useState<Record<number, boolean>>({});

  const senderFilterImportTemplate = useMemo(
    () => buildSenderFilterImportTemplate(effectiveTenantId ?? user?.tenant_id),
    [effectiveTenantId, user?.tenant_id],
  );

  // Rules and group projections are tenant-scoped. Keeping a global query key
  // lets a platform administrator switch tenants while React Query continues
  // to treat the previous tenant's cache as current, exposing stale rules and
  // making mutations appear to target the wrong scope.
  const queryKey = useMemo(
    () => ['sender-filter-rules', effectiveTenantId] as const,
    [effectiveTenantId],
  );
  const groupsQueryKey = useMemo(
    () => ['sender-filter-groups', effectiveTenantId] as const,
    [effectiveTenantId],
  );

  const { data: rulesData, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => listSenderFilterRules(apiRequest),
    enabled: embedded || isSystemAdmin || user?.role === 'tenant_admin',
    // Do not keep the page in a loading state through the global retry window.
    // Administrators need a truthful failure state and an explicit retry path.
    retry: false,
  });

  const {
    data: groupsData,
    isLoading: groupsLoading,
    isError: groupsError,
    isFetching: groupsFetching,
    refetch: refetchGroups,
  } = useQuery<SenderFilterGroups>({
    queryKey: groupsQueryKey,
    queryFn: () => listSenderFilterGroups(apiRequest),
    enabled: embedded || isSystemAdmin || user?.role === 'tenant_admin',
    retry: false,
  });

  // Group data is part of the page's trusted read model, not optional
  // decoration: it drives group names, deleted-reference warnings and editor
  // choices. If it fails, rendering with [] would falsely mark every group as
  // deleted and leave the editor with an empty selector.
  const pageLoading = isLoading || groupsLoading;
  const pageError = isError || groupsError;
  const pageFetching = isFetching || groupsFetching;

  // GT-12117: 组织域名下拉的选项来源——当前 effective 租户的接收域名列表。
  // 平台管理员未选租户时 effectiveTenantId 为 null，查询禁用，下拉显示空态。
  const { data: tenantDomains = [] } = useQuery<string[]>({
    queryKey: ['sender-filter-tenant-domains', effectiveTenantId],
    queryFn: () => listTenantDomains(effectiveTenantId as number, apiRequest).then((ds) => ds.map((d) => d.domain)),
    enabled: effectiveTenantId != null && (embedded || isSystemAdmin || user?.role === 'tenant_admin'),
  });

  const { data: tenantOptions = [] } = useQuery({
    queryKey: ['tenants', 'options'],
    queryFn: async () => {
      const response = await apiRequest<{ items: Array<{ id: number; name: string }> }>('/tenants');
      return response.items.map((tenant) => ({ id: tenant.id, name: tenant.name }));
    },
    enabled: isSystemAdmin,
  });

  const ruleViews = useMemo<SenderFilterRuleView[]>(() => {
    if (!rulesData?.items) return [];
    return rulesData.items.map((rule) => {
      const resolved = resolveSenderFilterRule(rule);
      const lt = resolved?.list_type || (rule.action === 'accept' ? 'whitelist' : 'blacklist');
      return {
        rule,
        list_type: lt,
        list_id_display: formatListId(rule, lt),
        resolved,
        is_complex: resolved === null,
        observe_mode: observeModeById[rule.id] ?? false,
      };
    });
  }, [rulesData, observeModeById]);

  const filteredRules = useMemo(
    () => filterSenderFilterRules(ruleViews, { listType: listTypeTab, search, status: statusFilter }),
    [ruleViews, listTypeTab, search, statusFilter],
  );

  const totalFiltered = filteredRules.length;
  const pagedRules = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRules.slice(start, start + pageSize);
  }, [filteredRules, page, pageSize]);
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/unified-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.deleteSuccess'));
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest(`/unified-rules/${id}`, {
        method: 'PUT',
        body: { is_active: isActive } as UpdateRuleRequest,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  // 观察模式（mock）：仅更新本地态，无对应后端接口。
  const handleToggleObserve = useCallback(
    (id: number, observeMode: boolean) => {
      setObserveModeById((prev) => ({ ...prev, [id]: observeMode }));
      toast.success(t('common.updateSuccess'));
    },
    [t],
  );

  const handleOpenDrawer = useCallback(
    (rule?: SenderFilterRuleView) => {
      setEditingRule(rule || null);
      setDrawerOpen(true);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (data: SenderFilterFormData) => {
      // GT-11486: 复杂规则（高级编辑器/API 创建，简易抽屉��法表达其条件）
      // 只允许更新基础字段。部分更新不携带 condition_tree/metadata/action/tags，
      // 后端保留原值，避免把复杂条件覆写成简易表单拼出来的条件。
      if (editingRule && data.is_complex) {
        try {
          const payload: UpdateRuleRequest = {
            name: data.name,
            description: data.description,
            priority: data.priority,
            is_active: data.is_active,
            valid_until: toRFC3339(data.valid_until) ?? null,
          };
          await apiRequest(`/unified-rules/${editingRule.rule.id}`, { method: 'PUT', body: payload });
          setObserveModeById((prev) => ({ ...prev, [editingRule.rule.id]: data.observe_mode ?? false }));
          queryClient.invalidateQueries({ queryKey });
          toast.success(t('common.updateSuccess'));
        } catch (err) {
          if ((err as { status?: number })?.status === 409) {
            toast.error(t('senderFilter.errors.nameDuplicate'));
          } else {
            toast.error(t('common.error'));
          }
          throw err;
        }
        return;
      }

      const conditionTree = buildConditionTree(data);
      const metadata = {
        feature: 'sender_filter' as const,
        sender_config: data.sender_config,
        ip_range: data.ip_range,
        list_type: data.list_type,
        whitelist_mode: data.list_type === 'whitelist' ? data.whitelist_mode : undefined,
      };
      const tags = data.list_type === 'whitelist' && data.whitelist_mode === 'bypass_content'
        ? ['sys:nocontent']
        : [];

      try {
        if (editingRule) {
          const payload: UpdateRuleRequest = {
            name: data.name,
            description: data.description,
            priority: data.priority,
            condition_tree: conditionTree,
            action: data.action,
            metadata,
            is_active: data.is_active,
            tags,
            page: 'sender_filter',
            valid_until: toRFC3339(data.valid_until) ?? null,
          };
          await apiRequest(`/unified-rules/${editingRule.rule.id}`, { method: 'PUT', body: payload });
          setObserveModeById((prev) => ({ ...prev, [editingRule.rule.id]: data.observe_mode ?? false }));
        } else {
          const payload: CreateRuleRequest = {
            name: data.name,
            description: data.description,
            page: 'sender_filter',
            rule_class: 'action',
            stage: 'rcpt',
            priority: data.priority,
            condition_tree: conditionTree,
            action: data.action,
            metadata,
            is_active: data.is_active,
            tags,
            valid_until: toRFC3339(data.valid_until) ?? null,
          };
          const created = await apiRequest<Rule>('/unified-rules', { method: 'POST', body: payload });
          if (created?.id) {
            setObserveModeById((prev) => ({ ...prev, [created.id]: data.observe_mode ?? false }));
          }
        }
        queryClient.invalidateQueries({ queryKey });
        toast.success(t(editingRule ? 'common.updateSuccess' : 'common.createSuccess'));
      } catch (err) {
        // GT-11685: 后端对重名返回 409（唯一索引 idx_rules_name_tenant）。
        // 此前统一吞成 common.error（"操作失败"），管理员不知道是名称重复。
        if ((err as { status?: number })?.status === 409) {
          toast.error(t('senderFilter.errors.nameDuplicate'));
        } else {
          toast.error(t('common.error'));
        }
        // 原样抛出：抽屉据 status===409 在规则名称字段行内提示。
        throw err;
      }
    },
    [apiRequest, editingRule, queryClient, queryKey, t],
  );

  const handleExport = () => {
    setImportExportTab('export');
    setImportExportOpen(true);
  };

  const handleImport = () => {
    setImportExportTab('import');
    setImportExportOpen(true);
  };

  if (!embedded && !isSystemAdmin && user?.role !== 'tenant_admin') {
    return (
      <PageShell>
        <PageHeader title={t('senderFilter.title')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t('common.notAuthorized')}
        </div>
      </PageShell>
    );
  }

  const actionButtons = (
    <div className="flex gap-2">
      <Button data-testid="sender-filter-create" onClick={() => handleOpenDrawer()}>
        <Plus className="h-4 w-4 mr-2" />
        {t('senderFilter.createRule')}
      </Button>
      <Button data-testid="sender-filter-import" variant="outline" size="icon" onClick={handleImport} aria-label={t('senderFilter.import')} title={t('senderFilter.import')}>
        <Upload className="h-4 w-4" />
      </Button>
      <Button data-testid="sender-filter-export" variant="outline" size="icon" onClick={handleExport} aria-label={t('senderFilter.export')} title={t('senderFilter.export')}>
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );

  const content = (
    <>
      <div className="space-y-4">
        <Tabs value={listTypeTab} onValueChange={(v) => { setListTypeTab(v); setPage(1); }}>
          <TabsList className="rounded-2xl border border-border/70 bg-muted/30 p-1">
            <TabsTrigger data-testid="sender-filter-tab-blacklist" value="blacklist">{t('senderFilter.blacklist')}</TabsTrigger>
            <TabsTrigger data-testid="sender-filter-tab-whitelist" value="whitelist">{t('senderFilter.whitelist')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {/* demo 布局：搜索行与「新建规则/导入/导出」同一行，操作按钮右对齐 */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-1 flex-wrap gap-3 items-center">
            <Input
              data-testid="sender-filter-search"
              placeholder={t('senderFilter.searchPlaceholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="max-w-xs"
            />
            {/* GT-11721: 状态筛选（全部/已启用/已禁用）。demo 重做时被移除，
                但它是既有管理员能力（原页面就有）且 QC 复查断言其存在，恢复之。 */}
            <Select
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter((v ?? 'all') as SenderFilterStatusFilter); setPage(1); }}
            >
              <SelectTrigger data-testid="sender-filter-status-filter" className="w-[120px]" aria-label={t('senderFilter.statusFilter')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem data-testid="sender-filter-status-all" value="all">{t('senderFilter.statusAll')}</SelectItem>
                <SelectItem data-testid="sender-filter-status-enabled" value="enabled">{t('senderFilter.statusEnabled')}</SelectItem>
                <SelectItem data-testid="sender-filter-status-disabled" value="disabled">{t('senderFilter.statusDisabled')}</SelectItem>
              </SelectContent>
            </Select>
            <Button data-testid="sender-filter-reset-filters" variant="ghost" size="icon" onClick={() => { setSearch(''); setStatusFilter('all'); setPage(1); }} aria-label={t('senderFilter.resetFilters')} title={t('senderFilter.resetFilters')}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          {actionButtons}
        </div>

        {pageLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : pageError ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-12"
            data-testid="sender-filter-load-error"
          >
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{t('senderFilter.loadFailed')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { void Promise.all([refetch(), refetchGroups()]); }}
              disabled={pageFetching}
              data-testid="sender-filter-load-retry"
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <SenderFilterTable
            data={pagedRules}
            pageIndex={page - 1}
            pageSize={pageSize}
            totalCount={totalFiltered}
            onPageChange={(idx) => setPage(idx + 1)}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            onEdit={(rule) => handleOpenDrawer(rule)}
            onDelete={(rule) => setDeleteTarget({ id: rule.rule.id, name: rule.rule.name })}
            onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
            onToggleObserve={handleToggleObserve}
            groups={groupsData ?? { senderGroups: [], ipGroups: [] }}
            isLoading={pageLoading}
          />
        )}
      </div>

      <SenderFilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        editingRule={editingRule}
        listTypeTab={listTypeTab as ListType}
        groups={groupsData ?? { senderGroups: [], ipGroups: [] }}
        tenantDomains={tenantDomains}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('senderFilter.deleteRule')}
        description={t('senderFilter.deleteConfirm', { name: deleteTarget?.name ?? '' })}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
        variant="destructive"
      />

      <RuleImportExportDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
        initialTab={importExportTab}
        scopeLabel={t('senderFilter.title')}
        variant="unified-rules"
        adminContext={isSystemAdmin ? 'system-admin' : 'tenant-admin'}
        tenantOptions={tenantOptions}
        rulesOnly
        importTemplate={senderFilterImportTemplate}
        onExport={(selection) => exportUnifiedRules(
          selection,
          apiRequest,
          'sender_filter',
          new Set(filteredRules.map((view) => view.rule.id)),
        )}
        onPreviewImport={(payload) => previewUnifiedRulesImport(payload, apiRequest, 'sender_filter')}
        onExecuteImport={async (payload) => {
          const response = await executeUnifiedRulesImport(payload, apiRequest, 'sender_filter');
          queryClient.invalidateQueries({ queryKey });
          return response;
        }}
      />
    </>
  );

  if (embedded) {
    return <ModuleMasterSwitch page="sender_filter">{content}</ModuleMasterSwitch>;
  }

  return (
    <PageShell>
      <PageHeader title={t('senderFilter.title')} />
      <ModuleMasterSwitch page="sender_filter">{content}</ModuleMasterSwitch>
    </PageShell>
  );
}
