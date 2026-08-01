'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Search, X, Loader2, ExternalLink, Ban, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listTenants, setTenantStatus } from '@/lib/api/tenants';
import type { Tenant } from '@/types/tenant';
import { formatDate } from '@/lib/utils';

import { displayStatus, type DisplayStatus } from './tenant-status';
import { useImpersonate } from './use-impersonate';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const STATUS_VARIANT: Record<DisplayStatus, 'success' | 'warning' | 'default' | 'error'> = {
  active: 'success',
  pending: 'warning',
  suspended: 'default',
  expired: 'error',
};

const PAGE_SIZE = 20;

interface TenantListProps {
  onEdit: (tenant: Tenant) => void;
}

export function TenantList({ onEdit }: TenantListProps) {
  const t = useTranslations('tenants');
  const apiErrorMessage = useApiErrorMessage();
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const impersonate = useImpersonate();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [confirmImpersonate, setConfirmImpersonate] = useState<Tenant | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<{
    tenant: Tenant;
    next: 'active' | 'suspended';
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', page, status, search],
    queryFn: () =>
      listTenants({
        page,
        pageSize: PAGE_SIZE,
        status: status === 'all' ? undefined : status,
        search: search || undefined,
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: 'active' | 'suspended' }) =>
      setTenantStatus(id, next),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-stats'] });
      toast.success(vars.next === 'suspended' ? t('toast.suspended') : t('toast.activated'));
      setConfirmStatus(null);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const columns: ColumnDef<Tenant>[] = [
    {
      // Combined name + code: name as the title, code as a mono subtitle
      // (spec §6 C "名称(+编码副标题)").
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
      id: 'status',
      header: tc('status'),
      cell: ({ row }) => {
        const ds = displayStatus({
          status: row.original.status,
          expired: row.original.expired,
        });
        return <StatusBadge status={t(`status.${ds}` as const)} variant={STATUS_VARIANT[ds]} />;
      },
    },
    {
      // Granted capabilities as badges (spec §6 C "形态·能力(能力徽标)").
      id: 'capabilities',
      header: t('form.capabilities'),
      cell: ({ row }) => {
        const flags = row.original.capability_flags ?? [];
        if (flags.length === 0) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex max-w-[200px] flex-wrap gap-1">
            {flags.map((id) => (
              <Badge key={id} variant="secondary" className="font-normal">
                {t(`capability.${id}` as const)}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'domain_count',
      header: t('domainCount'),
      size: 90,
      cell: ({ row }) => <span className="tabular-nums">{row.original.domain_count}</span>,
    },
    {
      // Account usage placeholder (spec §6 C / §10: data wiring deferred to a
      // later iteration; the column is shown so the layout is stable).
      id: 'account_usage',
      header: t('accountUsage'),
      size: 90,
      cell: () => <span className="text-xs text-muted-foreground">—</span>,
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
      accessorKey: 'expire_at',
      header: t('form.expireAt'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(row.original.expire_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: tc('actions'),
      cell: ({ row }) => {
        const tenant = row.original;
        const canActivate = tenant.status !== 'active';
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmImpersonate(tenant)}
              title={t('actions.manage')}
              disabled={displayStatus(tenant) !== 'active'}
            >
              <ExternalLink className="h-4 w-4" />
              {t('actions.manage')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(tenant)}
              title={t('actions.edit')}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {canActivate ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmStatus({ tenant, next: 'active' })}
                title={t('actions.activate')}
                className="text-emerald-600 hover:text-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmStatus({ tenant, next: 'suspended' })}
                title={t('actions.suspend')}
                className="text-amber-600 hover:text-amber-700"
              >
                <Ban className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
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
        <div className="ml-auto flex items-center gap-2">
          {/* GT-11839 — spec §6 B: "状态筛选(带数量徽标)". The badge is a
              has-filter indicator (0 or 1), matching the prototype's
              `filterCount={statusFilter !== "all" ? 1 : 0}`, not a result count. */}
          {status !== 'all' && (
            <span
              data-testid="tenant-status-filter-count"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground"
            >
              1
            </span>
          )}
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

      <ConfirmDialog
        open={!!confirmImpersonate}
        onOpenChange={(open) => !open && setConfirmImpersonate(null)}
        title={t('confirm.impersonate')}
        onConfirm={() => {
          if (confirmImpersonate) {
            const id = confirmImpersonate.id;
            setConfirmImpersonate(null);
            impersonate(id);
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmStatus}
        onOpenChange={(open) => !open && setConfirmStatus(null)}
        title={
          confirmStatus
            ? confirmStatus.next === 'suspended'
              ? t('confirm.suspend')
              : t('confirm.activate')
            : ''
        }
        variant={confirmStatus?.next === 'suspended' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (confirmStatus) {
            statusMutation.mutate({ id: confirmStatus.tenant.id, next: confirmStatus.next });
          }
        }}
      />
    </div>
  );
}
