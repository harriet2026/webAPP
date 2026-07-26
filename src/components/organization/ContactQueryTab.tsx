'use client';

// 通讯录查询 Tab —— 逐字段对齐 demo contact-book-tab.tsx：
// 工具栏（搜索/重置/筛选 Popover(数据源+标记状态)/导出）、批量操作栏（4 按钮 +
// 清空选择）、批量标记二次确认弹窗、行内「标记」下拉即时生效、人员详情抽屉。
// Q5 拍板：不做部门/职务筛选；用户拍板删除「状态」列与标记说明文案。

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Tag, Download, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageSurface } from '@/components/shared/page-shell';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { isMockEnabled } from '@/lib/mock/storage';
import {
  useContacts,
  useContactSources,
  useContactMutations,
  exportContactsUrl,
  downloadExportUrl,
} from './api';
import { ContactDetailDrawer } from './ContactDetailDrawer';
import { ListToolbar, FilterSelect, EmptyState, Pager, TagBadge } from './shared';
import type { Contact, ContactTag } from './types';

const EXPORT_LIMIT = 50000;

export function ContactQueryTab() {
  const t = useTranslations('organizationContacts');
  const tc = useTranslations('common');
  const { isSystemAdmin, isTenantAdmin, selectedTenantId, user } = useAuth();
  const tenantId = isSystemAdmin ? selectedTenantId : user?.tenant_id ?? null;
  const canMark = isSystemAdmin || isTenantAdmin;
  const { bulk } = useContactMutations();

  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<{ source: string; tag: string }>({ source: 'all', tag: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Contact | null>(null);
  const [batchTag, setBatchTag] = useState<ContactTag | null>(null);

  const { data, refetch } = useContacts({
    keyword: keyword || undefined,
    source_id: filters.source !== 'all' ? Number(filters.source) : undefined,
    tag: filters.tag !== 'all' ? (filters.tag as ContactTag) : '',
    page,
    page_size: pageSize,
  });
  const { data: sourcesData } = useContactSources({ page: 1, page_size: 100 });

  const items = useMemo(() => data?.items || [], [data]);
  const total = data?.total ?? 0;
  const filterCount = (filters.source !== 'all' ? 1 : 0) + (filters.tag !== 'all' ? 1 : 0);

  const pageAllChecked = items.length > 0 && items.every((p) => selected.has(p.id));
  const togglePageAll = () => {
    const next = new Set(selected);
    if (pageAllChecked) items.forEach((p) => next.delete(p.id));
    else items.forEach((p) => next.add(p.id));
    setSelected(next);
  };
  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const reset = () => {
    setKeyword('');
    setFilters({ source: 'all', tag: 'all' });
    setPage(1);
  };

  const markOne = (id: number, tag: ContactTag) => {
    const payload =
      tag === 'none'
        ? { action: 'untag' as const, ids: [id] }
        : { action: 'tag' as const, tag: tag as 'executive' | 'key_position', ids: [id] };
    bulk.mutate(payload, {
      onSuccess: () => {
        if (tag === 'executive') toast.success(t('toastMarkedExec'));
        else if (tag === 'key_position') toast.success(t('toastMarkedKey'));
        else toast.success(t('toastUnmarked'));
      },
      onError: (e: Error) => toast.error(e.message || tc('error')),
    });
  };

  const applyBatch = () => {
    if (batchTag === null) return;
    const ids = Array.from(selected);
    const count = ids.length;
    const payload =
      batchTag === 'none'
        ? { action: 'untag' as const, ids }
        : { action: 'tag' as const, tag: batchTag as 'executive' | 'key_position', ids };
    bulk.mutate(payload, {
      onSuccess: () => {
        toast.success(batchTag === 'none' ? t('toastBatchUntagged', { count }) : t('toastBatchTagged', { count }));
        setSelected(new Set());
      },
      onError: (e: Error) => toast.error(e.message || tc('error')),
    });
    setBatchTag(null);
  };

  // 导出（spec E4）：toast 文案逐字对齐 demo；真实后端仍触发浏览器下载，
  // Mock 模式仅 toast（与 demo 完全一致）。
  const exportData = async () => {
    if (total > EXPORT_LIMIT) {
      toast.error(t('exportLimitToast'));
      return;
    }
    toast.success(t('exportTaskToast', { count: total }));
    if (isMockEnabled()) return;
    try {
      const url = await exportContactsUrl({
        keyword: keyword || undefined,
        source_id: filters.source !== 'all' ? Number(filters.source) : undefined,
        tag: filters.tag !== 'all' ? (filters.tag as ContactTag) : '',
      });
      await downloadExportUrl(url, tenantId, `contacts-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    } catch (e) {
      toast.error((e as Error).message || tc('error'));
    }
  };

  const batchTagLabel = batchTag === 'executive' ? t('tagExecutive') : batchTag === 'key_position' ? t('tagKeyPosition') : '';

  return (
    <PageSurface className="space-y-4" data-testid="contacts-book-panel">
      <ListToolbar
        search={keyword}
        onSearchChange={(v) => {
          setKeyword(v);
          setPage(1);
        }}
        searchPlaceholder={t('searchContacts')}
        onReset={reset}
        onRefresh={() => refetch()}
        filterCount={filterCount}
        testIdPrefix="contacts-book"
        filterContent={
          <>
            <FilterSelect
              label={t('filterSource')}
              value={filters.source}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, source: v }));
                setPage(1);
              }}
              data-testid="contacts-book-filter-source"
              options={[
                { value: 'all', label: t('filterAll') },
                ...(sourcesData?.items || []).map((s) => ({ value: String(s.id), label: s.name })),
              ]}
            />
            <FilterSelect
              label={t('filterTagState')}
              value={filters.tag}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, tag: v }));
                setPage(1);
              }}
              data-testid="contacts-book-filter-tag"
              options={[
                { value: 'all', label: t('filterAll') },
                { value: 'executive', label: t('tagExecutive') },
                { value: 'key_position', label: t('tagKeyPosition') },
                { value: 'none', label: t('tagNone') },
              ]}
            />
          </>
        }
        actions={
          <Button variant="outline" className="h-9 gap-1.5" onClick={exportData} data-testid="contacts-book-export">
            <Download className="h-4 w-4" />
            {t('export')}
          </Button>
        }
      />

      {/* 批量操作栏（勾选 ≥1 行浮出，位于工具栏与表格之间） */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm dark:border-blue-900 dark:bg-blue-950/40"
          data-testid="contacts-book-batch-bar"
        >
          <span className="text-blue-700 dark:text-blue-300" data-testid="contacts-book-batch-count">
            {t('selected', { count: selected.size })}
          </span>
          {canMark && (
            <div className="ml-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-8" onClick={() => setBatchTag('executive')} data-testid="contacts-book-batch-exec">
                {t('batchExec')}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setBatchTag('key_position')} data-testid="contacts-book-batch-key">
                {t('batchKey')}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setBatchTag('none')} data-testid="contacts-book-batch-untag">
                {t('batchUntag')}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={exportData} data-testid="contacts-book-batch-export">
                <Download className="h-3.5 w-3.5" />
                {t('exportSelected')}
              </Button>
            </div>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-8 gap-1 text-gray-500"
            onClick={() => setSelected(new Set())}
            data-testid="contacts-book-batch-clear"
          >
            <X className="h-3.5 w-3.5" />
            {t('clearSelection')}
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState text={t('emptyNoMatch')} data-testid="contacts-book-empty" />
      ) : (
        <>
          <Table data-testid="contacts-book-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[44px]">
                  <Checkbox checked={pageAllChecked} onCheckedChange={togglePageAll} aria-label={t('selectAllPageAria')} data-testid="contacts-book-check-all" />
                </TableHead>
                <TableHead>{t('colSource')}</TableHead>
                <TableHead>{t('colDept')}</TableHead>
                <TableHead>{t('colDisplayName')}</TableHead>
                <TableHead>{t('colEmail')}</TableHead>
                <TableHead>{t('colJobTitle')}</TableHead>
                <TableHead>{t('colTag')}</TableHead>
                <TableHead className="w-[120px]">{t('colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} data-testid={`contacts-book-row-${p.id}`}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleOne(p.id)}
                      aria-label={t('selectRowAria', { name: p.display_name || p.email })}
                      data-testid={`contacts-book-check-${p.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">{p.source_name || '-'}</TableCell>
                  <TableCell className="max-w-[180px]">
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className="block truncate text-gray-600 dark:text-gray-400">{p.department_path || '-'}</span>}
                      />
                      <TooltipContent>{p.department_path || '-'}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="font-medium text-blue-600 hover:underline"
                      onClick={() => setDetail(p)}
                      data-testid={`contacts-book-name-${p.id}`}
                    >
                      {p.display_name || p.email}
                    </button>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">{p.email}</TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">{p.job_title || '-'}</TableCell>
                  <TableCell>
                    <TagBadge tag={p.tag} data-testid={`contacts-book-tag-${p.id}`} />
                  </TableCell>
                  <TableCell>
                    {canMark ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-blue-600" data-testid={`contacts-book-mark-${p.id}`}>
                              <Tag className="h-3.5 w-3.5" />
                              {t('mark')}
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => markOne(p.id, 'executive')} data-testid="contacts-book-mark-exec">
                            {t('markExec')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => markOne(p.id, 'key_position')} data-testid="contacts-book-mark-key">
                            {t('markKey')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => markOne(p.id, 'none')} data-testid="contacts-book-mark-none">
                            {t('markUntag')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
            data-testid="contacts-book-pager"
          />
        </>
      )}

      <ContactDetailDrawer contact={detail} open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }} />

      {/* 批量标记二次确认（demo：标题按选中数与目标标记动态生成） */}
      <AlertDialog open={batchTag !== null} onOpenChange={(o) => !o && setBatchTag(null)}>
        <AlertDialogContent data-testid="contacts-book-batch-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchTag === 'none'
                ? t('batchConfirmUntag', { count: selected.size })
                : t('batchConfirmTag', { count: selected.size, tag: batchTagLabel })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('batchConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="contacts-book-batch-dialog-cancel">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-blue-600 text-white hover:bg-blue-700" onClick={applyBatch} data-testid="contacts-book-batch-dialog-confirm">
              {t('btnConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSurface>
  );
}
