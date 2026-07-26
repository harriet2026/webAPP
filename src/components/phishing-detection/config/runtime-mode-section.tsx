'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
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
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { getEngineConfig, putEngineConfig } from '@/lib/api/phishing-config';
import { getDisposalSettings, putDisposalSettings } from '@/lib/api/disposal-settings';
import type {
  PhishTenantEngineParams,
  PhishRunMode,
  PhishObserveAction,
  PhishTimeoutTempDisposal,
} from '@/types/phishing-config';
import type { DisposalSettings } from '@/types/disposal-settings';
import { ConfidenceBandsEditor } from './confidence-bands-editor';

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

const TIMEOUT_DISPOSITIONS: PhishTimeoutTempDisposal[] = ['deliver', 'mark'];

export function RuntimeModeSection() {
  const t = useTranslations('phishingConfig.runtime');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const engineQuery = useQuery({
    queryKey: ['phish-engine-config'],
    queryFn: () => getEngineConfig(apiRequest),
  });
  const disposalQuery = useQuery({
    queryKey: ['disposal-settings'],
    queryFn: () => getDisposalSettings(apiRequest),
  });

  const engineBaseline = engineQuery.data?.engine ?? null;
  const disposalBaseline = disposalQuery.data ?? null;

  // Local drafts. Loaded into local state via the render-phase snapshot
  // pattern (keyed off open + baseline identity) so Cancel discards.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmTimeoutClose, setConfirmTimeoutClose] = useState(false);
  const [engineDraft, setEngineDraft] = useState<PhishTenantEngineParams | null>(null);
  const [disposalDraft, setDisposalDraft] = useState<DisposalSettings | null>(null);
  const [pendingTimeoutValue, setPendingTimeoutValue] = useState<boolean | null>(null);

  // When opening the sheet (or the baseline refreshes while it's open),
  // snapshot the draft from the latest loaded data.
  const loadKey = `${sheetOpen}:${engineBaseline ? JSON.stringify(engineBaseline) : ''}:${disposalBaseline ? JSON.stringify(disposalBaseline) : ''}`;
  const [lastLoadKey, setLastLoadKey] = useState('');
  if (sheetOpen && loadKey !== lastLoadKey && engineBaseline && disposalBaseline) {
    setLastLoadKey(loadKey);
    setEngineDraft({ ...engineBaseline });
    setDisposalDraft(structuredClone(disposalBaseline));
  } else if (!sheetOpen && lastLoadKey !== '') {
    // Reset on close so a reopen with an UNCHANGED baseline re-snapshots from
    // scratch. Without this, loadKey ("true:...") matches lastLoadKey on reopen
    // and the guard is skipped, leaking the cancelled drafts into the next open
    // (mirrors admission-rule-sheet's close-time reset).
    setLastLoadKey('');
    setEngineDraft(null);
    setDisposalDraft(null);
  }

  const engine = engineDraft ?? engineBaseline;
  const disposal = disposalDraft ?? disposalBaseline;

  const dirty = useMemo(() => {
    if (!engineBaseline || !disposalBaseline || !engineDraft || !disposalDraft) return false;
    return (
      JSON.stringify(engineDraft) !== JSON.stringify(engineBaseline) ||
      JSON.stringify(disposalDraft) !== JSON.stringify(disposalBaseline)
    );
  }, [engineBaseline, disposalBaseline, engineDraft, disposalDraft]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!engineDraft || !disposalDraft) return;
      await putEngineConfig(engineDraft, apiRequest);
      await putDisposalSettings(disposalDraft, apiRequest);
    },
    onSuccess: () => {
      toast.success(t('saved'));
      setSheetOpen(false);
      queryClient.invalidateQueries({ queryKey: ['phish-engine-config'] });
      queryClient.invalidateQueries({ queryKey: ['disposal-settings'] });
      queryClient.invalidateQueries({ queryKey: ['phish-bands'] });
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('saveFailed')),
  });

  const patchEngine = (p: Partial<PhishTenantEngineParams>) =>
    setEngineDraft((cur) => (cur ? { ...cur, ...p } : cur));
  const patchDisposalReview = (p: Partial<DisposalSettings['review']>) =>
    setDisposalDraft((cur) =>
      cur ? { ...cur, review: { ...cur.review, ...p } } : cur,
    );

  const observeMode = (engine?.run_mode ?? 'realtime') === 'observe';

  const onToggleTimeoutAutoDeliver = (next: boolean) => {
    if (!next) {
      // PRD TC-11: closing async-timeout requires a confirm dialog.
      setPendingTimeoutValue(false);
      setConfirmTimeoutClose(true);
      return;
    }
    patchDisposalReview({ timeout_auto_deliver: true });
  };

  const confirmCloseTimeout = () => {
    if (pendingTimeoutValue !== null) {
      patchDisposalReview({ timeout_auto_deliver: pendingTimeoutValue });
    }
    setConfirmTimeoutClose(false);
    setPendingTimeoutValue(null);
  };

  return (
    <Card data-testid="runtime-mode-section">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!engine ? (
          <p className="text-sm text-muted-foreground">
            {engineQuery.isError ? t('engineLoadFailed') : t('loading')}
          </p>
        ) : (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <ReadonlyField
                label={t('runMode')}
                value={t(`runModeValue.${engine.run_mode}`)}
                testId="runtime-mode-summary"
              />
              <ReadonlyField
                label={t('observeAction')}
                value={
                  engine.run_mode === 'observe'
                    ? t(`observeActionValue.${engine.observe_action}`)
                    : '—'
                }
              />
              <ReadonlyField
                label={t('timeoutTempDisposal')}
                value={
                  disposal
                    ? t(`timeoutTempValue.${disposal.review.timeout_temp_disposal || 'deliver'}`)
                    : disposalQuery.isLoading
                      ? t('loading')
                      : '—'
                }
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <ReadonlyField
                label={t('totalTimeout')}
                value={
                  disposal
                    ? `${disposal.review.custom_minutes}${t('minutes')}`
                    : disposalQuery.isLoading
                      ? t('loading')
                      : '—'
                }
              />
              <ReadonlyField
                label={t('asyncTimeout')}
                value={
                  disposal
                    ? `${disposal.review.max_recheck_minutes}${t('minutes')}`
                    : disposalQuery.isLoading
                      ? t('loading')
                      : '—'
                }
              />
              <ReadonlyField
                label={t('autoDeliver')}
                value={
                  disposal
                    ? disposal.review.timeout_auto_deliver
                      ? t('autoDeliverOn')
                      : t('autoDeliverOff')
                    : disposalQuery.isLoading
                      ? t('loading')
                      : '—'
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {disposalQuery.isError ? t('disposalLoadFailed') : t('timeoutScopeNote')}
            </p>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={!disposal}
                title={!disposal ? t('editUnavailable') : undefined}
                onClick={() => setSheetOpen(true)}
                data-testid="runtime-mode-edit"
              >
                {t('edit')}
              </Button>
            </div>
          </div>
        )}

        {/* The bands editor is always visible (it's part of "运行模式" per PRD).
            observeMode disables it (Plan 5 / O6 / TC-13). */}
        <ConfidenceBandsEditor observeMode={observeMode} />
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="sm:max-w-[640px] flex flex-col gap-0 p-0"
          data-testid="runtime-mode-sheet"
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>{t('sheetTitle')}</SheetTitle>
            <SheetDescription>{t('sheetDescription')}</SheetDescription>
          </SheetHeader>

          {engineDraft && disposalDraft ? (
            <>
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
                <section className="space-y-3">
                  <h3 className="font-medium">{t('runModeSectionTitle')}</h3>
                  <div className="grid gap-2">
                    {(['realtime', 'observe'] as const).map((mode) => (
                      <label
                        key={mode}
                        className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/30"
                      >
                        <input
                          type="radio"
                          name="run-mode"
                          className="mt-0.5"
                          checked={engineDraft.run_mode === mode}
                          onChange={() => patchEngine({ run_mode: mode as PhishRunMode })}
                          data-testid={`run-mode-${mode}`}
                        />
                        <div className="space-y-0.5">
                          <div className="font-medium">{t(`runModeValue.${mode}`)}</div>
                          <p className="text-xs text-muted-foreground">
                            {t(`runModeHint.${mode}`)}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  {engineDraft.run_mode === 'observe' ? (
                    <div className="ml-7 space-y-1.5">
                      <Label>{t('observeAction')}</Label>
                      <div className="flex gap-2">
                        {(['deliver', 'mark'] as const).map((act) => (
                          <Button
                            key={act}
                            type="button"
                            size="sm"
                            variant={
                              engineDraft.observe_action === act ? 'default' : 'outline'
                            }
                            onClick={() =>
                              patchEngine({ observe_action: act as PhishObserveAction })
                            }
                            data-testid={`observe-action-${act}`}
                          >
                            {t(`observeActionValue.${act}`)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="space-y-3">
                  <h3 className="font-medium">{t('timeoutSectionTitle')}</h3>
                  <p className="text-xs text-muted-foreground">{t('timeoutScopeNote')}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="total-timeout">{t('totalTimeout')}</Label>
                        <Tooltip>
                          <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
                          <TooltipContent className="max-w-xs text-xs">{t('totalTimeoutHint')}</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="relative">
                        <Input
                          id="total-timeout"
                          type="number"
                          min={1}
                          max={60}
                          value={disposalDraft.review.custom_minutes}
                          onChange={(e) =>
                            patchDisposalReview({
                              // TC-06: total timeout clamped to 1–60 minutes.
                              custom_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 0)),
                            })
                          }
                          onBlur={(e) =>
                            patchDisposalReview({
                              custom_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                            })
                          }
                          data-testid="total-timeout-input"
                          className="pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          {t('minutes')}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <Label htmlFor="async-timeout">{t('asyncTimeout')}</Label>
                        <Tooltip>
                          <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
                          <TooltipContent className="max-w-xs text-xs">{t('asyncTimeoutHint')}</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="relative">
                        <Input
                          id="async-timeout"
                          type="number"
                          min={1}
                          max={60}
                          value={disposalDraft.review.max_recheck_minutes}
                          onChange={(e) =>
                            patchDisposalReview({
                              // Async (M) recheck window: clamp to [1, 60] minutes.
                              max_recheck_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 0)),
                            })
                          }
                          onBlur={(e) =>
                            patchDisposalReview({
                              max_recheck_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                            })
                          }
                          data-testid="async-timeout-input"
                          className="pr-12"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          {t('minutes')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">{t('autoDeliver')}</div>
                      <p className="text-xs text-muted-foreground">{t('autoDeliverHint')}</p>
                    </div>
                    <Switch
                      checked={disposalDraft.review.timeout_auto_deliver}
                      onCheckedChange={(v) => onToggleTimeoutAutoDeliver(!!v)}
                      data-testid="auto-deliver-switch"
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="font-medium">{t('timeoutTempSectionTitle')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {TIMEOUT_DISPOSITIONS.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={
                          (disposalDraft.review.timeout_temp_disposal || 'deliver') === d
                            ? 'default'
                            : 'outline'
                        }
                        onClick={() => patchDisposalReview({ timeout_temp_disposal: d })}
                        data-testid={`timeout-temp-${d}`}
                      >
                        {t(`timeoutTempValue.${d}`)}
                      </Button>
                    ))}
                  </div>
                  {(disposalDraft.review.timeout_temp_disposal || 'deliver') === 'mark' ? (
                    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                      <Label htmlFor="timeout-mark-text">{t('timeoutMarkText')}</Label>
                      <Input
                        id="timeout-mark-text"
                        value={disposalDraft.review.timeout_mark_text ?? ''}
                        maxLength={20}
                        onChange={(e) =>
                          patchDisposalReview({ timeout_mark_text: e.target.value })
                        }
                        data-testid="timeout-mark-text"
                      />
                      <p className="text-xs text-muted-foreground">{t('timeoutMarkTextHint')}</p>
                      <div className="flex flex-wrap gap-3">
                        {(['subject_prefix', 'header'] as const).map((pos) => {
                          const positions = new Set(
                            disposalDraft.review.timeout_mark_positions ?? [],
                          );
                          return (
                            <label key={pos} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={positions.has(pos)}
                                onChange={() => {
                                  if (positions.has(pos)) positions.delete(pos);
                                  else positions.add(pos);
                                  patchDisposalReview({
                                    timeout_mark_positions: Array.from(positions),
                                  });
                                }}
                                data-testid={`timeout-mark-pos-${pos}`}
                              />
                              {t(`markPosition.${pos}`)}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>

              <SheetFooter className="border-t px-6 py-3 flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setSheetOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                  data-testid="runtime-mode-save"
                >
                  {saveMutation.isPending ? t('saving') : t('save')}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmTimeoutClose}
        onOpenChange={(o) => {
          setConfirmTimeoutClose(o);
          // Clear the pending value when dismissed via Escape/overlay too, not
          // just the Cancel button — otherwise a stale value lingers.
          if (!o) setPendingTimeoutValue(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('timeoutCloseConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('timeoutCloseConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTimeoutValue(null)}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmCloseTimeout} data-testid="timeout-close-confirm">
              {t('confirmClose')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ReadonlyField({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">
        <Badge variant="outline">{value}</Badge>
      </div>
    </div>
  );
}
