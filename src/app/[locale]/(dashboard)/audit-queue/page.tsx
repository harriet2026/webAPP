'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Check, X, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import {
  getOutboundAuditItems,
  approveOutboundAuditItem,
  rejectOutboundAuditItem,
  batchApproveOutboundAuditItems,
  batchRejectOutboundAuditItems,
  getOutboundAuditPreview,
  downloadOutboundAuditEmail,
  type OutboundAuditItem,
} from '@/lib/api/audit-queue';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { EmailPreviewDialog } from '@/components/email/email-preview-dialog';
import type { EmailPreviewResponse } from '@/types/email-preview';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export default function AuditQueuePage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { effectiveTenantId, isViewingAllTenants } = useTenant();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [notesDialog, setNotesDialog] = useState<{ type: 'approve' | 'reject'; ids: number[] } | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItemId, setPreviewItemId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['outbound-audit', activeTab, effectiveTenantId],
    queryFn: () => getOutboundAuditItems({ status: activeTab, limit: 50 }, apiRequest),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(items.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  const handleBatchAction = async (type: 'approve' | 'reject') => {
    if (selectedIds.length === 0) {
      toast.error(t('auditQueue.selectAtLeastOne'));
      return;
    }
    setNotesDialog({ type, ids: selectedIds });
  };

  const handleSubmitNotes = async () => {
    if (!notesDialog) return;
    setIsSubmitting(true);
    try {
      if (notesDialog.ids.length === 1) {
        if (notesDialog.type === 'approve') {
          await approveOutboundAuditItem(notesDialog.ids[0], notes, apiRequest);
        } else {
          await rejectOutboundAuditItem(notesDialog.ids[0], notes, apiRequest);
        }
      } else {
        if (notesDialog.type === 'approve') {
          await batchApproveOutboundAuditItems(notesDialog.ids, notes, apiRequest);
        } else {
          await batchRejectOutboundAuditItems(notesDialog.ids, notes, apiRequest);
        }
      }
      toast.success(notesDialog.type === 'approve' ? t('auditQueue.approved') : t('auditQueue.rejected'));
      queryClient.invalidateQueries({ queryKey: ['outbound-audit'] });
      setSelectedIds([]);
      setNotesDialog(null);
      setNotes('');
    } catch (error) {
      toast.error(apiErrorMessage(error, t('common.error')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreview = async (item: OutboundAuditItem) => {
    setPreviewOpen(true);
    setPreviewData(null);
    setPreviewLoading(true);
    setPreviewItemId(item.id);
    try {
      const data = await getOutboundAuditPreview(item.id, apiRequest);
      setPreviewData(data);
    } catch (error) {
      toast.error(apiErrorMessage(error, t('common.error')));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadEml = async () => {
    if (!previewItemId) return;
    try {
      const blob = await downloadOutboundAuditEmail(previewItemId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_${previewItemId}.eml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const columns: ColumnDef<OutboundAuditItem>[] = useMemo(() => [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={selectedIds.length === items.length && items.length > 0}
          onCheckedChange={handleSelectAll}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.includes(row.original.id)}
          onCheckedChange={(checked) => handleSelect(row.original.id, !!checked)}
        />
      ),
      size: 40,
    },
    { accessorKey: 'id', header: 'ID', size: 60 },
    ...(isViewingAllTenants ? [{
      id: 'tenant_name',
      header: t('common.tenant'),
      cell: ({ row }: { row: { original: OutboundAuditItem } }) => {
        return <OverflowCell text={row.original.tenant_name || String(row.original.tenant_id) || '-'} />;
      },
    } as ColumnDef<OutboundAuditItem>] : []),
    {
      accessorKey: 'sender',
      header: t('auditQueue.sender'),
      cell: ({ row }) => <OverflowCell text={row.original.sender || '-'} />,
    },
    {
      accessorKey: 'recipients',
      header: t('auditQueue.recipient'),
      cell: ({ row }) => {
        const v = row.original.recipients?.join(', ') || '-';
        return <OverflowCell text={v} />;
      },
    },
    {
      accessorKey: 'subject',
      header: t('auditQueue.subject'),
      cell: ({ row }) => <OverflowCell text={row.original.subject || '-'} />,
    },
    {
      accessorKey: 'reason',
      header: t('auditQueue.reason'),
      cell: ({ row }) => <OverflowCell text={row.original.reason || '-'} />,
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          variant={row.original.status === 'approved' ? 'success' : row.original.status === 'rejected' ? 'error' : 'warning'}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      header: t('auditQueue.createdAt'),
      cell: ({ row }) => formatDate(row.original.created_at),
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
            onClick={() => setNotesDialog({ type: 'approve', ids: [row.original.id] })}
            disabled={row.original.status !== 'pending'}
          >
            <Check className="h-4 w-4 text-green-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNotesDialog({ type: 'reject', ids: [row.original.id] })}
            disabled={row.original.status !== 'pending'}
          >
            <X className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ], [t, selectedIds, items, isViewingAllTenants]);

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('auditQueue.eyebrow')}
        title={t('auditQueue.title')}
        description={t('auditQueue.subtitle')}
        actions={activeTab === 'pending' && selectedIds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="default" onClick={() => handleBatchAction('approve')}>
              <Check className="h-4 w-4 mr-2" />
              {t('auditQueue.batchApprove')} ({selectedIds.length})
            </Button>
            <Button variant="destructive" onClick={() => handleBatchAction('reject')}>
              <X className="h-4 w-4 mr-2" />
              {t('auditQueue.batchReject')} ({selectedIds.length})
            </Button>
          </div>
        ) : null}
      />

      <PageSurface>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab((v ?? 'pending') as 'pending' | 'approved' | 'rejected'); setSelectedIds([]); }}>
        <TabsList className="rounded-2xl border border-border/70 bg-muted/30 p-1">
          <TabsTrigger value="pending">{t('auditQueue.pending')}</TabsTrigger>
          <TabsTrigger value="approved">{t('auditQueue.approved')}</TabsTrigger>
          <TabsTrigger value="rejected">{t('auditQueue.rejected')}</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <DataTable columns={columns} data={items} />
          )}
        </TabsContent>
      </Tabs>
      </PageSurface>

      <Dialog open={!!notesDialog} onOpenChange={(open) => !open && setNotesDialog(null)}>
        <DialogContent className="max-w-md rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>
              {notesDialog?.type === 'approve' ? t('auditQueue.approveTitle') : t('auditQueue.rejectTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('auditQueue.notes')}</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('auditQueue.notesPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesDialog(null)}>{t('common.cancel')}</Button>
              <Button onClick={handleSubmitNotes} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
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
