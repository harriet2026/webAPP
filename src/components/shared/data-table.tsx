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
  /**
   * 可选的按行语义级别解析器，渲染为 <TableRow data-level>。
   *
   * 为什么不是 data-state：<TableRow> 的 data-state 已被 row.getIsSelected() 占用，
   * 表格选中态样式靠 data-[state=selected] 生效，复用它会破坏选中高亮。data-level
   * 与 data-state 同在 qc yml 的 expect_attribute 白名单内
   * （qc/scripts/playwright/lib/yml/vocab/verbs/expect-attribute.ts），所以按行的
   * 语义高亮（如认证日志的成功/失败行）挂在这里，用例即可断言而不必去断 Tailwind class。
   * 返回 undefined 时不渲染该属性，对既有调用方无影响。
   */
  rowDataLevel?: (row: TData) => string | undefined;
  /** 列头 testid：按列 id 拼出，落在 <th> 上（避免为加 testid 而包一层 <span> 改变结构）。*/
  columnTestId?: (columnId: string) => string;
  /** 整表的稳定定位点，落在 DataTable 根节点上（避免调用方为放 testid 另包一层 <div>）。*/
  testId?: string;
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
  rowDataLevel,
  columnTestId,
  testId,
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
    <div className="space-y-4" data-testid={testId}>
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
                      <TableHead
                      key={header.id}
                      // 列头的稳定定位点。放在 <th> 上而不是把 header 文案包一层 <span>：
                      // 后者会改变组件结构（QC 侧只被授权做纯属性新增），而 columnTestId
                      // 由调用方按列 id 拼出，渲染结果一个字节都不变。
                      data-testid={columnTestId ? columnTestId(header.column.id) : undefined}
                      className={isActions ? 'sticky right-0 z-10 bg-card/96' : 'bg-muted/20'}>
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
                    data-level={rowDataLevel ? rowDataLevel(row.original) : undefined}
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
              <SelectTrigger className="h-8 w-[92px]" data-testid="data-table-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} data-testid={`data-table-page-size-${size}`} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button data-testid="data-table-prev-page" variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            {t('prev')}
          </Button>
          <div className="text-sm text-muted-foreground">
            {t('pageOf', { current: table.getState().pagination.pageIndex + 1, total: Math.max(1, table.getPageCount()) })}
          </div>
          <Button data-testid="data-table-next-page" variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
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
