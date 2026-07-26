'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bell, ChevronDown, Clock, RotateCcw, Send, Trash2, XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ApiRequestFn } from '@/lib/api/client';
import type { MailChildEvent, RecipientDisposition } from '@/types/email-disposal-detail';
import { useRecipientDisposition, type ActionKey } from '../hooks/use-recipient-disposition';

// Ported from tabs/delivery-tab.tsx (DD-11 part 2 -- restores its content,
// which had no home in the new 3-module drawer, as an additive per-recipient
// detail line on delivered groups rather than a wholesale second table).
type DeliveryStatus = 'success' | 'failed' | 'delivering' | 'pending';

function deliveryStatusOf(_finalAction: string, status: string): DeliveryStatus {
  const s = (status || '').toLowerCase();
  if (s.includes('deliver') && s.includes('fail')) return 'failed';
  if (s === 'delivered' || s === 'success') return 'success';
  if (s === 'failed' || s === 'bounced') return 'failed';
  if (s === 'in_delivery' || s === 'delivering') return 'delivering';
  return 'pending';
}

const STATUS_STYLES: Record<string, string> = {
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  marked_delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  quarantined: 'bg-blue-50 text-blue-700 border-blue-200',
  pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
  sidelined: 'bg-blue-50 text-blue-700 border-blue-200',
  audited: 'bg-amber-50 text-amber-700 border-amber-200',
  blocked: 'bg-orange-50 text-orange-700 border-orange-200',
  rejected: 'bg-orange-50 text-orange-700 border-orange-200',
  discarded: 'bg-red-50 text-red-700 border-red-200',
};
const DEFAULT_STATUS_STYLE = 'bg-gray-50 text-gray-700 border-gray-200';

const ACTION_ICONS: Record<ActionKey, typeof Send> = {
  deliver: Send,
  discard: Trash2,
  recall: RotateCcw,
  notify: Bell,
  // RA-5: Clock (blue-gray)/XCircle (orange) match the demo prototype's
  // 隔离/阻断 icon+color choice.
  quarantine: Clock,
  block: XCircle,
};

// G13: inline per-row action buttons get colored text (投递 emerald, 召回/
// 通知 blue, 丢弃 red) instead of a uniform gray outline, per html_spec
// layer-11's per-status action color tokens. RA-5: 隔离 slate/blue-gray,
// 阻断 orange, matching the demo.
const ACTION_ROW_CLASS: Record<ActionKey, string> = {
  deliver: 'text-emerald-700 data-[hovered=true]:bg-emerald-50 data-[hovered=true]:text-emerald-800 dark:text-emerald-400 dark:data-[hovered=true]:bg-emerald-950/30',
  discard: 'text-red-700 data-[hovered=true]:bg-red-50 data-[hovered=true]:text-red-800 dark:text-red-400 dark:data-[hovered=true]:bg-red-950/30',
  recall: 'text-blue-700 data-[hovered=true]:bg-blue-50 data-[hovered=true]:text-blue-800 dark:text-blue-400 dark:data-[hovered=true]:bg-blue-950/30',
  notify: 'text-blue-700 data-[hovered=true]:bg-blue-50 data-[hovered=true]:text-blue-800 dark:text-blue-400 dark:data-[hovered=true]:bg-blue-950/30',
  quarantine: 'text-slate-700 data-[hovered=true]:bg-slate-50 data-[hovered=true]:text-slate-800 dark:text-slate-300 dark:data-[hovered=true]:bg-slate-900/40',
  block: 'text-orange-700 data-[hovered=true]:bg-orange-50 data-[hovered=true]:text-orange-800 dark:text-orange-400 dark:data-[hovered=true]:bg-orange-950/30',
};

// G9: batch bar 投递/丢弃 are filled (green/red); 召回/通知 keep the
// outline treatment (a webapp-only addition beyond the demo's 投递/隔离/
// 丢弃 batch set -- kept per the task's KEEP list). RA-5: 隔离/阻断 get
// their own outline colors (slate/orange), matching the row-level styling.
const ACTION_BATCH_CLASS: Record<ActionKey, string> = {
  deliver: 'border-transparent bg-emerald-600 text-white data-[hovered=true]:bg-emerald-700',
  discard: 'border-transparent bg-red-600 text-white data-[hovered=true]:bg-red-700',
  recall: '',
  notify: '',
  quarantine: 'border-slate-300 text-slate-600 data-[hovered=true]:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:data-[hovered=true]:bg-slate-900/40',
  block: 'border-orange-300 text-orange-600 data-[hovered=true]:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:data-[hovered=true]:bg-orange-950/30',
};

// D3: number of recipient groups shown before the matrix collapses behind an
// "展开全部 N 个收件人" toggle (spec §75-83 D3).
const DISPLAY_LIMIT = 5;

interface RecipientStatusProps {
  recipient_dispositions: RecipientDisposition[] | undefined;
  mailLogId: number;
  // Sender address of the whole message, used only to restore the old
  // overview-tab.tsx "放行并加白" (release + whitelist) behavior (spec §6.1)
  // via the deliver action's optional whitelist checkbox.
  sender: string;
  apiRequest: ApiRequestFn;
  onDisposed: () => void;
  readOnly: boolean;
  // Delivery events (mail_child_events) for the per-recipient delivery-detail
  // line rendered on delivered groups only -- see tDelivery below (DD-11 part 2).
  events?: MailChildEvent[];
}

export function RecipientStatus({
  recipient_dispositions, mailLogId, sender, apiRequest, onDisposed, readOnly, events,
}: RecipientStatusProps) {
  const t = useTranslations('emailDisposal.detail.overview');
  // Separate scope reusing tabs/delivery-tab.tsx's existing, already-translated
  // i18n keys (established multi-scope-per-source pattern from DD-9/DD-10).
  const tDelivery = useTranslations('emailDisposal.detail.delivery');

  // D1: matrix header -- total recipient count (across all groups, not
  // group count) + a per-status distribution, mirroring
  // SendReceiveContextCard's B2 status-distribution computation.
  const totalRecipients = recipient_dispositions?.length ?? 0;
  const statusCounts: Record<string, number> = {};
  for (const d of recipient_dispositions ?? []) statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // D3: expand/collapse the recipient matrix when there are more than
  // DISPLAY_LIMIT groups.
  const [matrixExpanded, setMatrixExpanded] = useState(false);

  // Task 11b: dispatch machinery (grouping + deliver/discard/recall/notify
  // orchestration + dialogs) is now shared with the single-recipient header
  // buttons via this hook -- see hooks/use-recipient-disposition.tsx. Behavior
  // here is unchanged; onSettled clears this component's OWN checkbox
  // selection, which the hook doesn't know about.
  const {
    groups, openAction, lastResults, resultDialogOpen, closeResultDialog, DispositionDialogs,
  } = useRecipientDisposition({
    recipient_dispositions,
    mailLogId,
    sender,
    apiRequest,
    onDisposed,
    onSettled: () => setSelected(new Set()),
  });
  const multiGroup = groups.length > 1;
  const visibleGroups = !matrixExpanded && groups.length > DISPLAY_LIMIT
    ? groups.slice(0, DISPLAY_LIMIT)
    : groups;
  // G7: blocked/discarded (and any other actions.length===0) groups don't
  // get a checkbox at all, so "select all" must only ever target the
  // operable subset -- otherwise it could never reach a fully-checked state
  // once a non-operable row exists.
  const operableGroups = groups.filter((g) => g.actions.length > 0);

  const toggleGroup = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, [setSelected]);

  const toggleAllGroups = useCallback(() => {
    setSelected((prev) => (
      prev.size === operableGroups.length ? new Set() : new Set(operableGroups.map((g) => g.key))
    ));
  }, [operableGroups, setSelected]);

  if (!recipient_dispositions || recipient_dispositions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('recipientStatus.empty')}</p>;
  }

  const selectedCount = selected.size;

  return (
    <div className="space-y-3" data-testid="email-disposal-recipient-status">
      {/* D1: matrix header bar -- "收件人状态 (N 人)" + per-status distribution */}
      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        data-testid="email-disposal-recipient-status-header"
      >
        <span className="font-semibold">{t('recipientStatus.header', { n: totalRecipients })}</span>
        {Object.keys(statusCounts).length > 0 && (
          <span className="text-xs text-muted-foreground">
            {Object.entries(statusCounts)
              .map(([status, count]) => `${t(`recipientStatus.status.${status}`, { default: status })}: ${count}`)
              .join(' | ')}
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {multiGroup && (
              <TableHead className="w-10">
                <Checkbox
                  checked={operableGroups.length > 0 && selectedCount === operableGroups.length}
                  onCheckedChange={toggleAllGroups}
                  aria-label="Select all groups"
                />
              </TableHead>
            )}
            <TableHead className="text-xs">{t('recipientStatus.colRecipients')}</TableHead>
            <TableHead className="text-xs">{t('recipientStatus.colStatus')}</TableHead>
            <TableHead className="text-xs">{t('recipientStatus.colActions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleGroups.map((g) => {
            const style = STATUS_STYLES[g.status] || DEFAULT_STATUS_STYLE;
            // A quarantined/pending_review/sidelined group with no object_id
            // would normally be operable but has nothing for object-mode
            // dispose to target (review High-2) -- surface a distinguishable
            // tooltip so the operator understands to refresh/use list-mode
            // dispose instead of reading it as a generic blocked/discarded row.
            const missingObjectId = !g.objectId
              && (g.status === 'quarantined' || g.status === 'pending_review' || g.status === 'sidelined' || g.status === 'audited');
            // recipientActionsForStatus('delivered'|'marked_delivered') is the
            // only case returning ['recall'] -- the same "actually delivered"
            // case tabs/delivery-tab.tsx covered. Only these groups get the
            // restored per-recipient delivery-detail line.
            const isDeliveredGroup = g.actions.length === 1 && g.actions[0] === 'recall';
            // G7: a group with no available actions (blocked/discarded, or
            // the missing-object-id edge case) is not operable -- no
            // checkbox, the whole row reads as muted, and (outside the
            // missing-object-id case, which keeps its own distinguishing
            // tooltip) the action cell shows "(无原文)" per html_spec
            // layer-11's 核心规则 canOperate=✗ row.
            const notOperable = g.actions.length === 0;
            return (
              <TableRow
                key={g.key}
                data-testid={`email-disposal-recipient-status-row-${g.dispositions[0]?.recipient}`}
                className={notOperable ? 'bg-muted/30 text-muted-foreground opacity-70' : undefined}
              >
                {multiGroup && (
                  <TableCell>
                    {notOperable ? (
                      <span className="block size-4" aria-hidden="true" />
                    ) : (
                      <Checkbox
                        checked={selected.has(g.key)}
                        onCheckedChange={() => toggleGroup(g.key)}
                        aria-label={`Select group ${g.key}`}
                      />
                    )}
                  </TableCell>
                )}
                <TableCell className="text-xs max-w-[220px]">
                  {isDeliveredGroup ? (
                    <div className="space-y-1.5">
                      {g.dispositions.map((d) => {
                        const ev = events?.find((e) => e.recipient === d.recipient);
                        const dStatus = deliveryStatusOf(d.final_action, ev?.event_result || d.status);
                        const time = ev?.event_time || '—';
                        const error = ev?.dsn || d.reason || '—';
                        return (
                          <div key={d.recipient} className="min-w-0">
                            <div className="truncate">{d.recipient}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {tDelivery('time')}: {time}
                              {dStatus === 'failed' && ` · ${tDelivery('errorMessage')}: ${error}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="truncate">{g.dispositions.map((d) => d.recipient).join(', ')}</div>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline" className={style}>
                    {t(`recipientStatus.status.${g.status}`, { default: g.status })}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {notOperable ? (
                    missingObjectId ? (
                      <Tooltip>
                        <TooltipTrigger render={<span className="cursor-default text-muted-foreground" />}>
                          {t('recipientStatus.notOperable')}
                        </TooltipTrigger>
                        <TooltipContent>{t('recipientStatus.missingObjectIdTooltip')}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('recipientStatus.noContent')}</span>
                    )
                  ) : (
                    <div className="flex gap-1.5">
                      {g.actions.map((action) => {
                        const Icon = ACTION_ICONS[action];
                        const btn = (
                          <Button
                            key={action}
                            size="sm"
                            variant="ghost"
                            className={cn('h-7 text-xs', ACTION_ROW_CLASS[action])}
                            disabled={readOnly}
                            onClick={() => openAction(action, [g.key])}
                          >
                            <Icon className="mr-1 h-3 w-3" />
                            {t(`recipientStatus.action.${action}`)}
                          </Button>
                        );
                        return readOnly ? (
                          <Tooltip key={action}>
                            <TooltipTrigger render={<span />}>{btn}</TooltipTrigger>
                            <TooltipContent>{t('recipientStatus.readOnlyTooltip')}</TooltipContent>
                          </Tooltip>
                        ) : btn;
                      })}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* D3: >5 groups collapse behind an expand/collapse toggle */}
      {groups.length > DISPLAY_LIMIT && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          data-testid="email-disposal-recipient-status-expand"
          onClick={() => setMatrixExpanded((v) => !v)}
        >
          {matrixExpanded ? t('collapse') : t('recipientStatus.expandAll', { n: groups.length })}
          <ChevronDown className={cn('ml-1 h-3 w-3 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', matrixExpanded && 'rotate-180')} />
        </Button>
      )}

      {/* G8: bar appears at >=1 selected (was >1). G9: 已选中 N 个收件人 +
          action buttons (投递/丢弃 filled, 召回/通知 outline) + 取消. */}
      {multiGroup && selectedCount >= 1 && (
        <div
          className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2"
          data-testid="email-disposal-recipient-batch-bar"
        >
          <span className="text-sm font-medium">{t('recipientStatus.selected', { n: selectedCount })}</span>
          <div className="flex items-center gap-2 ml-auto">
            {/* RA-5: 批量隔离/批量阻断 added between deliver and discard,
                matching the single-recipient header's action order. */}
            {(['deliver', 'quarantine', 'block', 'discard', 'recall', 'notify'] as ActionKey[]).map((action) => {
              const Icon = ACTION_ICONS[action];
              const btn = (
                <Button
                  key={action}
                  variant="outline"
                  size="sm"
                  className={cn('h-7 text-xs', ACTION_BATCH_CLASS[action])}
                  disabled={readOnly}
                  data-testid={`email-disposal-recipient-batch-${action}`}
                  onClick={() => openAction(action, [...selected])}
                >
                  <Icon className="mr-1 h-3 w-3" />
                  {t(`recipientStatus.action.${action}`)}
                </Button>
              );
              return readOnly ? (
                <Tooltip key={action}>
                  <TooltipTrigger render={<span />}>{btn}</TooltipTrigger>
                  <TooltipContent>{t('recipientStatus.readOnlyTooltip')}</TooltipContent>
                </Tooltip>
              ) : btn;
            })}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              data-testid="email-disposal-recipient-batch-cancel"
              onClick={() => setSelected(new Set())}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* G6: batch-result "操作完成" modal -- one row per affected recipient,
          success rows green ({prevStatus} → {newStatus}), failure rows red
          ({prevStatus} → {reason}). Replaces the old inline
          lastFailures/resultSuccessCount blocks. */}
      <Dialog open={resultDialogOpen} onOpenChange={(o) => { if (!o) closeResultDialog(); }}>
        <DialogContent className="max-w-md" data-testid="email-disposal-recipient-batch-result">
          <DialogHeader>
            <DialogTitle>{t('recipientStatus.batchResultTitle')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-auto py-2">
            {lastResults.map((r, i) => (
              <div
                key={`${r.recipient}-${i}`}
                className={cn(
                  'flex items-center justify-between gap-2 rounded p-2 text-sm',
                  r.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/20'
                    : 'bg-red-50 dark:bg-red-950/20',
                )}
              >
                <span className="truncate">{r.recipient}</span>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t(`recipientStatus.status.${r.prevStatus}`, { default: r.prevStatus })}
                  </span>
                  <span>→</span>
                  <span className={r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                    {r.ok
                      ? (r.newStatus
                        ? t(`recipientStatus.status.${r.newStatus}`, { default: r.newStatus })
                        : t('recipientStatus.actionSuccess'))
                      : (r.reason || t('recipientStatus.actionFailed'))}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" onClick={closeResultDialog}>{t('recipientStatus.confirmClose')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {DispositionDialogs}
    </div>
  );
}
