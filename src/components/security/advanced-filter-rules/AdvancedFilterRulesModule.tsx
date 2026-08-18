'use client';

// AdvancedFilterRulesModule.tsx — layer-1-list-view.html rewrite (F9). Owns
// the module card itself (icon + title + description + module-level Switch)
// and the rule list beneath it: toolbar (search/status/scope/reset/count/new)
// → 8-col table → front-end pagination → static condition-catalogue info
// card. `embedded` keeps the pre-rewrite page component's host-compatible
// call signature (see PolicyPipelinePage.tsx); the module card border/header are
// rendered unconditionally either way per layer-1's component ownership
// (2.2 高级过滤规则模块 owns the whole card, not just the settings body).
//
// Fixes carried over from layer-1's documented demo defects (§9 in
// index.html): D-1 (condition-type count unified to the real 54, computed
// from catalogue.ts rather than hardcoded 52/21/18/13/21), D-4 (scope filter
// actually filters — delegated to list-filter.ts's correct `includes`
// semantics), D-5 (multi-value scope rendered as one Badge per value instead
// of the concatenated `incomingoutgoinginternal` string), D-12 (pagination is
// real front-end slicing, not permanently-disabled placeholder buttons).

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock, Edit2, Filter, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { canEditSecurityModule } from '@/lib/api/security-modules';
import {
  listAdvancedRules,
  deleteAdvancedRule,
  toggleAdvancedRule,
  getModuleEnabled,
  setModuleEnabled,
  getAdvancedFieldDefinitions,
  type RuleWithExtras,
} from '@/lib/api/advanced-rules';
import type { Rule } from '@/types/unified-rules';
import { filterRules, foldKeywords } from './list-filter';
import { getRulePrimaryAction, getRuleScope } from './list-row';
import { CONDITIONS } from './catalogue';
import type { PrimaryAction } from './conflict-matrix';
import { RuleEditorDrawer } from './RuleEditorDrawer';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

type StatusFilter = 'all' | 'enabled' | 'disabled';
type ScopeFilter = 'all' | 'incoming' | 'outgoing' | 'internal';

const PAGE_SIZE_OPTIONS = [50, 100, 200];

// Same --action-* token mapping as ActionSummary.tsx / PolicyPipelinePage.tsx
// (DESIGN.md's action-semantic palette); 'none' has no badge (rendered as
// a plain "—" per layer-1's element list).
const ACTION_BADGE_CLASS: Record<Exclude<PrimaryAction, 'none'>, string> = {
  deliver: 'border-action-deliver/30 bg-action-deliver/10 text-action-deliver',
  tagDeliver: 'border-action-mark-deliver/30 bg-action-mark-deliver/10 text-action-mark-deliver',
  quarantine: 'border-action-quarantine/30 bg-action-quarantine/10 text-action-quarantine',
  review: 'border-action-review/30 bg-action-review/10 text-action-review',
  discard: 'border-action-drop/30 bg-action-drop/10 text-action-drop',
  block: 'border-action-block/30 bg-action-block/10 text-action-block',
};

// The catalogue's `security` category (22) bundles both actual security
// checks and sender-behaviour rate-limit counters. The bottom info card
// (per layer-1, four labelled groups) splits those counters out into their
// own "系统限制" group so the display matches the product's four-group
// framing while the totals stay tied to the real 54-condition catalogue
// (19 mailBasic + 13 attachment + 16 security + 6 systemLimit = 54).
const SYSTEM_LIMIT_KEYS = new Set([
  'senderIpCount15Min',
  'senderRecipientCount15Min',
  'senderMailCount15Min',
  'senderMailCountDaily',
  'senderRateLimit15',
  'recipientCount',
]);

interface ListItem extends RuleWithExtras {
  keywords: string[];
  scope: string[];
  enabled: boolean;
}

export function AdvancedFilterRulesModule({
  embedded,
  aggregateDisabled = false,
}: {
  embedded?: boolean;
  // 综合策略聚合开关关闭时保留子项自身配置，但禁止在此修改；重新开启后
  // 仍显示并恢复此前的高级规则开关和值。
  aggregateDisabled?: boolean;
}) {
  const t = useTranslations('advancedRulesFeature');
  const apiErrorMessage = useApiErrorMessage();
  const tc = useTranslations('common');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { user, selectedTenantId } = useAuth();
  const { capabilities, viewer } = useProductForm();
  const moduleEditable = canEditSecurityModule({
    page: 'advanced_rules',
    role: user?.role,
    viewer,
    multiTenant: capabilities?.multiTenant ?? true,
    selectedTenantId,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const rulesQueryKey = ['advanced-rules', 'list'];

  const { data: rules, isLoading } = useQuery({
    queryKey: rulesQueryKey,
    queryFn: () => listAdvancedRules(apiRequest),
  });

  const { data: fieldDefsResp } = useQuery({
    queryKey: ['advanced-rules', 'field-defs'],
    queryFn: () => getAdvancedFieldDefinitions(apiRequest),
  });
  const fieldDefs = fieldDefsResp?.fields ?? {};

  const { data: moduleEnabledResp } = useQuery({
    queryKey: ['advanced-rules', 'enabled'],
    queryFn: () => getModuleEnabled(apiRequest),
  });
  const moduleEnabled = moduleEnabledResp?.enabled ?? true;

  const setEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) => setModuleEnabled(enabled, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advanced-rules', 'enabled'] });
      toast.success(tc('updateSuccess'));
    },
    onError: () => toast.error(tc('error')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdvancedRule(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesQueryKey });
      toast.success(tc('deleteSuccess'));
    },
    onError: (error: Error) => toast.error(apiErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => toggleAdvancedRule(id, isActive, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rulesQueryKey });
      toast.success(tc('updateSuccess'));
    },
    onError: (error: Error) => toast.error(apiErrorMessage(error)),
  });

  const handleReset = () => {
    setSearch('');
    setStatusFilter('all');
    setScopeFilter('all');
    setCurrentPage(0);
  };

  const handleNew = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleEditorSaved = () => {
    // RuleEditorDrawer already toasts + closes itself on success; this
    // callback only owns list-side bookkeeping.
    setEditingRule(null);
    queryClient.invalidateQueries({ queryKey: rulesQueryKey });
  };

  const listItems: ListItem[] = useMemo(
    () =>
      (rules ?? []).map((r) => ({
        ...r,
        keywords: r.keywords ?? [],
        scope: getRuleScope(r),
        enabled: r.is_active,
      })),
    [rules],
  );

  const filteredRules = useMemo(
    () => filterRules(listItems, search, statusFilter, scopeFilter),
    [listItems, search, statusFilter, scopeFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRules.length / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const pagedRules = useMemo(() => {
    const start = safePage * pageSize;
    return filteredRules.slice(start, start + pageSize);
  }, [filteredRules, safePage, pageSize]);

  const scopeLabel = (s: string) =>
    s === 'incoming' ? t('scopeIncoming') : s === 'outgoing' ? t('scopeOutgoing') : s === 'internal' ? t('scopeInternal') : s;

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale), [locale]);

  const infoGroups = useMemo(() => {
    const mailBasic = CONDITIONS.filter((c) => c.category === 'mailBasic');
    const attachment = CONDITIONS.filter((c) => c.category === 'attachment');
    const systemLimit = CONDITIONS.filter((c) => SYSTEM_LIMIT_KEYS.has(c.key));
    const security = CONDITIONS.filter((c) => c.category === 'security' && !SYSTEM_LIMIT_KEYS.has(c.key));
    return [
      { labelKey: 'infoCard.groupMailBasic' as const, items: mailBasic },
      { labelKey: 'infoCard.groupAttachment' as const, items: attachment },
      { labelKey: 'infoCard.groupSecurity' as const, items: security },
      { labelKey: 'infoCard.groupSystemLimit' as const, items: systemLimit },
    ];
  }, []);

  const content = (
    <div className="rounded-lg border bg-card p-4" data-testid="advanced-rules-module-card">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Filter className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <div className="text-sm font-semibold">{t('title')}</div>
            <div className="text-xs text-muted-foreground">{t('moduleDescription', { count: CONDITIONS.length })}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{moduleEnabled ? t('enabled') : t('disabled')}</span>
          <Switch
            checked={moduleEnabled}
            onCheckedChange={(v) => setEnabledMutation.mutate(v)}
            disabled={aggregateDisabled || !moduleEditable || setEnabledMutation.isPending}
            data-testid="module-enabled-switch"
          />
        </div>
      </div>

      <div className={cn((!moduleEnabled || aggregateDisabled) && 'pointer-events-none opacity-50')}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] max-w-[300px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="rules-search-input"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(0);
              }}
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StatusFilter);
              setCurrentPage(0);
            }}
          >
            <SelectTrigger data-testid="rules-status-filter" className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatus')}</SelectItem>
              <SelectItem value="enabled">{t('enabled')}</SelectItem>
              <SelectItem value="disabled">{t('disabled')}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={scopeFilter}
            onValueChange={(v) => {
              setScopeFilter(v as ScopeFilter);
              setCurrentPage(0);
            }}
          >
            <SelectTrigger data-testid="rules-scope-filter" className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allScope')}</SelectItem>
              <SelectItem value="incoming">{t('scopeIncoming')}</SelectItem>
              <SelectItem value="outgoing">{t('scopeOutgoing')}</SelectItem>
              <SelectItem value="internal">{t('scopeInternal')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleReset} data-testid="rules-reset-btn">
            <RotateCcw className="mr-1 h-4 w-4" />
            {t('reset')}
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground" data-testid="rules-count">
              {t('recordsCount', { count: filteredRules.length })}
            </span>
            <Button size="sm" onClick={handleNew} data-testid="rules-new-btn">
              <Plus className="mr-1 h-4 w-4" />
              {t('newRule')}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="w-[70px]">{tc('id')}</TableHead>
                <TableHead className="min-w-[160px]">{t('name')}</TableHead>
                <TableHead className="min-w-[180px]">{t('keywords')}</TableHead>
                <TableHead className="w-[140px]">{t('scope')}</TableHead>
                <TableHead className="w-[90px]">{t('priority')}</TableHead>
                <TableHead className="w-[100px]">{t('status')}</TableHead>
                <TableHead className="w-[110px]">{t('action')}</TableHead>
                <TableHead className="w-[130px]">{t('expiresAt')}</TableHead>
                <TableHead className="w-[150px] text-right">{t('operations')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    {tc('loading')}
                  </TableCell>
                </TableRow>
              ) : pagedRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    {tc('noData')}
                  </TableCell>
                </TableRow>
              ) : (
                pagedRules.map((rule) => {
                  const { visible, more } = foldKeywords(rule.keywords ?? []);
                  const action = getRulePrimaryAction(rule);
                  const expiry = rule.valid_until ? dateFormatter.format(new Date(rule.valid_until)) : null;

                  return (
                      <TableRow key={rule.id} data-testid={`rule-row-${rule.id}`}>
                        <TableCell className="font-mono text-sm">{rule.id}</TableCell>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>
                        {visible.length === 0 && more === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {visible.map((kw, idx) => (
                              <Badge key={`${kw}-${idx}`} variant="secondary" className="text-xs">
                                {kw}
                              </Badge>
                            ))}
                            {more > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                +{more}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {rule.scope.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {rule.scope.map((s) => (
                              <Badge key={s} variant="outline" className="text-xs">
                                {scopeLabel(s)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`rule-row-priority-${rule.id}`}>
                        {rule.priority}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          data-testid={`rule-row-toggle-${rule.id}`}
                          className={cn(
                            'text-xs',
                            rule.is_active
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'border-border bg-muted/40 text-muted-foreground',
                          )}
                        >
                          {rule.is_active ? t('enabled') : t('disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {action === 'none' ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="outline" className={cn('text-xs', ACTION_BADGE_CLASS[action])}>
                            {t(`primaryActions.${action}` as never)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {expiry === null ? (
                          <span className="text-emerald-600 dark:text-emerald-400">{t('permanent')}</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {expiry}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(rule)}
                            title={t('edit')}
                            data-testid={`rule-row-edit-${rule.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.is_active })}
                            data-testid={`rule-row-toggle-btn-${rule.id}`}
                          >
                            {rule.is_active ? t('disabled') : t('enabled')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(rule.id)}
                            className="text-destructive"
                            title={t('delete')}
                            data-testid={`rule-row-delete-${rule.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {filteredRules.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setCurrentPage(0);
                }}
              >
                <SelectTrigger data-testid="rules-page-size" aria-label={t('perPageLabel')} className="h-8 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>{t('perPageLabel')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                data-testid="rules-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
                {tc('prev')}
              </Button>
              <span className="text-sm text-muted-foreground" data-testid="rules-page-info">
                {safePage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                data-testid="rules-next-page"
              >
                {tc('next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3.5 rounded-md border bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground" data-testid="rules-info-card">
          {t('infoCard.title', { count: CONDITIONS.length })}{' '}
          {infoGroups.map((group, idx) => (
            <span key={group.labelKey}>
              <b className="text-foreground">{t(group.labelKey)}:</b>{' '}
              {group.items.map((c) => t(`v3Conditions.conditions.${c.key}` as never)).join(' · ')}
              {idx < infoGroups.length - 1 ? '　' : ''}
            </span>
          ))}
        </div>
      </div>

      <RuleEditorDrawer
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editingRule}
        fieldDefs={fieldDefs}
        onSaved={handleEditorSaved}
      />
    </div>
  );

  return embedded ? content : <div className="p-6">{content}</div>;
}
