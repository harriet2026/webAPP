'use client';

// 头部处置按钮组 SenderActions（发信人级）—— 概览模块「处置」区的顶部两个
// 按钮：发信人加黑（E1）/ 发信人加白（E2），以及非单收件人场景下的
// A6 多投提示。「更多」（E7）按钮已按需求移除。单收件人的投递/召回/丢弃/
// 通知按钮不在本组件范围内，由 Task 11b
// 的 sections/overview/single-recipient-actions.tsx（与 RecipientStatus 共用
// useRecipientDisposition dispatch hook）承载，由 ThreatSummaryCard 在本组件
// 旁边一起渲染（本组件只暴露 isSingleRecipient 供调用方判断是否还需渲染 A6
// 多投提示，自身从不渲染投递/召回/丢弃/通知按钮）。

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Info, Loader2, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
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
import type { ApiRequestFn } from '@/lib/api/client';
import { addSenderFilterRule, disposalRulePriority } from '../../lib/disposal-detail-api';
import { useAuth } from '@/contexts/auth-context';

interface SenderActionsProps {
  sender: string;
  apiRequest: ApiRequestFn;
  // Multi-recipient hint (A6) renders when this is false. See file-header
  // comment -- single-recipient dispose buttons are Task 11's scope, not
  // rendered here regardless of this flag's value.
  isSingleRecipient: boolean;
  readOnly?: boolean;
  // Called after a successful blacklist/whitelist rule creation so the
  // caller can refresh anything derived from it (e.g. a rule-hit list).
  onDisposed?: () => void;
}

export function SenderActions({
  sender,
  apiRequest,
  isSingleRecipient,
  readOnly = false,
  onDisposed,
}: SenderActionsProps) {
  const t = useTranslations('emailDisposal.detail.overview.senderActions');
  const { isSystemAdmin } = useAuth();
  // cancel / confirmBtn already exist (four languages) at the parent
  // overview namespace and are reused by reclassify-dialog.tsx /
  // recipient-status.tsx's own confirm dialogs -- pull from there instead of
  // duplicating the strings under senderActions.*.
  const tOverview = useTranslations('emailDisposal.detail.overview');

  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  const [includeSubdomains, setIncludeSubdomains] = useState(false);
  const [busy, setBusy] = useState(false);

  function openBlacklist() {
    setIncludeSubdomains(false);
    setBlacklistOpen(true);
  }

  function openWhitelist() {
    setWhitelistOpen(true);
  }

  async function confirmBlacklist() {
    setBusy(true);
    try {
      await addSenderFilterRule(sender, 'blacklist', apiRequest, disposalRulePriority(isSystemAdmin), {
        scope: 'tenant',
        includeSubdomains,
      });
      toast.success(t('blacklistDialog.success'));
      setBlacklistOpen(false);
      onDisposed?.();
    } catch {
      toast.error(t('blacklistDialog.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmWhitelist() {
    setBusy(true);
    try {
      await addSenderFilterRule(sender, 'whitelist', apiRequest, disposalRulePriority(isSystemAdmin), {
        scope: 'tenant',
      });
      toast.success(t('whitelistDialog.success'));
      setWhitelistOpen(false);
      onDisposed?.();
    } catch {
      toast.error(t('whitelistDialog.failed'));
    } finally {
      setBusy(false);
    }
  }

  const showOverlay = blacklistOpen || whitelistOpen;

  return (
    <>
    {showOverlay && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-[199] bg-black/60 transition-opacity duration-150" aria-hidden="true" />,
      document.body
    )}
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={readOnly}
        onClick={openBlacklist}
        data-testid="email-disposal-overview-action-blacklist"
      >
        <UserMinus className="mr-1 h-3.5 w-3.5" />
        {t('blacklist')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={readOnly}
        onClick={openWhitelist}
        data-testid="email-disposal-overview-action-whitelist"
      >
        <UserPlus className="mr-1 h-3.5 w-3.5" />
        {t('whitelist')}
      </Button>

      {!isSingleRecipient && (
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="email-disposal-overview-recipient-hint"
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          {t('recipientHint')}
        </div>
      )}

      {/* E1 -- 发信人加黑 */}
      <AlertDialog open={blacklistOpen} onOpenChange={(o) => !busy && setBlacklistOpen(o)}>
        <AlertDialogContent data-testid="email-disposal-overview-blacklist-dialog" overlayClassName="bg-black/60">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('blacklistDialog.title', { sender })}</AlertDialogTitle>
            <AlertDialogDescription>{t('blacklistDialog.desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <InteractiveSurface asChild variant="control" className="flex items-center gap-2 text-sm focus-within:ring-2 focus-within:ring-ring/60">
              <label>
                <Checkbox
                  checked={includeSubdomains}
                  onCheckedChange={(c) => setIncludeSubdomains(c === true)}
                  data-testid="email-disposal-overview-blacklist-include-subdomains"
                />
                {t('blacklistDialog.includeSubdomains')}
              </label>
            </InteractiveSurface>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} data-testid="email-disposal-overview-blacklist-cancel">
              {tOverview('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              data-testid="email-disposal-overview-blacklist-confirm"
              onClick={(e) => {
                e.preventDefault();
                void confirmBlacklist();
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tOverview('confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* E2 -- 发信人加白 */}
      <AlertDialog open={whitelistOpen} onOpenChange={(o) => !busy && setWhitelistOpen(o)}>
        <AlertDialogContent data-testid="email-disposal-overview-whitelist-dialog" overlayClassName="bg-black/60">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('whitelistDialog.title', { sender })}</AlertDialogTitle>
            <AlertDialogDescription>{t('whitelistDialog.desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} data-testid="email-disposal-overview-whitelist-cancel">
              {tOverview('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              data-testid="email-disposal-overview-whitelist-confirm"
              onClick={(e) => {
                e.preventDefault();
                void confirmWhitelist();
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tOverview('confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}
