'use client';

import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { useTranslations, useLocale, useFormatter, useNow } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Download, Trash2, CheckCircle, Loader2, RotateCcw, Eye, Settings, Filter, X, ArrowUpDown, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import { resolveActionBadges, actionToVariant } from '@/lib/email-log-action';
import type { ApiRequestFn } from '@/lib/api/client';
import { DISPLAY_STATUSES, type DisposalMailItem, type DisplayStatus } from '@/types/email-disposal';
import { type DisposalLang } from './lib/disposal-basis-config';
import { DisplayStatusBadges, RecipientStatusBadges } from './components/recipient-status-badges';
import { DisposalBasisCell } from './components/disposal-basis-cell';
import { mailTypeLabelKey, correctionSourceLabelKey } from './lib/detail-helpers';

interface MailListTableProps {
  items: DisposalMailItem[];
  loading: boolean;
  total: number;
  selectedIds: Set<number>;
  onSelectionChange: (ids: Set<number>) => void;
  onItemClick: (id: number) => void;
  onBatchAction: (action: 'find_similar' | 'release' | 'delete' | 'export' | 'recall') => void;
  onFindSimilar?: (id: number) => void;
  aiEnabled?: boolean;
  similarMode?: boolean;
  headerFilters: TableHeaderFilters;
  onHeaderFiltersChange: (filters: TableHeaderFilters) => void;
  timeSort: TimeSortOrder;
  onTimeSortChange: (sort: TimeSortOrder) => void;
  /** 全量筛选导出时的 loading 状态 */
  exportLoading?: boolean;
  /** Active action filters, used to explain why a mixed row matched. */
  activeExecutionActions?: string[];
  /** Active status filters, used to select the matching mixed status badge. */
  activeDisplayStatuses?: string[];
  /** Active disposal-basis filters; matching groups are displayed first. */
  activeDisposalPolicyKeys?: string[];
  activeDisposalRuleIds?: string[];
  /** Tenant-scoped API client used for lazy full-basis loading. */
  requestFn: ApiRequestFn;
}

export type TimeSortOrder = 'none' | 'asc' | 'desc';

export interface TableHeaderFilters {
  directions: string[];
  emailTypes: string[];
  statuses: DisplayStatus[];
}

// ACTION_VARIANTS is no longer used for rendering; actionToVariant() from
// email-log-action.ts is used directly so mixed actions expand to per-action badges.

// GT-11580: columns the operator can show/hide via the toolbar 设置 button.
// The leading select checkbox and the trailing operations column are
// structural and always rendered.
const TOGGLEABLE_COLUMNS = [
  'time', 'direction', 'subject', 'senderIp', 'senderRecipient',
  'disposalBasis', 'mailType', 'similarity', 'action', 'status',
] as const;
type ToggleableColumn = (typeof TOGGLEABLE_COLUMNS)[number];
const COLUMN_PREF_KEY = 'osg.disposal.hiddenColumns';
const DENSITY_PREF_KEY = 'osg.disposal.density';
type TableDensity = 'comfortable' | 'compact';
const DIRECTION_BADGE_CLASSES: Record<string, string> = {
  incoming: 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400',
  outgoing: 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400',
  internal: 'border-border text-muted-foreground',
};
const NEUTRAL_DIRECTION_BADGE_CLASS = 'border-border text-muted-foreground';

const subscribeToClientEnvironment = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function MailListTable({
  items,
  loading,
  total,
  selectedIds,
  onSelectionChange,
  onItemClick,
  onBatchAction,
  onFindSimilar,
  aiEnabled = true,
  similarMode = false,
  headerFilters,
  onHeaderFiltersChange,
  timeSort,
  onTimeSortChange,
  exportLoading = false,
  activeExecutionActions,
  activeDisplayStatuses,
  activeDisposalPolicyKeys,
  activeDisposalRuleIds,
  requestFn,
}: MailListTableProps) {
  const t = useTranslations('emailDisposal');
  const rawLocale = useLocale();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const mounted = useSyncExternalStore(
    subscribeToClientEnvironment,
    getClientSnapshot,
    getServerSnapshot,
  );
  // Map next-intl locale to one of the disposal-basis dictionary's supported
  // langs; unknown locales fall back to zh (the dictionary's primary language).
  const disposalLang: DisposalLang = (['zh', 'en', 'th', 'ru'] as const).includes(rawLocale as DisposalLang)
    ? (rawLocale as DisposalLang)
    : 'zh';

  // GT-11579: localize enum badges (direction / action) with safe fallback to
  // the raw value when the i18n key is missing.
  // GT-11917: next-intl does NOT throw on a missing key — it logs
  // MISSING_MESSAGE and renders the key path itself. A try/catch therefore
  // never fires; probe with t.has() instead.
  const localizeEnum = useCallback((key: string, fallback: string) => {
    return t.has(key as never) ? t(key as never) : fallback;
  }, [t]);

  const formatRelativeTime = useCallback((timestamp: string | undefined | null) => {
    if (!timestamp) return formatDate(timestamp);
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime()) || !mounted) return formatDate(timestamp);
    return format.relativeTime(date, now);
  }, [format, mounted, now]);

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const hasSelection = selectedIds.size > 0;
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  // GT-12782 Task 4：门禁改读后端下发的展示状态列表——「列表包含待处置/已投递
  // 类状态」即可用。mixed 邮件因此按包含语义参与门禁（内部含隔离收件人的
  // 多投信可批量放行、含已投递收件人的可召回），与筛选同一套语义，刻意设计。
  // 防御空值：列表理应恒存在（后端三条读路径统一下发），但陈旧 mock/接口缺失
  // 不应把整页打崩——按空列表处理（门禁禁用、状态列显示 '—'）。
  const listOf = (item: DisposalMailItem) => item.displayStatuses ?? [];
  const listContains = (item: DisposalMailItem, statuses: DisplayStatus[]) =>
    listOf(item).some((entry) => statuses.includes(entry.status));
  const canRelease = hasSelection && selectedItems.every((item) =>
    listContains(item, ['quarantine_pending', 'sideline_pending', 'audit_pending']),
  );
  const canRecall = hasSelection && selectedIds.size <= 10 && selectedItems.every((item) =>
    listContains(item, ['delivered']),
  );

  // GT-11580: per-browser column show/hide preference. Initialised empty (all
  // visible) so SSR and the first client render agree, then hydrated from
  // localStorage in an effect to avoid a hydration mismatch.
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(COLUMN_PREF_KEY);
        if (raw) {
          setHiddenColumns(new Set(JSON.parse(raw) as string[]));
        } else {
          // 默认隐藏"处置依据"列，首次访问时生效
          const defaults = new Set(['disposalBasis']);
          setHiddenColumns(defaults);
          localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify([...defaults]));
        }
      } catch {
        /* ignore malformed preference */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const toggleColumn = useCallback((key: ToggleableColumn) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore persistence failure */
      }
      return next;
    });
  }, []);
  const isColVisible = useCallback(
    (key: ToggleableColumn) => !hiddenColumns.has(key),
    [hiddenColumns],
  );

  // Density is a browser-only display preference. Hydrate it after mount so
  // the server render and first client render both use the comfortable mode.
  const [density, setDensity] = useState<TableDensity>('comfortable');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedDensity = localStorage.getItem(DENSITY_PREF_KEY);
        if (storedDensity === 'comfortable' || storedDensity === 'compact') {
          setDensity(storedDensity);
        }
      } catch {
        /* ignore unavailable storage */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const toggleDensity = useCallback(() => {
    setDensity((currentDensity) => {
      const nextDensity: TableDensity = currentDensity === 'compact' ? 'comfortable' : 'compact';
      try {
        localStorage.setItem(DENSITY_PREF_KEY, nextDensity);
      } catch {
        /* ignore persistence failure */
      }
      return nextDensity;
    });
  }, []);
  const isCompact = density === 'compact';
  const headDensityClass = isCompact ? 'h-8' : undefined;
  const cellDensityClass = isCompact ? 'py-1.5' : undefined;

  const directionOptions = ['incoming', 'outgoing', 'internal'];
  const emailTypeOptions = ['normal', 'subscription', 'advertising', 'spam', 'harmful', 'phishing', 'account_compromised', 'suspicious', 'spoofing', 'virus', 'sensitive'];
  const statusOptions = DISPLAY_STATUSES;

  const updateHeaderFilter = useCallback((key: keyof TableHeaderFilters, option: string, checked: boolean) => {
    const current = headerFilters[key] as string[];
    const next = checked ? [...new Set([...current, option])] : current.filter((value) => value !== option);
    onHeaderFiltersChange({ ...headerFilters, [key]: next });
  }, [headerFilters, onHeaderFiltersChange]);

  const headerFilter = useCallback((
    label: string,
    key: keyof TableHeaderFilters,
    options: readonly string[],
    optionLabel: (option: string) => string,
  ) => {
    const selected = headerFilters[key] as string[];
    return (
      <Popover>
        <PopoverTrigger
          data-testid={`disposal-table-filter-${key}`}
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn('h-7 gap-1 px-1 text-xs font-medium', selected.length > 0 && 'text-primary')}
            />
          }
        >
          {label}<Filter className="h-3 w-3" />
          {selected.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{selected.length}</span>}
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium">{label}</span>
            {selected.length > 0 && (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto p-0 text-xs"
                onClick={() => onHeaderFiltersChange({ ...headerFilters, [key]: [] })}
              >
                {t('table.clearFilter')}
              </Button>
            )}
          </div>
          <div className="max-h-64 space-y-1 overflow-auto">
            {options.map((option) => (
              <InteractiveSurface
                key={option}
                asChild
                variant="control"
                className="flex items-center gap-2 rounded px-2 py-1 text-xs data-[hovered=true]:bg-accent/70 focus-within:ring-2 focus-within:ring-ring/60"
              >
                <label>
                  <Checkbox checked={selected.includes(option)} onCheckedChange={(checked) => updateHeaderFilter(key, option, checked === true)} />
                  {optionLabel(option)}
                </label>
              </InteractiveSurface>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }, [headerFilters, onHeaderFiltersChange, t, updateHeaderFilter]);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(items.map((i) => i.id)));
    }
  }, [allSelected, items, onSelectionChange]);

  const toggleOne = useCallback(
    (id: number) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  // GT-11580: the batch toolbar is a permanent fixture (共 N 条 count, batch
  // actions disabled until a valid selection, and the column-settings menu). It
  // is rendered in every branch below -- including loading / empty -- so the
  // operator never loses the toolbar just because the current filter matches no
  // mail. (GT-12164: 默认筛选已改为“全部”，不再默认隔离+旁路。)
  const toolbar = (
    <div data-testid="disposal-batch-toolbar" className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-sm text-muted-foreground">{t('table.total', { n: total })}</span>
      {hasSelection && (
        <span className="text-sm font-medium text-primary">
          {t('batch.crossPageSelected', { n: selectedIds.size })}
        </span>
      )}
      <div className="flex gap-2 ml-auto items-center">
        {aiEnabled && (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Button data-testid="disposal-batch-find-similar" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onBatchAction('find_similar')} disabled={!hasSelection || selectedIds.size > 10}>
                <Search className="mr-1 h-3 w-3" />
                {t('batch.findSimilar')}
              </Button>
            </TooltipTrigger>
            {selectedIds.size > 10 && (
              <TooltipContent>{t('batch.similarLimit')}</TooltipContent>
            )}
          </Tooltip>
        )}
        <Button data-testid="disposal-batch-release" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onBatchAction('release')} disabled={!canRelease}>
          <CheckCircle className="mr-1 h-3 w-3" />
          {t('batch.release')}
        </Button>
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Button data-testid="disposal-batch-recall" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onBatchAction('recall')} disabled={!canRecall}>
              <RotateCcw className="mr-1 h-3 w-3" />
              {t('batch.recall')}
            </Button>
          </TooltipTrigger>
          {selectedIds.size > 10 && (
            <TooltipContent>{t('batch.recallLimit')}</TooltipContent>
          )}
        </Tooltip>
        <Button data-testid="disposal-batch-delete" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onBatchAction('delete')} disabled={!hasSelection}>
          <Trash2 className="mr-1 h-3 w-3" />
          {t('batch.delete')}
        </Button>
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Button
              data-testid="disposal-batch-export"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onBatchAction('export')}
              disabled={exportLoading}
            >
              {exportLoading
                ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                : <Download className="mr-1 h-3 w-3" />}
              {hasSelection
                ? t('batch.exportSelected', { n: selectedIds.size })
                : t('batch.exportAll', { n: total })}
            </Button>
          </TooltipTrigger>
          {!hasSelection && (
            <TooltipContent>{t('batch.exportAllFiltered')}</TooltipContent>
          )}
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="h-7 text-xs" data-testid="disposal-column-settings">
                <Settings className="mr-1 h-3 w-3" />
                {t('table.settings')}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-[180px]">
            {/* GroupLabel must live inside a Group (Base UI MenuGroupContext). */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('table.columnSettings')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {TOGGLEABLE_COLUMNS.filter((key) => key !== 'similarity' || (aiEnabled && similarMode)).map((key) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={isColVisible(key)}
                  onCheckedChange={() => toggleColumn(key)}
                  onSelect={(e) => e.preventDefault()}
                  data-testid={`disposal-column-toggle-${key}`}
                >
                  {t(`table.${key}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('table.densitySettings')}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={isCompact}
                onCheckedChange={toggleDensity}
                onSelect={(event) => event.preventDefault()}
                data-testid="disposal-density-toggle"
              >
                {t('table.compactDensity')}
              </DropdownMenuCheckboxItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const colHead = (key: ToggleableColumn) => {
    if (!isColVisible(key)) return null;
    if (key === 'time') {
      const nextSort: TimeSortOrder = timeSort === 'none' ? 'asc' : timeSort === 'asc' ? 'desc' : 'none';
      const SortIcon = timeSort === 'asc' ? ArrowUp : timeSort === 'desc' ? ArrowDown : ArrowUpDown;
      return (
        <TableHead className={cn('text-xs', headDensityClass)} data-testid="disposal-column-header-time">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-1 text-xs font-medium"
            data-testid="disposal-time-sort"
            onClick={() => onTimeSortChange(nextSort)}
          >
            {t('table.time')}<SortIcon className="h-3.5 w-3.5" />
          </Button>
        </TableHead>
      );
    }
    if (key === 'direction') return <TableHead className={cn('text-xs', headDensityClass)} data-testid="disposal-column-header-direction">{headerFilter(t('table.direction'), 'directions', directionOptions, (option) => localizeEnum(`filters.${option}`, option))}</TableHead>;
    if (key === 'mailType') return <TableHead className={cn('text-xs', headDensityClass)} data-testid="disposal-column-header-mailType">{headerFilter(t('table.mailType'), 'emailTypes', emailTypeOptions, (option) => t(`filters.mailTypes.${option}`))}</TableHead>;
    if (key === 'status') return <TableHead className={cn('text-xs', headDensityClass)} data-testid="disposal-column-header-status">{headerFilter(t('table.status'), 'statuses', statusOptions, (option) => t(`filters.statuses.${option}`))}</TableHead>;
    return <TableHead className={cn('text-xs', headDensityClass)} data-testid={`disposal-column-header-${key}`}>{t(`table.${key}`)}</TableHead>;
  };

  // colSpan for the loading / empty message row: 1 select column + visible
  // data columns + 1 operations column.
  const visibleColSpan =
    2 + TOGGLEABLE_COLUMNS.filter((key) => (key !== 'similarity' || (aiEnabled && similarMode)) && isColVisible(key)).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {toolbar}
        <div className="rounded-lg border" data-testid="disposal-mail-table">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className={cn('sticky left-0 z-30 w-10 min-w-[40px] max-w-[40px] p-0 bg-card border-r', headDensityClass)}>
                  <div className="flex items-center justify-center h-full w-10">
                    <Checkbox checked={false} disabled aria-label="Select all" />
                  </div>
                </TableHead>
                {colHead('time')}
                {colHead('direction')}
                {colHead('subject')}
                {colHead('senderIp')}
                {colHead('senderRecipient')}
                {colHead('disposalBasis')}
                {colHead('mailType')}
                {aiEnabled && similarMode && colHead('similarity')}
                {colHead('action')}
                {colHead('status')}
                <TableHead className={cn('sticky right-0 z-20 min-w-20 border-l bg-card text-xs', headDensityClass)}>{t('table.operations')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={visibleColSpan} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin inline" />
                  {t('table.loading')}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {toolbar}
        <div className="rounded-lg border" data-testid="disposal-mail-table">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className={cn('sticky left-0 z-30 w-10 min-w-[40px] max-w-[40px] p-0 bg-card border-r', headDensityClass)}>
                  <div className="flex items-center justify-center h-full w-10">
                    <Checkbox checked={false} disabled aria-label="Select all" />
                  </div>
                </TableHead>
                {colHead('time')}
                {colHead('direction')}
                {colHead('subject')}
                {colHead('senderIp')}
                {colHead('senderRecipient')}
                {colHead('disposalBasis')}
                {colHead('mailType')}
                {aiEnabled && similarMode && colHead('similarity')}
                {colHead('action')}
                {colHead('status')}
                <TableHead className={cn('sticky right-0 z-20 min-w-20 border-l bg-card text-xs', headDensityClass)}>{t('table.operations')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={visibleColSpan} className="py-12 text-center text-muted-foreground">
                  {t('table.empty')}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toolbar}

      {(headerFilters.directions.length > 0 || headerFilters.emailTypes.length > 0 || headerFilters.statuses.length > 0) && (
        <div data-testid="disposal-table-filter-chips" className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('table.headerFilters')}:</span>
          {headerFilters.directions.map((value) => {
            const label = localizeEnum(`filters.${value}`, value);
            return (
              <Badge key={`direction-${value}`} variant="outline" className="gap-1 border-border bg-muted/50 text-foreground">
                {label}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-mr-1 size-5 rounded-full"
                  aria-label={`${t('table.clearFilter')}: ${label}`}
                  onClick={() => updateHeaderFilter('directions', value, false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
          {headerFilters.emailTypes.map((value) => {
            const label = t(`filters.mailTypes.${value}`);
            return (
              <Badge key={`type-${value}`} variant="outline" className="gap-1 border-border bg-muted/50 text-foreground">
                {label}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-mr-1 size-5 rounded-full"
                  aria-label={`${t('table.clearFilter')}: ${label}`}
                  onClick={() => updateHeaderFilter('emailTypes', value, false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
          {headerFilters.statuses.map((value) => {
            const label = t(`filters.statuses.${value}`);
            return (
              <Badge key={`status-${value}`} variant="outline" className="gap-1 border-border bg-muted/50 text-foreground">
                {label}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-mr-1 size-5 rounded-full"
                  aria-label={`${t('table.clearFilter')}: ${label}`}
                  onClick={() => updateHeaderFilter('statuses', value, false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto p-0"
            onClick={() => onHeaderFiltersChange({ directions: [], emailTypes: [], statuses: [] })}
          >
            {t('table.clearFilter')}
          </Button>
        </div>
      )}

      {/* GT-12423: min-w 使 1024px 视口下产生横向滚动（原型行为，配合
          sticky 操作列），800px 在 ≥1280 视口（容器 ≥868px）不触发滚动 */}
      <div className="rounded-lg border" data-testid="disposal-mail-table">
        <Table className="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead
                className={cn('sticky left-0 z-30 w-10 min-w-[40px] max-w-[40px] p-0 bg-card border-r', headDensityClass)}
                data-testid="disposal-select-column"
              >
                <div className="flex items-center justify-center h-full w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </div>
              </TableHead>
              {colHead('time')}
              {colHead('direction')}
              {colHead('subject')}
              {colHead('senderIp')}
              {colHead('senderRecipient')}
              {colHead('disposalBasis')}
              {colHead('mailType')}
              {aiEnabled && similarMode && colHead('similarity')}
              {colHead('action')}
              {colHead('status')}
              <TableHead className={cn('sticky right-0 z-20 min-w-20 border-l bg-card text-xs', headDensityClass)} data-testid="disposal-operations-column">{t('table.operations')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                interactive
                data-state={selectedIds.has(item.id) ? 'selected' : undefined}
                data-testid={`disposal-mail-row-${item.id}`}
                className={cn(
                  'group',
                  selectedIds.has(item.id) && 'bg-primary/5 data-[state=selected]:data-[hovered=true]:bg-primary/10',
                )}
                onClick={() => {
                  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
                  if (sel && sel.toString().length > 0) return;
                  onItemClick(item.id);
                }}
              >
                <TableCell
                  data-testid={`disposal-cell-${item.id}-select`}
                  className={cn(
                    'sticky left-0 z-10 w-10 min-w-[40px] max-w-[40px] p-0 border-r bg-card transition-[background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))] group-data-[hovered=true]:bg-[color-mix(in_srgb,var(--muted)_45%,var(--card))] motion-reduce:transition-none',
                    selectedIds.has(item.id) && 'bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))] group-data-[hovered=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]',
                    cellDensityClass,
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center h-full w-10">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleOne(item.id)}
                      aria-label={`Select email ${item.id}`}
                    />
                  </div>
                </TableCell>
                {isColVisible('time') && (
                <TableCell className={cn('text-xs whitespace-nowrap', cellDensityClass)} data-testid={`disposal-cell-${item.id}-time`}>
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-default" />}>
                      {formatRelativeTime(item.timestamp)}
                    </TooltipTrigger>
                    <TooltipContent>{formatDate(item.timestamp)}</TooltipContent>
                  </Tooltip>
                </TableCell>
                )}
                {isColVisible('direction') && (
                <TableCell className={cn('text-xs', cellDensityClass)} data-testid={`disposal-cell-${item.id}-direction`}>
                  <Badge
                    variant="outline"
                    className={cn(
                      'h-5 px-1.5 py-0 text-[10px] font-normal',
                      DIRECTION_BADGE_CLASSES[item.direction] ?? NEUTRAL_DIRECTION_BADGE_CLASS,
                    )}
                  >
                    {localizeEnum(`filters.${item.direction}` as const, item.direction)}
                  </Badge>
                </TableCell>
                )}
                {isColVisible('subject') && (
                <TableCell className={cn('text-xs max-w-[300px] truncate', cellDensityClass)} data-testid={`disposal-cell-${item.id}-subject`}>
                  {item.subject}
                </TableCell>
                )}
                {isColVisible('senderIp') && (
                <TableCell className={cn('text-xs max-w-[160px] truncate font-mono', cellDensityClass)} data-testid={`disposal-cell-${item.id}-senderIp`}>
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-default" />}>{item.clientIp || '—'}</TooltipTrigger>
                    <TooltipContent className="max-w-md text-xs">{item.clientIp || '—'}</TooltipContent>
                  </Tooltip>
                </TableCell>
                )}
                {isColVisible('senderRecipient') && (
                <TableCell className={cn('text-xs max-w-[320px] truncate', cellDensityClass)} data-testid={`disposal-cell-${item.id}-senderRecipient`}>
                  {(() => {
                    const recipients = (item.recipientList ?? (item.recipient ? [item.recipient] : [])).join(', ') || '—';
                    const full = `${item.sender} → ${recipients}`;
                    return (
                      <Tooltip>
                        <TooltipTrigger render={<span className="inline-flex items-center gap-1 cursor-default" />}>
                          <span className="truncate">{item.sender}</span>
                          <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="truncate">{recipients}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md text-xs">{full}</TooltipContent>
                      </Tooltip>
                    );
                  })()}
                </TableCell>
                )}
                {isColVisible('disposalBasis') && (
                <TableCell className={cn('text-xs max-w-[280px] truncate', cellDensityClass)} data-testid={`disposal-cell-${item.id}-disposalBasis`}>
                  <DisposalBasisCell
                    mailLogId={item.id}
                    basis={item.disposalBasis}
                    groups={item.disposalBasisGroups}
                    reason={item.reason}
                    lang={disposalLang}
                    requestFn={requestFn}
                    highlightPolicyKeys={activeDisposalPolicyKeys}
                    highlightRuleIds={activeDisposalRuleIds}
                  />
                </TableCell>
                )}
                {isColVisible('mailType') && (
                <TableCell className={cn('text-xs whitespace-nowrap', cellDensityClass)} data-testid={`disposal-cell-${item.id}-mailType`}>
                  {item.emailType ? (
                    <span className="inline-flex items-center gap-1">
                      <span>{t(mailTypeLabelKey(item.emailType))}</span>
                      {item.emailTypeOverridden && (
                        <Tooltip>
                          <TooltipTrigger render={<span />}>
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-green-500 text-green-600">
                              {t('table.corrected')}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md text-xs">
                            {item.emailTypeOriginal && (
                              <span>{t('table.correctedTooltip', {
                                original: t(mailTypeLabelKey(item.emailTypeOriginal)),
                                current: t(mailTypeLabelKey(item.emailType)),
                                source: t(correctionSourceLabelKey(item.correctionSource)),
                              })}</span>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  ) : '—'}
                </TableCell>
                )}
                {aiEnabled && similarMode && isColVisible('similarity') && (
                  <TableCell className={cn('text-xs whitespace-nowrap', cellDensityClass)} data-testid={`disposal-cell-${item.id}-similarity`}>
                    {item.similarity != null ? `${item.similarity}%` : '—'}
                  </TableCell>
                )}
                {isColVisible('action') && (
                <TableCell className={cn('text-xs', cellDensityClass)} data-testid={`disposal-cell-${item.id}-action`}>
                  {/* mixed + 有逐收件人明细时展示一个主要动作 Badge，完整明细放在 tooltip；
                      否则走原 badge 路径（单一动作展开）。 */}
                  {item.action === 'mixed' && item.recipientDispositions && item.recipientDispositions.length > 0 ? (
                    <RecipientStatusBadges
                      dispositions={item.recipientDispositions}
                      highlightKeys={activeExecutionActions}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {(() => {
                        const { badges, remainder } = resolveActionBadges(item.action, item.finalActionRule);
                        return (
                          <>
                            {badges.map(({ action }) => (
                              <Badge key={action} variant={actionToVariant(action)}>
                                {localizeEnum(`filters.actions.${action}` as const, action)}
                              </Badge>
                            ))}
                            {remainder > 0 && (
                              <span className="text-[10px] text-muted-foreground">+{remainder}</span>
                            )}
                        </>
                      );
                    })()}
                    </div>
                  )}
                </TableCell>
                )}
                {isColVisible('status') && (
                <TableCell className={cn('text-xs', cellDensityClass)} data-testid={`disposal-cell-${item.id}-status`}>
                  {/* 状态列无条件消费后端权威 display_statuses。逐收件人明细只负责
                      “执行动作”列的 tooltip，不能在 mixed 分支重新推导状态；否则
                      召回后会出现筛选命中 recall_success、列表仍显示投递/隔离态的
                      双真源。单元素 → 单徽章，多元素 → 主要徽章 + hover 覆盖数明细。 */}
                  {listOf(item).length === 0 ? '—' : (
                    <DisplayStatusBadges
                      entries={listOf(item)}
                      highlightKeys={activeDisplayStatuses}
                    />
                  )}
                </TableCell>
                )}
                <TableCell
                  data-testid={`disposal-cell-${item.id}-operations`}
                  className={cn(
                    'sticky right-0 z-10 min-w-20 border-l bg-card text-xs transition-[background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))] group-data-[hovered=true]:bg-[color-mix(in_srgb,var(--muted)_45%,var(--card))] motion-reduce:transition-none',
                    selectedIds.has(item.id) && 'bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))] group-data-[hovered=true]:bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]',
                    cellDensityClass,
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            data-testid={`disposal-view-${item.id}`}
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t('table.view')}
                            className="text-blue-600 data-[hovered=true]:bg-muted/65 data-[hovered=true]:text-blue-700"
                            onClick={() => onItemClick(item.id)}
                          >
                            <Eye />
                          </Button>
                        }
                      />
                      <TooltipContent>{t('table.view')}</TooltipContent>
                    </Tooltip>
                    {aiEnabled && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              data-testid={`disposal-find-similar-${item.id}`}
                              variant="ghost"
                              size="icon-xs"
                              aria-label={t('table.findSimilar')}
                              className="text-blue-600 data-[hovered=true]:bg-muted/65 data-[hovered=true]:text-blue-700"
                              onClick={() => onFindSimilar?.(item.id)}
                            >
                              <Search />
                            </Button>
                          }
                        />
                        <TooltipContent>{t('table.findSimilarTooltip')}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
