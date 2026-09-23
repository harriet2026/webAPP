'use client';

import { ColumnDef } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { Pencil, Trash2, Mail, Globe, Users, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/shared/status-badge';
import { DataTable } from '@/components/shared/data-table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SenderFilterRuleView, SenderFilterAction, SenderConfigType, SenderFilterGroups } from '@/types/sender-filter';

// GT-12500：修改时间按本地时区展示（分钟精度）。此前刻意用 UTC（理由是与
// 规则 ID 里的 UTC 日期一致），但管理员看到的是与本地钟表对不上的时间——
// 展示一律本地化，规则 ID 只是标识不承担时刻语义。
function formatLocalMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface SenderFilterTableProps {
  data: SenderFilterRuleView[];
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onEdit: (rule: SenderFilterRuleView) => void;
  onDelete: (rule: SenderFilterRuleView) => void;
  onToggle: (id: number, isActive: boolean) => void;
  onToggleRunMode: (rule: SenderFilterRuleView) => void;
  pendingRunModeId: number | null;
  groups: SenderFilterGroups;
  isLoading: boolean;
}

const senderIcon: Record<SenderConfigType, React.ElementType> = {
  individual: Mail,
  domain: Globe,
  group: Users,
};

function actionVariant(action: string): 'success' | 'error' | 'warning' | 'default' {
  switch (action) {
    case 'accept':
      return 'success';
    case 'reject':
      return 'error';
    case 'discard':
      return 'error';
    case 'quarantine':
      return 'warning';
    case 'audit':
      return 'warning';
    default:
      return 'default';
  }
}

export function SenderFilterTable({
  data,
  pageCount,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onDelete,
  onToggle,
  onToggleRunMode,
  pendingRunModeId,
  groups,
  isLoading: _isLoading,
}: SenderFilterTableProps) {
  const t = useTranslations();
  const senderGroupNames = new Set(groups.senderGroups.map((g) => g.name));

  const columns: ColumnDef<SenderFilterRuleView>[] = [
    {
      accessorKey: 'list_id_display',
      header: t('senderFilter.ruleId'),
      cell: ({ row }) => (
        <span data-testid="sender-filter-cell-ruleId" className="font-mono text-xs">{row.original.list_id_display}</span>
      ),
      size: 100,
    },
    {
      accessorKey: 'rule.name',
      header: t('senderFilter.ruleName'),
      cell: ({ row }) => <span data-testid="sender-filter-cell-ruleName" className="font-medium">{row.original.rule.name}</span>,
    },
    {
      id: 'sender_config',
      header: t('senderFilter.senderConfig'),
      cell: ({ row }) => {
        const resolved = row.original.resolved;
        // `sender_config` must be checked too, not just `resolved`. A
        // sender_filter rule whose metadata carries no sender_config (accepted by
        // POST /unified-rules, and reachable via rule import or any non-UI
        // client) otherwise threw "Cannot read properties of undefined (reading
        // 'type')" from the line below — an uncaught render error that took out
        // the WHOLE page behind the error boundary ("操作失败"), not just this
        // cell. Degrade to the same "complex condition" badge already used for a
        // rule the simple editor cannot represent.
        if (!resolved || !resolved.sender_config) {
          return <Badge data-testid="sender-filter-cell-complex" variant="secondary">{t('senderFilter.complexCondition')}</Badge>;
        }
        // An unrecognised type would likewise yield `undefined` here and crash on
        // render; fall back to the same badge rather than an undefined component.
        const Icon = senderIcon[resolved.sender_config.type];
        if (!Icon) {
          return <Badge data-testid="sender-filter-cell-complex" variant="secondary">{t('senderFilter.complexCondition')}</Badge>;
        }
        const typeLabel = t(`senderFilter.senderType_${resolved.sender_config.type}`);
        const groupDeleted = resolved.sender_config.type === 'group' && !senderGroupNames.has(resolved.sender_config.value);
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            {groupDeleted ? (
              <Tooltip>
                <TooltipTrigger render={<Badge variant="destructive" className="text-[10px] gap-1 cursor-help"><AlertTriangle className="h-3 w-3" />{t('senderFilter.groupDeleted')}</Badge>} />
                <TooltipContent>{t('senderFilter.groupDeleted')}</TooltipContent>
              </Tooltip>
            ) : (
              <span data-testid="sender-filter-cell-senderValue" className="text-sm">{resolved.sender_config.value}</span>
            )}
            <Badge data-testid="sender-filter-cell-senderType" variant="secondary" className="text-[10px]">{typeLabel}</Badge>
          </div>
        );
      },
    },
    {
      id: 'action',
      header: t('senderFilter.action'),
      cell: ({ row }) => {
        const action = row.original.rule.action as SenderFilterAction;
        return (
          <StatusBadge
            status={t(`senderFilter.action_${action}`)}
            variant={actionVariant(action)}
          />
        );
      },
    },
    {
      accessorKey: 'rule.priority',
      header: t('senderFilter.priority'),
      cell: ({ row }) => (
        <span data-testid="sender-filter-cell-priority" className="text-sm tabular-nums">{row.original.rule.priority}</span>
      ),
      size: 80,
    },
    {
      id: 'run_mode',
      header: t('senderFilter.runMode'),
      cell: ({ row }) => {
        if (row.original.list_type !== 'blacklist') return null;
        const resolved = row.original.resolved;
        const isObserve = resolved?.run_mode === 'observe';
        const label = isObserve ? t('senderFilter.runModeValue_observe') : t('senderFilter.runModeValue_realtime');
        // 复杂规则（resolved 为 null）无法安全还原完整 metadata 用于回写，
        // 保持只读展示，禁用开关，避免误触后无法正确保存。
        const readOnly = row.original.is_complex || !resolved;
        const isPending = pendingRunModeId === row.original.rule.id;
        return (
          <div className="flex items-center gap-2">
            <Switch
              data-testid="sender-filter-row-run-mode-toggle"
              checked={isObserve}
              disabled={readOnly || isPending}
              onCheckedChange={() => onToggleRunMode(row.original)}
              className="data-checked:bg-amber-500 dark:data-checked:bg-amber-500"
              aria-label={t('senderFilter.runModeToggleTooltip')}
              title={readOnly ? t('senderFilter.complexCondition') : t('senderFilter.runModeToggleTooltip')}
            />
            <span className={cn('text-xs', isObserve ? 'text-amber-700 font-medium' : 'text-muted-foreground')}>
              {label}
            </span>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: t('senderFilter.status'),
      cell: ({ row }) => (
        <Switch
          data-testid="sender-filter-row-status"
          checked={row.original.rule.is_active}
          onCheckedChange={(isActive) => onToggle(row.original.rule.id, isActive)}
          aria-label={row.original.rule.is_active ? t('common.disabled') : t('common.enabled')}
        />
      ),
    },
    {
      accessorKey: 'rule.updated_at',
      header: t('senderFilter.modifyTime'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {formatLocalMinute(row.original.rule.updated_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('senderFilter.operation'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            data-testid="sender-filter-row-edit"
            variant="ghost"
            size="icon"
            aria-label={t('common.edit')}
            title={t('common.edit')}
            onClick={() => {
              // GT-11486: complex rules also go through the drawer. The
              // previous onEditComplex -> /rules/action/:id route never
              // existed and 404'd, leaving complex rules uneditable. The
              // drawer prefills the basic fields and shows the raw
              // condition read-only; saving is a partial update that never
              // overwrites the complex condition_tree/action.
              onEdit(row.original);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            data-testid="sender-filter-row-delete"
            variant="ghost"
            size="icon"
            aria-label={t('common.delete')}
            title={t('common.delete')}
            onClick={() => onDelete(row.original)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <TooltipProvider>
      <DataTable
        columns={columns}
        data={data}
        rowTestId={(row) => `sender-filter-row-${row.rule.id}`}
        columnTestId={(id) => `sender-filter-col-${id}`}
        testId="sender-filter-table"
        pageCount={Math.max(1, pageCount)}
        pageIndex={pageIndex}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
      />
    </TooltipProvider>
  );
}
