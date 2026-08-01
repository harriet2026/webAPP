'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { SendHorizonal, Download, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ServerPagination } from '@/components/shared/server-pagination';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  getQuarantineList,
  batchReleaseQuarantine,
  getQuarantinePreview,
  downloadQuarantineEmail,
  type QuarantineItem,
} from '@/lib/api/quarantine';
import { useTenant } from '@/hooks/use-tenant';
import { useApiRequest } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { EmailPreviewDialog } from '@/components/email/email-preview-dialog';
import type { EmailPreviewResponse } from '@/types/email-preview';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export default function QuarantinePage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { effectiveTenantId, isSystemAdmin, isViewingAllTenants } = useTenant();
  const { apiRequest } = useApiRequest();

  const [sender, setSender] = useState('');
  const [subject, setSubject] = useState('');
  const [reason, setReason] = useState('');
  const [releasedFilter, setReleasedFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [releaseDialog, setReleaseDialog] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItemId, setPreviewItemId] = useState<number | null>(null);
  const pageSize = 20;

  const params = useMemo(() => ({
    sender: sender || undefined,
    subject: subject || undefined,
    reason: reason || undefined,
    released: releasedFilter === 'yes' ? true : releasedFilter === 'no' ? false : undefined,
    page,
    limit: pageSize,
  }), [sender, subject, reason, releasedFilter, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['quarantine', params, effectiveTenantId],
    queryFn: () => getQuarantineList(params, apiRequest),
  });

  const items = data?.items ?? [];

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(items.map((item) => item.quarantine_id));
    } else {
      setSelectedIds([]);
    }
  }, [items]);

  const handleSelect = useCallback((id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  }, []);

  const handleBatchRelease = useCallback(async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      // An empty target mailbox means "deliver to the recipients the mail was
      // originally addressed to": the backend falls back to item.Recipients
      // when target_email is omitted. Sending an address here instead
      // redirects the mail to that single mailbox, which for a multi-recipient
      // mail silently drops every co-recipient (GT-12172).
      const target = releaseTarget.trim();
      await batchReleaseQuarantine({
        items: selectedIds.map((qid) => ({ quarantine_id: qid, ...(target ? { target_email: target } : {}) })),
        notes: releaseNotes || undefined,
      }, apiRequest);
      toast.success(t('common.success'));
      queryClient.invalidateQueries({ queryKey: ['quarantine'] });
      setSelectedIds([]);
      setReleaseDialog(false);
      setReleaseTarget('');
      setReleaseNotes('');
    } catch (error) {
      toast.error(apiErrorMessage(error, t('common.error')));
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedIds, releaseTarget, releaseNotes, queryClient, t]);

  const handleSearch = useCallback(() => {
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setSender('');
    setSubject('');
    setReason('');
    setReleasedFilter('');
    setPage(1);
  }, []);

  const handlePreview = useCallback(async (item: QuarantineItem) => {
    setPreviewOpen(true);
    setPreviewData(null);
    setPreviewLoading(true);
    setPreviewItemId(item.id);
    try {
      const data = await getQuarantinePreview(item.quarantine_id, apiRequest);
      setPreviewData(data);
    } catch (error) {
      toast.error(apiErrorMessage(error, t('common.error')));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }, [apiRequest, t]);

  const handleDownloadEml = useCallback(async () => {
    if (!previewItemId) return;
    try {
      const blob = await downloadQuarantineEmail(previewItemId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quarantine_${previewItemId}.eml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('common.error'));
    }
  }, [previewItemId, t]);

  const columns: ColumnDef<QuarantineItem>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={selectedIds.length === items.length && items.length > 0}
          onCheckedChange={handleSelectAll}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.includes(row.original.quarantine_id)}
          onCheckedChange={(checked) => handleSelect(row.original.quarantine_id, !!checked)}
        />
      ),
      size: 40,
    },
    ...(isViewingAllTenants ? [{
      id: 'tenant_name',
      header: t('common.tenant'),
      cell: ({ row }: { row: { original: QuarantineItem } }) => {
        return <OverflowCell text={row.original.tenant_name || String(row.original.tenant_id) || '-'} />;
      },
    } as ColumnDef<QuarantineItem>] : []),
    {
      accessorKey: 'subject',
      header: t('quarantine.subject'),
      cell: ({ row }) => {
        const v = row.original.subject;
        if (!v) return '-';
        return <OverflowCell text={v} />;
      },
    },
    {
      accessorKey: 'sender',
      header: t('quarantine.sender'),
      cell: ({ row }) => <OverflowCell text={row.original.sender || '-'} />,
    },
    {
      accessorKey: 'recipients',
      header: t('quarantine.recipients'),
      cell: ({ row }) => {
        const v = row.original.recipients?.join(', ') || '-';
        return <OverflowCell text={v} />;
      },
    },
    {
      accessorKey: 'reason',
      header: t('quarantine.reason'),
      cell: ({ row }) => <OverflowCell text={row.original.reason || '-'} />,
    },
    {
      accessorKey: 'quarantined_at',
      header: t('quarantine.quarantinedAt'),
      cell: ({ row }) => formatDate(row.original.quarantined_at),
    },
    {
      accessorKey: 'expires_at',
      header: t('quarantine.expiresAt'),
      cell: ({ row }) => formatDate(row.original.expires_at),
    },
    {
      accessorKey: 'released_at',
      header: t('quarantine.released'),
      cell: ({ row }) => (
        <Badge variant={row.original.released_at ? 'default' : 'secondary'}>
          {row.original.released_at ? t('common.yes') : t('common.no')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handlePreview(row.original)}
          title={t('emailPreview.title')}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
      size: 40,
    },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('quarantine.eyebrow')}
        title={t('quarantine.title')}
        description={t('quarantine.subtitle')}
        actions={selectedIds.length > 0 ? (
          <Button onClick={() => setReleaseDialog(true)}>
            <SendHorizonal className="h-4 w-4 mr-2" />
            {t('quarantine.batchRelease')} ({selectedIds.length})
          </Button>
        ) : null}
      />

      <PageFilters>
      <div className="flex flex-wrap gap-4">
        <Input
          placeholder={t('quarantine.sender')}
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          className="w-48"
        />
        <Input
          placeholder={t('quarantine.subject')}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-48"
        />
        <Input
          placeholder={t('quarantine.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-48"
        />
        <Select value={releasedFilter} onValueChange={(v) => setReleasedFilter(v === 'all' ? '' : v ?? '')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('quarantine.released')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="yes">{t('common.yes')}</SelectItem>
            <SelectItem value="no">{t('common.no')}</SelectItem>
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

      <Dialog open={releaseDialog} onOpenChange={(open) => !open && setReleaseDialog(false)}>
        <DialogContent className="max-w-md rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{t('quarantine.batchRelease')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('quarantine.releaseToOptional')}</Label>
              <Input
                value={releaseTarget}
                onChange={(e) => setReleaseTarget(e.target.value)}
                placeholder={t('quarantine.releaseToPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('quarantine.notes')}</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleBatchRelease} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('quarantine.release')}
            </Button>
          </DialogFooter>
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
