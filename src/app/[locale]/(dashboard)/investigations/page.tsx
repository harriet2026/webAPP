'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { Bot, Eye, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/data-table';
import { PageFilters } from '@/components/shared/page-filters';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { ServerPagination } from '@/components/shared/server-pagination';
import { InvestigationCreateDialog, InvestigationDetailDialog } from '@/components/investigations/investigation-dialogs';
import { genericAgentTypes } from '@/components/investigations/investigation-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getInvestigations } from '@/lib/api/investigations';
import { useApiRequest } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
import type {
  InvestigationListParams,
  InvestigationRiskLevel,
  InvestigationStatus,
  InvestigationTask,
  InvestigationTargetType,
  InvestigationType,
} from '@/types/investigation';

const PAGE_SIZE = 20;

function riskBadgeVariant(risk: InvestigationRiskLevel) {
  switch (risk) {
    case 'critical':
    case 'high':
      return 'destructive' as const;
    case 'medium':
      return 'default' as const;
    case 'low':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function statusBadgeVariant(status: InvestigationStatus) {
  switch (status) {
    case 'failed':
    case 'cancelled':
      return 'destructive' as const;
    case 'completed':
      return 'default' as const;
    case 'running':
    case 'needs_approval':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
}

function isActiveTask(status: InvestigationStatus) {
  return status === 'pending' || status === 'running';
}

function formatConfidence(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 100)}%`;
}

function formatTargetType(type: InvestigationTargetType, t: ReturnType<typeof useTranslations>) {
  const key = `investigations.targetTypes.${type}`;
  return t.has(key) ? t(key) : type.replaceAll('_', ' ');
}

function summarizeTarget(task: InvestigationTask, t: ReturnType<typeof useTranslations>) {
  const targetIDs = task.target_ids.filter(Boolean);
  switch (task.target_type) {
    case 'mail':
      return targetIDs[0] || '-';
    case 'mail_batch':
      return t('investigations.labels.targetCount', { count: targetIDs.length });
    case 'account':
      return targetIDs[0] || '-';
    case 'cluster':
      return targetIDs.join(', ') || '-';
    default:
      return targetIDs.join(', ') || '-';
  }
}

export default function InvestigationsPage() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const mailLogId = searchParams.get('mail_log_id') || '';
  const queryTaskId = searchParams.get('task_id') || '';
  const ruleCreated = searchParams.get('rule_created') || '';
  const ruleUpdated = searchParams.get('rule_updated') || '';

  const [type, setType] = useState<InvestigationType | ''>('');
  const [status, setStatus] = useState<InvestigationStatus | ''>('');
  const [riskLevel, setRiskLevel] = useState<InvestigationRiskLevel>('');
  const [createdBy, setCreatedBy] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(Boolean(mailLogId));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const effectiveTaskId = queryTaskId || selectedTaskId;
  const effectiveDetailOpen = Boolean(queryTaskId) || detailOpen;

  const updateInvestigationQuery = useCallback((taskId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (taskId) {
      nextParams.set('task_id', taskId);
    } else {
      nextParams.delete('task_id');
    }
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (ruleCreated !== '1') {
      return;
    }
    toast.success(t('investigations.ruleCreatedReturnSuccess'));
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('rule_created');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, ruleCreated, searchParams, t]);

  useEffect(() => {
    if (ruleUpdated !== '1') {
      return;
    }
    toast.success(t('investigations.ruleUpdatedReturnSuccess'));
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('rule_updated');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }, [pathname, router, ruleUpdated, searchParams, t]);

  const openDetail = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setDetailOpen(true);
    updateInvestigationQuery(taskId);
  }, [updateInvestigationQuery]);

  const handleDetailOpenChange = useCallback((open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      updateInvestigationQuery(null);
    }
  }, [updateInvestigationQuery]);

  const params = useMemo<InvestigationListParams>(() => ({
    page,
    limit: PAGE_SIZE,
    type,
    status,
    risk_level: riskLevel,
    created_by: createdBy || undefined,
  }), [createdBy, page, riskLevel, status, type]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['investigations', params],
    queryFn: () => getInvestigations(params, apiRequest),
    refetchInterval: (query) => {
      const items = (query.state.data as { items?: InvestigationTask[] } | undefined)?.items ?? [];
      return items.some((item) => isActiveTask(item.status)) ? 5000 : false;
    },
  });

  const handleReset = useCallback(() => {
    setType('');
    setStatus('');
    setRiskLevel('');
    setCreatedBy('');
    setPage(1);
  }, []);

  const handleCreated = useCallback((taskId: string) => {
    queryClient.invalidateQueries({ queryKey: ['investigations'] });
    openDetail(taskId);
  }, [openDetail, queryClient]);

  const columns: ColumnDef<InvestigationTask>[] = useMemo(() => [
    {
      accessorKey: 'id',
      header: t('investigations.fields.taskId'),
      cell: ({ row }) => (
        <button
          className="font-mono text-left text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => {
            openDetail(row.original.id);
          }}
        >
          {row.original.id}
        </button>
      ),
    },
    {
      accessorKey: 'type',
      header: t('investigations.fields.agentType'),
      cell: ({ row }) => <Badge variant="outline">{t(`investigations.types.${row.original.type}`)}</Badge>,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => <Badge variant={statusBadgeVariant(row.original.status)}>{t(`investigations.statuses.${row.original.status}`)}</Badge>,
    },
    {
      accessorKey: 'risk_level',
      header: t('investigations.fields.riskLevel'),
      cell: ({ row }) => (
        <Badge variant={riskBadgeVariant(row.original.risk_level)}>
          {row.original.risk_level ? t(`investigations.risks.${row.original.risk_level}`) : t('investigations.notAvailable')}
        </Badge>
      ),
    },
    {
      accessorKey: 'target_ids',
      header: t('investigations.fields.targetType'),
      cell: ({ row }) => (
        <div className="space-y-1">
          <Badge variant="outline">{formatTargetType(row.original.target_type, t)}</Badge>
          <div className="font-mono text-xs text-muted-foreground">{summarizeTarget(row.original, t)}</div>
        </div>
      ),
    },
    {
      accessorKey: 'summary',
      header: t('investigations.fields.summary'),
      cell: ({ row }) => (
        <div className="max-w-[26rem]">
          <div className="line-clamp-2 text-sm">{row.original.summary || t('investigations.pendingSummary')}</div>
          {row.original.error_message ? (
            <div className="mt-1 line-clamp-1 text-xs text-destructive">{row.original.error_message}</div>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'confidence',
      header: t('investigations.fields.confidence'),
      cell: ({ row }) => formatConfidence(row.original.confidence),
    },
    {
      accessorKey: 'updated_at',
      header: t('investigations.fields.updatedAt'),
      cell: ({ row }) => formatDate(row.original.updated_at),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          title={t('investigations.viewDetail')}
          onClick={() => {
            openDetail(row.original.id);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [openDetail, t]);

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('investigations.eyebrow')}
        title={t('investigations.title')}
        description={t('investigations.description')}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Bot className="mr-2 h-4 w-4" />
              {t('investigations.createTitle')}
            </Button>
          </div>
        )}
      />

      <PageFilters>
        <div className="flex flex-wrap gap-4">
          <Select value={type || 'all'} onValueChange={(value) => { setType(value === 'all' ? '' : value as InvestigationType); setPage(1); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('investigations.fields.agentType')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {genericAgentTypes.map((item) => (
                <SelectItem key={item.value} value={item.value}>{t(item.labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status || 'all'} onValueChange={(value) => { setStatus(value === 'all' ? '' : value as InvestigationStatus); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('common.status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {['pending', 'running', 'completed', 'failed', 'needs_approval', 'cancelled'].map((item) => (
                <SelectItem key={item} value={item}>{t(`investigations.statuses.${item}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={riskLevel || 'all'} onValueChange={(value) => { setRiskLevel(value === 'all' ? '' : value as InvestigationRiskLevel); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('investigations.fields.riskLevel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {['low', 'medium', 'high', 'critical'].map((item) => (
                <SelectItem key={item} value={item}>{t(`investigations.risks.${item}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={createdBy}
            onChange={(event) => { setCreatedBy(event.target.value); setPage(1); }}
            placeholder={t('investigations.createdByPlaceholder')}
            className="w-52"
          />

          <Button variant="outline" onClick={handleReset}>{t('common.reset')}</Button>
        </div>
      </PageFilters>

      {isLoading ? (
        <PageSurface>
          <div className="flex items-center justify-center py-12 text-muted-foreground">{t('common.loading')}</div>
        </PageSurface>
      ) : (
        <PageSurface className="space-y-4">
          <DataTable columns={columns} data={data?.items ?? []} hidePagination />
          <ServerPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data?.total ?? 0}
            onPageChange={setPage}
          />
        </PageSurface>
      )}

      <InvestigationCreateDialog
        key={mailLogId || 'manual'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialTargetId={mailLogId}
        onCreated={handleCreated}
      />

      <InvestigationDetailDialog
        open={effectiveDetailOpen}
        onOpenChange={handleDetailOpenChange}
        taskId={effectiveTaskId}
      />
    </PageShell>
  );
}
