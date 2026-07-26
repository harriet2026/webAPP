'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';
import { AccessDeniedPanel, LoadingPanel } from '@/components/shared/state-panel';
import { DkimStatusBadge } from '@/components/dkim/dkim-status-badge';
import { usePermission } from '@/hooks/use-permission';
import { useRouter } from '@/i18n/navigation';
import { listDkimKeys, type DkimKey } from '@/lib/api/dkim';
import { getTenants } from '@/lib/api/tenants';

export default function SystemDkimPage() {
  const t = useTranslations();
  const router = useRouter();
  const { isSystemAdmin } = usePermission();
  const [domainFilter, setDomainFilter] = useState('');

  const { data: keysResp, isLoading } = useQuery({
    queryKey: ['dkim-keys', 'system', domainFilter],
    queryFn: () => listDkimKeys({ domain: domainFilter || undefined, page: 1, page_size: 100 }),
    enabled: isSystemAdmin,
  });

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => getTenants(),
    enabled: isSystemAdmin,
  });

  const tenantNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const tn of tenants ?? []) map[tn.id] = tn.name;
    return map;
  }, [tenants]);

  const columns: ColumnDef<DkimKey>[] = useMemo(
    () => [
      {
        accessorKey: 'tenant_id',
        header: t('dkim.tenant'),
        cell: ({ row }) => tenantNameById[row.original.tenant_id] ?? `#${row.original.tenant_id}`,
      },
      {
        accessorKey: 'domain',
        header: t('tenants.domain'),
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.domain}</span>,
      },
      {
        accessorKey: 'selector',
        header: t('dkim.selector'),
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.selector}</span>,
      },
      {
        accessorKey: 'dns_status',
        header: t('dkim.dnsStatusColumn'),
        cell: ({ row }) => <DkimStatusBadge status={row.original.dns_status} />,
      },
      {
        accessorKey: 'is_active',
        header: t('common.status'),
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="default">{t('dkim.active')}</Badge>
          ) : (
            <Badge variant="secondary">{t('common.disabled')}</Badge>
          ),
      },
      {
        id: 'actions',
        header: t('common.actions'),
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/tenants/${row.original.tenant_id}/domains?dkim=${encodeURIComponent(row.original.domain)}`)}
          >
            <ArrowUpRight className="mr-1 h-4 w-4" />
            {t('dkim.jumpToTenant')}
          </Button>
        ),
      },
    ],
    [t, router, tenantNameById]
  );

  if (!isSystemAdmin) {
    return <AccessDeniedPanel description={t('common.accessDenied')} />;
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('dkim.eyebrow')}
        title={t('dkim.overviewTitle')}
        description={t('dkim.overviewDescription')}
      />

      <PageFilters>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <Input
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            placeholder={t('dkim.filterByDomain')}
            className="max-w-xs"
          />
        </div>
      </PageFilters>

      {isLoading ? (
        <LoadingPanel />
      ) : (
        <PageSurface>
          <DataTable columns={columns} data={keysResp?.items ?? []} />
        </PageSurface>
      )}
    </PageShell>
  );
}
