'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Download, Upload, Loader2, RotateCcw } from 'lucide-react';
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
import type { CreateRuleRequest, UpdateRuleRequest } from '@/types/unified-rules';
import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { RuleImportExportDialog } from '@/components/rules/RuleImportExportDialog';
import { exportUnifiedRules, previewUnifiedRulesImport, executeUnifiedRulesImport } from '@/lib/api/unified-rules';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';
import { toRFC3339 } from '@/lib/format-time';

export function SenderFilterPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { isSystemAdmin, user } = useAuth();

  const [listTypeTab, setListTypeTab] = useState<string>('blacklist');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SenderFilterStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<SenderFilterRuleView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);

  const queryKey = ['sender-filter-rules'];

  const { data: rulesData, isLoading } = useQuery({
    queryKey,
    queryFn: () => listSenderFilterRules(apiRequest),
    enabled: embedded || isSystemAdmin || user?.role === 'tenant_admin',
  });

  const { data: groupsData } = useQuery<SenderFilterGroups>({
    queryKey: ['sender-filter-groups'],
    queryFn: () => listSenderFilterGroups(apiRequest),
    enabled: embedded || isSystemAdmin || user?.role === 'tenant_admin',
  });

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
      };
    });
  }, [rulesData]);

  const filteredRules = useMemo(
    () => filterSenderFilterRules(ruleViews, { listType: listTypeTab, search, status: statusFilter }),
    [ruleViews, listTypeTab, search, statusFilter],
  );

  const totalFiltered = filteredRules.length;
  const pagedRules = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRules.slice(start, start + pageSize);
  }, [filteredRules, page, pageSize]);
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/unified-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.deleteSuccess'));
      setDeleteTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
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
      toast.error(error.message);
    },
  });

  const handleOpenDrawer = useCallback(
    (rule?: SenderFilterRuleView) => {
      setEditingRule(rule || null);
      setDrawerOpen(true);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (data: SenderFilterFormData) => {
      // GT-11486: 复杂规则（高级编辑器/API 创建，简易抽屉无法表达其条件）
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
          await apiRequest('/unified-rules', { method: 'POST', body: payload });
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

  const handleExport = async () => {
    setImportExportOpen(true);
  };

  const handleImport = async () => {
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
      <Button onClick={() => handleOpenDrawer()}>
        <Plus className="h-4 w-4 mr-2" />
        {t('senderFilter.createRule')}
      </Button>
      <Button variant="outline" size="icon" onClick={handleImport} aria-label={t('senderFilter.import')} title={t('senderFilter.import')}>
        <Upload className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" onClick={handleExport} aria-label={t('senderFilter.export')} title={t('senderFilter.export')}>
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );

  const content = (
    <>
      <div className="space-y-4">
        <Tabs value={listTypeTab} onValueChange={(v) => { setListTypeTab(v); setPage(1); }}>
          <TabsList className="rounded-2xl border border-border/70 bg-muted/30 p-1">
            <TabsTrigger value="blacklist">{t('senderFilter.blacklist')}</TabsTrigger>
            <TabsTrigger value="whitelist">{t('senderFilter.whitelist')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {/* demo 布局：搜索行与「新建规则/导入/导出」同一行，操作按钮右对齐 */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-1 flex-wrap gap-3 items-center">
            <Input
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
              <SelectTrigger className="w-[120px]" aria-label={t('senderFilter.statusFilter')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('senderFilter.statusAll')}</SelectItem>
                <SelectItem value="enabled">{t('senderFilter.statusEnabled')}</SelectItem>
                <SelectItem value="disabled">{t('senderFilter.statusDisabled')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setStatusFilter('all'); setPage(1); }} aria-label={t('senderFilter.resetFilters')} title={t('senderFilter.resetFilters')}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          {actionButtons}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <SenderFilterTable
            data={pagedRules}
            pageCount={totalPages}
            pageIndex={page - 1}
            pageSize={pageSize}
            onPageChange={(idx) => setPage(idx + 1)}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            onEdit={(rule) => handleOpenDrawer(rule)}
            onDelete={(rule) => setDeleteTarget({ id: rule.rule.id, name: rule.rule.name })}
            onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
            groups={groupsData ?? { senderGroups: [], ipGroups: [] }}
            isLoading={isLoading}
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
        scopeLabel={t('senderFilter.title')}
        variant="unified-rules"
        adminContext={isSystemAdmin ? 'system-admin' : 'tenant-admin'}
        tenantOptions={tenantOptions}
        onExport={(selection) => exportUnifiedRules(selection, apiRequest, 'sender_filter')}
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
