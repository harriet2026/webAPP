'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Search, X, Loader2, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { routingOverview } from '@/lib/api/tenant-routing';
import { getTenant } from '@/lib/api/tenants';
import type { Tenant } from '@/types/tenant';
import {
  progressCount,
  type RoutingProgress,
} from '@/components/tenants/routing/progress';

import { RoutingDetail } from './routing-detail';

const PAGE_SIZE = 20;

const PROGRESS_KEYS = ['receiving', 'relay', 'outbound', 'auth'] as const;

export function RoutingTab() {
  const t = useTranslations('tenants');
  const tc = useTranslations('common');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Tenant | null>(null);

  // GT-12437：?tenant_id= 深链直达指定租户的路由详情（认证日志「命中配置」
  // 跳转带上归属租户；MailRoutingShell 自己读 ?tab=auth&config= 选中子页签
  // 与高亮行）。仅首载生效，之后由页内状态接管。
  const deepLinkTenantID = useSearchParams().get('tenant_id');
  useEffect(() => {
    const id = Number(deepLinkTenantID);
    if (!deepLinkTenantID || !Number.isInteger(id) || id <= 0) return;
    let cancelled = false;
    getTenant(id)
      .then((t) => { if (!cancelled) setSelected(t); })
      .catch(() => { /* 租户不存在/无权限 → 停留在路由总览列表 */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTenantID]);

  // GT-12330: the drill-down scopes to the target tenant page-locally. It does
  // NOT touch the global selected tenant — RoutingDetail + MailRoutingShell now
  // inject X-Tenant-ID from the explicit tenant id via useScopedApiRequest. The
  // old global setSelectedTenant collided with the platform-view reconciliation
  // (GT-12245: system_admin + viewer=platform clears any selected tenant), which
  // wiped the header immediately and made every tenant-scoped route 400.
  const openDrilldown = (tenant: Tenant) => {
    setSelected(tenant);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['routing-overview', page, status, search],
    queryFn: () =>
      routingOverview({
        page,
        pageSize: PAGE_SIZE,
        status: status === 'all' ? undefined : status,
        search: search || undefined,
      }),
  });

  if (selected) {
    return (
      <RoutingDetail
        tenant={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  const columns: ColumnDef<Tenant>[] = [
    {
      accessorKey: 'name',
      header: t('tenantName'),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.original.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{row.original.code}</div>
        </div>
      ),
    },
    {
      // GT-11952 / Spec 2B §F7: the overview table shows the domain list, not a
      // count, so an operator can see each tenant's routing scope without
      // drilling into every row. `domains` is populated by the routing-overview
      // endpoint only; fall back to the count if it is somehow absent.
      id: 'domains',
      header: t('domains'),
      cell: ({ row }) => {
        const domains = row.original.domains;
        if (!domains || domains.length === 0) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <span
            data-testid="tenant-domains"
            className="block max-w-[280px] truncate text-xs"
            title={domains.join('、')}
          >
            {domains.join('、')}
          </span>
        );
      },
    },
    {
      id: 'progress',
      header: t('routing.progress'),
      cell: ({ row }) => {
        const rp = row.original.routing_progress;
        const done = progressCount(rp);
        return (
          <div className="flex items-center gap-3">
            <ProgressDots rp={rp} labels={PROGRESS_KEYS.map((k) => t(`routing.tabs.${k}`))} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('routing.progressHint', { done, total: 4 })}
            </span>
          </div>
        );
      },
    },
    {
      id: 'access_status',
      header: t('access.label'),
      cell: ({ row }) => {
        const a = row.original.access_status;
        return (
          <StatusBadge
            status={t(`access.${a}` as const)}
            variant={a === 'configured' ? 'success' : 'warning'}
          />
        );
      },
    },
    {
      id: 'actions',
      header: t('routing.actions.configure'),
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => openDrilldown(row.original)}
          >
            {t('routing.actions.configure')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('tenantName')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                setSearch(searchInput);
              }
            }}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setPage(1);
            setSearch(searchInput);
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSearchInput('');
            setSearch('');
            setStatus('all');
            setPage(1);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="ml-auto">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v ?? 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc('status')}</SelectItem>
              <SelectItem value="pending">{t('status.pending')}</SelectItem>
              <SelectItem value="active">{t('status.active')}</SelectItem>
              <SelectItem value="suspended">{t('status.suspended')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          pageCount={totalPages}
          pageIndex={page - 1}
          onPageChange={(i) => setPage(i + 1)}
        />
      )}
    </div>
  );
}

interface ProgressDotsProps {
  rp: RoutingProgress;
  labels: string[];
}

function ProgressDots({ rp, labels }: ProgressDotsProps) {
  const entries = PROGRESS_KEYS.map((k) => rp[k] as boolean);
  return (
    <div className="flex items-center gap-1.5">
      {entries.map((done, i) => (
        <Tooltip key={PROGRESS_KEYS[i]}>
          <TooltipTrigger
            render={
              <span
                className={
                  'inline-block h-2.5 w-2.5 rounded-full ' +
                  (done
                    ? 'bg-emerald-500'
                    : 'bg-muted-foreground/25')
                }
              />
            }
          />
          <TooltipContent>
            <span className="font-medium">{labels[i]}</span>
            <span className="ml-1 text-muted-foreground">
              {done ? '✓' : '—'}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
