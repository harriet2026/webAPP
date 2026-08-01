'use client';

// useRecipientDisposition -- Task 11b: shared per-recipient disposition
// dispatch machinery, extracted verbatim (behavior-preserving) from
// components/recipient-status.tsx so both the multi-recipient matrix
// (RecipientStatus) and the single-recipient header buttons
// (sections/overview/single-recipient-actions.tsx) drive the SAME
// deliver/discard/recall/notify dispatch logic instead of forking it.
//
// Backend supports only deliver/discard/recall/notify (spec §9-D) as
// genuine, durable dispose actions -- the `dispatch()` function below (and
// everything it guards: pending/reclassify/discard-confirm dialog state) is
// untouched by task RA-5 and stays exactly that.
//
// RA-5 (demo parity): 隔离/阻断 are ADDITIVE, DEMO-PARITY-ONLY actions with
// their own lightweight immediate-dispatch path (dispatchQuarantineOrBlock,
// below) that does not go through `pending`/dispatch() at all -- they fire
// on click with no confirm dialog (matching the demo), succeed and mutate
// state only against the mock backend, and degrade to an explicit
// "operation unsupported" toast against the real backend (which rejects any
// bulk-dispose action other than release/delete with a 400).

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ApiRequestFn } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import type { EmailType, ObjectDisposeResult, RecipientDisposition } from '@/types/email-disposal-detail';
import { recipientActionsForStatus } from '../lib/detail-helpers';
import {
  addSenderFilterRule, disposalRulePriority, disposeByObject, disposeObjectAction, notifyRecipient,
} from '../lib/disposal-detail-api';
import { recallMails } from '../lib/disposal-api';
import { ReclassifyDialog } from '../components/reclassify-dialog';

export type ActionKey = 'deliver' | 'discard' | 'recall' | 'notify' | 'quarantine' | 'block';

export interface RecipientGroup {
  key: string;
  // null for a synthetic no-object singleton group (e.g. a delivered
  // recipient with no addressable quarantine/sideline object).
  objectId: string | null;
  dispositions: RecipientDisposition[];
  status: string;
  actions: ActionKey[];
}

interface FailureRow {
  recipients: string;
  reason: string;
}

// G6: one row per affected recipient in the batch-result "操作完成" modal --
// prevStatus/newStatus are raw status keys (rendered via
// recipientStatus.status.<key>); reason is an already-i18n-resolved string
// (or a literal API-supplied reason, e.g. object-dispose's `reason` field)
// shown in place of newStatus when ok is false, or as a generic fallback
// when ok is true but there is no concrete newStatus (recall/notify, which
// don't map to a recipient-visible status per spec §9-D).
export interface RecipientResultRow {
  recipient: string;
  prevStatus: string;
  ok: boolean;
  newStatus?: string;
  reason?: string;
}

interface PendingAction {
  action: ActionKey;
  groupKeys: string[];
}

// G10: 矩阵排序 -- 待审核 → 隔离中 → 标记投递 → 已投递 → 已阻断 → 已丢弃
// (html_spec layer-11 核心规则). Groups sharing a bucket keep their original
// relative order (Array.prototype.sort is stable); groups whose status isn't
// one of the known buckets sort last.
const STATUS_ORDER: Record<string, number> = {
  pending_review: 0,
  audited: 0,
  quarantined: 1,
  sidelined: 1,
  marked_delivered: 2,
  delivered: 3,
  blocked: 4,
  rejected: 4,
  discarded: 5,
};
function statusSortKey(status: string): number {
  return STATUS_ORDER[status] ?? Number.MAX_SAFE_INTEGER;
}

// Entries sharing a non-empty object_id were disposed together as one
// object-mode batch (see DD-3/DD-5's uniform audit-object-key sites); entries
// with no object_id (delivered items, or blocked/discarded items with no
// addressable object) each form their own singleton group.
export function groupRecipientDispositions(dispositions: RecipientDisposition[]): RecipientGroup[] {
  const order: string[] = [];
  const map = new Map<string, RecipientDisposition[]>();
  let anonIdx = 0;
  for (const d of dispositions) {
    const key = d.object_id || `__no_object_${anonIdx++}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(d);
  }
  const groups = order.map((key) => {
    const items = map.get(key)!;
    // All entries in one object-mode batch share a status (they were
    // quarantined/sidelined together); take the first as representative.
    const status = items[0].status;
    return {
      key,
      objectId: items[0].object_id || null,
      dispositions: items,
      status,
      actions: recipientActionsForStatus(status, !!items[0].object_id) as ActionKey[],
    };
  });
  return groups.sort((a, b) => statusSortKey(a.status) - statusSortKey(b.status));
}

interface UseRecipientDispositionArgs {
  recipient_dispositions: RecipientDisposition[] | undefined;
  mailLogId: number;
  // Sender address of the whole message, used only to restore the old
  // overview-tab.tsx "放行并加白" (release + whitelist) behavior (spec §6.1)
  // via the deliver action's optional whitelist checkbox.
  sender: string;
  apiRequest: ApiRequestFn;
  onDisposed: () => void;
  // Called once per dispatch (success or failure) after busy/pending/dialog
  // state has settled -- lets a caller with its own selection state (e.g.
  // RecipientStatus's checkbox matrix) clear it without this hook knowing
  // about it.
  onSettled?: () => void;
}

export function useRecipientDisposition({
  recipient_dispositions, mailLogId, sender, apiRequest, onDisposed, onSettled,
}: UseRecipientDispositionArgs) {
  const t = useTranslations('emailDisposal.detail.overview');
  const { isSystemAdmin } = useAuth();

  const groups = useMemo(
    () => groupRecipientDispositions(recipient_dispositions ?? []),
    [recipient_dispositions],
  );

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // G6: batch-result modal state -- lastResults holds one row per affected
  // recipient of the most recent dispatch (single-row action or multi-select
  // batch alike); resultDialogOpen drives the "操作完成" Dialog and is set
  // true whenever a dispatch produces a non-empty result set.
  const [lastResults, setLastResults] = useState<RecipientResultRow[]>([]);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);

  function finishResults(rows: RecipientResultRow[]) {
    setLastResults(rows);
    setResultDialogOpen(rows.length > 0);
  }

  function openAction(action: ActionKey, groupKeys: string[]) {
    // RA-5: 隔离/阻断 fire immediately, with no confirm/reclassify dialog
    // (matches the demo) -- they never touch `pending`/`dispatch()`, so the
    // guarded deliver/discard/recall/notify state machine below is
    // unaffected by their existence.
    if (action === 'quarantine' || action === 'block') {
      void dispatchQuarantineOrBlock(action, groupKeys);
      return;
    }
    setLastResults([]);
    setResultDialogOpen(false);
    setPending({ action, groupKeys });
    if (action === 'deliver' || action === 'recall') {
      setReclassifyOpen(true);
    }
  }

  // dispatchQuarantineOrBlock -- RA-5's lightweight, additive immediate-fire
  // path for 隔离/阻断. Deliberately NOT folded into dispatch()/`pending`:
  // those actions have no reclassify step and no confirm dialog, so routing
  // them through the guarded state machine above would only add dead
  // branches to code whose job is to stay byte-identical for
  // deliver/discard/recall/notify. Mirrors dispatch()'s deliver/discard
  // object-mode branch (grouping, notApplicable handling, batch-result rows,
  // toasts) but calls disposeObjectAction (action='quarantine'|'block')
  // instead of disposeByObject (action='release'|'delete').
  //
  // Mock vs real detection: none needed -- the real backend's bulk-dispose
  // handler rejects any action other than release/delete with a 400
  // (internal/api/mail_log_disposal.go), so a thrown ApiError from
  // disposeObjectAction IS "the backend doesn't support this", while the
  // mock dispatcher explicitly recognizes 'quarantine'/'block' and succeeds.
  // Attempting the call and branching on its outcome is simpler and more
  // robust than inspecting localStorage's mock-enabled flag from inside a
  // hook that doesn't otherwise know about the mock subsystem.
  async function dispatchQuarantineOrBlock(action: 'quarantine' | 'block', groupKeys: string[]) {
    setBusy(true);
    setLastResults([]);
    setResultDialogOpen(false);
    try {
      const targetGroups = groups.filter((g) => groupKeys.includes(g.key));
      const applicable = targetGroups.filter((g) => g.actions.includes(action));
      const notApplicable = targetGroups.filter((g) => !g.actions.includes(action));

      const failures: FailureRow[] = notApplicable.map((g) => ({
        recipients: g.dispositions.map((d) => d.recipient).join(', '),
        reason: t('recipientStatus.notApplicable'),
      }));
      const resultRows: RecipientResultRow[] = notApplicable.flatMap((g) => g.dispositions.map((d) => ({
        recipient: d.recipient,
        prevStatus: g.status,
        ok: false,
        reason: t('recipientStatus.notApplicable'),
      })));
      const newStatusKey = action === 'quarantine' ? 'quarantined' : 'blocked';
      let succeeded = 0;

      for (const g of applicable) {
        if (!g.objectId) {
          // Unreachable in practice -- recipientActionsForStatus only ever
          // exposes quarantine/block for a group that carries an object_id
          // (same guard as deliver/discard, review High-2).
          const reason = t('recipientStatus.notApplicable');
          failures.push({ recipients: g.dispositions.map((d) => d.recipient).join(', '), reason });
          resultRows.push(...g.dispositions.map((d) => ({
            recipient: d.recipient, prevStatus: g.status, ok: false, reason,
          })));
          continue;
        }
        try {
          const resp = await disposeObjectAction(mailLogId, g.objectId, action, apiRequest);
          const results: ObjectDisposeResult[] = resp.results ?? [];
          const failed = results.find((r) => r.status !== 'succeeded');
          if (failed) {
            const reason = reasonForObjectResult(failed);
            failures.push({ recipients: g.dispositions.map((d) => d.recipient).join(', '), reason });
            resultRows.push(...g.dispositions.map((d) => ({
              recipient: d.recipient, prevStatus: g.status, ok: false, reason,
            })));
          } else {
            succeeded += 1;
            resultRows.push(...g.dispositions.map((d) => ({
              recipient: d.recipient, prevStatus: g.status, ok: true, newStatus: newStatusKey,
            })));
          }
        } catch {
          // The real backend's 400 ("action must be release or delete")
          // lands here -- demo-parity buttons on an environment that
          // genuinely can't perform them, per spec. Never silently corrupt
          // recipient state: the row is reported as failed with the
          // explicit unsupported reason, group status is left untouched.
          const reason = t('recipientStatus.quarantineBlockUnsupported');
          failures.push({ recipients: g.dispositions.map((d) => d.recipient).join(', '), reason });
          resultRows.push(...g.dispositions.map((d) => ({
            recipient: d.recipient, prevStatus: g.status, ok: false, reason,
          })));
        }
      }

      finishResults(resultRows);
      if (failures.length === 0) {
        toast.success(t('recipientStatus.actionSuccess'));
      } else if (succeeded > 0) {
        toast.error(t('recipientStatus.bulkResult', { success: succeeded, failed: failures.length }));
      } else if (applicable.length > 0) {
        // Every attempted group failed -- against the real backend this is
        // reliably the 400 "action must be release or delete" case, so lead
        // with the explicit unsupported message rather than the generic
        // actionFailed one.
        toast.error(t('recipientStatus.quarantineBlockUnsupported'));
      } else {
        toast.error(t('recipientStatus.actionFailed'));
      }
      if (succeeded > 0) onDisposed();
    } finally {
      setBusy(false);
      onSettled?.();
    }
  }

  // Maps an object-mode result's status to a distinguishable i18n reason
  // (spec §5.6): unsupported_object_target / forbidden_object_target must
  // read differently from the generic "not applicable" fallback so a user
  // can tell "this object kind can't be disposed individually yet" apart
  // from "this object doesn't belong to this message".
  function reasonForObjectResult(r: ObjectDisposeResult): string {
    if (r.status === 'unsupported_object_target') return t('recipientStatus.unsupportedObjectTarget');
    if (r.status === 'forbidden_object_target') return t('recipientStatus.forbiddenObjectTarget');
    return r.reason || t('recipientStatus.notApplicable');
  }

  async function dispatch(finalType: string | undefined, whitelistSender?: boolean) {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.action === 'notify') {
        // 事后通知 (spec §5.3): no reclassify step, no object_id -- it's a
        // pure side-channel email to each selected group's recipient(s),
        // never a dispose-state mutation.
        const targetGroups = groups.filter((g) => pending.groupKeys.includes(g.key));
        const applicable = targetGroups.filter((g) => g.actions.includes('notify'));
        const notApplicable = targetGroups.filter((g) => !g.actions.includes('notify'));
        const failures: FailureRow[] = notApplicable.map((g) => ({
          recipients: g.dispositions.map((d) => d.recipient).join(', '),
          reason: t('recipientStatus.notApplicable'),
        }));
        const resultRows: RecipientResultRow[] = notApplicable.flatMap((g) => g.dispositions.map((d) => ({
          recipient: d.recipient,
          prevStatus: g.status,
          ok: false,
          reason: t('recipientStatus.notApplicable'),
        })));
        let succeeded = 0;

        for (const g of applicable) {
          for (const d of g.dispositions) {
            try {
              await notifyRecipient(mailLogId, d.recipient, apiRequest);
              succeeded += 1;
              resultRows.push({ recipient: d.recipient, prevStatus: g.status, ok: true });
            } catch {
              failures.push({ recipients: d.recipient, reason: t('recipientStatus.actionFailed') });
              resultRows.push({
                recipient: d.recipient, prevStatus: g.status, ok: false, reason: t('recipientStatus.actionFailed'),
              });
            }
          }
        }

        finishResults(resultRows);
        if (failures.length === 0) {
          toast.success(t('recipientStatus.actionSuccess'));
        } else if (succeeded > 0) {
          toast.error(t('recipientStatus.bulkResult', { success: succeeded, failed: failures.length }));
        } else {
          toast.error(t('recipientStatus.actionFailed'));
        }
      } else if (pending.action === 'recall') {
        // Recall is always whole-message (spec §4.3) -- a delivered
        // recipient has no quarantine/sideline object to address, so a
        // successful call always targets the whole message. But only groups
        // whose status actually exposes 'recall' (recipientActionsForStatus)
        // may trigger it -- e.g. a quarantined group co-selected alongside a
        // delivered one in a multi-group batch must be reported as
        // not-applicable rather than silently causing a whole-message recall
        // it was never eligible for.
        const targetGroups = groups.filter((g) => pending.groupKeys.includes(g.key));
        const applicable = targetGroups.filter((g) => g.actions.includes('recall'));
        const notApplicable = targetGroups.filter((g) => !g.actions.includes('recall'));
        const failures: FailureRow[] = notApplicable.map((g) => ({
          recipients: g.dispositions.map((d) => d.recipient).join(', '),
          reason: t('recipientStatus.notApplicable'),
        }));
        const notApplicableRows: RecipientResultRow[] = notApplicable.flatMap((g) => g.dispositions.map((d) => ({
          recipient: d.recipient,
          prevStatus: g.status,
          ok: false,
          reason: t('recipientStatus.notApplicable'),
        })));

        if (applicable.length === 0) {
          finishResults(notApplicableRows);
          toast.error(t('recipientStatus.actionFailed'));
        } else {
          try {
            const resp = await recallMails({ mail_log_ids: [mailLogId], final_type: finalType }, apiRequest);
            const applicableRows: RecipientResultRow[] = applicable.flatMap((g) => g.dispositions.map((d) => ({
              recipient: d.recipient, prevStatus: g.status, ok: true,
            })));
            finishResults([...notApplicableRows, ...applicableRows]);
            if (resp.reclassify_failed?.includes(mailLogId)) {
              toast.warning(t('reclassifyPartialFail'));
            } else if (failures.length === 0) {
              toast.success(t('recipientStatus.actionSuccess'));
            } else {
              toast.error(t('recipientStatus.bulkResult', { success: applicable.length, failed: failures.length }));
            }
            onDisposed();
          } catch {
            const applicableFailRows: RecipientResultRow[] = applicable.flatMap((g) => g.dispositions.map((d) => ({
              recipient: d.recipient, prevStatus: g.status, ok: false, reason: t('recipientStatus.actionFailed'),
            })));
            finishResults([...notApplicableRows, ...applicableFailRows]);
            toast.error(t('recipientStatus.actionFailed'));
          }
        }
      } else {
        const action = pending.action; // 'deliver' | 'discard'
        const targetGroups = groups.filter((g) => pending.groupKeys.includes(g.key));
        const applicable = targetGroups.filter((g) => g.actions.includes(action));
        const notApplicable = targetGroups.filter((g) => !g.actions.includes(action));

        const failures: FailureRow[] = notApplicable.map((g) => ({
          recipients: g.dispositions.map((d) => d.recipient).join(', '),
          reason: t('recipientStatus.notApplicable'),
        }));
        const resultRows: RecipientResultRow[] = notApplicable.flatMap((g) => g.dispositions.map((d) => ({
          recipient: d.recipient,
          prevStatus: g.status,
          ok: false,
          reason: t('recipientStatus.notApplicable'),
        })));
        // G6: deliver/discard resolve to a concrete, recipient-visible
        // status, so their success rows carry newStatus (unlike
        // recall/notify, which have no such mapping in this backend).
        const newStatusKey = action === 'deliver' ? 'delivered' : 'discarded';
        let succeeded = 0;
        let reclassifyFailedAny = false;

        for (const g of applicable) {
          try {
            if (!g.objectId) {
              // recipientActionsForStatus only exposes deliver/discard for a
              // group that carries an object_id (review High-2), so this
              // should be unreachable. Never fall back to a whole-message
              // dispose here -- that would silently act on every recipient
              // of the message instead of just this group.
              const reason = t('recipientStatus.notApplicable');
              failures.push({ recipients: g.dispositions.map((d) => d.recipient).join(', '), reason });
              resultRows.push(...g.dispositions.map((d) => ({
                recipient: d.recipient, prevStatus: g.status, ok: false, reason,
              })));
              continue;
            }
            const resp = await disposeByObject(
              mailLogId,
              g.objectId,
              action === 'deliver' ? 'release' : 'delete',
              action === 'deliver' ? finalType : undefined,
              apiRequest,
            );
            const results: ObjectDisposeResult[] = resp.results ?? [];
            const failed = results.find((r) => r.status !== 'succeeded');
            if (failed) {
              const reason = reasonForObjectResult(failed);
              failures.push({ recipients: g.dispositions.map((d) => d.recipient).join(', '), reason });
              resultRows.push(...g.dispositions.map((d) => ({
                recipient: d.recipient, prevStatus: g.status, ok: false, reason,
              })));
            } else {
              succeeded += 1;
              if (results.some((r) => r.reclassify_failed)) reclassifyFailedAny = true;
              resultRows.push(...g.dispositions.map((d) => ({
                recipient: d.recipient, prevStatus: g.status, ok: true, newStatus: newStatusKey,
              })));
            }
          } catch {
            const reason = t('recipientStatus.actionFailed');
            failures.push({ recipients: g.dispositions.map((d) => d.recipient).join(', '), reason });
            resultRows.push(...g.dispositions.map((d) => ({
              recipient: d.recipient, prevStatus: g.status, ok: false, reason,
            })));
          }
        }

        finishResults(resultRows);
        // Restore old overview-tab.tsx's "放行并加白" two-step, partial-
        // failure-tolerant shape (spec §6.1): the whitelist rule is only
        // attempted once (the sender is fixed for the whole message,
        // regardless of how many recipient groups were disposed), and its
        // failure never turns an already-successful dispose into a reported
        // failure -- it just gets its own toast.
        let ruleOk = true;
        if (action === 'deliver' && whitelistSender && succeeded > 0) {
          try {
            await addSenderFilterRule(sender, 'whitelist', apiRequest, disposalRulePriority(isSystemAdmin));
          } catch {
            ruleOk = false;
            toast.warning(t('rulePartialFail'));
          }
        }
        if (reclassifyFailedAny) toast.warning(t('reclassifyPartialFail'));
        if (failures.length === 0) {
          if (ruleOk && !reclassifyFailedAny) toast.success(t('recipientStatus.actionSuccess'));
        } else if (succeeded > 0) {
          toast.error(t('recipientStatus.bulkResult', { success: succeeded, failed: failures.length }));
        } else {
          toast.error(t('recipientStatus.actionFailed'));
        }
        if (succeeded > 0) onDisposed();
      }
    } finally {
      setBusy(false);
      setPending(null);
      setReclassifyOpen(false);
      onSettled?.();
    }
  }

  function confirmDiscard() {
    // discard has no reclassify step per spec -- dispatch directly.
    void dispatch(undefined);
  }

  function confirmNotify() {
    // notify has no reclassify step -- dispatch directly.
    void dispatch(undefined);
  }

  const reclassifyDefaultType: EmailType = pending?.action === 'recall' ? 'spam' : 'normal';

  // G5 (v2 html_spec layer-14 §③ showDeleteConfirm): the discard confirm
  // dialog carries a red recipient info bar naming exactly who this
  // dispatch targets -- computed from the SAME pending.groupKeys used by
  // dispatch() itself, so what the operator sees always matches what
  // actually gets discarded. Review Important fix: dispatch()'s discard
  // branch further restricts targetGroups to `applicable` (groups whose
  // actions actually include 'discard') -- this must apply the identical
  // predicate, or a co-selected group without 'discard' in its actions
  // (a silent no-op in dispatch) would still be listed here as if it were
  // being discarded.
  const pendingDiscardRecipients = pending && pending.action === 'discard'
    ? groups
      .filter((g) => pending.groupKeys.includes(g.key) && g.actions.includes('discard'))
      .flatMap((g) => g.dispositions.map((d) => d.recipient))
    : [];

  const DispositionDialogs = (
    <>
      <ReclassifyDialog
        open={reclassifyOpen && pending != null && pending.action !== 'discard' && pending.action !== 'notify'}
        onOpenChange={(o) => { setReclassifyOpen(o); if (!o) setPending(null); }}
        defaultType={reclassifyDefaultType}
        onConfirm={(finalType, whitelistSender) => void dispatch(finalType, whitelistSender)}
        showWhitelistOption={pending?.action === 'deliver'}
        busy={busy}
      />

      {/* G5 (v2 html_spec layer-14 §③ showDeleteConfirm): red title, a red
          recipient info bar naming the target(s), a description conveying
          「该操作不可恢复」, and a red-filled confirm button. */}
      <AlertDialog
        open={pending != null && pending.action === 'discard'}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400">
              {t('recipientStatus.confirmDiscard.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('recipientStatus.confirmDiscard.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDiscardRecipients.length > 0 && (
            <div
              className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300"
              data-testid="email-disposal-discard-confirm-recipients"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span className="truncate">{pendingDiscardRecipients.join('、')}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="border-transparent bg-red-600 text-white data-[hovered=true]:bg-red-700"
              onClick={(e) => { e.preventDefault(); confirmDiscard(); }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('recipientStatus.confirmDiscard.confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pending != null && pending.action === 'notify'}
        onOpenChange={(o) => !o && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('recipientStatus.confirmNotify.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('recipientStatus.confirmNotify.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); confirmNotify(); }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('confirmBtn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return {
    groups,
    openAction,
    busy,
    lastResults,
    resultDialogOpen,
    closeResultDialog: () => setResultDialogOpen(false),
    DispositionDialogs,
  };
}
