'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ApiError, useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { getPhishingConfig, putPhishingConfig } from '@/lib/api/phishing-config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { phishingQueryKeys } from '../phishing-query-keys';
import { useUnsavedDraftRegistration } from './use-unsaved-draft-registration';
import type {
  PhishAgentConfig,
  PhishAgentConfigPutRequest,
  PhishConfigConflictResponse,
  PhishMarkPosition,
  PhishPolicyDisposition,
  PhishRiskLevel,
  PhishRunMode,
} from '@/types/phishing-config';

const RISKS: PhishRiskLevel[] = ['suspicious', 'low', 'medium', 'high'];
const DISPOSITIONS: PhishPolicyDisposition[] = ['proceed', 'audit', 'quarantine', 'discard'];
const MARK_POSITIONS: PhishMarkPosition[] = ['subject_prefix', 'header'];

function isConfigConflict(body: unknown): body is PhishConfigConflictResponse {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Partial<PhishConfigConflictResponse>;
  return candidate.error?.code === 'phishing_agent.config_version_conflict'
    && Boolean(candidate.risk_policy)
    && Boolean(candidate.runtime_policy);
}

function cloneConfig(config: PhishAgentConfig): PhishAgentConfig {
  return structuredClone(config);
}

function requestFromDraft(draft: PhishAgentConfig): PhishAgentConfigPutRequest {
  const policies = Object.fromEntries(RISKS.map((risk) => {
    const policy = draft.risk_policy.policies[risk];
    if (policy.base_disposition !== 'proceed') {
      return [risk, { base_disposition: policy.base_disposition }];
    }
    const markPositions = policy.mark_positions ?? [];
    return [risk, markPositions.length > 0
      ? { base_disposition: policy.base_disposition, mark_positions: markPositions, mark_text: policy.mark_text }
      : { base_disposition: policy.base_disposition }];
  })) as PhishAgentConfigPutRequest['risk_policy']['policies'];
  return {
    risk_policy: {
      cutoffs: draft.risk_policy.cutoffs,
      policies,
      expected_version: draft.risk_policy.version,
    },
    runtime_policy: {
      run_mode: draft.runtime_policy.run_mode,
      observe_action: draft.runtime_policy.observe_action,
      observe_mark_enabled: draft.runtime_policy.observe_mark_enabled,
      timeout_minutes: draft.runtime_policy.timeout_minutes,
      max_recheck_minutes: draft.runtime_policy.max_recheck_minutes,
      timeout_async_enabled: draft.runtime_policy.timeout_async_enabled,
      expected_version: draft.runtime_policy.version,
    },
  };
}

function OptionCard({ selected, title, description, onClick, testId }: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button type="button" variant="outline" onClick={onClick} data-testid={testId}
      className={cn('h-auto flex-1 items-stretch whitespace-normal rounded-lg p-3 text-left', selected ? 'border-primary bg-primary/5' : 'border-border data-[hovered=true]:bg-muted/40')}>
      <span className="flex items-center gap-2">
        <span className={cn('flex size-4 items-center justify-center rounded-full border', selected ? 'border-primary' : 'border-muted-foreground/40')}>
          {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </span>
      <span className="mt-1 block pl-6 text-xs leading-5 text-muted-foreground">{description}</span>
    </Button>
  );
}

export function RuntimeRiskSection({ readOnly = false }: { readOnly?: boolean }) {
  const t = useTranslations('phishingConfig.runtime');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const configQuery = useQuery({
    queryKey: phishingQueryKeys.config(effectiveTenantId),
    queryFn: () => getPhishingConfig(apiRequest),
  });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PhishAgentConfig | null>(null);
  const [conflict, setConflict] = useState<PhishAgentConfig | null>(null);

  const dirty = Boolean(open && draft && configQuery.data && JSON.stringify(draft) !== JSON.stringify(configQuery.data));
  useUnsavedDraftRegistration(open, dirty);

  const saveMutation = useMutation({
    mutationFn: (value: PhishAgentConfig) => putPhishingConfig(requestFromDraft(value), apiRequest),
    onSuccess: (value) => {
      queryClient.setQueryData(phishingQueryKeys.config(effectiveTenantId), value);
      setConflict(null);
      setOpen(false);
      toast.success(t('saved'));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        if (isConfigConflict(error.body)) setConflict(error.body);
        toast.error(t('conflictDescription'));
        return;
      }
      toast.error(apiErrorMessage(error, t('saveFailed')));
    },
  });

  const ranges = useMemo(() => {
    if (!draft) return [];
    const { low, medium, high } = draft.risk_policy.cutoffs;
    return [[0, low], [low, medium], [medium, high], [high, 100]];
  }, [draft]);

  const openEditor = () => {
    if (!configQuery.data || readOnly) return;
    setDraft(cloneConfig(configQuery.data));
    setConflict(null);
    setOpen(true);
  };

  const patchRuntime = (patch: Partial<PhishAgentConfig['runtime_policy']>) => {
    setDraft((current) => current ? { ...current, runtime_policy: { ...current.runtime_policy, ...patch } } : current);
  };
  const patchCutoff = (key: 'low' | 'medium' | 'high', value: number) => {
    setDraft((current) => current ? {
      ...current,
      risk_policy: { ...current.risk_policy, cutoffs: { ...current.risk_policy.cutoffs, [key]: value } },
    } : current);
  };
  const patchPolicy = (risk: PhishRiskLevel, patch: Partial<PhishAgentConfig['risk_policy']['policies'][PhishRiskLevel]>) => {
    setDraft((current) => current ? {
      ...current,
      risk_policy: {
        ...current.risk_policy,
        policies: { ...current.risk_policy.policies, [risk]: { ...current.risk_policy.policies[risk], ...patch } },
      },
    } : current);
  };

  const validCutoffs = draft
    ? draft.risk_policy.cutoffs.low > 0
      && draft.risk_policy.cutoffs.low < draft.risk_policy.cutoffs.medium
      && draft.risk_policy.cutoffs.medium < draft.risk_policy.cutoffs.high
      && draft.risk_policy.cutoffs.high < 100
    : false;
  const invalidMarkText = draft
    ? RISKS.some((risk) => {
      const policy = draft.risk_policy.policies[risk];
        if (policy.base_disposition !== 'proceed' || (policy.mark_positions?.length ?? 0) === 0) return false;
      const markLength = Array.from(policy.mark_text ?? '').length;
      return markLength === 0 || markLength > 20;
    })
    : false;
  const validRuntimeDeadlines = draft
    ? Number.isInteger(draft.runtime_policy.timeout_minutes)
      && draft.runtime_policy.timeout_minutes >= 1
      && draft.runtime_policy.timeout_minutes <= 300
      && Number.isInteger(draft.runtime_policy.max_recheck_minutes)
      && draft.runtime_policy.max_recheck_minutes >= 1
      && draft.runtime_policy.max_recheck_minutes <= 60
    : false;

  return (
    <Card className="rounded-xl border-l-4 border-l-destructive border-border shadow-sm" data-testid="runtime-risk-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4 text-destructive" />{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {configQuery.isLoading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : configQuery.isError ? (
          <p className="text-sm text-destructive">{apiErrorMessage(configQuery.error, t('engineLoadFailed'))}</p>
        ) : configQuery.data ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">{t('runMode')}</span><span className="text-xs text-muted-foreground">{t('runModeFootnote')}</span></div>
              <div className="flex flex-wrap items-center gap-2"><Badge className={configQuery.data.runtime_policy.run_mode === 'observe' ? 'border-transparent bg-warning/15 text-warning-foreground dark:text-warning' : 'border-transparent bg-destructive/15 text-destructive'}>{t(`runModeValue.${configQuery.data.runtime_policy.run_mode}`)}</Badge><p className="text-sm text-muted-foreground">{t('summary', { count: RISKS.length, autoDeliver: configQuery.data.runtime_policy.timeout_async_enabled ? t('autoDeliverOn') : t('autoDeliverOff') })}</p></div>
            </div>
            <Button variant="outline" size="sm" onClick={openEditor} disabled={readOnly}><Pencil className="size-3.5" />{t('edit')}</Button>
          </div>
        ) : null}
      </CardContent>

      <Sheet open={open} onOpenChange={(next) => { if (!next && saveMutation.isPending) return; setOpen(next); }}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[640px]" data-testid="runtime-risk-sheet">
          <SheetHeader className="shrink-0 border-b border-border px-5 py-4"><SheetTitle>{t('sheetTitle')}</SheetTitle><SheetDescription>{t('sheetDescription')}</SheetDescription></SheetHeader>
          {draft ? <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {conflict ? (
              <Alert variant="destructive" data-testid="runtime-conflict-alert"><AlertTriangle className="size-4" /><AlertTitle>{t('conflictTitle')}</AlertTitle><AlertDescription className="space-y-2"><p>{t('conflictDescription')}</p><Button size="sm" variant="outline" onClick={() => { setDraft(cloneConfig(conflict)); setConflict(null); }}>{t('reloadLatest')}</Button></AlertDescription></Alert>
            ) : null}
            <section className="space-y-3">
              <Label>{t('runMode')}</Label>
              <div className="flex gap-2">{(['realtime', 'observe'] as PhishRunMode[]).map((mode) => <OptionCard key={mode} selected={draft.runtime_policy.run_mode === mode} title={t(`runModeValue.${mode}`)} description={t(`runModeHint.${mode}`)} onClick={() => patchRuntime({ run_mode: mode })} testId={`run-mode-${mode}`} />)}</div>
              {draft.runtime_policy.run_mode === 'observe' ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground dark:text-warning">{t('observeModeBanner')}</div>
              ) : null}
            </section>
            <section className="space-y-3">
              <Label>{t('timeoutPolicy')}</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-2"><Label htmlFor="timeout-minutes" className="text-sm text-muted-foreground">{t('timeoutMinutes')}</Label><Input id="timeout-minutes" data-testid="timeout-minutes" type="number" min={1} max={300} value={draft.runtime_policy.timeout_minutes} onChange={(event) => patchRuntime({ timeout_minutes: Number(event.target.value) })} /></div>
                <div className="min-w-0 space-y-2"><Label htmlFor="recheck-minutes" className="text-sm text-muted-foreground">{t('maxRecheckMinutes')}</Label><Input id="recheck-minutes" data-testid="recheck-minutes" type="number" min={1} max={60} value={draft.runtime_policy.max_recheck_minutes} onChange={(event) => patchRuntime({ max_recheck_minutes: Number(event.target.value) })} /></div>
              </div>
              {!validRuntimeDeadlines ? <p className="text-sm text-destructive">{t('invalidTimeoutWindow')}</p> : null}
              {draft.runtime_policy.run_mode === 'realtime' ? <div className="flex items-center justify-between rounded-lg border border-border p-3"><div><Label>{t('timeoutAsync')}</Label><p className="mt-1 text-xs text-muted-foreground">{t('timeoutAsyncHint')}</p></div><Switch checked={draft.runtime_policy.timeout_async_enabled} onCheckedChange={(timeout_async_enabled) => patchRuntime({ timeout_async_enabled })} data-testid="timeout-async-enabled" /></div> : null}
              {draft.runtime_policy.run_mode === 'observe' ? <div className="flex items-center justify-between rounded-lg border border-border p-3"><div><Label>{t('observeMark')}</Label><p className="mt-1 text-xs text-muted-foreground">{t('observeMarkHint')}</p></div><Switch checked={draft.runtime_policy.observe_mark_enabled} onCheckedChange={(observe_mark_enabled) => patchRuntime({ observe_action: 'accept', observe_mark_enabled })} data-testid="observe-mark-enabled" /></div> : null}
            </section>
            <section className="space-y-3">
              <div><Label>{t('confidencePolicy')}</Label><p className="mt-1 text-sm text-muted-foreground">{t('confidenceHint')}</p></div>
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3">
                {(['low', 'medium', 'high'] as const).map((cutoff) => <div key={cutoff} className="min-w-0 space-y-2"><Label htmlFor={`cutoff-${cutoff}`} className="text-sm">{t(`cutoff.${cutoff}`)}</Label><Input id={`cutoff-${cutoff}`} data-testid={`cutoff-${cutoff}`} type="number" min={1} max={99} value={draft.risk_policy.cutoffs[cutoff]} onChange={(event) => patchCutoff(cutoff, Number(event.target.value))} /></div>)}
              </div>
              {!validCutoffs ? <p className="text-sm text-destructive">{t('invalidCutoffs')}</p> : null}
              <div className="overflow-x-auto rounded-lg border border-border">
                <div className="grid min-w-[570px] grid-cols-[126px_112px_170px_1fr] border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground"><span>{t('range')}</span><span>{t('risk')}</span><span>{t('dispositionLabel')}</span><span>{t('markSetting')}</span></div>
                {RISKS.map((risk, index) => {
                  const policy = draft.risk_policy.policies[risk];
                  const positions = policy.mark_positions ?? [];
                  const markLength = Array.from(policy.mark_text ?? '').length;
                  return <div key={risk} className="grid min-w-[570px] grid-cols-[126px_112px_170px_1fr] items-start gap-2 border-b border-border px-3 py-3 last:border-b-0" data-testid={`risk-row-${risk}`}>
                    <span className="font-mono text-xs text-muted-foreground">{ranges[index]?.[0]}–{ranges[index]?.[1]}</span>
                    <Badge variant={risk === 'high' ? 'destructive' : 'secondary'} className="w-fit">{t(`riskLevel.${risk}`)}</Badge>
                    <Select value={policy.base_disposition} onValueChange={(value) => patchPolicy(risk, { base_disposition: value as PhishPolicyDisposition })}><SelectTrigger className="w-full" data-testid={`disposition-${risk}`}><SelectValue /></SelectTrigger><SelectContent>{DISPOSITIONS.map((value) => <SelectItem key={value} value={value}>{t(`disposition.${value}`)}</SelectItem>)}</SelectContent></Select>
                    {policy.base_disposition === 'proceed' ? <div className="space-y-2" data-testid={`mark-addon-${risk}`}>
                      <div className="flex flex-wrap gap-2">{MARK_POSITIONS.map((position) => <Button key={position} type="button" size="sm" variant={positions.includes(position) ? 'default' : 'outline'} onClick={() => patchPolicy(risk, { mark_positions: positions.includes(position) ? positions.filter((item) => item !== position) : [...positions, position] })}>{t(`markPosition.${position}`)}</Button>)}</div>
                      {positions.length > 0 ? <div className="space-y-1"><Input value={policy.mark_text ?? ''} placeholder={t('markText')} aria-invalid={markLength === 0 || markLength > 20} onChange={(event) => patchPolicy(risk, { mark_text: event.target.value })} />{markLength === 0 ? <p className="text-sm text-destructive">{t('markTextRequired')}</p> : markLength > 20 ? <p className="text-sm text-destructive">{t('markTextTooLong')}</p> : <p className="text-xs text-muted-foreground">{t('markTextLimit')}</p>}</div> : null}
                    </div> : <span className="text-sm text-muted-foreground">—</span>}
                  </div>;
                })}
              </div>
            </section>
          </div> : null}
          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border px-5 py-3"><Button variant="outline" onClick={() => setOpen(false)} disabled={saveMutation.isPending}>{t('cancel')}</Button><Button onClick={() => draft && saveMutation.mutate(draft)} disabled={!draft || !validCutoffs || !validRuntimeDeadlines || invalidMarkText || saveMutation.isPending || readOnly} data-testid="runtime-save">{saveMutation.isPending ? t('saving') : t('save')}</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
