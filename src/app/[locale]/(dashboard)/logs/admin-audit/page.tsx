'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { listTenants } from '@/lib/api/tenants';
import {
  getAdminAuditLogs,
  getAdminAuditStats,
  type AdminAuditLog,
  type AdminAuditLogParams,
} from '@/lib/api/admin-audit';
import { useApiRequest } from '@/lib/api/client';
import { AdminAuditStats } from '@/components/admin-audit/admin-audit-stats';
import {
  AdminAuditFilters,
  EMPTY_ADMIN_FILTERS,
  filtersToParams,
  type AdminFilterState,
} from '@/components/admin-audit/admin-audit-filters';
import { AdminAuditTable } from '@/components/admin-audit/admin-audit-table';
import { AdminAuditDetailDrawer } from '@/components/admin-audit/admin-audit-detail-drawer';
import { useAuditViewMode } from '@/components/admin-audit/use-audit-view-mode';
import { useAppliedFilterState } from '@/hooks/use-applied-filter-state';

type LayerTab = 'platform' | 'tenant';

const DEFAULT_PAGE_SIZE = 50;

export default function AdminAuditLogsPage() {
  const t = useTranslations();
  const { apiRequest } = useApiRequest();
  const viewMode = useAuditViewMode();

  const [layerTab, setLayerTab] = useState<LayerTab>('platform');
  // GT-12315：管理员账号行的「日志」入口带 ?keyword=<username> 深链进来，
  // 用它作为关键字过滤的初始值（仅初始化时读取，后续由过滤卡片接管）。
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get('keyword') ?? '';
  const {
    draft: filters,
    applied: appliedFilters,
    setDraft: setFilters,
    apply: applyFilters,
    reset: resetFilters,
  } = useAppliedFilterState<AdminFilterState>({
    initialValue: initialKeyword
      ? { ...EMPTY_ADMIN_FILTERS, keyword: initialKeyword }
      : EMPTY_ADMIN_FILTERS,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);

  const drillTenant = viewMode === 'platform' && layerTab === 'tenant';
  const showTenantColumn = viewMode === 'platform' && layerTab === 'tenant';
  const showLayerTabs = viewMode === 'platform';

  const { data: tenantsData } = useQuery({
    queryKey: ['admin-audit-tenant-options'],
    queryFn: () => listTenants({ pageSize: 200 }),
    enabled: drillTenant,
  });
  const tenants = useMemo(
    () => (tenantsData?.items ?? []).map((item) => ({ id: item.id, name: item.name })),
    [tenantsData],
  );
  const tenantNameOf = useCallback(
    (log: AdminAuditLog) => {
      if (log.tenant_name) return log.tenant_name;
      const tid = log.effective_tenant_id ?? log.tenant_id;
      if (tid == null) return '-';
      const match = tenants.find((tenant) => tenant.id === tid);
      return match ? match.name : String(tid);
    },
    [tenants],
  );

  const layerForParams = useMemo<'platform' | 'tenant' | undefined>(() => {
    if (viewMode === 'platform') return layerTab;
    if (viewMode === 'tenant') return 'tenant';
    return undefined;
  }, [viewMode, layerTab]);

  const tenantIdParam = useMemo<number | undefined>(() => {
    if (!drillTenant) return undefined;
    const v = appliedFilters.tenant.trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [appliedFilters.tenant, drillTenant]);

  const params = useMemo<AdminAuditLogParams>(() => ({
    page,
    page_size: pageSize,
    ...filtersToParams(appliedFilters),
    layer: layerForParams,
    tenant_id: tenantIdParam,
  }), [page, pageSize, appliedFilters, layerForParams, tenantIdParam]);

  const statsParams = useMemo<Omit<AdminAuditLogParams, 'page' | 'page_size'>>(() => {
    const { page: _p, page_size: _ps, ...rest } = params;
    void _p; void _ps;
    return rest;
  }, [params]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-logs', params],
    queryFn: () => getAdminAuditLogs(params, apiRequest),
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-audit-stats', statsParams],
    queryFn: () => getAdminAuditStats(statsParams, apiRequest),
  });

  const handleFiltersChange = useCallback((next: AdminFilterState) => {
    setFilters(next);
  }, [setFilters]);

  const handleSearch = useCallback(() => {
    applyFilters();
    setPage(1);
  }, [applyFilters]);

  const handleReset = useCallback(() => {
    resetFilters(EMPTY_ADMIN_FILTERS);
    setPage(1);
  }, [resetFilters]);

  const handleLayerTabChange = useCallback((value: string | null) => {
    if (value === 'platform' || value === 'tenant') {
      setLayerTab(value);
      resetFilters(EMPTY_ADMIN_FILTERS);
      setPage(1);
    }
  }, [resetFilters]);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const subtitle = useMemo(() => {
    if (viewMode === 'platform') return t('adminAudit.subtitlePlatform');
    if (viewMode === 'tenant') return t('adminAudit.subtitleTenant');
    return t('adminAudit.subtitle');
  }, [viewMode, t]);

  return (
    <PageShell data-testid="admin-audit-page">
      <PageHeader
        eyebrow={t('adminAudit.eyebrow')}
        title={t('adminAudit.title')}
        description={subtitle}
      />

      {showLayerTabs ? (
        <Tabs value={layerTab} onValueChange={handleLayerTabChange}>
          <TabsList variant="line">
            <TabsTrigger value="platform" data-testid="admin-audit-tab-platform">{t('adminAudit.layer.platform')}</TabsTrigger>
            <TabsTrigger value="tenant" data-testid="admin-audit-tab-tenant">{t('adminAudit.layer.tenant')}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <AdminAuditStats stats={stats} />

      <AdminAuditFilters
        value={filters}
        onChange={handleFiltersChange}
        onSearch={handleSearch}
        onReset={handleReset}
        showTenant={drillTenant}
        tenants={tenants}
      />

      {isLoading ? (
        <PageSurface>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </PageSurface>
      ) : (
        <AdminAuditTable
          logs={data?.items ?? []}
          onRowClick={setSelectedLog}
          showTenant={showTenantColumn}
          tenantNameOf={tenantNameOf}
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      <AdminAuditDetailDrawer
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        tenantNameOf={tenantNameOf}
      />
    </PageShell>
  );
}
