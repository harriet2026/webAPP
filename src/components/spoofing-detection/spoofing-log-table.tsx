'use client';

import { useMemo } from 'react';
import {
  ColumnDef, flexRender, getCoreRowModel, useReactTable,
} from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OverflowCell } from '@/components/shared/overflow-cell';
import { formatDate, cn } from '@/lib/utils';
import type { SpoofingLogItem } from '@/types/spoofing-detection';

interface Props {
  data: SpoofingLogItem[];
  isLoading?: boolean;
  canEdit: boolean;
  onOpenDetail: (id: string) => void;
  onBlock: (item: SpoofingLogItem) => void;
  onExempt: (item: SpoofingLogItem) => void;
}

function riskScore(item: SpoofingLogItem): number | null {
  return typeof item.confidence === 'number' ? Math.round(item.confidence * 100) : null;
}
function scoreClass(score: number): string {
  if (score >= 80) return 'text-rose-600 dark:text-rose-400 font-bold';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400 font-bold';
  return 'text-emerald-600 dark:text-emerald-400 font-bold';
}
function dispositionClass(d: string): string {
  if (d === 'reject' || d === 'discard' || d === 'quarantine') return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
  if (d === 'accept') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
  return 'bg-muted text-muted-foreground';
}

export function SpoofingLogTable({ data, isLoading, canEdit, onOpenDetail, onBlock, onExempt }: Props) {
  const tsd = useTranslations('spoofingDetection');

  const columns = useMemo<ColumnDef<SpoofingLogItem>[]>(() => [
    { accessorKey: 'sidelined_at', header: tsd('table.time'),
      cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDate(row.original.sidelined_at)}</span> },
    { accessorKey: 'sender', header: tsd('table.sender'), cell: ({ row }) => <OverflowCell text={row.original.sender || '-'} /> },
    { accessorKey: 'subject', header: tsd('table.subject'), cell: ({ row }) => <OverflowCell text={row.original.subject || '-'} /> },
    { id: 'risk', header: tsd('table.riskScore'), cell: ({ row }) => {
        const s = riskScore(row.original);
        if (s === null) return <span className="text-muted-foreground">—</span>;
        return <span className={cn('tabular-nums', scoreClass(s))}>{s}</span>;
      } },
    { id: 'methods', header: tsd('table.spoofMethods'), cell: ({ row }) => {
        const methods = row.original.spoof_methods;
        if (methods && methods.length > 0) {
          return (
            <div className="flex flex-wrap gap-1">
              {methods.map((m) => <Badge key={m} variant="outline" className="text-xs">{tsd(`spoofMethod.${m}` as never) || m}</Badge>)}
            </div>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      } },
    { id: 'target', header: tsd('table.target'), cell: ({ row }) => {
        const t = row.original.target_name;
        const tt = row.original.target_type;
        if (!t && !tt) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-1.5 text-sm">
            {tt ? <Badge variant="secondary" className="text-[10px]">{tsd(`target.${tt}` as never) || tt}</Badge> : null}
            <span>{t || '—'}</span>
          </div>
        );
      } },
    { accessorKey: 'disposition', header: tsd('table.action'),
      cell: ({ row }) => <Badge className={dispositionClass(row.original.disposition)}>{tsd(`disposition.${row.original.disposition}`)}</Badge> },
    { id: 'actions', header: tsd('table.actions'),
      cell: ({ row }) => {
        const item = row.original;
        const noAct = !item.actionable;
        return (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => onOpenDetail(item.id)}>{tsd('table.detail')}</Button>
            {canEdit ? (
              <>
                <Button variant="outline" size="sm" disabled={noAct} onClick={() => onBlock(item)}>{tsd('table.block')}</Button>
                <Button variant="ghost" size="sm" disabled={noAct} onClick={() => onExempt(item)}>{tsd('table.exempt')}</Button>
                {noAct ? <span className="text-xs text-muted-foreground">{tsd('table.fallbackHint')}</span> : null}
              </>
            ) : null}
          </div>
        );
      } },
  ], [canEdit, onBlock, onExempt, onOpenDetail, tsd]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns stable table helpers outside React Compiler's memo model.
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h, idx) => (
                <TableHead key={h.id}
                  className={cn('bg-muted/40 text-foreground', idx === hg.headers.length - 1 && 'sticky right-0 bg-muted/40 text-right')}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow><TableCell colSpan={columns.length} className="h-36 text-center text-muted-foreground">{tsd('table.empty')}</TableCell></TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell, idx) => (
                  <TableCell key={cell.id}
                    className={cn(idx === row.getVisibleCells().length - 1 && 'sticky right-0 bg-card')}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
