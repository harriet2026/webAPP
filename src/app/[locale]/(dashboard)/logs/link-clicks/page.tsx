'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';
import { ServerPagination } from '@/components/shared/server-pagination';
import { useScopedApiRequest } from '@/lib/api/client';
import { useProductForm } from '@/contexts/product-form-context';
import { listTenants } from '@/lib/api/tenants';
import { getLinkClicks, downloadLinkClick, type LinkClickLog } from '@/lib/api/link-clicks';
import { LinkFilters, type LinkFilterValues } from '@/components/link-logs/link-filters';
import { LinkTable } from '@/components/link-logs/link-table';
import { LinkDetailModal } from '@/components/link-logs/link-detail-modal';

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

export default function LinkClicksPage() {
  const t = useTranslations();
  const { capabilities, viewer } = useProductForm();

  // Tenant-scope dropdown only for cloud (saas) + platform viewer (spec §4.1).
  const showTenant = !!capabilities?.saas && viewer === 'platform';
  const [scopeTenant, setScopeTenant] = useState<number | null>(null);
  // Page-local X-Tenant-ID for the (read-only, all-tenant) log view:
  // cloud+platform → dropdown selection (null=all); otherwise null (AI-multi
  // platform sees all; tenant_admin forced by backend).
  const effectiveScope = showTenant ? scopeTenant : null;
  const { apiRequest } = useScopedApiRequest(effectiveScope);

  // Tenant dropdown options: fetched from the global tenants API (system_admin
  // sees all tenants). Only used when showTenant is true.
  const { data: tenantsData } = useQuery({
    queryKey: ['link-clicks-tenant-options'],
    queryFn: () => listTenants({ pageSize: 200 }),
    enabled: showTenant,
  });

  const [filters, setFilters] = useState<LinkFilterValues>(EMPTY_FILTERS);
  const [filterKey, setFilterKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<LinkClickLog | null>(null);

  const params = useMemo(() => ({
    message_id: filters.messageId || undefined,
    clicker: filters.clicker || undefined,
    sender: filters.sender || undefined,
    src_url: filters.srcUrl || undefined,
    trigger_stage: filters.triggerStage || undefined,
    final_result: filters.finalResult || undefined,
    user_action: filters.userAction || undefined,
    click_source: filters.clickSource || undefined,
    ...dayRange(filters.clickDate),
    page,
    page_size: pageSize,
  }), [filters, page, pageSize]);

  const { data, isLoading } = useQuery({
    queryKey: ['link-clicks', params, effectiveScope],
    queryFn: () => getLinkClicks(params, apiRequest),
  });

  const handleFilterChange = useCallback((patch: Partial<LinkFilterValues>) => setFilters((f) => ({ ...f, ...patch })), []);
  const handleSearch = useCallback(() => setPage(1), []);
  const handleReset = useCallback(() => { setFilters(EMPTY_FILTERS); setPage(1); setFilterKey((k) => k + 1); }, []);
  const handleDownload = useCallback(async (log: LinkClickLog) => {
    try {
      await downloadLinkClick(log.id, log.log_id ?? String(log.id), apiRequest);
    } catch (e) {
      toast.error(t('linkLogs.downloadFailed', { error: e instanceof Error ? e.message : String(e) }));
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
    <Select items={tenantItems} value={scopeTenant == null ? 'all' : String(scopeTenant)} onValueChange={(v) => { setScopeTenant(v === 'all' || v == null ? null : Number(v)); setPage(1); }}>
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
    <PageShell className="min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]">
      <PageHeader icon={Link2} title={t('linkLogs.title')} description={t('linkLogs.subtitle')} />
      <div className="space-y-6" data-testid="link-logs-page">
        <PageFilters>
          <LinkFilters key={filterKey} values={filters} onChange={handleFilterChange}
            onSearch={handleSearch} onReset={handleReset} tenantScope={tenantDropdown} />
        </PageFilters>
        {isLoading ? (
          <PageSurface><div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div></PageSurface>
        ) : (
          <PageSurface className="space-y-4">
            <div className="text-sm text-muted-foreground" data-testid="link-logs-total">{t('linkLogs.total', { count: data?.total ?? 0 })}</div>
            <LinkTable logs={data?.items ?? []} showTenant={showTenant && scopeTenant == null}
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
