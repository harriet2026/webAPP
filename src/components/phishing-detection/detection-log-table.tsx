'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronDown, ChevronRight, Link2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useApiRequest } from '@/lib/api/client';
import { getDetectionLogDetail } from '@/lib/api/phishing-detection';
import { EmptyState } from '@/components/shared/empty-state';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { UrlFindingsTable } from './url-findings-table';
import { confidenceClass, policyDispositionBadgeClass, riskBadgeClass } from './badge-styles';
import { phishingQueryKeys } from './phishing-query-keys';
import { DisplayStatusBadges } from '@/components/email-disposal/components/recipient-status-badges';
import type { DetectionLogItem } from '@/types/phishing-detection';
import { formatDate } from '@/lib/utils';
import { urlVerdictClass } from '@/lib/url-verdict';

function UrlSummaryCell({ item }: { item: DetectionLogItem }) {
  const t = useTranslations('phishingDetection');
  const summary = item.url_summary;
  if (!summary || summary.total === 0) return <span className="text-muted-foreground">{item.result_truncated ? t('urlValidation.truncated') : '—'}</span>;
  const buckets = ['phishing', 'malicious', 'suspicious', 'safe', 'needs_review', 'invalid', 'unvalidated'] as const;
  const complete = summary.version === 2 && !summary.legacy && buckets.every((key) => Number.isInteger(summary[key]) && summary[key]! >= 0)
    && buckets.reduce((total, key) => total + (summary[key] ?? 0), 0) === summary.total;
  return <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="tabular-nums text-sm font-medium">{summary.total} {t('table.urlLinks')}</span>
      {complete ? buckets.filter((key) => summary[key]! > 0).map((key) => <span key={key} className={`flex items-center gap-1 ${urlVerdictClass[key]}`} title={t(`urlValidation.labels.${key}`)}>
        <span className="inline-block size-1.5 rounded-full bg-current" />
        <span className="tabular-nums text-sm">{summary[key]}</span>
      </span>) : <span className="text-xs text-muted-foreground">{t('urlValidation.legacy')}</span>}
    </div>
    {item.result_truncated ? <p className="text-xs text-muted-foreground">{t('urlValidation.truncated')}</p> : null}
  </div>;
}

function ExpandedDetail({ id }: { id: string }) {
  const t = useTranslations('phishingDetection');
  const tc = useTranslations('common');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const query = useQuery({ queryKey: phishingQueryKeys.detail(effectiveTenantId, id), queryFn: () => getDetectionLogDetail(id, apiRequest) });
  const findings = query.data?.investigation?.result?.details?.url_findings ?? [];
  return <div data-testid={`phishing-log-expanded-${id}`} className="bg-muted/30 py-3"><div className="mx-12 mb-1 overflow-hidden rounded-lg border border-border bg-card"><div className="flex items-center gap-2 border-b border-border/60 bg-card px-3.5 py-2.5 text-sm font-semibold"><Link2 className="size-4 text-muted-foreground" /><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{t('table.urlFindings')}</span><span>{t('table.urlFindingsTitle', { count: findings.length })}</span></div>{query.isLoading ? <div className="flex items-center gap-2 px-3.5 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{tc('loading')}</div> : <UrlFindingsTable findings={findings} embedded />}</div></div>;
}

export function DetectionLogTable({ data, isLoading, truncated, onOpenDetail }: { data: DetectionLogItem[]; isLoading?: boolean; truncated?: boolean; onOpenDetail: (id: string) => void }) {
  const t = useTranslations('phishingDetection');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const columns = useMemo<ColumnDef<DetectionLogItem>[]>(() => [
    { id: 'expand', header: '', cell: ({ row }) => (row.original.url_summary?.total ?? 0) > 0 ? <Button type="button" data-testid={`phishing-log-expand-${row.original.sideline_id}`} variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t('table.urlFindings')} aria-expanded={Boolean(expanded[row.original.sideline_id])} onClick={() => setExpanded((current) => ({ ...current, [row.original.sideline_id]: !current[row.original.sideline_id] }))}>{expanded[row.original.sideline_id] ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</Button> : <span aria-hidden="true" className="block size-6" /> },
    { accessorKey: 'sidelined_at', header: t('table.time'), cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDate(row.original.sidelined_at)}</span> },
    { accessorKey: 'sender', header: t('table.sender'), cell: ({ row }) => <OverflowCell text={row.original.sender || '—'} /> },
    { accessorKey: 'subject', header: t('table.subject'), cell: ({ row }) => <OverflowCell text={row.original.subject || '—'} /> },
    { accessorKey: 'detection_mode', header: t('table.detectionMode'), cell: ({ row }) => row.original.detection_mode ? <Badge variant="outline">{t(`detectionMode.${row.original.detection_mode}`)}</Badge> : <span className="text-muted-foreground">—</span> },
    { id: 'url_summary', header: t('table.urlRisk'), cell: ({ row }) => row.original.url_summary.total > 0 ? <Button type="button" data-testid={`phishing-log-url-summary-${row.original.sideline_id}`} variant="ghost" size="sm" className="h-auto justify-start p-0 text-left" aria-label={t('table.urlFindings')} aria-expanded={Boolean(expanded[row.original.sideline_id])} onClick={() => setExpanded((current) => ({ ...current, [row.original.sideline_id]: !current[row.original.sideline_id] }))}><UrlSummaryCell item={row.original} /></Button> : <UrlSummaryCell item={row.original} /> },
    { accessorKey: 'agent_rounds', header: t('table.agentRounds'), cell: ({ row }) => row.original.agent_rounds > 0 ? <span className="tabular-nums text-sm">{row.original.agent_rounds} {t('table.roundUnit')}</span> : <span className="text-muted-foreground">—</span> },
    { accessorKey: 'confidence', header: t('table.confidence'), cell: ({ row }) => typeof row.original.confidence === 'number' ? <span className={confidenceClass(row.original.confidence)}>{Math.round(row.original.confidence * 100)}%</span> : <span className="text-muted-foreground">—</span> },
    { id: 'risk_level', header: t('table.riskLevel'), cell: ({ row }) => <Badge className={riskBadgeClass(row.original.risk_level)}>{row.original.risk_level ? t(`riskLevel.${row.original.risk_level}`) : t('policyDisposition.undecided')}</Badge> },
    { accessorKey: 'policy_disposition', header: t('table.disposition'), cell: ({ row }) => <Badge className={policyDispositionBadgeClass(row.original.policy_disposition)}>{t(`policyDisposition.${row.original.policy_disposition ?? 'undecided'}`)}</Badge> },
    { id: 'mail_status', header: t('table.mailStatus'), cell: ({ row }) => row.original.display_statuses?.length ? <DisplayStatusBadges entries={row.original.display_statuses} /> : <span className="text-muted-foreground">—</span> },
    { id: 'actions', header: t('table.actions'), cell: ({ row }) => <Button data-testid={`phishing-log-detail-${row.original.sideline_id}`} variant="ghost" size="sm" className="h-8 px-2 text-sm text-primary" onClick={() => onOpenDetail(row.original.sideline_id)}>{t('table.detail')}</Button> },
  ], [expanded, onOpenDetail, t]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return <div className="space-y-3">{truncated ? <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning-foreground dark:text-warning">{t('table.truncatedBanner')}</div> : null}<div data-testid="phishing-log-table" className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm"><Table className="w-full min-w-[1220px]"><TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id} className="h-auto bg-muted/40 px-3 py-2.5 text-sm font-semibold text-foreground">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={columns.length} className="h-24 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow> : table.getRowModel().rows.length === 0 ? <TableRow><TableCell colSpan={columns.length} className="h-24"><EmptyState title={t('table.empty')} /></TableCell></TableRow> : table.getRowModel().rows.map((row) => <Fragment key={row.id}><TableRow data-testid={`phishing-log-row-${row.original.sideline_id}`} className="hover:bg-transparent">{row.getVisibleCells().map((cell) => <TableCell key={cell.id} data-testid={`phishing-log-cell-${row.original.sideline_id}-${cell.column.id}`} className="px-3 py-2.5 text-sm">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>{expanded[row.original.sideline_id] ? <TableRow><TableCell colSpan={columns.length} className="p-0"><ExpandedDetail id={row.original.sideline_id} /></TableCell></TableRow> : null}</Fragment>)}</TableBody></Table></div></div>;
}
