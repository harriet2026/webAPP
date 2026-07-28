'use client';

// 头部处置按钮组 SenderActions（发信人级）—— 概览模块「处置」区的顶部三个
// 按钮：发信人加黑（E1）/ 发信人加白（E2）/ 更多（E7），以及非单收件人场景下的
// A6 多投提示。单收件人的投递/召回/丢弃/通知按钮不在本组件范围内，由 Task 11b
// 的 sections/overview/single-recipient-actions.tsx（与 RecipientStatus 共用
// useRecipientDisposition dispatch hook）承载，由 ThreatSummaryCard 在本组件
// 旁边一起渲染（本组件只暴露 isSingleRecipient 供调用方判断是否还需渲染 A6
// 多投提示，自身从不渲染投递/召回/丢弃/通知按钮）。

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Info, Loader2, MoreHorizontal, UserMinus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { InteractiveSurface } from '@/components/ui/interactive-surface';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ApiRequestFn } from '@/lib/api/client';
import { addSenderFilterRule } from '../../lib/disposal-detail-api';

type ScopeValue = 'tenant' | 'global';

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
  // cancel / confirmBtn already exist (four languages) at the parent
  // overview namespace and are reused by reclassify-dialog.tsx /
  // recipient-status.tsx's own confirm dialogs -- pull from there instead of
  // duplicating the strings under senderActions.*.
  const tOverview = useTranslations('emailDisposal.detail.overview');

  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  const [blacklistScope, setBlacklistScope] = useState<ScopeValue>('tenant');
  const [whitelistScope, setWhitelistScope] = useState<ScopeValue>('tenant');
  const [includeSubdomains, setIncludeSubdomains] = useState(false);
  const [busy, setBusy] = useState(false);

  function openBlacklist() {
    setBlacklistScope('tenant');
    setIncludeSubdomains(false);
    setBlacklistOpen(true);
  }

  function openWhitelist() {
    setWhitelistScope('tenant');
    setWhitelistOpen(true);
  }

  async function confirmBlacklist() {
    setBusy(true);
    try {
      await addSenderFilterRule(sender, 'blacklist', apiRequest, {
        scope: blacklistScope,
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
      await addSenderFilterRule(sender, 'whitelist', apiRequest, {
        scope: whitelistScope,
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

  function notImplemented() {
    toast.info(t('notImplementedToast'));
  }

  return (
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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              disabled={readOnly}
              data-testid="email-disposal-overview-action-more"
            />
          }
        >
          <MoreHorizontal className="mr-1 h-3.5 w-3.5" />
          {t('more')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={notImplemented} data-testid="email-disposal-overview-action-more-mark-fp">
            {t('menu.markFalsePositive')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={notImplemented} data-testid="email-disposal-overview-action-more-mark-fn">
            {t('menu.markFalseNegative')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
        <AlertDialogContent data-testid="email-disposal-overview-blacklist-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('blacklistDialog.title', { sender })}</AlertDialogTitle>
            <AlertDialogDescription>{t('blacklistDialog.desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('blacklistDialog.scopeLabel')}</p>
              <RadioGroup
                value={blacklistScope}
                onValueChange={(v) => setBlacklistScope(v as ScopeValue)}
                className="flex gap-4"
              >
                <InteractiveSurface asChild variant="control" className="flex items-center gap-2 text-sm focus-within:ring-2 focus-within:ring-ring/60">
                  <label>
                    <RadioGroupItem value="tenant" data-testid="email-disposal-overview-blacklist-scope-tenant" />
                    {t('blacklistDialog.scopeTenant')}
                  </label>
                </InteractiveSurface>
                <InteractiveSurface asChild variant="control" className="flex items-center gap-2 text-sm focus-within:ring-2 focus-within:ring-ring/60">
                  <label>
                    <RadioGroupItem value="global" data-testid="email-disposal-overview-blacklist-scope-global" />
                    {t('blacklistDialog.scopeGlobal')}
                  </label>
                </InteractiveSurface>
              </RadioGroup>
            </div>
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
              variant="destructive"
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
        <AlertDialogContent data-testid="email-disposal-overview-whitelist-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('whitelistDialog.title', { sender })}</AlertDialogTitle>
            <AlertDialogDescription>{t('whitelistDialog.desc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <p className="text-sm font-medium">{t('whitelistDialog.scopeLabel')}</p>
            <RadioGroup
              value={whitelistScope}
              onValueChange={(v) => setWhitelistScope(v as ScopeValue)}
              className="flex gap-4"
            >
              <InteractiveSurface asChild variant="control" className="flex items-center gap-2 text-sm focus-within:ring-2 focus-within:ring-ring/60">
                <label>
                  <RadioGroupItem value="tenant" data-testid="email-disposal-overview-whitelist-scope-tenant" />
                  {t('whitelistDialog.scopeTenant')}
                </label>
              </InteractiveSurface>
              <InteractiveSurface asChild variant="control" className="flex items-center gap-2 text-sm focus-within:ring-2 focus-within:ring-ring/60">
                <label>
                  <RadioGroupItem value="global" data-testid="email-disposal-overview-whitelist-scope-global" />
                  {t('whitelistDialog.scopeGlobal')}
                </label>
              </InteractiveSurface>
            </RadioGroup>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} data-testid="email-disposal-overview-whitelist-cancel">
              {tOverview('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="border-emerald-600/20 bg-emerald-600 text-white data-[hovered=true]:bg-emerald-600/90"
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
  );
}
