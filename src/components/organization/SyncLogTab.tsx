'use client';

// 同步日志 Tab —— 逐字段对齐 demo sync-log-tab.tsx：
// 工具栏（搜索数据源名称/重置/筛选 Popover(同步方式+状态)，无 actions —— 只读
// Tab）、8 列表格（结果摘要「新增 a / 更新 u / 删除 d / 失败 f」）、详情抽屉。
// spec E7：后端 list 无文本搜索参数，搜索为当前页客户端过滤；
// 数据源名称由 source_id 对照数据源列表解析（后端 DTO 不含 source_name）。

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageSurface } from '@/components/shared/page-shell';
import { useContactSyncLogs, useContactSources } from './api';
import { SyncLogDetailDialog } from './SyncLogDetailDialog';
import { ListToolbar, FilterSelect, EmptyState, Pager } from './shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function LogStatusBadge({ status, 'data-testid': testId }: { status: string; 'data-testid'?: string }) {
  const t = useTranslations('organizationContacts');
  const map: Record<string, string> = {
    success: 'border-green-200 bg-green-50 text-green-600 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400',
    partial: 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
    failed: 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
    running: 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400',
    canceled: 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400',
  };
  const labels: Record<string, string> = {
    success: t('statusSuccess'),
    partial: t('statusPartial'),
    failed: t('statusFailed'),
    running: t('statusRunning'),
    canceled: t('statusCanceled'),
  };
  return (
    <Badge variant="outline" className={cn('font-normal', map[status] ?? map.canceled)} data-testid={testId}>
      {labels[status] ?? status}
    </Badge>
  );
}

export function formatLogDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '-';
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SyncLogTab() {
  const t = useTranslations('organizationContacts');

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ mode: 'all', status: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, refetch } = useContactSyncLogs({
    sync_type: filters.mode !== 'all' ? filters.mode : undefined,
    status: filters.status !== 'all' ? filters.status : undefined,
    page,
    page_size: pageSize,
  });
  const { data: sourcesData } = useContactSources({ page: 1, page_size: 100 });

  const sourceById = useMemo(() => {
    const m = new Map<number, { name: string; type: string }>();
    for (const s of sourcesData?.items || []) m.set(s.id, { name: s.name, type: s.source_type });
    return m;
  }, [sourcesData]);

  const items = useMemo(() => {
    const list = data?.items || [];
    const kw = search.trim().toLowerCase();
    if (!kw) return list;
    return list.filter((l) => (sourceById.get(l.source_id ?? -1)?.name || '').toLowerCase().includes(kw));
  }, [data, search, sourceById]);
  const total = search.trim() ? items.length : data?.total ?? 0;
  const filterCount = (filters.mode !== 'all' ? 1 : 0) + (filters.status !== 'all' ? 1 : 0);

  const reset = () => {
    setSearch('');
    setFilters({ mode: 'all', status: 'all' });
    setPage(1);
  };

  return (
    <PageSurface className="space-y-4" data-testid="contacts-log-panel">
      <ListToolbar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder={t('searchLogs')}
        onReset={reset}
        onRefresh={() => refetch()}
        filterCount={filterCount}
        testIdPrefix="contacts-log"
        filterContent={
          <>
            <FilterSelect
              label={t('filterSyncType')}
              value={filters.mode}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, mode: v }));
                setPage(1);
              }}
              data-testid="contacts-log-filter-mode"
              options={[
                { value: 'all', label: t('filterAll') },
                { value: 'auto', label: t('syncTypeAuto') },
                { value: 'manual', label: t('syncTypeManual') },
              ]}
            />
            <FilterSelect
              label={t('filterStatus')}
              value={filters.status}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, status: v }));
                setPage(1);
              }}
              data-testid="contacts-log-filter-status"
              options={[
                { value: 'all', label: t('filterAll') },
                { value: 'success', label: t('statusSuccess') },
                { value: 'partial', label: t('statusPartial') },
                { value: 'failed', label: t('statusFailed') },
              ]}
            />
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState data-testid="contacts-log-empty" />
      ) : (
        <>
          <Table data-testid="contacts-log-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[90px]">{t('colLogId')}</TableHead>
                <TableHead>{t('colSource')}</TableHead>
                <TableHead>{t('filterSyncType')}</TableHead>
                <TableHead>{t('colResultSummary')}</TableHead>
                <TableHead>{t('filterStatus')}</TableHead>
                <TableHead>{t('colDuration')}</TableHead>
                <TableHead>{t('colStartedAt')}</TableHead>
                <TableHead className="w-[90px]">{t('colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((l) => (
                <TableRow key={l.id} data-testid={`contacts-log-row-${l.id}`}>
                  <TableCell className="text-gray-500">{l.id}</TableCell>
                  <TableCell className="font-medium">{sourceById.get(l.source_id ?? -1)?.name || '-'}</TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {l.sync_type === 'auto' ? t('syncTypeAuto') : t('syncTypeManual')}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {t('resultSummary', {
                      added: l.added_count,
                      updated: l.updated_count,
                      deleted: l.deleted_count,
                      failed: l.failed_count,
                    })}
                  </TableCell>
                  <TableCell>
                    <LogStatusBadge status={String(l.status)} data-testid={`contacts-log-status-${l.id}`} />
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">{formatLogDuration(l.duration_ms)}</TableCell>
                  <TableCell className="text-gray-500">
                    {l.started_at ? format(new Date(l.started_at), 'yyyy-MM-dd HH:mm:ss') : '-'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-blue-600"
                      onClick={() => setDetailId(l.id)}
                      data-testid={`contacts-log-detail-${l.id}`}
                    >
                      {t('logDetailBtn')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager
            total={total}
            page={page}
            pageSize={pageSize}
            unit={t('pagerUnitRecords')}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            data-testid="contacts-log-pager"
          />
        </>
      )}

      <SyncLogDetailDialog
        logId={detailId}
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
        sourceById={sourceById}
      />
    </PageSurface>
  );
}
