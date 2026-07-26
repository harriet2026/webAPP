'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Loader2, Eye } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { ServerPagination } from '@/components/shared/server-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAuthAttempts, type AuthAttempt } from '@/lib/api/auth-attempts';
import { formatDate } from '@/lib/utils';
import { useTenant } from '@/hooks/use-tenant';
import { useAuth } from '@/contexts/auth-context';
import { listTenants } from '@/lib/api/tenants';
import { useApiRequest } from '@/lib/api/client';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';
import { AuthStatsCards } from '@/components/auth-logs/auth-stats-cards';
import { AuthFilters, type AuthFilterValues } from '@/components/auth-logs/auth-filters';
import { AuthDetailDrawer } from '@/components/auth-logs/auth-detail-drawer';
import { failReasonLabelKey, formatIPLocation, protocolLabelKey, sceneLabelKey } from '@/components/auth-logs/constants';

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function AuthAttemptsPage() {
  const t = useTranslations();
  const { apiRequest } = useApiRequest();
  const { effectiveTenantId, isViewingAllTenants } = useTenant();
  const { isSystemAdmin } = useAuth();

  // GT-12367：平台管理员用页面*内*的「租户范围」下拉筛选认证日志，独立于顶部
  // dev-only 全局租户选择器（生产不存在）。仅平台管理员拉租户清单，租户管理员无此控件。
  const { data: tenantList } = useQuery({
    queryKey: ['auth-attempts-tenant-options'],
    queryFn: () => listTenants({ pageSize: 500 }),
    enabled: isSystemAdmin,
    staleTime: 5 * 60 * 1000,
  });
  const tenantOptions = useMemo(
    () => (isSystemAdmin ? (tenantList?.items ?? []).map((tn) => ({ id: tn.id, name: tn.name })) : undefined),
    [isSystemAdmin, tenantList],
  );

  // Consume the ?result=failed deep-link param (mailflow connection "view logs",
  // spec §3.4): seed the result filter from the URL at mount (in the state
  // initializer, so no setState-in-effect), then strip the param from the URL.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const initialResult = searchParams.get('result');
  const [filters, setFilters] = useState<AuthFilterValues>({
    keyword: '',
    domain: '',
    result: initialResult === 'failed' ? 'false' : initialResult === 'success' ? 'true' : '',
    authProtocol: '',
    scene: '',
    failReason: '',
    tenantId: '',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<AuthAttempt | null>(null);

  const resultParamStripped = useRef(false);
  useEffect(() => {
    if (resultParamStripped.current) return;
    if (!searchParams.get('result')) return;
    resultParamStripped.current = true;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('result');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [searchParams, pathname, router]);
  // Bumped on Reset to remount AuthFilters so its local text drafts clear.
  const [filterKey, setFilterKey] = useState(0);

  const params = useMemo(() => ({
    keyword: filters.keyword || undefined,
    domain: filters.domain || undefined,
    auth_protocol: filters.authProtocol || undefined,
    scene: filters.scene || undefined,
    fail_reason: (filters.result === 'true' ? undefined : filters.failReason) || undefined,
    tenant_id: filters.tenantId ? Number(filters.tenantId) : undefined,
    success: filters.result === 'true' ? true : filters.result === 'false' ? false : undefined,
    page,
    page_size: pageSize,
  }), [filters, page, pageSize]);

  const { data, isLoading } = useQuery({
    queryKey: ['auth-attempts', params, effectiveTenantId],
    queryFn: () => getAuthAttempts(params, apiRequest),
  });

  const handleFilterChange = useCallback((patch: Partial<AuthFilterValues>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if (patch.result === 'true' && prev.failReason) {
        next.failReason = '';
      }
      return next;
    });
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
  }, []);

  // Changing page size must return to page 1, otherwise a stale high page index
  // (e.g. page 5 at size 20) requests an offset past the (now larger-page) total
  // and the table renders empty while pagination still reads "page 5".
  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setFilters({
      keyword: '',
      domain: '',
      result: '',
      authProtocol: '',
      scene: '',
      failReason: '',
      tenantId: '',
    });
    setPage(1);
    setFilterKey((k) => k + 1);
  }, []);

  const columns: ColumnDef<AuthAttempt>[] = [
    {
      accessorKey: 'attempted_at',
      header: t('logs.timestamp'),
      cell: ({ row }) => formatDate(row.original.attempted_at),
    },
    ...(isViewingAllTenants ? [{
      id: 'tenant_name',
      header: t('common.tenant'),
      cell: ({ row }: { row: { original: AuthAttempt } }) => (
        <span>{row.original.tenant_name || row.original.tenant_id || '-'}</span>
      ),
    } as ColumnDef<AuthAttempt>] : []),
    { accessorKey: 'username', header: t('authAttempts.username') },
    {
      accessorKey: 'auth_protocol',
      header: t('authAttempts.protocol'),
      cell: ({ row }) => {
        const code = row.original.auth_protocol;
        if (!code) return <span className="text-muted-foreground">—</span>;
        const key = protocolLabelKey(code);
        // GT-12435: html_spec 原型(logs-auth-logs)§2.4 协议/结果徽章为 rounded
        // (0.25rem 偏方)，共享 Badge 基类是 rounded-4xl(胶囊)，此处覆盖为 rounded
        // 对齐原型(tailwind-merge 同组后者胜)。
        return <Badge variant="outline" className="rounded font-normal">{key ? t(key) : code}</Badge>;
      },
    },
    {
      accessorKey: 'scene',
      header: t('authAttempts.scene'),
      cell: ({ row }) => {
        const code = row.original.scene;
        if (!code) return <span className="text-muted-foreground">—</span>;
        const key = sceneLabelKey(code);
        return <span>{key ? t(key) : code}</span>;
      },
    },
    {
      accessorKey: 'domain',
      header: t('authAttempts.domain'),
      cell: ({ row }) => <span>{row.original.domain || '—'}</span>,
    },
    {
      id: 'server',
      header: t('authAttempts.server'),
      cell: ({ row }) => {
        const host = row.original.server_host;
        const port = row.original.server_port;
        if (!host) return <span className="text-muted-foreground">—</span>;
        return <span className="font-mono text-xs">{host}{port ? `:${port}` : ''}</span>;
      },
    },
    {
      accessorKey: 'client_ip',
      header: t('authAttempts.sourceIp'),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs">{row.original.client_ip}</span>
          {formatIPLocation(row.original.ip_location, t) ? (
            <span className="text-xs text-muted-foreground">{formatIPLocation(row.original.ip_location, t)}</span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'success',
      header: t('authAttempts.result'),
      // GT-12434: html_spec 原型(logs-auth-logs)的「成功」徽标为绿色
      // (bg-green-100 text-green-800)。此前用 variant="default"(主题蓝填充),
      // 与「绿色=正常放行」的语义色不符。改为绿/红语义徽标,与管理员操作日志
      // 列表的成功/失败徽标(emerald/red 设计 token)保持一致。
      cell: ({ row }) =>
        row.original.success ? (
          <Badge variant="outline" className="rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
            {t('authAttempts.success')}
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded bg-red-50 text-red-700 ring-1 ring-red-200">
            {t('authAttempts.failed')}
          </Badge>
        ),
    },
    {
      id: 'fail_reason',
      header: t('authAttempts.failureReason'),
      cell: ({ row }) => {
        if (row.original.success) return <span className="text-muted-foreground">—</span>;
        const key = failReasonLabelKey(row.original.fail_reason_code);
        if (key) return <span>{t(key)}</span>;
        return <span>{row.original.failure_reason || '—'}</span>;
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">{t('common.actions')}</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto gap-1 p-1 text-primary hover:text-primary"
            onClick={() => setSelected(row.original)}
            data-testid={`auth-attempt-view-${row.original.id}`}
          >
            <Eye className="h-4 w-4" />
            {t('authAttempts.viewDetails')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell data-testid="auth-attempts-page">
      <PageHeader
        eyebrow={t('authAttempts.eyebrow')}
        title={t('authAttempts.title')}
        description={t('authAttempts.subtitle')}
      />

      <AuthStatsCards />

      <PageFilters>
        <AuthFilters
          key={filterKey}
          values={filters}
          onChange={handleFilterChange}
          onSearch={handleSearch}
          onReset={handleReset}
          tenantOptions={tenantOptions}
        />
      </PageFilters>

      {isLoading ? (
        <PageSurface>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </PageSurface>
      ) : (
        <PageSurface className="space-y-4">
          <div className="text-sm text-muted-foreground" data-testid="auth-attempts-total">
            {t('authAttempts.totalRecords', { count: data?.total ?? 0 })}
          </div>
          <div data-testid="auth-attempts-table">
            <DataTable
              columns={columns}
              data={data?.items ?? []}
              pageSize={pageSize}
              hidePagination
              noDataText={t('authAttempts.empty')}
              rowClassName={(row) => (row.success ? '' : 'bg-rose-50 dark:bg-rose-950/20')}
              rowTestId={(row) => `auth-attempt-row-${row.id}`}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SelectPlaceholder
              value={pageSize}
              onChange={handlePageSizeChange}
              options={PAGE_SIZE_OPTIONS}
            />
            <ServerPagination
              page={page}
              pageSize={pageSize}
              total={data?.total ?? 0}
              onPageChange={setPage}
            />
          </div>
        </PageSurface>
      )}

      <AuthDetailDrawer
        attempt={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </PageShell>
  );
}

function SelectPlaceholder({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (v: number) => void;
  options: number[];
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => v != null && onChange(Number(v))}>
      <SelectTrigger className="h-8 w-[92px]" data-testid="auth-attempts-page-size">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((size) => (
          <SelectItem key={size} value={String(size)}>{size}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
