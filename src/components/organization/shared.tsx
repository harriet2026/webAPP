'use client';

// 组织通讯录模块共享件 —— 视觉规范逐字段对齐 demo
// design/origin/demo/components/admin/contacts/shared.tsx 与
// components/admin/mail-routing/shared.tsx（ListToolbar/Field/SectionCard/
// EmptyState/TestResultTag）。

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ContactTag, SyncStatus } from './types';

// ---------- 同步状态徽章（数据源：正常/部分异常(N)/异常/未同步/同步中） ----------
export function SyncStatusBadge({
  status,
  abnormalCount,
  'data-testid': testId,
}: {
  status: SyncStatus | string;
  abnormalCount?: number;
  'data-testid'?: string;
}) {
  const t = useTranslations('organizationContacts');
  if (status === 'running') {
    return (
      <Badge variant="outline" className="font-normal border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400" data-testid={testId}>
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        {t('statusRunning')}
      </Badge>
    );
  }
  const map: Record<string, string> = {
    success: 'border-green-200 bg-green-50 text-green-600 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400',
    partial: 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400',
    failed: 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400',
    unsynced: 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400',
    canceled: 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400',
  };
  const labels: Record<string, string> = {
    success: t('srcStatusNormal'),
    partial: t('statusPartial'),
    failed: t('srcStatusAbnormal'),
    unsynced: t('statusUnsynced'),
    canceled: t('statusCanceled'),
  };
  const label =
    status === 'partial' && abnormalCount
      ? t('statusPartialWithCount', { count: abnormalCount })
      : labels[String(status)] ?? String(status);
  return (
    <Badge variant="outline" className={cn('font-normal', map[String(status)] ?? map.unsynced)} data-testid={testId}>
      {label}
    </Badge>
  );
}

// ---------- 自动同步状态标签（绿点开启 / 灰点关闭） ----------
export function AutoSyncBadge({ enabled }: { enabled: boolean }) {
  const t = useTranslations('organizationContacts');
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')} />
      <span className={enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
        {enabled ? t('autoSyncOn') : t('autoSyncOff')}
      </span>
    </span>
  );
}

// ---------- 人员标记徽章（高管红 / 关键岗位橙 / 无标记 -） ----------
export function TagBadge({ tag, 'data-testid': testId }: { tag: ContactTag; 'data-testid'?: string }) {
  const t = useTranslations('organizationContacts');
  if (tag === 'none' || !tag) return <span className="text-gray-400" data-testid={testId}>-</span>;
  const cls =
    tag === 'executive'
      ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400'
      : 'border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-400';
  return (
    <Badge variant="outline" className={cn('font-normal', cls)} data-testid={testId}>
      {tag === 'executive' ? t('tagExecutive') : t('tagKeyPosition')}
    </Badge>
  );
}

// ---------- 分页器（demo Pager：共 N 条 / 页码省略号 / 前往 X 页 / N 条/页） ----------
function buildPageList(page: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

export function Pager({
  total,
  page,
  pageSize,
  unit,
  onPageChange,
  onPageSizeChange,
  'data-testid': testId,
}: {
  total: number;
  page: number;
  pageSize: number;
  unit?: string;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  'data-testid'?: string;
}) {
  const t = useTranslations('organizationContacts');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [jump, setJump] = useState('');
  const pages = buildPageList(page, totalPages);

  const goJump = () => {
    const n = Number(jump);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) onPageChange(n);
    setJump('');
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm text-gray-600 dark:text-gray-400" data-testid={testId}>
      <span>{t('pagerTotal', { total: total.toLocaleString(), unit: unit ?? t('pagerUnitRecords') })}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={t('pagerPrev')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1.5 text-gray-400">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className={cn('h-8 w-8', p === page && 'bg-blue-600 hover:bg-blue-600 text-white')}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </Button>
          ),
        )}
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label={t('pagerNext')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 text-xs">{t('pagerGoto')}</span>
        <Input
          value={jump}
          onChange={(e) => setJump(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') goJump(); }}
          onBlur={goJump}
          className="h-8 w-14 text-center"
          aria-label={t('pagerGotoAria')}
        />
        <span className="text-xs">{t('pagerPage')}</span>
        <Select value={String(pageSize)} onValueChange={(v) => v && onPageSizeChange(Number(v))}>
          <SelectTrigger className="ml-1 h-8 w-[92px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>{t('pagerPerPage', { count: n })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------- 列表工具栏（搜索 + 重置筛选 + 刷新(Q4 拍板保留) + 筛选 Popover + actions） ----------
export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  onReset,
  onRefresh,
  filterCount,
  filterContent,
  actions,
  testIdPrefix,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  onReset: () => void;
  onRefresh?: () => void;
  filterCount?: number;
  filterContent?: ReactNode;
  actions?: ReactNode;
  testIdPrefix: string;
}) {
  const t = useTranslations('organizationContacts');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-64 pl-8"
          data-testid={`${testIdPrefix}-search`}
        />
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0" onClick={onReset} aria-label={t('resetFilters')} data-testid={`${testIdPrefix}-reset`}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          }
        />
        <TooltipContent>{t('resetFilters')}</TooltipContent>
      </Tooltip>
      {onRefresh && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0" onClick={onRefresh} aria-label={t('refresh')} data-testid={`${testIdPrefix}-refresh`}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            }
          />
          <TooltipContent>{t('refresh')}</TooltipContent>
        </Tooltip>
      )}
      <div className="ml-auto flex items-center gap-2">
        {filterContent && (
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" className="h-9 gap-1.5" data-testid={`${testIdPrefix}-filter`}>
                  <SlidersHorizontal className="h-4 w-4" />
                  {t('filter')}
                  {!!filterCount && filterCount > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] text-white">
                      {filterCount}
                    </span>
                  )}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-80 space-y-3" data-testid={`${testIdPrefix}-filter-popover`}>
              {filterContent}
            </PopoverContent>
          </Popover>
        )}
        {actions}
      </div>
    </div>
  );
}

// ---------- 筛选弹层里的一项（label + Select） ----------
export function FilterSelect({
  label,
  value,
  onValueChange,
  options,
  'data-testid': testId,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  'data-testid'?: string;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-gray-500">{label}</span>
      <Select value={value} onValueChange={(v) => v && onValueChange(v)}>
        <SelectTrigger className="h-9 w-full" data-testid={testId}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------- 表单区块卡 ----------
export function SectionCard({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h4>
        {desc && <p className="mt-0.5 text-xs text-gray-500">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

// ---------- 表单字段（label + 必填星 + 行内错误/hint） ----------
export function Field({
  label,
  required,
  error,
  hint,
  children,
  'data-testid': testId,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-normal text-gray-700 dark:text-gray-300">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-red-500" data-testid={testId ? `${testId}-error` : undefined}>{error}</p>}
    </div>
  );
}

// ---------- 空态 ----------
export function EmptyState({ onAdd, text, 'data-testid': testId }: { onAdd?: () => void; text?: string; 'data-testid'?: string }) {
  const t = useTranslations('organizationContacts');
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400" data-testid={testId}>
      <Inbox className="h-10 w-10" />
      <p className="text-sm">{text ?? t('emptyText')}</p>
      {onAdd && (
        <Button variant="outline" size="sm" onClick={onAdd}>
          {t('emptyAddNow')}
        </Button>
      )}
    </div>
  );
}

// ---------- 测试连接结果标签（idle 不渲染 / loading / 连通正常 / 连接失败：原因） ----------
export type TestState = 'idle' | 'loading' | 'ok' | 'fail';

export function TestResultTag({ result, failReason, 'data-testid': testId }: { result: TestState; failReason?: string; 'data-testid'?: string }) {
  const t = useTranslations('organizationContacts');
  if (result === 'idle') return null;
  if (result === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500" data-testid={testId}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('testing')}
      </span>
    );
  }
  if (result === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600" data-testid={testId}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t('testOk')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600" data-testid={testId}>
      <XCircle className="h-3.5 w-3.5" />
      {t('testFailPrefix', { reason: failReason || t('testFailTimeout') })}
    </span>
  );
}
