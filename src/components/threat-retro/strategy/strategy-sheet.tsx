'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Button } from '@/components/ui/button';
import { useApiRequest } from '@/lib/api/client';
import {
  createStrategy,
  updateStrategy,
  startScan,
  getAgentState,
} from '@/lib/api/threat-retro';
import { makeStrategy, overlapWarn, validateStrategy } from './strategy-defaults';
import { BasicInfoBlock } from './blocks/basic-info-block';
import { TriggerBlock } from './blocks/trigger-block';
import { ResourceLimitsBlock } from './blocks/resource-limits-block';
import { DispositionBlock } from './blocks/disposition-block';
import type { ThreatRetroStrategy } from '@/types/threat-retro';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { useThreatRetroAccess } from '../access';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ThreatRetroStrategy | null;
  list: ThreatRetroStrategy[];
  onSaved: () => void;
}

function isDeepDraftEqualMode(a: ThreatRetroStrategy, b: ThreatRetroStrategy): boolean {
  // structural shallow equality for dirty tracking
  return JSON.stringify(a) === JSON.stringify(b);
}

export function StrategySheet({ open, onOpenChange, initial, list, onSaved }: Props) {
  const t = useTranslations('threatRetroStrategy');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest } = useApiRequest();
  const { canEdit } = useThreatRetroAccess();

  const { data: agentState } = useQuery({
    queryKey: ['tr-agent-state'],
    queryFn: () => getAgentState(apiRequest),
    enabled: open,
  });

  const baseDraft = useMemo(() => initial ?? makeStrategy('deep'), [initial]);
  const [draft, setDraft] = useState<ThreatRetroStrategy>(baseDraft);
  // cleanDraft tracks the last-saved state so dirty = false after a successful save.
  const [cleanDraft, setCleanDraft] = useState<ThreatRetroStrategy>(baseDraft);
  const [confirmClose, setConfirmClose] = useState(false);

  // snapshot draft on open transitions (no useEffect → no cascading renders).
  const [lastKey, setLastKey] = useState('');
  const key = `${open ? 'open' : 'closed'}:${initial?.id ?? 'new'}`;
  if (key !== lastKey) {
    setLastKey(key);
    if (open) {
      setDraft(baseDraft);
      setCleanDraft(baseDraft);
    }
  }

  const patch = (p: Partial<ThreatRetroStrategy>) => setDraft((cur) => ({ ...cur, ...p }));
  const errors = validateStrategy(draft);
  const overlap = overlapWarn(draft, list);
  const dirty = !isDeepDraftEqualMode(draft, cleanDraft);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (draft.id !== undefined) {
        await updateStrategy(draft.id, draft, apiRequest);
      } else {
        await createStrategy(draft, apiRequest);
      }
    },
    onSuccess: () => {
      toast.success(draft.id !== undefined ? t('toast.updated') : t('toast.created'));
      setCleanDraft(draft); // reset dirty tracker — closing after save won't prompt
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, t('toast.saveError'))),
  });

  const saveAndTestMutation = useMutation({
    mutationFn: async () => {
      let id = draft.id;
      if (id !== undefined) {
        await updateStrategy(id, draft, apiRequest);
      } else {
        const created = await createStrategy(draft, apiRequest);
        id = created.id;
        setDraft((cur) => ({ ...cur, id }));
      }
      const now = new Date();
      const start = new Date(now);
      start.setMinutes(start.getMinutes() - draft.lookback_window_minutes);
      await startScan(
        { strategy_id: id!, window_start: start.toISOString(), window_end: now.toISOString(), test: true },
        apiRequest,
      );
    },
    onSuccess: () => {
      toast.success(t('toast.testStarted'));
      setCleanDraft((cur) => ({ ...cur, id: draft.id })); // mark saved
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, t('toast.saveError'))),
  });

  const handleSave = () => {
    if (Object.keys(errors).length > 0) {
      toast.error(t('toast.invalid'));
      return;
    }
    saveMutation.mutate();
  };

  const handleSaveAndTest = () => {
    if (Object.keys(errors).length > 0) {
      toast.error(t('toast.invalid'));
      return;
    }
    saveAndTestMutation.mutate();
  };

  const tryClose = () => {
    if (dirty) setConfirmClose(true);
    else onOpenChange(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) tryClose();
          else onOpenChange(true);
        }}
      >
        <SheetContent
          side="right"
          data-testid="strategy-sheet"
          className="sm:max-w-[640px] flex flex-col gap-0 p-0"
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{initial ? t('sheet.editTitle') : t('sheet.createTitle')}</SheetTitle>
            <SheetDescription>{t('sheet.description')}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Non-admins get a read-only form (spec §9/§11): a disabled
                fieldset disables every nested control so the whole strategy
                form is greyed out, not just the save buttons (review P2-10). */}
            <fieldset
              disabled={!canEdit}
              className={`m-0 min-w-0 space-y-6 border-0 p-0 ${!canEdit ? 'opacity-60' : ''}`}
            >
              <BasicInfoBlock draft={draft} patch={patch} errors={{ name: errors.name }} />
              <TriggerBlock
                draft={draft}
                patch={patch}
                errors={{
                  confidence: errors.confidence,
                  cooldown: errors.cooldown,
                  listenSources: errors.listenSources,
                  runTimes: errors.runTimes,
                  lookback: errors.lookback,
                }}
                overlapConflict={overlap}
              />
              <ResourceLimitsBlock
                draft={draft}
                patch={patch}
                isAdmin={canEdit}
                agentState={agentState}
                errors={{ maxToolCalls: errors.maxToolCalls, maxUrlFetches: errors.maxUrlFetches }}
              />
              <DispositionBlock draft={draft} patch={patch} errors={{ recipients: errors.recipients, confidence: errors.confidence, autoConfidence: errors.autoConfidence, decisionTimeout: errors.decisionTimeout, maxRecall: errors.maxRecall, circuitBreaker: errors.circuitBreaker, exclusionTags: errors.exclusionTags, exclusionEmails: errors.exclusionEmails }} />
              {initial ? (
                <section className="space-y-3 border-t pt-5">
                  <h3 className="text-sm font-semibold">{t('sheet.runStats')}</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><p className="text-muted-foreground">{t('sheet.statsTriggers')}</p><strong>{initial.stats?.triggers ?? 0}</strong></div>
                    <div><p className="text-muted-foreground">{t('sheet.statsLeaks')}</p><strong>{initial.stats?.leaks_found ?? 0}</strong></div>
                    <div><p className="text-muted-foreground">{t('sheet.statsRecalled')}</p><strong>{initial.stats?.recalled ?? 0}</strong></div>
                    <div><p className="text-muted-foreground">{t('sheet.nextRun')}</p><strong>{formatTenantTimestamp(initial.next_run)}</strong></div>
                  </div>
                </section>
              ) : null}
            </fieldset>
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-3">
            <Button variant="outline" onClick={tryClose} disabled={saveMutation.isPending}>
              {t('sheet.cancel')}
            </Button>
            <Button
              data-testid="strategy-save"
              onClick={handleSave}
              disabled={!canEdit || saveMutation.isPending || saveAndTestMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('sheet.save')}
            </Button>
            {draft.mode === 'deep' ? (
              <Button
                variant="secondary"
                onClick={handleSaveAndTest}
                disabled={!canEdit || !agentState?.enabled || saveMutation.isPending || saveAndTestMutation.isPending}
                data-testid="strategy-save-and-test"
              >
                {saveAndTestMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t('sheet.saveAndTest')}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sheet.confirmCloseTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sheet.confirmCloseDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('sheet.keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmClose(false);
                onOpenChange(false);
              }}
            >
              {t('sheet.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function formatTenantTimestamp(value?: string | null): string {
  if (!value) return '—';
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/);
  if (!match) return value;
  const zone = match[3] === 'Z' ? 'UTC' : `UTC${match[3]}`;
  return `${match[1]} ${match[2]} (${zone})`;
}
