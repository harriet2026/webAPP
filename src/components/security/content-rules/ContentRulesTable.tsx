'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Copy,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/shared/status-badge';
import { DataTable } from '@/components/shared/data-table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { toContentRuleUiAction } from '@/lib/api/content-rules';
import type {
  ContentRuleRuleView,
  ContentRuleMatchType,
  ContentRuleScope,
  ContentRuleUiAction,
} from '@/types/content-rules';

interface ContentRulesTableProps {
  data: ContentRuleRuleView[];
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onEdit: (rule: ContentRuleRuleView) => void;
  onEditComplex: (ruleId: number) => void;
  onDelete: (rule: ContentRuleRuleView) => void;
  onToggle: (id: number, isActive: boolean) => void;
  onCopy: (ruleId: number) => void;
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  isLoading: boolean;
  canEdit?: boolean;
  totalCount?: number;
}

type DerivedStatus = 'enabled' | 'disabled' | 'expiringSoon' | 'expired';

export function formatContentRuleId(id: number): string {
  return `CR-${String(id).padStart(6, '0')}`;
}

// Complex content rules cannot be round-tripped through the simplified
// content-rule drawer. Open the existing data-stage editor, which preserves
// the rule's full condition tree, instead of navigating to the removed
// /rules/action/:id route.
export function complexContentRuleEditHref(id: number): string {
  return `/rules/data?edit_rule_id=${id}`;
}

export function deriveContentRuleStatus(
  isActive: boolean,
  validUntil?: string | null,
  now = new Date(),
): DerivedStatus {
  const expiry = validUntil ? new Date(validUntil) : null;
  if (expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime()) return 'expired';
  if (!isActive) return 'disabled';
  if (expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000) return 'expiringSoon';
  return 'enabled';
}

function getDisplayAction(resolved: ContentRuleRuleView['resolved']): ContentRuleUiAction | null {
  if (!resolved) return null;
  const direction = resolved.directions.receive?.enabled
    ? resolved.directions.receive
    : resolved.directions.send?.enabled
      ? resolved.directions.send
      : resolved.directions.internal?.enabled
        ? resolved.directions.internal
        : null;
  return direction ? toContentRuleUiAction(direction.action, resolved.mark_config) : null;
}

function actionVariant(action: ContentRuleUiAction): 'success' | 'error' | 'warning' | 'info' | 'default' {
  if (action === 'accept') return 'success';
  if (action === 'quarantine' || action === 'audit') return 'warning';
  if (action === 'reject' || action === 'discard') return 'error';
  return 'default';
}

function matchTypeVariant(type: ContentRuleMatchType): 'info' | 'default' | 'success' {
  if (type === 'keyword') return 'info';
  if (type === 'content_group') return 'success';
  return 'default';
}

function displayScopes(scopes: ContentRuleScope[]): string[] {
  const values: string[] = [];
  if (scopes.includes('subject')) values.push('subject');
  if (scopes.includes('text_body') || scopes.includes('html_body')) values.push('body');
  if (scopes.includes('header')) values.push('header');
  if (scopes.includes('attachment_names')) values.push('attachmentNames');
  if (scopes.includes('attachment_types')) values.push('attachmentTypes');
  if (scopes.includes('attachment_hash')) values.push('attachmentHash');
  if (scopes.includes('urls')) values.push('urls');
  return values;
}

export function ContentRulesTable({
  data,
  pageCount,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onEditComplex,
  onDelete,
  onToggle,
  onCopy,
  selectedIds,
  onSelectionChange,
  canEdit = true,
  totalCount,
}: ContentRulesTableProps) {
  const t = useTranslations();

  const columns: ColumnDef<ContentRuleRuleView>[] = [
    {
      id: 'select',
      header: () => {
        const pageIds = data.map((item) => item.rule.id);
        const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
        return (
          <input
            type="checkbox"
            checked={allSelected}
            disabled={!canEdit}
            aria-label={t('contentRules.selectCurrentPage')}
            onChange={(event) => {
              onSelectionChange(
                event.target.checked
                  ? Array.from(new Set([...selectedIds, ...pageIds]))
                  : selectedIds.filter((id) => !pageIds.includes(id)),
              );
            }}
            className="h-4 w-4 accent-primary"
          />
        );
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(row.original.rule.id)}
          disabled={!canEdit}
          aria-label={t('contentRules.selectRule', { name: row.original.rule.name })}
          onChange={(event) => {
            onSelectionChange(
              event.target.checked
                ? Array.from(new Set([...selectedIds, row.original.rule.id]))
                : selectedIds.filter((id) => id !== row.original.rule.id),
            );
          }}
          className="h-4 w-4 accent-primary"
        />
      ),
      size: 40,
    },
    {
      id: 'rule_id',
      header: t('contentRules.ruleId'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {formatContentRuleId(row.original.rule.id)}
        </span>
      ),
    },
    {
      id: 'rule_name',
      header: t('contentRules.ruleName'),
      cell: ({ row }) => (
        <div className="min-w-[180px] max-w-[280px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate font-medium">{row.original.rule.name}</div>
            {row.original.resolved?.source === 'email_disposal_center' && (
              <Badge
                variant="outline"
                className="shrink-0 border-blue-200 bg-blue-50 text-[10px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300"
                data-testid={`content-rule-source-email-disposal-${row.original.rule.id}`}
              >
                {t('contentRules.sourceEmailDisposal')}
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.resolved?.match_content || row.original.rule.description || '—'}
          </div>
        </div>
      ),
    },
    {
      id: 'match_type',
      header: t('contentRules.matchType'),
      cell: ({ row }) => {
        const type = row.original.resolved?.match_type;
        if (!type) return <Badge variant="secondary">{t('senderFilter.complexCondition')}</Badge>;
        return (
          <StatusBadge
            status={t(`contentRules.matchType${type === 'content_group' ? 'ContentGroup' : type[0].toUpperCase() + type.slice(1)}` as 'contentRules.matchTypeKeyword')}
            variant={matchTypeVariant(type)}
          />
        );
      },
    },
    {
      id: 'action',
      header: t('contentRules.action'),
      cell: ({ row }) => {
        const action = getDisplayAction(row.original.resolved);
        if (!action) return <span className="text-muted-foreground">—</span>;
        const key = action.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
        return <StatusBadge status={t(`contentRules.action${key}` as 'contentRules.actionDeliver')} variant={actionVariant(action)} />;
      },
    },
    {
      id: 'scopes',
      header: t('contentRules.scope'),
      cell: ({ row }) => {
        const scopes = displayScopes(row.original.resolved?.scopes ?? []);
        if (!scopes.length) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex min-w-[150px] flex-wrap gap-1">
            {scopes.slice(0, 2).map((scope) => (
              <Badge key={scope} variant="secondary" className="text-[10px]">
                {t(`contentRules.scopeDisplay${scope[0].toUpperCase() + scope.slice(1)}` as 'contentRules.scopeDisplaySubject')}
              </Badge>
            ))}
            {scopes.length > 2 && <Badge variant="outline" className="text-[10px]">+{scopes.length - 2}</Badge>}
          </div>
        );
      },
    },
    {
      id: 'priority',
      header: t('contentRules.priority'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-mono text-sm text-muted-foreground">
          {row.original.rule.priority}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('contentRules.status'),
      cell: ({ row }) => {
        const status = deriveContentRuleStatus(row.original.rule.is_active, row.original.rule.valid_until);
        const hint = status === 'expiringSoon' ? t('contentRules.statusExpiringSoon')
          : status === 'expired' ? t('contentRules.statusExpired')
          : null;
        return (
          <div className="flex items-center gap-1.5">
            <Switch
              checked={row.original.rule.is_active}
              disabled={status === 'expired'}
              onCheckedChange={(isActive) => onToggle(row.original.rule.id, isActive)}
              aria-label={row.original.rule.is_active ? t('common.disabled') : t('common.enabled')}
            />
            {hint && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <AlertTriangle
                      className={cn(
                        'h-3.5 w-3.5',
                        status === 'expired' ? 'text-destructive' : 'text-amber-500',
                      )}
                    />
                  }
                />
                <TooltipContent>{hint}</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      id: 'valid_until',
      header: t('contentRules.validUntil'),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {row.original.rule.valid_until
            ? new Date(row.original.rule.valid_until).toLocaleDateString()
            : t('contentRules.permanent')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('contentRules.operations'),
      cell: ({ row }) => {
        const item = row.original;
        if (!canEdit) return null;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('common.edit')}
              data-testid={`content-rule-edit-${item.rule.id}`}
              onClick={() => item.is_complex ? onEditComplex(item.rule.id) : onEdit(item)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={(
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('contentRules.moreOperations')}
                    data-testid={`content-rule-more-${item.rule.id}`}
                  />
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  data-testid={`content-rule-toggle-${item.rule.id}`}
                  onClick={() => onToggle(item.rule.id, !item.rule.is_active)}
                >
                  <Power />
                  {item.rule.is_active ? t('contentRules.disableRule') : t('contentRules.enableRule')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopy(item.rule.id)}>
                  <Copy />
                  {t('common.copy')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  data-testid={`content-rule-delete-${item.rule.id}`}
                  onClick={() => onDelete(item)}
                >
                  <Trash2 />
                  {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return (
    <TooltipProvider>
      <DataTable
        columns={columns}
        data={data}
        pageCount={Math.max(1, pageCount)}
        pageIndex={pageIndex}
        onPageChange={onPageChange}
        pageSize={pageSize}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageSizeChange={onPageSizeChange}
        rowTestId={(row) => `content-rule-row-${row.rule.id}`}
        noDataText={t('contentRules.noRules')}
        totalCount={totalCount}
        pageJumpLabel={t('contentRules.jumpToPage')}
        rowClassName={(row) => {
          const status = deriveContentRuleStatus(row.rule.is_active, row.rule.valid_until);
          return cn(
            selectedIds.includes(row.rule.id) && 'bg-primary/5',
            status === 'expired' && 'opacity-60',
          );
        }}
      />
    </TooltipProvider>
  );
}
