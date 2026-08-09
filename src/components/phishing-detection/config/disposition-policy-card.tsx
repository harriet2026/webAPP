'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { HelpCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { getBands, getEngineConfig, putBands, putEngineConfig } from '@/lib/api/phishing-config';
import { getDisposalSettings, putDisposalSettings } from '@/lib/api/disposal-settings';
import type {
  PhishTenantEngineParams,
  PhishRunMode,
  PhishObserveAction,
  PhishTimeoutTempDisposal,
  PhishProtectionLevel,
  PhishBand,
} from '@/types/phishing-config';
import { detectProtectionLevel, PHISHING_PRESETS } from './protection-presets';
import type { DisposalSettings } from '@/types/disposal-settings';
import { ConfidenceBandsTable, defaultBands, validateBandsContiguous } from './confidence-bands-editor';

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

const TIMEOUT_DISPOSITIONS: PhishTimeoutTempDisposal[] = ['deliver', 'mark'];
const PRESET_LEVELS: PhishProtectionLevel[] = ['standard', 'strict', 'custom'];

// The disposition-policy card is a single unit of edit: run mode + protection
// level + timeout policy + confidence bands all share one draft and one
// Save/Cancel pair (per the "处置策略" PRD — everything visible inline, no
// per-field save). Only the timeout sub-form is tucked behind a small drawer;
// applying it there just updates the shared draft, it does not hit the API.
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
  const bandsBaseline = useMemo(
    () => (bandsQuery.data && bandsQuery.data.length > 0 ? bandsQuery.data : defaultBands()),
    [bandsQuery.data],
  );

  const [engineDraft, setEngineDraft] = useState<PhishTenantEngineParams | null>(null);
  const [disposalDraft, setDisposalDraft] = useState<DisposalSettings | null>(null);
  const [bandsDraft, setBandsDraft] = useState<PhishBand[] | null>(null);
  // Tracks which preset (if any) is currently "applied" so a manual edit can
  // offer a one-click "恢复为标准/严格防护" back to it (PRD §四.3).
  const [lastPreset, setLastPreset] = useState<PhishProtectionLevel | null>(null);
  const [pendingPresetSwitch, setPendingPresetSwitch] = useState<'standard' | 'strict' | null>(null);
  const [timeoutSheetOpen, setTimeoutSheetOpen] = useState(false);
  const [timeoutDraft, setTimeoutDraft] = useState<DisposalSettings | null>(null);
  const [confirmTimeoutClose, setConfirmTimeoutClose] = useState(false);
  const [pendingTimeoutValue, setPendingTimeoutValue] = useState<boolean | null>(null);

  // Snapshot drafts from the latest loaded baseline exactly once per baseline
  // identity (mirrors the render-phase snapshot pattern used elsewhere in this
  // page), so a background refetch doesn't clobber in-progress edits.
  const loadKey = `${engineBaseline ? JSON.stringify(engineBaseline) : ''}:${disposalBaseline ? JSON.stringify(disposalBaseline) : ''}:${JSON.stringify(bandsBaseline)}`;
  const [lastLoadKey, setLastLoadKey] = useState('');
  if (loadKey !== lastLoadKey && engineBaseline && disposalBaseline) {
    setLastLoadKey(loadKey);
    setEngineDraft({ ...engineBaseline });
    setDisposalDraft(structuredClone(disposalBaseline));
    setBandsDraft(structuredClone(bandsBaseline));
    const initialLevel = engineBaseline.protection_level ?? detectProtectionLevel(bandsBaseline);
    setLastPreset(initialLevel === 'custom' ? null : initialLevel);
  }

  const engine = engineDraft;
  const disposal = disposalDraft;
  const bands = bandsDraft ?? [];
  const protectionLevel = (engine?.protection_level ?? detectProtectionLevel(bands)) as PhishProtectionLevel;
  const runMode = engine?.run_mode ?? 'realtime';
  const observeMode = runMode === 'observe';
  const bandsError = validateBandsContiguous(bands);

  const dirty = useMemo(() => {
    if (!engineBaseline || !disposalBaseline || !engineDraft || !disposalDraft || !bandsDraft) return false;
    return (
      JSON.stringify(engineDraft) !== JSON.stringify(engineBaseline) ||
      JSON.stringify(disposalDraft) !== JSON.stringify(disposalBaseline) ||
      JSON.stringify(bandsDraft) !== JSON.stringify(bandsBaseline)
    );
  }, [engineBaseline, disposalBaseline, bandsBaseline, engineDraft, disposalDraft, bandsDraft]);

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
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('saveFailed')),
  });

  const patchEngine = (p: Partial<PhishTenantEngineParams>) =>
    setEngineDraft((cur) => (cur ? { ...cur, ...p } : cur));

  const cancelAll = () => {
    if (!engineBaseline || !disposalBaseline) return;
    setEngineDraft({ ...engineBaseline });
    setDisposalDraft(structuredClone(disposalBaseline));
    setBandsDraft(structuredClone(bandsBaseline));
    const initialLevel = engineBaseline.protection_level ?? detectProtectionLevel(bandsBaseline);
    setLastPreset(initialLevel === 'custom' ? null : initialLevel);
  };

  const applyPreset = (level: 'standard' | 'strict') => {
    setBandsDraft(structuredClone(PHISHING_PRESETS[level].bands));
    patchEngine({ protection_level: level });
    setLastPreset(level);
  };

  const onPresetClick = (level: 'standard' | 'strict') => {
    // A dirty custom table would be silently overwritten by the preset — the
    // PRD requires a confirm before that happens (TC-06).
    if (protectionLevel === 'custom' && bandsDraft && bandsBaseline) {
      setPendingPresetSwitch(level);
      return;
    }
    applyPreset(level);
  };

  const onRestorePreset = () => {
    if (lastPreset === 'standard' || lastPreset === 'strict') applyPreset(lastPreset);
  };

  const onRunModeChange = (mode: PhishRunMode) => {
    patchEngine({ run_mode: mode });
    if (mode === 'realtime' && !engineDraft?.protection_level) {
      // Re-entering realtime with no explicit preset chosen yet defaults to
      // Standard so the bands table is always meaningfully filled in.
      applyPreset('standard');
    }
  };

  const onToggleTimeoutAutoDeliver = (next: boolean) => {
    if (!next) {
      setPendingTimeoutValue(false);
      setConfirmTimeoutClose(true);
      return;
    }
    setTimeoutDraft((cur) => (cur ? { ...cur, review: { ...cur.review, timeout_auto_deliver: true } } : cur));
  };

  const confirmCloseTimeout = () => {
    if (pendingTimeoutValue !== null) {
      setTimeoutDraft((cur) =>
        cur ? { ...cur, review: { ...cur.review, timeout_auto_deliver: pendingTimeoutValue } } : cur,
      );
    }
    setConfirmTimeoutClose(false);
    setPendingTimeoutValue(null);
  };

  const openTimeoutSheet = () => {
    if (!disposalDraft) return;
    setTimeoutDraft(structuredClone(disposalDraft));
    setTimeoutSheetOpen(true);
  };

  const applyTimeoutDraft = () => {
    if (timeoutDraft) setDisposalDraft(timeoutDraft);
    setTimeoutSheetOpen(false);
  };

  const loaded = engine && disposal;

  return (
    <Card data-testid="disposition-policy-card">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">
            {engineQuery.isError ? t('engineLoadFailed') : t('loading')}
          </p>
        ) : (
          <>
            {/* 运行模式 */}
            <div className="space-y-2">
              <Label htmlFor="run-mode-select">{t('runMode')}</Label>
              <Select value={runMode} onValueChange={(v) => onRunModeChange(v as PhishRunMode)}>
                <SelectTrigger id="run-mode-select" className="w-48" data-testid="run-mode-select">
                  <SelectValue>{t(`runModeValue.${runMode}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="realtime" data-testid="run-mode-option-realtime">
                    {t('runModeValue.realtime')}
                  </SelectItem>
                  <SelectItem value="observe" data-testid="run-mode-option-observe">
                    {t('runModeValue.observe')}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t(`runModeHint.${runMode}`)}</p>

              {observeMode ? (
                <div
                  className="flex items-center gap-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400"
                  data-testid="observe-mode-banner"
                >
                  <span>{tb('observeBanner')}</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-muted-foreground">{t('observeAction')}</span>
                    {(['deliver', 'mark'] as const).map((act) => (
                      <Button
                        key={act}
                        type="button"
                        size="sm"
                        variant={engine.observe_action === act ? 'default' : 'outline'}
                        onClick={() => patchEngine({ observe_action: act as PhishObserveAction })}
                        data-testid={`observe-action-${act}`}
                      >
                        {t(`observeActionValue.${act}`)}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* 防护等级 — hidden entirely in observe mode (no disposition concept). */}
            {!observeMode ? (
              <div className="space-y-1.5" data-testid="protection-level-row">
                <Label>{t('protectionLevel')}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_LEVELS.map((level) => (
                    <Button
                      key={level}
                      type="button"
                      size="sm"
                      variant={protectionLevel === level ? 'default' : 'outline'}
                      disabled={level === 'custom'}
                      onClick={() => {
                        if (level === 'custom') return;
                        onPresetClick(level);
                      }}
                      data-testid={`protection-level-${level}`}
                    >
                      {t(`protectionLevelValue.${level}`)}
                    </Button>
                  ))}
                  {protectionLevel === 'custom' && (lastPreset === 'standard' || lastPreset === 'strict') ? (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-xs"
                      onClick={onRestorePreset}
                      data-testid="restore-preset"
                    >
                      {t('restorePreset', { level: t(`protectionLevelValue.${lastPreset}`) })}
                    </Button>
                  ) : null}
                </div>
                {protectionLevel === 'custom' ? (
                  <p className="text-xs text-muted-foreground" data-testid="custom-protection-hint">
                    {t('customProtectionHint')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* 超时策略 — summary line, full editing lives in the small drawer. */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label>{t('timeoutSectionTitle')}</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openTimeoutSheet}
                  data-testid="timeout-edit"
                >
                  {t('edit')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">
                  {t('totalTimeout')} <span className="font-medium text-foreground">{disposal.review.custom_minutes}{t('minutes')}</span>
                </span>
                <span className="text-muted-foreground">
                  {t('timeoutTempDisposal')} <span className="font-medium text-foreground">{t(`timeoutTempValue.${disposal.review.timeout_temp_disposal || 'deliver'}`)}</span>
                </span>
                <span className="text-muted-foreground">
                  {t('asyncTimeout')} <span className="font-medium text-foreground">{disposal.review.max_recheck_minutes}{t('minutes')}</span>
                </span>
                <span className="text-muted-foreground">
                  {t('autoDeliver')} <span className="font-medium text-foreground">{disposal.review.timeout_auto_deliver ? t('autoDeliverOn') : t('autoDeliverOff')}</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t('timeoutScopeNote')}</p>
            </div>

            {/* 置信度分级处置 */}
            <div className="space-y-2">
              <Label>{tb('title')}</Label>
              <p className="text-xs text-muted-foreground">{tb('description')}</p>
              {observeMode ? (
                <div
                  className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400"
                  data-testid="bands-observe-banner"
                >
                  {tb('observeBanner')}
                </div>
              ) : null}
              <div className={observeMode ? 'opacity-50' : undefined}>
                <ConfidenceBandsTable
                  bands={bands}
                  disabled={observeMode}
                  onChange={(next) => setBandsDraft(next)}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>

      {loaded ? (
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" onClick={cancelAll} disabled={!dirty} data-testid="policy-cancel">
            {t('cancel')}
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || !!bandsError || saveMutation.isPending}
            data-testid="policy-save"
          >
            {saveMutation.isPending ? t('saving') : t('save')}
          </Button>
        </CardFooter>
      ) : null}

      {/* 恢复预设覆盖确认 */}
      <AlertDialog
        open={pendingPresetSwitch !== null}
        onOpenChange={(o) => !o && setPendingPresetSwitch(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('switchPresetConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('switchPresetConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingPresetSwitch(null)}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPresetSwitch) applyPreset(pendingPresetSwitch);
                setPendingPresetSwitch(null);
              }}
              data-testid="confirm-preset-switch"
            >
              {t('save')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 超时策略 — small dedicated drawer */}
      <Sheet open={timeoutSheetOpen} onOpenChange={setTimeoutSheetOpen}>
        <SheetContent
          side="right"
          className="sm:max-w-[400px] flex flex-col gap-0 p-0"
          data-testid="timeout-edit-drawer"
        >
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle>{t('timeoutEditTitle')}</SheetTitle>
            <SheetDescription>{t('timeoutEditDescription')}</SheetDescription>
          </SheetHeader>

          {timeoutDraft ? (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
                      value={timeoutDraft.review.custom_minutes}
                      onChange={(e) =>
                        setTimeoutDraft((cur) =>
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
                        setTimeoutDraft((cur) =>
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
                      value={timeoutDraft.review.max_recheck_minutes}
                      onChange={(e) =>
                        setTimeoutDraft((cur) =>
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
                        setTimeoutDraft((cur) =>
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

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">{t('autoDeliver')}</div>
                    <p className="text-xs text-muted-foreground">{t('autoDeliverHint')}</p>
                  </div>
                  <Switch
                    checked={timeoutDraft.review.timeout_auto_deliver}
                    onCheckedChange={(v) => onToggleTimeoutAutoDeliver(!!v)}
                    data-testid="auto-deliver-switch"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('timeoutTempDisposal')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {TIMEOUT_DISPOSITIONS.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={(timeoutDraft.review.timeout_temp_disposal || 'deliver') === d ? 'default' : 'outline'}
                        onClick={() =>
                          setTimeoutDraft((cur) =>
                            cur ? { ...cur, review: { ...cur.review, timeout_temp_disposal: d } } : cur,
                          )
                        }
                        data-testid={`timeout-temp-${d}`}
                      >
                        {t(`timeoutTempValue.${d}`)}
                      </Button>
                    ))}
                  </div>
                  {(timeoutDraft.review.timeout_temp_disposal || 'deliver') === 'mark' ? (
                    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                      <Label htmlFor="timeout-mark-text">{t('timeoutMarkText')}</Label>
                      <Input
                        id="timeout-mark-text"
                        value={timeoutDraft.review.timeout_mark_text ?? ''}
                        maxLength={20}
                        onChange={(e) =>
                          setTimeoutDraft((cur) =>
                            cur
                              ? { ...cur, review: { ...cur.review, timeout_mark_text: e.target.value } }
                              : cur,
                          )
                        }
                        data-testid="timeout-mark-text"
                      />
                      <p className="text-xs text-muted-foreground">{t('timeoutMarkTextHint')}</p>
                      <div className="flex flex-wrap gap-3">
                        {(['subject_prefix', 'header'] as const).map((pos) => {
                          const positions = new Set(timeoutDraft.review.timeout_mark_positions ?? []);
                          return (
                            <label key={pos} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={positions.has(pos)}
                                onChange={() => {
                                  if (positions.has(pos)) positions.delete(pos);
                                  else positions.add(pos);
                                  setTimeoutDraft((cur) =>
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
                  ) : null}
                </div>
              </div>

              <SheetFooter className="border-t px-5 py-3 flex-row justify-end gap-2">
                <Button variant="outline" onClick={() => setTimeoutSheetOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={applyTimeoutDraft} data-testid="timeout-apply">
                  {t('save')}
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
