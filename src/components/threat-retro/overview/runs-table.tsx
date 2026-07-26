'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate } from '@/lib/utils';
import { useApiRequest } from '@/lib/api/client';
import { getRunDetail, recallLeakMails, markFalsePositive, cancelRun, bulkCancelRuns, exportRuns } from '@/lib/api/threat-retro';
import {
  confidenceClass,
  dispositionBadgeClass,
  recallBadgeClass,
} from '../badge-styles';
import type { RecallPolicy, ThreatRetroLeakMail, ThreatRetroRun } from '@/types/threat-retro';
import { isRunDegraded } from '@/lib/threat-retro/degraded';
import { EmlSheet } from './eml-sheet';
import { AffectedUsersDialog } from './affected-users-dialog';
import { RecallDialog } from './recall-dialog';
import { FalsePositiveDialog } from './false-positive-dialog';

interface RowSelection {
  runId: string;
  mailLogId: number;
}

const runColumnClass: Record<string, string> = {
  'select-run': 'w-8',
  expand: 'w-8',
  run_id: 'w-[140px]',
  trigger_type: 'w-[110px]',
  window: 'w-[150px]',
  mode: 'w-16',
  agent_rounds: 'w-[60px]',
  confidence: 'w-[70px]',
  disposition_summary: 'w-[90px]',
  recall_status: 'w-[90px]',
  affected_users: 'w-[60px]',
  basis_summary: 'w-[120px]',
  actions: 'w-32',
};

interface RunsTableProps {
  data: ThreatRetroRun[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  isAdmin: boolean;
  selected: RowSelection[];
  onSelectedChange: (next: RowSelection[]) => void;
  onBatchRecall: () => void;
  batchPending?: boolean;
  onMutated: () => void;
}

function ExpandedRunDetail({
  runId,
  isTest,
  isAdmin,
  selected,
  onSelectedChange,
  onShowEml,
  onRecall,
  onMarkFp,
  onShowAffected,
}: {
  runId: string;
  isTest: boolean;
  isAdmin: boolean;
  selected: RowSelection[];
  onSelectedChange: (next: RowSelection[]) => void;
  onShowEml: (leak: ThreatRetroLeakMail) => void;
  onRecall: (leaks: ThreatRetroLeakMail[], policies: { unread_policy: RecallPolicy; read_policy: RecallPolicy }) => void;
  onMarkFp: (leak: ThreatRetroLeakMail) => void;
  onShowAffected: (leak: ThreatRetroLeakMail) => void;
}) {
  const t = useTranslations('threatRetro');
  const { apiRequest } = useApiRequest();
  const { data, isLoading } = useQuery({
    queryKey: ['tr-run-detail', runId],
    queryFn: () => getRunDetail(runId, apiRequest),
  });

  const leaks = data?.leak_mails ?? [];
  const allChecked =
    leaks.length > 0 &&
    leaks.every((l) => selected.some((s) => s.runId === runId && s.mailLogId === l.mail_log_id));

  const toggleOne = (l: ThreatRetroLeakMail, checked: boolean) => {
	if (isTest) return;
    const cur = selected.filter((s) => !(s.runId === runId && s.mailLogId === l.mail_log_id));
    onSelectedChange(checked ? [...cur, { runId, mailLogId: l.mail_log_id }] : cur);
  };
  const toggleAll = (checked: boolean) => {
	if (isTest) return;
    const without = selected.filter((s) => s.runId !== runId);
    onSelectedChange(
      checked
        ? [...without, ...leaks.map((l) => ({ runId, mailLogId: l.mail_log_id }))]
        : without,
    );
  };

  return (
    <div className="bg-muted/20 px-4 py-3">
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">{t('leakDetail.title')}</h4>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> {t('leakDetail.loading')}
        </div>
      ) : leaks.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('leakDetail.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/60 bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allChecked}
                    disabled={isTest}
                    onCheckedChange={(v) => toggleAll(Boolean(v))}
                  />
                </TableHead>
                <TableHead>{t('leakDetail.sender')}</TableHead>
                <TableHead>{t('leakDetail.subject')}</TableHead>
                <TableHead className="w-24">{t('leakDetail.threatType')}</TableHead>
                <TableHead className="w-24">{t('leakDetail.disposition')}</TableHead>
                <TableHead className="w-24">{t('leakDetail.recheckConfidence')}</TableHead>
                <TableHead className="w-24">{t('leakDetail.recallStatus')}</TableHead>
                <TableHead className="w-56 text-right">{t('leakDetail.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaks.map((l) => {
				const checked = !isTest && selected.some(
                  (s) => s.runId === runId && s.mailLogId === l.mail_log_id,
                );
				return (
				  <Fragment key={`${runId}-${l.mail_log_id}`}>
				  <TableRow>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        disabled={isTest}
                        onCheckedChange={(v) => toggleOne(l, Boolean(v))}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      <OverflowCell text={l.sender} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <OverflowCell text={l.subject} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {['phishing', 'malware', 'impersonation', 'unknown'].includes(l.threat_type)
                          ? t(`eml.threatType.${l.threat_type}`)
                          : l.threat_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={dispositionBadgeClass(l.disposition)}>
                        {t(`leakDetail.dispositionValue.${l.disposition}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={confidenceClass(Math.round((l.recheck_confidence ?? 0) * 100))}>
                        {Math.round((l.recheck_confidence ?? 0) * 100)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={recallBadgeClass(l.recall_status)}>
                        {t(`recallStatus.${l.recall_status || 'no_need'}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => onShowAffected(l)}>
                          {t('table.affectedUsers')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onShowEml(l)}>
                          {t('table.viewEml')}
                        </Button>
                        {isAdmin ? (
                          <>
                            {!isTest ? (
                              <Button data-testid={`recall-${runId}-${l.mail_log_id}`} variant="outline" size="sm" onClick={() => onRecall([l], data?.recall_policy ?? { unread_policy: 'recall', read_policy: 'notify' })}>
                                {t('table.recall')}
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="sm" onClick={() => onMarkFp(l)}>
                              {t('table.falsePositive')}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
				  </TableRow>
				  <TableRow className="bg-muted/20 hover:bg-muted/20">
					<TableCell />
					<TableCell colSpan={7} className="py-2">
					  <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
						<div><dt className="inline font-medium text-foreground">{t('leakDetail.mailId')}: </dt><dd className="inline font-mono">{l.mail_log_id}</dd></div>
						<div><dt className="inline font-medium text-foreground">{t('leakDetail.originalDisposition')}: </dt><dd className="inline">{l.orig_disposition || '—'}</dd></div>
						<div className="md:col-span-2"><dt className="inline font-medium text-foreground">{t('leakDetail.rationale')}: </dt><dd className="inline">{l.rationale || '—'}</dd></div>
						<div className="md:col-span-2 xl:col-span-4"><dt className="inline font-medium text-foreground">{t('leakDetail.releasedRecipients')}: </dt><dd className="inline break-all">{l.released_recipients?.join(', ') || '—'}</dd></div>
					  </dl>
					</TableCell>
				  </TableRow>
				  </Fragment>
				);
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function RunsTable({
  data,
  total,
  page,
  pageSize,
  onPageChange,
  isLoading,
  isAdmin,
  selected,
  onSelectedChange,
  onBatchRecall,
  batchPending,
  onMutated,
}: RunsTableProps) {
  const t = useTranslations('threatRetro');
  const { apiRequest } = useApiRequest();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [emlLeak, setEmlLeak] = useState<ThreatRetroLeakMail | null>(null);
  const [affectedLeak, setAffectedLeak] = useState<ThreatRetroLeakMail | null>(null);
	const [affectedRunId, setAffectedRunId] = useState<string | null>(null);
  const [recallCtx, setRecallCtx] = useState<{ runId: string; leaks: ThreatRetroLeakMail[]; policies: { unread_policy: RecallPolicy; read_policy: RecallPolicy } } | null>(null);
  const [fpCtx, setFpCtx] = useState<{ runId: string; leak: ThreatRetroLeakMail; isTest: boolean } | null>(null);
  const [cancelRunId, setCancelRunId] = useState<string | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);

  const exportMutation = useMutation({
    mutationFn: () => exportRuns(selectedRunIds, apiRequest),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'threat-retro-runs.csv';
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.exportError')),
  });
  const bulkCancelMutation = useMutation({
    mutationFn: () => bulkCancelRuns(selectedRunIds, apiRequest),
    onSuccess: (result) => {
      toast.success(t('toast.bulkCancelResult', { requested: result.requested, cancelled: result.cancelled, skipped: result.skipped, failed: result.failed }));
      setSelectedRunIds([]);
      setBulkCancelOpen(false);
      onMutated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.cancelError')),
  });

  const cancelMutation = useMutation({
    mutationFn: (runId: string) => cancelRun(runId, apiRequest),
    onSuccess: () => {
      toast.success(t('toast.cancelSuccess'));
      setCancelRunId(null);
      onMutated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.cancelError')),
  });

  const recallMutation = useMutation({
    mutationFn: ({ runId, leaks }: {
      runId: string;
      leaks: ThreatRetroLeakMail[];
    }) =>
      recallLeakMails(
        runId,
        { mail_log_ids: leaks.map((l) => l.mail_log_id) },
        apiRequest,
      ),
    onSuccess: () => {
      toast.success(t('toast.recallSuccess'));
      setRecallCtx(null);
      onMutated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.recallError')),
  });

  const fpMutation = useMutation({
    mutationFn: ({ runId, leak, reason, addWhitelist }: { runId: string; leak: ThreatRetroLeakMail; reason: string; addWhitelist: boolean }) =>
      markFalsePositive(
        runId,
        { mail_log_id: leak.mail_log_id, reason, add_whitelist: addWhitelist },
        apiRequest,
      ),
    onSuccess: () => {
      toast.success(t('toast.fpMarked'));
      setFpCtx(null);
      onMutated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.recallError')),
  });

  const columns = useMemo<ColumnDef<ThreatRetroRun>[]>(
    () => [
      {
        id: 'select-run',
        header: () => (
          <Checkbox
            checked={data.length > 0 && data.every((run) => selectedRunIds.includes(run.run_id))}
            onCheckedChange={(checked) => setSelectedRunIds(checked ? data.map((run) => run.run_id) : [])}
            aria-label={t('table.selectRuns')}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedRunIds.includes(row.original.run_id)}
            onCheckedChange={(checked) => setSelectedRunIds((current) => checked ? [...new Set([...current, row.original.run_id])] : current.filter((id) => id !== row.original.run_id))}
            aria-label={row.original.run_id}
          />
        ),
      },
      {
        id: 'expand',
        header: '',
        cell: ({ row }) => {
          const isOpen = !!expanded[row.original.run_id];
          return (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((prev) => ({ ...prev, [row.original.run_id]: !isOpen }))}
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          );
        },
      },
      {
        accessorKey: 'run_id',
        header: t('table.runId'),
        cell: ({ row }) => (
          <div className="min-w-0 space-y-0.5 overflow-hidden">
            <div className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.original.created_at)}</div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className="min-w-0 truncate font-mono text-xs"
                title={row.original.run_id}
              >
                {row.original.run_id}
              </span>
              {row.original.is_test ? <Badge variant="outline" className="shrink-0">{t('table.testRun')}</Badge> : null}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'trigger_type',
        header: t('table.triggerType'),
        cell: ({ row }) => (
          <div>
            <div className="max-w-40 truncate text-sm font-medium">{row.original.strategy_name || '—'}</div>
            <Badge variant="outline">{t(`triggerType.${row.original.trigger_type}`)}</Badge>
          </div>
        ),
      },
      {
        id: 'window',
        header: t('table.window'),
        cell: ({ row }) => (
          <div className="whitespace-nowrap text-xs leading-5 text-muted-foreground">
            <div>{formatDate(row.original.window_start)}</div>
            <div>→ {formatDate(row.original.window_end)}</div>
          </div>
        ),
      },
      {
        id: 'mode',
        header: t('table.mode'),
        cell: () => (
          <Badge
            variant="outline"
            className="border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-950/40"
          >
            {t('modeBadge.async')}
          </Badge>
        ),
      },
      {
        accessorKey: 'agent_rounds',
        header: t('table.agentRounds'),
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">{row.original.agent_rounds ?? 0}</span>
        ),
      },
      {
        accessorKey: 'confidence',
        header: t('table.confidence'),
        cell: ({ row }) => (
          <span className={row.original.confidence == null ? 'text-muted-foreground' : confidenceClass(Math.round(row.original.confidence * 100))}>
            {row.original.confidence == null ? '—' : `${Math.round(row.original.confidence * 100)}%`}
          </span>
        ),
      },
      {
        accessorKey: 'disposition_summary',
        header: t('table.disposition'),
		cell: ({ row }) => {
		  const disposition = row.original.disposition_summary || 'no_need';
		  const key = row.original.is_test && disposition !== 'no_need' && disposition !== 'false_positive'
			? `proposed_${disposition}`
			: disposition;
		  return <Badge variant="outline">{t(`table.dispositionValue.${key}`)}</Badge>;
		},
      },
      {
        accessorKey: 'recall_status',
        header: t('table.recallStatus'),
        cell: ({ row }) => (
          <Badge className={recallBadgeClass(row.original.recall_status)}>
            {t(`recallStatus.${row.original.recall_status || 'no_need'}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'affected_users',
        header: t('table.affectedUsers'),
        cell: ({ row }) => (
          <button
            type="button"
            className="tabular-nums text-sm text-primary hover:underline"
			onClick={() => setAffectedRunId(row.original.run_id)}
          >
            {row.original.affected_users ?? 0}
          </button>
        ),
      },
      {
        accessorKey: 'basis_summary',
        header: t('table.basis'),
        cell: ({ row }) => <OverflowCell text={row.original.basis_summary ? `${row.original.basis_summary}${row.original.basis_count > 1 ? ` +${row.original.basis_count - 1}` : ''}` : '—'} />,
      },
      {
        id: 'actions',
        header: t('table.actions'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            {row.original.circuit_breaker_tripped ? (
              <Badge
                variant="outline"
                className="border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/40"
              >
                {t('circuitBreaker')}
              </Badge>
            ) : null}
            {isRunDegraded(row.original) ? (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/40"
                title={row.original.error_message || t('degraded')}
              >
                {t('degraded')}
              </Badge>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => setExpanded((p) => ({ ...p, [row.original.run_id]: true }))}
            >
              {t('table.viewLeaks')}
            </Button>
            {isAdmin && (row.original.status === 'running' || row.original.status === 'pending') ? (
              // Cancel an in-progress run (spec §8 / §3.1.1: cancels all
              // sub-tasks). cancelRun was wired in the API client but had no UI
              // entry point (review P2-8).
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelRunId(row.original.run_id)}
              >
                {t('table.cancel')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [data, expanded, isAdmin, selectedRunIds, t],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
	<div>
	  <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
        {selectedRunIds.length > 0 ? (
          <div className="mr-auto flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <strong>{t('table.selectedRuns', { count: selectedRunIds.length })}</strong>
            <Button size="sm" variant="outline" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>{t('table.batchExport')}</Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkCancelOpen(true)}>{t('table.batchCancel')}</Button>
          </div>
        ) : null}
        {selected.length > 0 ? (
          <Button
            size="sm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onBatchRecall}
            disabled={!isAdmin || batchPending}
            data-testid="batch-recall-btn"
          >
            {batchPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            {t('table.batchRecall', { count: selected.length })}
          </Button>
        ) : null}
      </div>

	  <div className="overflow-x-auto">
        <Table className="min-w-[1246px] table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={`bg-muted/20 ${runColumnClass[header.column.id] ?? ''}`}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24">
                  <EmptyState title={t('table.empty')} />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isOpen = !!expanded[row.original.run_id];
                return (
                  <Fragment key={row.id}>
                    <TableRow data-testid={`run-row-${row.original.run_id}`}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={runColumnClass[cell.column.id] ?? ''}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {isOpen ? (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="p-0">
                          <ExpandedRunDetail
                            runId={row.original.run_id}
                            isTest={row.original.is_test}
                            isAdmin={isAdmin}
                            selected={selected}
                            onSelectedChange={onSelectedChange}
                            onShowEml={setEmlLeak}
                            onRecall={(leaks, policies) => setRecallCtx({ runId: row.original.run_id, leaks, policies })}
                            onMarkFp={(leak) => setFpCtx({ runId: row.original.run_id, leak, isTest: row.original.is_test })}
                            onShowAffected={setAffectedLeak}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            {t('table.prev')}
          </Button>
          <span>
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            {t('table.next')}
          </Button>
        </div>
      ) : null}

      <EmlSheet open={!!emlLeak} onOpenChange={(o) => !o && setEmlLeak(null)} leak={emlLeak} />
      <AffectedUsersDialog
		open={!!affectedLeak || !!affectedRunId}
		onOpenChange={(o) => {
		  if (!o) {
			setAffectedLeak(null);
			setAffectedRunId(null);
		  }
		}}
        leak={affectedLeak}
		runId={affectedRunId}
      />
      <RecallDialog
        open={!!recallCtx && recallCtx.leaks.length > 0}
        onOpenChange={(o) => !o && setRecallCtx(null)}
        leaks={recallCtx?.leaks ?? []}
        policies={recallCtx?.policies ?? { unread_policy: 'recall', read_policy: 'notify' }}
        isLoading={recallMutation.isPending}
        onConfirm={() => {
          if (recallCtx && recallCtx.leaks.length > 0) {
            recallMutation.mutate({ runId: recallCtx.runId, leaks: recallCtx.leaks });
          }
        }}
      />
      <FalsePositiveDialog
        open={!!fpCtx}
        onOpenChange={(o) => !o && setFpCtx(null)}
        isLoading={fpMutation.isPending}
        allowWhitelist={!fpCtx?.isTest}
        onSubmit={({ reason, add_whitelist }) => {
          if (fpCtx) fpMutation.mutate({ ...fpCtx, reason, addWhitelist: add_whitelist });
        }}
      />
      <AlertDialog open={!!cancelRunId} onOpenChange={(o) => !o && setCancelRunId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cancelDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cancelDialog.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              {t('cancelDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (cancelRunId) cancelMutation.mutate(cancelRunId);
              }}
            >
              {t('cancelDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={bulkCancelOpen} onOpenChange={setBulkCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t('table.batchCancel')}</AlertDialogTitle><AlertDialogDescription>{t('table.bulkCancelDescription')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('cancelDialog.cancel')}</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); bulkCancelMutation.mutate(); }}>{t('table.batchCancel')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
