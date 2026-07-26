'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { RotateCcw, Trash2, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ServerPagination } from '@/components/shared/server-pagination';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getSidelineList,
  reinjectSideline,
  deleteSideline,
  getSidelinePreview,
  downloadSidelineEmail,
  type SidelineItem,
} from '@/lib/api/sideline';
import { useTenant } from '@/hooks/use-tenant';
import { useApiRequest } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { EmailPreviewDialog } from '@/components/email/email-preview-dialog';
import type { EmailPreviewResponse } from '@/types/email-preview';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';

const statusVariantMap: Record<SidelineItem['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  processing: 'default',
  quarantined: 'outline',
  failed: 'destructive',
  reinjected: 'outline',
  released_pending: 'outline',
  manual_hold: 'outline',
};

// Distinct tones for the two states the built-in badge variants don't cover:
// released_pending ~ warning/in-progress (amber), manual_hold ~ awaiting-action (orange).
const statusClassNameMap: Partial<Record<SidelineItem['status'], string>> = {
  released_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  manual_hold: 'bg-orange-100 text-orange-800 border-orange-300',
};

export default function SidelinePage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { effectiveTenantId, isSystemAdmin, isViewingAllTenants } = useTenant();
  const { apiRequest } = useApiRequest();

  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SidelineItem | null>(null);
  const pageSize = 20;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const params = useMemo(() => ({
    sender: sender || undefined,
    subject: subject || undefined,
    status: (statusFilter || undefined) as SidelineItem['status'] | undefined,
    page,
    limit: pageSize,
  }), [sender, subject, statusFilter, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['sideline', params, effectiveTenantId],
    queryFn: () => getSidelineList(params, apiRequest),
  });

  const items = data?.items ?? [];

  const reinjectMutation = useMutation({
    mutationFn: (id: string) => reinjectSideline(id, apiRequest),
    onSuccess: () => {
      toast.success(t('common.success'));
      queryClient.invalidateQueries({ queryKey: ['sideline'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSideline(id, apiRequest),
    onSuccess: () => {
      toast.success(t('common.deleteSuccess'));
      queryClient.invalidateQueries({ queryKey: ['sideline'] });
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    },
  });

  const handleSearch = useCallback(() => {
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setSender('');
    setSubject('');
    setStatusFilter('');
    setPage(1);
  }, []);

  const handlePreview = useCallback(async (item: SidelineItem) => {
    setPreviewOpen(true);
    setPreviewData(null);
    setPreviewLoading(true);
    setPreviewItemId(item.id);
    try {
      const data = await getSidelinePreview(item.id, apiRequest);
      setPreviewData(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setPreviewLoading(false);
    }
  }, [apiRequest, t]);

  const handleDownloadEml = useCallback(async () => {
    if (!previewItemId) return;
    try {
      const blob = await downloadSidelineEmail(previewItemId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sideline_${previewItemId}.eml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('common.error'));
    }
  }, [previewItemId, t]);

  const statusLabel = useCallback((status: SidelineItem['status']) => {
    const camel = status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const key = `sideline.status${camel.charAt(0).toUpperCase()}${camel.slice(1)}` as 'sideline.statusPending' | 'sideline.statusProcessing' | 'sideline.statusQuarantined' | 'sideline.statusFailed' | 'sideline.statusReinjected' | 'sideline.statusReleasedPending' | 'sideline.statusManualHold';
    return t(key);
  }, [t]);

  const columns: ColumnDef<SidelineItem>[] = [
    ...(isViewingAllTenants ? [{
      id: 'tenant_name',
      header: t('common.tenant'),
      cell: ({ row }: { row: { original: SidelineItem } }) => {
        return <OverflowCell text={row.original.tenant_name || String(row.original.tenant_id) || '-'} />;
      },
    } as ColumnDef<SidelineItem>] : []),
    {
      accessorKey: 'subject',
      header: t('sideline.subject'),
      cell: ({ row }) => {
        const v = row.original.subject;
        if (!v) return '-';
        return <OverflowCell text={v} />;
      },
    },
    {
      accessorKey: 'reason',
      header: t('sideline.reason'),
      cell: ({ row }) => <OverflowCell text={row.original.reason || '-'} />,
    },
    {
      accessorKey: 'sender',
      header: t('sideline.sender'),
      cell: ({ row }) => <OverflowCell text={row.original.sender || '-'} />,
    },
    {
      accessorKey: 'status',
      header: t('sideline.status'),
      cell: ({ row }) => (
        <Badge variant={statusVariantMap[row.original.status]} className={statusClassNameMap[row.original.status]}>
          {statusLabel(row.original.status)}
        </Badge>
      ),
    },
    { accessorKey: 'priority', header: t('sideline.priority') },
    {
      accessorKey: 'sidelined_at',
      header: t('sideline.sidelinedAt'),
      cell: ({ row }) => formatDate(row.original.sidelined_at),
    },
    {
      accessorKey: 'retry_count',
      header: t('sideline.retryCount'),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handlePreview(row.original)}
            title={t('emailPreview.title')}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => reinjectMutation.mutate(row.original.id)}
            disabled={row.original.status === 'reinjected' || reinjectMutation.isPending}
            title={t('sideline.reinject')}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteTarget(row.original)}
            disabled={deleteMutation.isPending}
            title={t('sideline.delete')}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('sideline.eyebrow')}
        title={t('sideline.title')}
        description={t('sideline.subtitle')}
      />

      <PageFilters>
      <div className="flex flex-wrap gap-4">
        <Input
          placeholder={t('sideline.sender')}
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          className="w-48"
        />
        <Input
          placeholder={t('sideline.subject')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-48"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v ?? '')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('sideline.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="pending">{t('sideline.statusPending')}</SelectItem>
            <SelectItem value="processing">{t('sideline.statusProcessing')}</SelectItem>
            <SelectItem value="quarantined">{t('sideline.statusQuarantined')}</SelectItem>
            <SelectItem value="failed">{t('sideline.statusFailed')}</SelectItem>
            <SelectItem value="reinjected">{t('sideline.statusReinjected')}</SelectItem>
            <SelectItem value="released_pending">{t('sideline.statusReleasedPending')}</SelectItem>
            <SelectItem value="manual_hold">{t('sideline.statusManualHold')}</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleSearch}>{t('common.search')}</Button>
        <Button variant="outline" onClick={handleReset}>{t('common.reset')}</Button>
      </div>
      </PageFilters>

      {isLoading ? (
        <PageSurface>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </PageSurface>
      ) : (
        <PageSurface className="space-y-4">
          <DataTable columns={columns} data={items} pageSize={pageSize} hidePagination />
          <ServerPagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
          />
        </PageSurface>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('sideline.confirmDelete')}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        variant="destructive"
      />
      <EmailPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        preview={previewData}
        isLoading={previewLoading}
        onDownload={handleDownloadEml}
      />
    </PageShell>
  );
}
