'use client';

// SingleRecipientActions -- Task 11b: restores the single-recipient dispose
// action buttons (deliver/discard/recall/notify) that Task 8 removed when it
// gated RecipientStatus to multi-recipient only. Rendered in
// ThreatSummaryCard's header row, next to SenderActions (mirrors the demo's
// threat-summary-card header dispose buttons). Reuses the SAME dispatch
// machinery as the multi-recipient matrix via useRecipientDisposition --
// see hooks/use-recipient-disposition.tsx.
//
// GT-13650: the action list comes from recipientActionsForStatus and only
// exposes operations supported by the real API; mock-only actions must not
// appear in this production surface.

import { useTranslations } from 'next-intl';
import {
  Bell, Clock, RotateCcw, Send, Trash2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ApiRequestFn } from '@/lib/api/client';
import type { RecipientDisposition } from '@/types/email-disposal-detail';
import { useRecipientDisposition, type ActionKey } from '../../hooks/use-recipient-disposition';

const ACTION_ICONS: Record<ActionKey, typeof Send> = {
  deliver: Send,
  discard: Trash2,
  recall: RotateCcw,
  notify: Bell,
  // RA-5: Clock (blue-gray)/XCircle (orange) match the demo prototype's
  // 隔离/阻断 icon+color choice for a pending recipient.
  quarantine: Clock,
  block: XCircle,
  // GT-12880：重新投递（对保留期内仍留有原文的邮件）。
  redeliver: RotateCcw,
};

// G2 (v2 html_spec §②): 投递/丢弃 are filled (green/red) in the header strip,
// matching the matrix batch bar's ACTION_BATCH_CLASS (components/
// recipient-status.tsx) for visual consistency across the two dispose
// surfaces; 召回/通知 keep the plain outline treatment. RA-5: 隔离/阻断 get
// their own outline color (blue-gray / orange) instead of a solid fill, per
// the demo.
const ACTION_FILL_CLASS: Partial<Record<ActionKey, string>> = {
  deliver: 'border-transparent bg-emerald-600 text-white data-[hovered=true]:bg-emerald-700',
  discard: 'border-transparent bg-red-600 text-white data-[hovered=true]:bg-red-700',
  quarantine: 'border-slate-300 text-slate-600 data-[hovered=true]:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:data-[hovered=true]:bg-slate-900/40',
  block: 'border-orange-300 text-orange-600 data-[hovered=true]:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:data-[hovered=true]:bg-orange-950/30',
  redeliver: 'border-transparent bg-emerald-600 text-white data-[hovered=true]:bg-emerald-700',
};

interface SingleRecipientActionsProps {
  recipient_dispositions: RecipientDisposition[] | undefined;
  mailLogId: number;
  sender: string;
  apiRequest: ApiRequestFn;
  onDisposed: () => void;
  readOnly: boolean;
  redeliverAvailable?: boolean;
  redeliverUnavailableReason?: 'original_expired' | 'storage_unavailable';
}

export function SingleRecipientActions({
  recipient_dispositions, mailLogId, sender, apiRequest, onDisposed, readOnly,
  redeliverAvailable = true, redeliverUnavailableReason = 'original_expired',
}: SingleRecipientActionsProps) {
  const t = useTranslations('emailDisposal.detail.overview');

  const { groups, openAction, DispositionDialogs } = useRecipientDisposition({
    recipient_dispositions,
    mailLogId,
    sender,
    apiRequest,
    onDisposed,
    redeliverAvailable,
    redeliverUnavailableReason,
  });

  // Only meaningful for a genuinely single-recipient message -- a caller
  // that passes more than one disposition would produce more than one
  // group, which this component intentionally does not render (that's
  // RecipientStatus's matrix, not this header strip).
  if (!recipient_dispositions || recipient_dispositions.length !== 1 || groups.length !== 1) {
    return null;
  }
  const group = groups[0];
  if (group.actions.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" data-testid="email-disposal-overview-recipient-actions">
        {group.actions.map((action) => {
          const Icon = ACTION_ICONS[action];
          const redeliverUnavailable = action === 'redeliver' && !redeliverAvailable;
          const btn = (
            <Button
              key={action}
              size="sm"
              variant="outline"
              disabled={readOnly || redeliverUnavailable}
              className={cn(ACTION_FILL_CLASS[action])}
              data-testid={`email-disposal-overview-recipient-action-${action}`}
              onClick={() => openAction(action, [group.key])}
            >
              <Icon className="mr-1 h-3.5 w-3.5" />
              {t(`recipientStatus.action.${action}`)}
            </Button>
          );
          return readOnly || redeliverUnavailable ? (
            <Tooltip key={action}>
              <TooltipTrigger render={<span />}>{btn}</TooltipTrigger>
              <TooltipContent data-testid={redeliverUnavailable ? 'email-disposal-redeliver-unavailable-tooltip' : undefined}>
                {redeliverUnavailable
                  ? t(`recipientStatus.redeliverUnavailable.${redeliverUnavailableReason}`)
                  : t('recipientStatus.readOnlyTooltip')}
              </TooltipContent>
            </Tooltip>
          ) : btn;
        })}
      </div>
      {DispositionDialogs}
    </>
  );
}
