'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { ServerPagination } from '@/components/shared/server-pagination';
import { useScopedApiRequest, ApiError } from '@/lib/api/client';
import { useProductForm } from '@/contexts/product-form-context';
import { listTenants } from '@/lib/api/tenants';
import { getLinkClicks, downloadLinkClick, type LinkClickLog } from '@/lib/api/link-clicks';
import { LinkFilters, type LinkFilterValues } from '@/components/link-logs/link-filters';
import { LinkTable } from '@/components/link-logs/link-table';
import { LinkDetailModal } from '@/components/link-logs/link-detail-modal';
import { useAppliedFilterState } from '@/hooks/use-applied-filter-state';

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const DEFAULT_PAGE_SIZE = 100;

// 「点击时间」是单日期筛选（html_spec §2.1）；后端参数是 start/end 区间，
// 这里把所选日期展开为本地当日 [00:00:00, 23:59:59.999] 的 RFC3339 区间。
function dayRange(clickDate: string): { start?: string; end?: string } {
  if (!clickDate) return {};
  const start = new Date(`${clickDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return {};
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

const EMPTY_FILTERS: LinkFilterValues = {
  messageId: '', clicker: '', sender: '', srcUrl: '',
  triggerStage: '', finalResult: '', userAction: '', clickSource: '',
  clickDate: '',
};

interface LinkFilterDraft {
  values: LinkFilterValues;
  tenantId: number | null;
}

export default function LinkClicksPage() {
  const t = useTranslations();
  const { capabilities, viewer } = useProductForm();

  // Tenant-scope dropdown only for cloud (saas) + platform viewer (spec §4.1).
  const showTenant = !!capabilities?.saas && viewer === 'platform';
  const {
    draft: filterDraft,
    applied: appliedFilter,
    setDraft: setFilterDraft,
    apply: applyFilters,
    reset: resetFilters,
  } = useAppliedFilterState<LinkFilterDraft>({
    initialValue: { values: EMPTY_FILTERS, tenantId: null },
  });
  // Page-local X-Tenant-ID for the (read-only, all-tenant) log view:
  // cloud+platform → dropdown selection (null=all); otherwise null (AI-multi
  // platform sees all; tenant_admin forced by backend).
  const effectiveScope = showTenant ? appliedFilter.tenantId : null;
  const { apiRequest } = useScopedApiRequest(effectiveScope);

  // Tenant dropdown options: fetched from the global tenants API (system_admin
  // sees all tenants). Only used when showTenant is true.
  const { data: tenantsData } = useQuery({
    queryKey: ['link-clicks-tenant-options'],
    queryFn: () => listTenants({ pageSize: 200 }),
    enabled: showTenant,
  });

  const [filterKey, setFilterKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<LinkClickLog | null>(null);

  const params = useMemo(() => ({
    message_id: appliedFilter.values.messageId || undefined,
    clicker: appliedFilter.values.clicker || undefined,
    sender: appliedFilter.values.sender || undefined,
    src_url: appliedFilter.values.srcUrl || undefined,
    trigger_stage: appliedFilter.values.triggerStage || undefined,
    final_result: appliedFilter.values.finalResult || undefined,
    user_action: appliedFilter.values.userAction || undefined,
    click_source: appliedFilter.values.clickSource || undefined,
    ...dayRange(appliedFilter.values.clickDate),
    page,
    page_size: pageSize,
  }), [appliedFilter.values, page, pageSize]);

  const { data, isLoading } = useQuery({
    queryKey: ['link-clicks', params, effectiveScope],
    queryFn: () => getLinkClicks(params, apiRequest),
  });

  const handleFilterChange = useCallback((patch: Partial<LinkFilterValues>) => {
    setFilterDraft((current) => ({
      ...current,
      values: { ...current.values, ...patch },
    }));
  }, [setFilterDraft]);
  const handleSearch = useCallback(() => {
    applyFilters();
    setPage(1);
  }, [applyFilters]);
  const handleReset = useCallback(() => {
    resetFilters({ values: EMPTY_FILTERS, tenantId: null });
    setPage(1);
    setFilterKey((k) => k + 1);
  }, [resetFilters]);
  const handleDownload = useCallback(async (log: LinkClickLog) => {
    try {
      await downloadLinkClick(log.id, log.log_id ?? String(log.id), apiRequest);
    } catch (e) {
      // GT-12610：不再把后端英文 message（Invalid id / Link click not found /
      // Internal server error）原样拼进 toast，按稳定错误码映射本地化文案。
      const code = e instanceof ApiError
        ? ((e.body?.error as { code?: string } | undefined)?.code ?? '')
        : '';
      const key = code === 'invalid_request' ? 'invalidId' : code === 'not_found' ? 'notFound' : 'generic';
      toast.error(t(`linkLogs.downloadErrors.${key}`));
    }
  }, [apiRequest, t]);

  // Base UI's <Select.Value> shows the raw value unless the Root gets `items`,
  // which rendered the tenant id instead of its name (GT-12021).
  const tenantItems = useMemo(
    () => ({
      all: t('linkLogs.allTenants'),
      ...Object.fromEntries((tenantsData?.items ?? []).map((tn) => [String(tn.id), tn.name])),
    }),
    [tenantsData, t],
  );

  const tenantDropdown = showTenant ? (
    <Select
      items={tenantItems}
      value={filterDraft.tenantId == null ? 'all' : String(filterDraft.tenantId)}
      onValueChange={(v) => {
        const tenantId = v === 'all' || v == null ? null : Number(v);
        setFilterDraft((current) => ({ ...current, tenantId }));
      }}
    >
      <SelectTrigger data-testid="link-logs-tenant-scope" className="h-9 w-full"><SelectValue placeholder={t('linkLogs.tenantScope')} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('linkLogs.allTenants')}</SelectItem>
        {(tenantsData?.items ?? []).map((tn) => (
          <SelectItem key={tn.id} value={String(tn.id)}>{tn.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null;

  return (
    <PageShell>
      <PageHeader eyebrow={t('linkLogs.eyebrow')} title={t('linkLogs.title')} description={t('linkLogs.subtitle')} />
      <div className="space-y-4" data-testid="link-logs-page">
        <LinkFilters key={filterKey} values={filterDraft.values} onChange={handleFilterChange}
          onSearch={handleSearch} onReset={handleReset} tenantScope={tenantDropdown} />
        {isLoading ? (
          <PageSurface><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></PageSurface>
        ) : (
          <PageSurface className="space-y-4">
            <div className="text-sm text-muted-foreground" data-testid="link-logs-total">{t('linkLogs.total', { count: data?.total ?? 0 })}</div>
            <LinkTable logs={data?.items ?? []} showTenant={showTenant && appliedFilter.tenantId == null}
              onView={setSelected} onDownload={handleDownload} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => { if (v != null) { setPageSize(Number(v)); setPage(1); } }}>
                <SelectTrigger data-testid="link-logs-page-size" className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZE_OPTIONS.map((o) => <SelectItem key={o} value={String(o)}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <ServerPagination page={page} pageSize={pageSize} total={data?.total ?? 0} onPageChange={setPage} />
            </div>
          </PageSurface>
        )}
      </div>

      <LinkDetailModal log={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </PageShell>
  );
}
