'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { HelpCircle, Pencil, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { CollapsibleSectionTrigger } from '@/components/ui/collapsible-section-trigger';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { getBands, getEngineConfig, putBands, putEngineConfig } from '@/lib/api/phishing-config';
import { getDisposalSettings, putDisposalSettings } from '@/lib/api/disposal-settings';
import type {
  PhishTenantEngineParams,
  PhishRunMode,
  PhishObserveAction,
  PhishBand,
} from '@/types/phishing-config';
import { detectProtectionLevel, PHISHING_PRESETS } from './protection-presets';
import type { DisposalSettings } from '@/types/disposal-settings';
import { ConfidenceBandsTable, defaultBands, validateBandsContiguous } from './confidence-bands-editor';

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

const RUN_MODES: PhishRunMode[] = ['realtime', 'observe'];
const OBSERVE_ACTIONS: PhishObserveAction[] = ['deliver', 'mark'];

// A large radio-style option card used for the two mutually-exclusive choices
// in this drawer (run mode, observe action). Purely presentational — the
// underlying value set and semantics are unchanged from the previous
// Select/Button controls.
function OptionCard({
  selected,
  title,
  description,
  onClick,
  testId,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'flex-1 rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-primary' : 'border-muted-foreground/40',
          )}
        >
          {selected ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </span>
      {description ? (
        <span className="mt-1 block pl-6 text-xs text-muted-foreground">{description}</span>
      ) : null}
    </button>
  );
}

// The disposition-policy card is a single unit of edit: run mode + protection
// level + timeout policy + confidence bands all share one draft and one
// Save/Cancel pair. The card itself only shows a read-only summary of the
// current baseline; all editing happens inside the "运行模式配置" drawer,
// which snapshots its own draft when opened and only writes back to the
// server when the drawer's Save is clicked (Cancel just closes and discards).
export function DispositionPolicyCard() {
  const t = useTranslations('phishingConfig.runtime');
  const tb = useTranslations('phishingConfig.bands');
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
  const bandsQuery = useQuery({
    queryKey: ['phish-bands'],
    queryFn: () => getBands(apiRequest),
  });

  const engineBaseline = engineQuery.data?.engine ?? null;
  const disposalBaseline = disposalQuery.data ?? null;
  const bandsBaseline = bandsQuery.data && bandsQuery.data.length > 0 ? bandsQuery.data : defaultBands();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [engineDraft, setEngineDraft] = useState<PhishTenantEngineParams | null>(null);
  const [disposalDraft, setDisposalDraft] = useState<DisposalSettings | null>(null);
  const [bandsDraft, setBandsDraft] = useState<PhishBand[] | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmTimeoutClose, setConfirmTimeoutClose] = useState(false);
  const [pendingTimeoutValue, setPendingTimeoutValue] = useState<boolean | null>(null);

  const loaded = !!(engineBaseline && disposalBaseline);

  const openSheet = () => {
    if (!engineBaseline || !disposalBaseline) return;
    setEngineDraft({ ...engineBaseline });
    const disposalDraftClone = structuredClone(disposalBaseline);
    // "超时临时处置" 现在只保留「标记」这一种动作（UI 已去掉"正常投递"/"按沙箱透视
    // 结果处置"），在此归一化，避免存量数据（旧值 deliver/by_result）流入编辑态。
    disposalDraftClone.review.timeout_temp_disposal = 'mark';
    setDisposalDraft(disposalDraftClone);
    // 「置信度分级处置」的"放行"（accept）动作已从可选项中移除；若存量配置里
    // 仍带有旧值，在此归一化为"进行下一步"（mark，不预置标记位置/文案）。
    setBandsDraft(
      structuredClone(bandsBaseline).map((b) =>
        (b.disposition as string) === 'accept' ? { ...b, disposition: 'mark' } : b,
      ),
    );
    setAdvancedOpen(false);
    setSheetOpen(true);
  };

  const engine = engineDraft;
  const disposal = disposalDraft;
  const bands = bandsDraft ?? [];
  const draftRunMode = engine?.run_mode ?? 'realtime';
  const draftObserveMode = draftRunMode === 'observe';
  const bandsError = validateBandsContiguous(bands);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!engineDraft || !disposalDraft || !bandsDraft) return;
      await putEngineConfig(
        { ...engineDraft, protection_level: engineDraft.protection_level ?? detectProtectionLevel(bandsDraft) },
        apiRequest,
      );
      await putBands(bandsDraft, apiRequest);
      await putDisposalSettings(disposalDraft, apiRequest);
    },
    onSuccess: () => {
      toast.success(t('saved'));
      queryClient.invalidateQueries({ queryKey: ['phish-engine-config'] });
      queryClient.invalidateQueries({ queryKey: ['disposal-settings'] });
      queryClient.invalidateQueries({ queryKey: ['phish-bands'] });
      setSheetOpen(false);
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('saveFailed')),
  });

  const patchEngine = (p: Partial<PhishTenantEngineParams>) =>
    setEngineDraft((cur) => (cur ? { ...cur, ...p } : cur));

  const onRunModeChange = (mode: PhishRunMode) => {
    patchEngine({ run_mode: mode, protection_level: engineDraft?.protection_level ?? 'standard' });
    if (mode === 'realtime' && (!bandsDraft || bandsDraft.length === 0)) {
      // Re-entering realtime with no bands configured yet defaults to the
      // Standard preset so the table is always meaningfully filled in. The
      // "防护等级" picker itself is no longer exposed in this drawer, but the
      // backend still stores protection_level, so it's derived silently.
      setBandsDraft(structuredClone(PHISHING_PRESETS.standard.bands));
    }
  };

  const onToggleTimeoutAutoDeliver = (next: boolean) => {
    if (!next) {
      setPendingTimeoutValue(false);
      setConfirmTimeoutClose(true);
      return;
    }
    setDisposalDraft((cur) => (cur ? { ...cur, review: { ...cur.review, timeout_auto_deliver: true } } : cur));
  };

  const confirmCloseTimeout = () => {
    if (pendingTimeoutValue !== null) {
      setDisposalDraft((cur) =>
        cur ? { ...cur, review: { ...cur.review, timeout_auto_deliver: pendingTimeoutValue } } : cur,
      );
    }
    setConfirmTimeoutClose(false);
    setPendingTimeoutValue(null);
  };

  // ---- collapsed-card summary (always reads the baseline, never the draft) ----
  const baselineRunMode: PhishRunMode = engineBaseline?.run_mode ?? 'realtime';
  const baselineObserveMode = baselineRunMode === 'observe';
  const summaryText = !loaded
    ? ''
    : baselineObserveMode
      ? t('summaryObserve', { action: t(`observeActionValue.${engineBaseline!.observe_action}`) })
      : t('summaryRealtime', {
          autoDeliver: disposalBaseline!.review.timeout_auto_deliver ? t('autoDeliverOn') : t('autoDeliverOff'),
          tempDisposal: t(`timeoutTempValue.${disposalBaseline!.review.timeout_temp_disposal || 'deliver'}`),
          bandsCount: bandsBaseline.length,
        });

  return (
    <Card className="border-l-4 border-l-red-500" data-testid="disposition-policy-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-600" />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">
            {engineQuery.isError ? t('engineLoadFailed') : t('loading')}
          </p>
        ) : (
          <>
            {baselineObserveMode ? (
              <div
                className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400"
                data-testid="observe-mode-banner"
              >
                <span>{t('observeModeBanner')}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('runMode')}</span>
                  <span className="text-xs text-muted-foreground">{t('runModeFootnote')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={
                      baselineObserveMode
                        ? 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400'
                        : 'bg-red-500/15 text-red-700 dark:text-red-400'
                    }
                    data-testid="run-mode-badge"
                  >
                    {t(`runModeValue.${baselineRunMode}`)}
                  </Badge>
                  <span className="text-sm text-muted-foreground" data-testid="run-mode-summary">
                    {summaryText}
                  </span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={openSheet} data-testid="policy-edit">
                <Pencil className="h-3.5 w-3.5" />
                {t('edit')}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {/* 运行模式配置 — the single large drawer holding every editable field. */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="sm:max-w-[640px] flex flex-col gap-0 p-0"
          data-testid="disposition-edit-sheet"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>{t('sheetTitle')}</SheetTitle>
            <SheetDescription>{t('sheetDescription')}</SheetDescription>
          </SheetHeader>

          {engine && disposal ? (
            <>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                {/* 运行模式 */}
                <div className="space-y-2">
                  <Label>{t('runMode')}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {RUN_MODES.map((mode) => (
                      <OptionCard
                        key={mode}
                        selected={draftRunMode === mode}
                        title={t(`runModeValue.${mode}`)}
                        description={t(`runModeHint.${mode}`)}
                        onClick={() => onRunModeChange(mode)}
                        testId={`run-mode-${mode}`}
                      />
                    ))}
                  </div>
                  {!draftObserveMode ? (
                    <p className="text-xs text-muted-foreground" data-testid="run-mode-cascade-hint">
                      {t('runModeCascadeHint')}
                    </p>
                  ) : null}
                </div>

                {draftObserveMode ? (
                  <div className="space-y-3">
                    <div
                      className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400"
                      data-testid="sheet-observe-banner"
                    >
                      {t('observeModeBanner')}
                    </div>
                    <div className="space-y-2">
                      <Label>{t('observeAction')}</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        {OBSERVE_ACTIONS.map((act) => (
                          <OptionCard
                            key={act}
                            selected={engine.observe_action === act}
                            title={t(`observeActionValue.${act}`)}
                            description={t(`observeActionHint.${act}`)}
                            onClick={() => patchEngine({ observe_action: act })}
                            testId={`observe-action-${act}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 超时策略 */}
                    <div className="space-y-4 rounded-lg border p-3" data-testid="timeout-section">
                      <Label>{t('timeoutSectionTitle')}</Label>

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <div className="text-sm font-medium">{t('autoDeliver')}</div>
                          <p className="text-xs text-muted-foreground">{t('autoDeliverHint')}</p>
                        </div>
                        <Switch
                          checked={disposal.review.timeout_auto_deliver}
                          onCheckedChange={(v) => onToggleTimeoutAutoDeliver(!!v)}
                          data-testid="auto-deliver-switch"
                        />
                      </div>

                      {disposal.review.timeout_auto_deliver ? (
                        <div className="space-y-2" data-testid="timeout-temp-disposal-section">
                          <Label>{t('timeoutTempDisposal')}</Label>
                          <p className="text-xs text-muted-foreground">{t('timeoutTempDisposalHint')}</p>
                          {/* 超时临时处置目前只保留「标记」这一种动作（已去掉"正常投递"/"按沙箱
                              透视结果处置"），因此不再需要选择器——直接展示标记配置。 */}
                          <div className="space-y-2 rounded-md border bg-muted/30 p-3" data-testid="timeout-temp-mark-config">
                            <Label htmlFor="timeout-mark-text">{t('timeoutMarkText')}</Label>
                            <Input
                              id="timeout-mark-text"
                              value={disposal.review.timeout_mark_text ?? ''}
                              maxLength={20}
                              onChange={(e) =>
                                setDisposalDraft((cur) =>
                                  cur
                                    ? { ...cur, review: { ...cur.review, timeout_mark_text: e.target.value } }
                                    : cur,
                                )
                              }
                              data-testid="timeout-mark-text"
                            />
                            <p className="text-xs text-muted-foreground">{t('timeoutMarkTextHint')}</p>
                            <div className="flex flex-wrap items-center gap-3">
                              {(['subject_prefix', 'header'] as const).map((pos) => {
                                const positions = new Set(disposal.review.timeout_mark_positions ?? []);
                                return (
                                  <label key={pos} className="flex items-center gap-1 text-xs">
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5"
                                      checked={positions.has(pos)}
                                      onChange={() => {
                                        if (positions.has(pos)) positions.delete(pos);
                                        else positions.add(pos);
                                        setDisposalDraft((cur) =>
                                          cur
                                            ? {
                                                ...cur,
                                                review: {
                                                  ...cur.review,
                                                  timeout_mark_positions: Array.from(positions),
                                                },
                                              }
                                            : cur,
                                        );
                                      }}
                                      data-testid={`timeout-mark-pos-${pos}`}
                                    />
                                    {t(`markPosition.${pos}`)}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                        <CollapsibleSectionTrigger className="h-9" data-testid="timeout-advanced-trigger">
                          {t('advancedSettings')}
                        </CollapsibleSectionTrigger>
                        <CollapsibleContent className="mt-3 space-y-4">
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
                                value={disposal.review.custom_minutes}
                                onChange={(e) =>
                                  setDisposalDraft((cur) =>
                                    cur
                                      ? {
                                          ...cur,
                                          review: {
                                            ...cur.review,
                                            custom_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 0)),
                                          },
                                        }
                                      : cur,
                                  )
                                }
                                onBlur={(e) =>
                                  setDisposalDraft((cur) =>
                                    cur
                                      ? {
                                          ...cur,
                                          review: {
                                            ...cur.review,
                                            custom_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                                          },
                                        }
                                      : cur,
                                  )
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
                                value={disposal.review.max_recheck_minutes}
                                onChange={(e) =>
                                  setDisposalDraft((cur) =>
                                    cur
                                      ? {
                                          ...cur,
                                          review: {
                                            ...cur.review,
                                            max_recheck_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 0)),
                                          },
                                        }
                                      : cur,
                                  )
                                }
                                onBlur={(e) =>
                                  setDisposalDraft((cur) =>
                                    cur
                                      ? {
                                          ...cur,
                                          review: {
                                            ...cur.review,
                                            max_recheck_minutes: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                                          },
                                        }
                                      : cur,
                                  )
                                }
                                data-testid="async-timeout-input"
                                className="pr-12"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                                {t('minutes')}
                              </span>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>

                    {/* 置信度分级处置策略 */}
                    <div className="space-y-2">
                      <Label>{tb('title')}</Label>
                      <p className="text-xs text-muted-foreground">{tb('description')}</p>
                      <ConfidenceBandsTable
                        bands={bands}
                        disabled={false}
                        onChange={(next) => setBandsDraft(next)}
                      />
                    </div>
                  </>
                )}
              </div>

              <SheetFooter className="border-t px-5 py-3 flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setSheetOpen(false)} data-testid="policy-cancel">
                  {t('cancel')}
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!!bandsError || saveMutation.isPending}
                  data-testid="policy-save"
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
