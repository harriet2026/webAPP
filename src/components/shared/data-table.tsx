'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  SortingState,
  getSortedRowModel,
  ColumnFiltersState,
  PaginationState,
  Updater,
  getFilteredRowModel,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  noDataText?: string;
  hidePagination?: boolean;
  pageCount?: number;
  pageIndex?: number;
  onPageChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Optional per-row class resolver. Returns a className string applied to <TableRow>. */
  rowClassName?: (row: TData) => string;
  /** Optional per-row data-testid resolver, applied to <TableRow> for stable QC/Playwright row lookups. */
  rowTestId?: (row: TData) => string;
  totalCount?: number;
  pageJumpLabel?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 10,
  noDataText,
  hidePagination = false,
  pageCount: serverPageCount,
  pageIndex: serverPageIndex,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  rowClassName,
  rowTestId,
  totalCount,
  pageJumpLabel,
}: DataTableProps<TData, TValue>) {
  const t = useTranslations('common');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [jumpPage, setJumpPage] = useState('');

  const isServerPagination = serverPageCount !== undefined && onPageChange !== undefined;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    ...(isServerPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    ...(isServerPagination
      ? {
          manualPagination: true,
          pageCount: serverPageCount,
          state: {
            sorting,
            columnFilters,
            pagination: { pageIndex: serverPageIndex ?? 0, pageSize },
          },
          onPaginationChange: (updater: Updater<PaginationState>) => {
            const newPageIndex = typeof updater === 'function'
              ? updater({ pageIndex: serverPageIndex ?? 0, pageSize }).pageIndex
              : updater.pageIndex;
            onPageChange(newPageIndex);
          },
        }
      : {
          state: {
            sorting,
            columnFilters,
          },
          initialState: {
            pagination: {
              pageSize,
            },
          },
        }),
  });

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[24px] border border-border/70 bg-card/96 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <Table>
          <colgroup>
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const isActions = header.column.id === 'actions';
              const isSelect = header.column.id === 'select';
              if (isActions) return <col key={header.id} className="w-[80px]" />;
              if (isSelect) return <col key={header.id} className="w-[40px]" />;
              return <col key={header.id} />;
            })}
          </colgroup>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isActions = header.column.id === 'actions';
                  return (
                      <TableHead key={header.id} className={isActions ? 'sticky right-0 z-10 bg-card/96' : 'bg-muted/20'}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowCls = rowClassName ? rowClassName(row.original) : '';
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    data-testid={rowTestId ? rowTestId(row.original) : undefined}
                    className={rowCls || undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isActions = cell.column.id === 'actions';
                      return (
                        <TableCell key={cell.id} className={isActions ? 'sticky right-0 z-10 bg-card/96' : ''}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {noDataText || t('noData')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {!hidePagination && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {totalCount !== undefined && (
            <span className="mr-auto text-sm text-muted-foreground">{t('total', { count: totalCount })}</span>
          )}
          {onPageSizeChange && (
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-8 w-[92px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            {t('prev')}
          </Button>
          <div className="text-sm text-muted-foreground">
            {t('pageOf', { current: table.getState().pagination.pageIndex + 1, total: Math.max(1, table.getPageCount()) })}
          </div>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            {t('next')}
          </Button>
          {pageJumpLabel && isServerPagination && (
            <label className="ml-2 flex items-center gap-2 text-sm text-muted-foreground">
              {pageJumpLabel}
              <Input
                type="number"
                min={1}
                max={Math.max(1, table.getPageCount())}
                value={jumpPage}
                onChange={(event) => setJumpPage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const target = Math.min(Math.max(Number(jumpPage) || 1, 1), Math.max(1, table.getPageCount()));
                  onPageChange?.(target - 1);
                  setJumpPage('');
                }}
                className="h-8 w-16"
                aria-label={pageJumpLabel}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
