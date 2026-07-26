'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader, PageShell } from '@/components/shared/page-shell';
import { UserListTable } from '@/components/security/user-list/UserListTable';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { listUserListRules, resolveUserListRule, userListTypeFromRule, bulkDeleteUserListRules, deleteUserListRule } from '@/lib/api/user-list';
import type { UserListView, ListType } from '@/lib/api/user-list';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [10, 20, 50, 100];

// Windowed page-number list capped at 5 numbered slots + a leading/trailing
// ellipsis marker, per D-007's pagination spec.
function getPageWindow(current: number, total: number): (number | 'ellipsis')[] {
  const maxSlots = 5;
  if (total <= maxSlots) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(maxSlots / 2));
  const end = Math.min(total, start + maxSlots - 1);
  start = Math.max(1, end - maxSlots + 1);
  const nums: (number | 'ellipsis')[] = [];
  if (start > 1) {
    nums.push(1);
    if (start > 2) nums.push('ellipsis');
  }
  for (let p = start; p <= end; p++) {
    if (p === 1 && start > 1) continue;
    nums.push(p);
  }
  if (end < total) {
    if (end < total - 1) nums.push('ellipsis');
    nums.push(total);
  }
  return nums;
}

export function UserListPage({ embedded }: { embedded?: boolean } = {}) {
  const t = useTranslations('userList');
  const tp = useTranslations('pipeline');
  const tc = useTranslations('common');
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin, user } = useAuth();

  const [tab, setTab] = useState<ListType>('blacklist');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<UserListView | null>(null);
  const [showBatch, setShowBatch] = useState(false);
  const [jumpValue, setJumpValue] = useState('');

  const queryKey = ['user-list'];
  const listQueryKey = [...queryKey, tab, search, page, pageSize];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => listUserListRules({ listType: tab, search, page, pageSize }, apiRequest),
    enabled: embedded || isSystemAdmin || user?.role === 'tenant_admin',
    // 列表持续失败时必须尽快交出错误态和人工重试入口；继承全局自动重试会让
    // 管理员在首个反馈窗口内只能看到骨架屏。
    retry: false,
  });

  const rows = useMemo<UserListView[]>(() => {
    if (!data?.items) return [];
    const source = data.serverPaginated
      ? data.items
      : data.items.filter((r) => userListTypeFromRule(r) === tab);
    return source.map((r) => resolveUserListRule(r, tab));
  }, [data, tab]);

  // Compatibility for the bundled mock response, which predates server-side
  // filtering and still returns only { items }. Production responses carry a
  // total and never run this client-side branch.
  const filteredRows = useMemo(() => {
    if (data?.serverPaginated || !search) return rows;
    const query = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.ruleId.toLowerCase().includes(query) ||
        r.sender.toLowerCase().includes(query) ||
        r.recipient.toLowerCase().includes(query),
    );
  }, [data?.serverPaginated, rows, search]);

  const total = data?.serverPaginated ? data.total : filteredRows.length;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, Math.max(1, maxPage));
  const pageRows = useMemo(
    () => data?.serverPaginated ? rows : filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [data?.serverPaginated, rows, filteredRows, safePage, pageSize],
  );
  const pageWindow = useMemo(() => getPageWindow(safePage, maxPage), [safePage, maxPage]);

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (ids: number[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUserListRule(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('deleteSuccess'));
      setDeleting(null);
    },
    onError: (error: Error) => {
      toast.error(error?.message ?? t('deleteFailed'));
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: () => bulkDeleteUserListRules(Array.from(selectedIds), apiRequest),
    onSuccess: (res) => {
      res.failed.forEach((f) => toast.error(`${f.id}: ${f.reason}`));
      if (res.failed.length === 0) toast.success(t('deleteSuccess'));
      queryClient.invalidateQueries({ queryKey });
      setSelectedIds(new Set());
      setShowBatch(false);
    },
    onError: (error: Error) => {
      toast.error(error?.message ?? t('deleteFailed'));
    },
  });

  if (!embedded && !isSystemAdmin && user?.role !== 'tenant_admin') {
    return (
      <PageShell>
        <PageHeader title={tp('userBlackWhiteList')} />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          {tc('notAuthorized')}
        </div>
      </PageShell>
    );
  }

  const jumpToPage = () => {
    const n = parseInt(jumpValue, 10);
    if (!Number.isNaN(n)) setPage(Math.min(maxPage, Math.max(1, n)));
    setJumpValue('');
  };

  const body = (
    <ModuleMasterSwitch page="user_list">
      <div className="space-y-4">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as ListType);
            setSearch('');
            setSelectedIds(new Set());
            setPage(1);
          }}
        >
          <TabsList className="rounded-2xl border border-border/70 bg-muted/30 p-1">
            <TabsTrigger value="blacklist">{t('blacklistRules')}</TabsTrigger>
            <TabsTrigger value="whitelist">{t('whitelistRules')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-1 flex-wrap gap-3 items-center">
            <Input
              type="search"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('reset')}
                      onClick={() => {
                        setSearch('');
                        setPage(1);
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  }
                />
                <TooltipContent>{t('reset')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setShowBatch(true)}>
              {t('deleteSelected')}({selectedIds.size})
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{t('loadFailed')}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          </div>
        ) : (
          <>
            <UserListTable
              rows={pageRows}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onDelete={(row) => setDeleting(row)}
            />

            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
                <div className="text-sm text-muted-foreground">
                  {t('total')} {total} {t('items')}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={safePage === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      &lt;
                    </Button>
                    {pageWindow.map((p, i) =>
                      p === 'ellipsis' ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground">
                          …
                        </span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === safePage ? 'default' : 'outline'}
                          size="sm"
                          className={cn('h-8 w-8 p-0', p === safePage && 'bg-primary text-primary-foreground')}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      ),
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={safePage === maxPage}
                      onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                    >
                      &gt;
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{t('goToPage')}</span>
                    <input
                      type="number"
                      min={1}
                      max={maxPage}
                      value={jumpValue}
                      onChange={(e) => setJumpValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') jumpToPage();
                      }}
                      className="h-8 w-14 rounded-md border bg-background px-2 text-center text-sm"
                    />
                    <span className="text-muted-foreground">{t('page')}</span>
                  </div>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v ?? '10'));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          {s} {t('itemsPerPage')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ModuleMasterSwitch>
  );

  const content = (
    <>
      {body}

      <AlertDialog open={showBatch} onOpenChange={setShowBatch}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDeleteBatch')}
              {selectedIds.size}
              {t('rulesText')} ? {t('cannotUndo')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => batchDeleteMutation.mutate()}>
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDeleteSingle')} {deleting?.ruleId} ? {t('cannotUndo')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              {t('confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {tp('userListTip')}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <PageShell>
      <PageHeader title={tp('userBlackWhiteList')} />
      {content}
    </PageShell>
  );
}
