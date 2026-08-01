'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import {
  getInboundAuditItems,
  approveInboundAuditItem,
  rejectInboundAuditItem,
  bulkInboundAuditAction,
  getInboundAuditItemEML,
  type InboundAuditItem,
} from '@/lib/api/inbound-audit';
import { useApiRequest } from '@/lib/api/client';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { useAuth } from '@/contexts/auth-context';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export function InboundAuditPage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [commentDialog, setCommentDialog] = useState<{ type: 'approve' | 'reject'; ids: number[] } | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['inbound-audit', activeTab],
    queryFn: () => getInboundAuditItems({ status: activeTab, page_size: 50 }, apiRequest),
    enabled: isSystemAdmin,
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(items.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  }, [items]);

  const handleSelect = useCallback((id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  }, [selectedIds]);

  const handleBatchAction = async (type: 'approve' | 'reject') => {
    if (selectedIds.length === 0) {
      toast.error(t('auditQueue.selectAtLeastOne'));
      return;
    }
    setCommentDialog({ type, ids: selectedIds });
  };

  const handleSubmitComment = async () => {
    if (!commentDialog) return;
    setIsSubmitting(true);
    try {
      if (commentDialog.ids.length === 1) {
        if (commentDialog.type === 'approve') {
          await approveInboundAuditItem(commentDialog.ids[0], comment, apiRequest);
        } else {
          await rejectInboundAuditItem(commentDialog.ids[0], comment, apiRequest);
        }
      } else {
        await bulkInboundAuditAction(commentDialog.type, commentDialog.ids, comment, apiRequest);
      }
      toast.success(commentDialog.type === 'approve' ? t('inboundAudit.approve') : t('inboundAudit.reject'));
      queryClient.invalidateQueries({ queryKey: ['inbound-audit'] });
      setSelectedIds([]);
      setCommentDialog(null);
      setComment('');
    } catch (error) {
      toast.error(apiErrorMessage(error, t('common.error')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = useCallback(async (item: InboundAuditItem) => {
    try {
      const blob = await getInboundAuditItemEML(item.id, apiRequest);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inbound_audit_${item.id}.eml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('common.success'));
    } catch (error) {
      toast.error(apiErrorMessage(error, t('common.error')));
    }
  }, [apiRequest, t, apiErrorMessage]);

  const columns: ColumnDef<InboundAuditItem>[] = useMemo(() => [
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
    {
      accessorKey: 'sender',
      header: t('inboundAudit.sender'),
      cell: ({ row }) => <OverflowCell text={row.original.sender || '-'} />,
    },
    {
      accessorKey: 'subject',
      header: t('inboundAudit.subject'),
      cell: ({ row }) => <OverflowCell text={row.original.subject || '-'} />,
    },
    {
      accessorKey: 'rule_name',
      header: t('inboundAudit.rule'),
      cell: ({ row }) => <OverflowCell text={row.original.rule_name || '-'} />,
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
      accessorKey: 'triggered_at',
      header: t('inboundAudit.triggeredAt'),
      cell: ({ row }) => formatDate(row.original.triggered_at || row.original.created_at),
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDownload(row.original)}
            title={t('inboundAudit.preview')}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCommentDialog({ type: 'approve', ids: [row.original.id] })}
            disabled={row.original.status !== 'pending'}
          >
            <Check className="h-4 w-4 text-green-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCommentDialog({ type: 'reject', ids: [row.original.id] })}
            disabled={row.original.status !== 'pending'}
          >
            <X className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ], [t, selectedIds, items, handleDownload, handleSelect, handleSelectAll]);

  if (!isSystemAdmin) {
    return (
      <PageShell>
        <PageHeader title={t('inboundAudit.title')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {t('common.notAuthorized')}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t('inboundAudit.title')}
        actions={activeTab === 'pending' && selectedIds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="default" onClick={() => handleBatchAction('approve')}>
              <Check className="h-4 w-4 mr-2" />
              {t('inboundAudit.bulkApprove')} ({selectedIds.length})
            </Button>
            <Button variant="destructive" onClick={() => handleBatchAction('reject')}>
              <X className="h-4 w-4 mr-2" />
              {t('inboundAudit.bulkReject')} ({selectedIds.length})
            </Button>
          </div>
        ) : null}
      />

      <PageSurface>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab((v ?? 'pending') as typeof activeTab); setSelectedIds([]); }}>
          <TabsList className="rounded-2xl border border-border/70 bg-muted/30 p-1">
            <TabsTrigger value="pending">{t('inboundAudit.pending')}</TabsTrigger>
            <TabsTrigger value="approved">{t('inboundAudit.approved')}</TabsTrigger>
            <TabsTrigger value="rejected">{t('inboundAudit.rejected')}</TabsTrigger>
            <TabsTrigger value="all">{t('inboundAudit.all')}</TabsTrigger>
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

      <Dialog open={!!commentDialog} onOpenChange={(open) => !open && setCommentDialog(null)}>
        <DialogContent className="max-w-md rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>
              {commentDialog?.type === 'approve' ? t('inboundAudit.approve') : t('inboundAudit.reject')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('inboundAudit.comment')}</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('inboundAudit.commentPlaceholder')}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCommentDialog(null)}>{t('common.cancel')}</Button>
              <Button onClick={handleSubmitComment} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
