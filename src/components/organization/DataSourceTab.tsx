'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageSurface } from '@/components/shared/page-shell';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useApiRequest } from '@/lib/api/client';
import { useContactSources, useContactSourceMutations, getContactSourceImpact } from './api';
import { DataSourceFormSheet } from './DataSourceFormSheet';
import {
  SyncStatusBadge,
  AutoSyncBadge,
  ListToolbar,
  FilterSelect,
  EmptyState,
  Pager,
} from './shared';
import type { ContactSource, ContactSourceImpact, SourceType } from './types';

// demo data-source-tab.tsx 的 webapp 实现：工具栏/表格/分页逐字段对齐 demo，
// 筛选与分页走后端参数（GT-12038）。
export function sourceAddress(source: ContactSource): string {
  const cfg = (source.config || {}) as Record<string, unknown>;
  if (typeof cfg.server === 'string' && cfg.server) return cfg.server;
  if (typeof cfg.server_url === 'string' && cfg.server_url) return cfg.server_url;
  return '-';
}

export function sourceTypeShort(t: (k: string) => string, type: SourceType): string {
  switch (type) {
    case 'ldap':
      return t('typeLdap');
    case 'csv':
      return t('typeCsv');
    case 'coremail':
      return t('typeShortCoremail');
    case 'neteml':
      return t('typeShortNeteml');
    default:
      return type;
  }
}

export function DataSourceTab() {
  const t = useTranslations('organizationContacts');
  const tc = useTranslations('common');
  const { isSystemAdmin, isTenantAdmin, selectedTenantId, user } = useAuth();
  const tenantId = isSystemAdmin ? selectedTenantId : user?.tenant_id ?? null;
  // GT-12030：数据源增删改/同步对本租户的 tenant_admin 同样开放，与后端
  // RequireAdminOrTenantAdmin() 同口径。
  const canWrite = isSystemAdmin || isTenantAdmin;

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ syncType: 'all', status: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactSource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactSource | null>(null);
  // GT-12341（重开轮）：删除确认框动态展示影响面（联系人数量 + 受影响策略）。
  // 打开时拉取 /impact；失败/加载中回退固定说明文案，不阻塞删除操作。
  const [deleteImpact, setDeleteImpact] = useState<ContactSourceImpact | null>(null);
  useEffect(() => {
    setDeleteImpact(null);
    if (!deleteTarget) return;
    let cancelled = false;
    getContactSourceImpact(deleteTarget.id, scopedRequest)
      .then((im) => { if (!cancelled) setDeleteImpact(im); })
      .catch(() => { /* 影响面拉取失败 → 保留固定文案 */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteTarget]);

  // GT-12038：搜索/类型/状态筛选与分页全部走后端参数（后端 ListContactSources
  // 已支持 search + source_type + sync_status + auto_sync）。
  const { data, refetch } = useContactSources({
    search: search.trim() || undefined,
    source_type: filters.syncType !== 'all' ? (filters.syncType as SourceType) : '',
    sync_status: filters.status !== 'all' ? (filters.status as ContactSource['sync_status']) : '',
    page,
    page_size: pageSize,
  });
  const allItems = useMemo(() => data?.items || [], [data]);
  const paged = allItems;
  const total = data?.total ?? 0;
  const filterCount = (filters.syncType !== 'all' ? 1 : 0) + (filters.status !== 'all' ? 1 : 0);

  const { sync, remove, setAutoSync } = useContactSourceMutations();
  const { apiRequest: scopedRequest } = useApiRequest();
  const anyRunning = allItems.some((s) => s.sync_status === 'running');

  // 同步终态 toast：跟踪 running → 终态 的迁移（demo syncRow 1.5s 出结果 + toast；
  // 真实后端靠轮询感知）。
  const prevStatus = useRef<Map<number, string>>(new Map());
  useEffect(() => {
    const prev = prevStatus.current;
    for (const s of allItems) {
      const was = prev.get(s.id);
      if (was === 'running' && s.sync_status !== 'running') {
        if (s.sync_status === 'success') toast.success(t('toastSyncSuccess'));
        else if (s.sync_status === 'partial')
          toast.success(t('toastSyncPartial', { count: Number((s as Record<string, unknown>).abnormal_count ?? 0) || 0 }));
        else if (s.sync_status === 'failed') toast.error(t('toastSyncFailed'));
      }
    }
    prevStatus.current = new Map(allItems.map((s) => [s.id, s.sync_status]));
  }, [allItems, t]);

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => refetch(), 1000);
    return () => clearInterval(id);
  }, [anyRunning, refetch]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: ContactSource) => {
    setEditing(s);
    setFormOpen(true);
  };
  const reset = () => {
    setSearch('');
    setFilters({ syncType: 'all', status: 'all' });
    setPage(1);
  };

  const syncRow = (s: ContactSource) => {
    if (s.sync_status === 'running') return;
    sync.mutate(
      { id: s.id },
      { onError: (e: Error) => toast.error(e.message || tc('error')) },
    );
  };

  // demo：点击「自动同步」徽章直接 toggle。走 GT-12034 的专用端点，而不是完整
  // PUT —— 列表响应的 config 是脱敏的（`********`），回传会覆写真实凭据。
  // spec E5：开启时后端要求 cron，源上没有就下发默认 0 0 * * *。
  const toggleAuto = (s: ContactSource) => {
    if (!canWrite || s.source_type === 'csv') return;
    const next = !s.auto_sync_enabled;
    setAutoSync.mutate(
      { id: s.id, enabled: next, cronExpr: next && !s.cron_expr ? '0 0 * * *' : undefined },
      { onError: (e: Error) => toast.error(e.message || tc('error')) },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    remove.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('toastDeleted'));
        setDeleteTarget(null);
      },
      onError: (e: Error) => toast.error(e.message || tc('error')),
    });
  };

  return (
    <PageSurface className="space-y-4" data-testid="contacts-source-panel">
      <ListToolbar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder={t('searchPlaceholder')}
        onReset={reset}
        onRefresh={() => refetch()}
        filterCount={filterCount}
        testIdPrefix="contacts-source"
        filterContent={
          <>
            <FilterSelect
              label={t('filterSyncType')}
              value={filters.syncType}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, syncType: v }));
                setPage(1);
              }}
              data-testid="contacts-source-filter-type"
              options={[
                { value: 'all', label: t('filterAll') },
                { value: 'ldap', label: t('typeLdap') },
                { value: 'coremail', label: t('typeCoremail') },
                { value: 'neteml', label: t('typeNeteml') },
                { value: 'csv', label: t('typeCsv') },
              ]}
            />
            <FilterSelect
              label={t('filterSyncStatus')}
              value={filters.status}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, status: v }));
                setPage(1);
              }}
              data-testid="contacts-source-filter-status"
              options={[
                { value: 'all', label: t('filterAll') },
                { value: 'success', label: t('srcStatusNormal') },
                { value: 'partial', label: t('statusPartial') },
                { value: 'failed', label: t('srcStatusAbnormal') },
                { value: 'unsynced', label: t('statusUnsynced') },
              ]}
            />
          </>
        }
        actions={
          canWrite ? (
            <Button className="h-9 gap-1.5 bg-blue-600 text-white hover:bg-blue-700" onClick={openNew} data-testid="contacts-source-add">
              <Plus className="h-4 w-4" />
              {t('addSource')}
            </Button>
          ) : null
        }
      />

      {allItems.length === 0 ? (
        <EmptyState onAdd={canWrite ? openNew : undefined} data-testid="contacts-source-empty" />
      ) : (
        <>
          <Table data-testid="contacts-source-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[90px]">{t('colId')}</TableHead>
                <TableHead>{t('colName')}</TableHead>
                <TableHead>{t('colSourceType')}</TableHead>
                <TableHead>{t('colAddress')}</TableHead>
                <TableHead>{t('colSyncStatus')}</TableHead>
                <TableHead>{t('colAutoSync')}</TableHead>
                <TableHead>{t('colLastSync')}</TableHead>
                <TableHead className="w-[200px]">{t('colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((s) => {
                const running = s.sync_status === 'running';
                const abnormalCount = Number((s as Record<string, unknown>).abnormal_count ?? 0) || undefined;
                return (
                  <TableRow key={s.id} data-testid={`contacts-source-row-${s.id}`}>
                    <TableCell className="text-gray-500">{s.id}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-400">{sourceTypeShort(t, s.source_type)}</TableCell>
                    <TableCell className="max-w-[220px]">
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className="block truncate text-gray-600 dark:text-gray-400">{sourceAddress(s)}</span>}
                        />
                        <TooltipContent>{sourceAddress(s)}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <SyncStatusBadge status={s.sync_status} abnormalCount={abnormalCount} data-testid={`contacts-source-status-${s.id}`} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleAuto(s)}
                        aria-label={t('toggleAutoSyncAria')}
                        data-testid={`contacts-source-autosync-${s.id}`}
                      >
                        <AutoSyncBadge enabled={s.auto_sync_enabled && s.source_type !== 'csv'} />
                      </button>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {s.last_sync_time ? format(new Date(s.last_sync_time), 'yyyy-MM-dd HH:mm') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {running ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button variant="ghost" size="sm" className="h-7 gap-1 text-gray-400" disabled data-testid={`contacts-source-sync-${s.id}`}>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  {t('statusRunning')}
                                </Button>
                              }
                            />
                            <TooltipContent>{t('runningTip')}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-gray-600 dark:text-gray-400"
                            onClick={() => syncRow(s)}
                            disabled={!canWrite}
                            data-testid={`contacts-source-sync-${s.id}`}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            {t('actionSync')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-blue-600"
                          onClick={() => openEdit(s)}
                          disabled={!canWrite}
                          data-testid={`contacts-source-edit-${s.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('actionEdit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-red-600"
                          onClick={() => setDeleteTarget(s)}
                          disabled={!canWrite}
                          data-testid={`contacts-source-delete-${s.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('actionDelete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pager
            total={total}
            page={page}
            pageSize={pageSize}
            unit={t('pagerUnitRules')}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            data-testid="contacts-source-pager"
          />
        </>
      )}

      <DataSourceFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        tenantId={tenantId}
        existingNames={allItems.map((s) => ({ id: s.id, name: s.name }))}
      />

      {/* 删除二次确认（demo：动态标题 + 固定正文，Q3 拍板不接影响面接口） */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="contacts-source-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle', { name: deleteTarget?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription data-testid="contacts-source-delete-impact">
              {deleteImpact
                ? t('deleteImpactDesc', {
                    count: deleteImpact.contact_count,
                    // 后端无受影响策略时返回 null（Go nil slice），必须判空。
                    profiles: (deleteImpact.affected_profiles ?? []).length > 0
                      ? (deleteImpact.affected_profiles ?? []).join('、')
                      : t('deleteImpactNoProfiles'),
                  })
                : t('deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="contacts-source-delete-dialog-cancel">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={confirmDelete} data-testid="contacts-source-delete-dialog-confirm">
              {t('deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSurface>
  );
}
