'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronRight, Link2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { OverflowCell } from '@/components/shared/overflow-cell';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate } from '@/lib/utils';
import { getDetectionLogDetail } from '@/lib/api/phishing-detection';
import { useApiRequest } from '@/lib/api/client';
import {
  confidenceClass,
  dispositionBadgeClass,
} from '@/components/phishing-detection/badge-styles';
import { UrlFindingsTable } from '@/components/phishing-detection/url-findings-table';
import { DISPLAY_STATUS_VARIANTS, mapPhishingDispositionToDisplayStatus } from '@/lib/display-status';
import type { DetectionLogItem } from '@/types/phishing-detection';

interface DetectionLogTableProps {
  data: DetectionLogItem[];
  isLoading?: boolean;
  truncated?: boolean;
  isAdmin: boolean;
  isLiveState: (disposition: string) => boolean;
  onOpenDetail: (id: string) => void;
  onBlock: (item: DetectionLogItem) => void;
  onExempt: (item: DetectionLogItem) => void;
}

function ConfidenceCell({ value }: { value?: number | null }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={confidenceClass(value)}>{Math.round(value * 100)}%</span>;
}

function UrlSummaryCell({ item }: { item: DetectionLogItem }) {
  const t = useTranslations('phishingDetection');
  const s = item.url_summary;
  if (!s || s.total === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="tabular-nums text-xs font-medium">
        {s.total} {t('table.urlLinks')}
      </span>
      {s.phishing > 0 ? (
        <span className="flex items-center gap-1 text-rose-600" title={t('table.urlPhishing')}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500" />
          <span className="tabular-nums text-xs">{s.phishing}</span>
        </span>
      ) : null}
      {s.suspicious > 0 ? (
        <span className="flex items-center gap-1 text-amber-600" title={t('table.urlSuspicious')}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="tabular-nums text-xs">{s.suspicious}</span>
        </span>
      ) : null}
      {s.phishing === 0 && s.suspicious === 0 && s.normal > 0 ? (
        <span className="flex items-center gap-1 text-emerald-600" title={t('table.urlNormal')}>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="tabular-nums text-xs">{s.normal}</span>
        </span>
      ) : null}
    </div>
  );
}

function ExpandedDetail({ id }: { id: string }) {
  const t = useTranslations('phishingDetection');
  const tc = useTranslations('common');
  const { apiRequest } = useApiRequest();
  const { data, isLoading } = useQuery({
    queryKey: ['phish-detail', id],
    queryFn: () => getDetectionLogDetail(id, apiRequest),
  });
  const findings = data?.investigation?.result?.details?.url_findings ?? [];

  return (
    <div className="bg-[#fbfcff] py-3">
      <div className="mx-12 mb-1 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border/60 bg-card px-3.5 py-2.5 text-xs font-semibold text-slate-700">
          <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="inline-flex min-h-[22px] items-center rounded-full bg-blue-50 px-2 text-[11px] font-semibold text-blue-700">
            {t('table.urlFindings')}
          </span>
          <span>{t('table.urlFindingsTitle', { count: findings.length })}</span>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> {tc('loading')}
          </div>
        ) : (
          <UrlFindingsTable findings={findings} embedded />
        )}
      </div>
    </div>
  );
}

export function DetectionLogTable({
  data,
  isLoading,
  truncated,
  isAdmin,
  isLiveState,
  onOpenDetail,
  onBlock,
  onExempt,
}: DetectionLogTableProps) {
  const tpd = useTranslations('phishingDetection');
  // 「邮件状态」列直接复用「邮件处置中心」的文案 key，保证同一状态在两个模块
  // 里显示的文案（与配色）100% 一致，不会随各自维护而逐渐漂移。
  const ted = useTranslations('emailDisposal');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const columns = useMemo<ColumnDef<DetectionLogItem>[]>(() => [
    {
      id: 'expand',
      header: '',
      cell: ({ row }) => {
        const isOpen = !!expanded[row.original.sideline_id];
        const hasUrls = (row.original.url_summary?.total ?? 0) > 0;
        if (!hasUrls) {
          return <span className="block h-5 w-5" />;
        }
        return (
          <button
            type="button"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setExpanded((prev) => ({ ...prev, [row.original.sideline_id]: !isOpen }))}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        );
      },
    },
    {
      accessorKey: 'sidelined_at',
      header: tpd('table.time'),
      cell: ({ row }) => <span className="whitespace-nowrap text-xs text-foreground">{formatDate(row.original.sidelined_at)}</span>,
    },
    {
      accessorKey: 'sender',
      header: tpd('table.sender'),
      cell: ({ row }) => <OverflowCell text={row.original.sender || '-'} />,
    },
    {
      accessorKey: 'subject',
      header: tpd('table.subject'),
      cell: ({ row }) => <OverflowCell text={row.original.subject || '-'} />,
    },
    {
      accessorKey: 'detection_mode',
      header: tpd('table.detectionMode'),
      cell: ({ row }) => {
        const mode = row.original.detection_mode;
        if (!mode) return <span className="text-muted-foreground">—</span>;
        return <Badge variant="outline">{tpd(`detectionMode.${mode}`)}</Badge>;
      },
    },
    {
      id: 'url_summary',
      header: tpd('table.urlRisk'),
      cell: ({ row }) => {
        const isOpen = !!expanded[row.original.sideline_id];
        const hasUrls = (row.original.url_summary?.total ?? 0) > 0;
        if (!hasUrls) return <UrlSummaryCell item={row.original} />;
        return (
          <button
            type="button"
            className="cursor-pointer text-left"
            aria-expanded={isOpen}
            aria-label={tpd('table.urlFindings')}
            onClick={() => setExpanded((prev) => ({ ...prev, [row.original.sideline_id]: !isOpen }))}
          >
            <UrlSummaryCell item={row.original} />
          </button>
        );
      },
    },
    {
      accessorKey: 'agent_rounds',
      header: tpd('table.agentRounds'),
      cell: ({ row }) => (
        <span className="tabular-nums text-xs">
          {row.original.agent_rounds ?? 0} {tpd('table.roundUnit')}
        </span>
      ),
    },
    {
      accessorKey: 'confidence',
      header: tpd('table.confidence'),
      cell: ({ row }) => <ConfidenceCell value={row.original.confidence} />,
    },
    {
      accessorKey: 'disposition',
      header: tpd('table.disposition'),
      cell: ({ row }) => (
        <Badge className={dispositionBadgeClass(row.original.disposition)}>
          {tpd(`disposition.${row.original.disposition}`)}
        </Badge>
      ),
    },
    {
      id: 'mail_status',
      header: tpd('table.mailStatus'),
      cell: ({ row }) => {
        // 检测日志接口没有独立的邮件生命周期状态字段，由 disposition（执行
        // 动作）+ recall_status（召回/通知状态）在前端派生，派生规则与文案/
        // 配色均与「邮件处置中心」保持一致，详见 mapPhishingDispositionToDisplayStatus。
        const displayStatus = row.original.display_status ?? mapPhishingDispositionToDisplayStatus(
          row.original.disposition,
          row.original.recall_status,
        );
        return (
          <Badge variant={DISPLAY_STATUS_VARIANTS[displayStatus]}>
            {ted(`filters.statuses.${displayStatus}`)}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: tpd('table.actions'),
      cell: ({ row }) => {
        const item = row.original;
        const live = isLiveState(item.disposition);
        return (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700" onClick={() => onOpenDetail(item.sideline_id)}>
              {tpd('table.detail')}
            </Button>
            {isAdmin ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={live}
                  onClick={() => onBlock(item)}
                >
                  {tpd('table.block')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={live}
                  onClick={() => onExempt(item)}
                >
                  {tpd('table.exempt')}
                </Button>
              </>
            ) : null}
          </div>
        );
      },
    },
  ], [expanded, isAdmin, isLiveState, onBlock, onExempt, onOpenDetail, tpd, ted]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  return (
    <div className="space-y-3">
      {truncated ? (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {tpd('table.truncatedBanner')}
        </div>
      ) : null}
      <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-card shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <Table className="w-full min-w-[1220px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-auto bg-[#f9fafc] px-3 py-2.5 text-xs font-semibold text-slate-700">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
                  <EmptyState title={tpd('table.empty')} />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => {
                const isOpen = !!expanded[row.original.sideline_id];
                return (
                  <Fragment key={row.id}>
                    <TableRow className="hover:bg-gray-50">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="px-3 py-2.5 text-xs">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {isOpen ? (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="p-0">
                          <ExpandedDetail id={row.original.sideline_id} />
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
    </div>
  );
}
