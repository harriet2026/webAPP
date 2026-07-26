'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAlertMetrics, useAlertTemplates, useSaveAlertRule } from './hooks';
import type { AlertRule, AlertRulePayload, MetricDef } from '@/types/alerts';

const MODULE_ORDER = ['system', 'database', 'mailflow_queue', 'mailflow_delivery', 'mailflow_connection', 'detection'];

interface Props { rule?: AlertRule; onClose: () => void }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function num(v: string): number | null {
  const n = Number(v);
  return v === '' || Number.isNaN(n) ? null : n;
}

function blankRule(): AlertRulePayload {
  return {
    name: '', description: '', enabled: true, severity: 'p2',
    metric_key: '', module: '', aggregation: 'raw', operator: 'gt',
    threshold_warn: null, threshold_crit: null, dual_threshold: false,
    target_scope: { node: 'all' }, duration_type: 'time', duration_seconds: 300, sample_count: 3,
    notify_email_enabled: true, notify_recipients: [], recovery_notify: true,
    convergence_window_seconds: 300, effective_period: null,
    combined_conditions: null, escalation: null, suppress_interval_seconds: null, silence_period: null,
  };
}

// Drop server-generated fields (id/created_at/updated_at) so they don't leak
// into the editable form state and get accidentally re-submitted on save.
function stripServerFields(rule: AlertRule): AlertRulePayload {
  const out: Record<string, unknown> = { ...rule };
  delete out.id;
  delete out.created_at;
  delete out.updated_at;
  return out as unknown as AlertRulePayload;
}

interface MetricGroup {
  module: string;
  metrics: MetricDef[];
  available: boolean;
}

function groupMetrics(metrics: MetricDef[]): MetricGroup[] {
  const byMod = new Map<string, MetricDef[]>();
  for (const m of metrics) {
    const g = byMod.get(m.module) ?? [];
    g.push(m);
    byMod.set(m.module, g);
  }
  return MODULE_ORDER.filter((mod) => byMod.has(mod)).map((mod) => {
    const ms = byMod.get(mod)!;
    return { module: mod, metrics: ms, available: ms.some((m) => m.available) };
  });
}

export function AlertRuleEditor({ rule, onClose }: Props) {
  const t = useTranslations('alertCenter');
  const { data: metricsResp } = useAlertMetrics();
  const { data: tplResp } = useAlertTemplates();
  const save = useSaveAlertRule();

  const [form, setForm] = useState<AlertRulePayload>(() => rule
    ? stripServerFields(rule)
    : blankRule());
  const [recipients, setRecipients] = useState((rule?.notify_recipients ?? []).join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof AlertRulePayload>(k: K, v: AlertRulePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const metrics = useMemo(() => metricsResp?.items ?? [], [metricsResp]);
  const groups = useMemo(() => groupMetrics(metrics), [metrics]);
  const currentMetric = metrics.find((m) => m.key === form.metric_key);
  const unit = currentMetric?.unit ?? '';

  const applyTemplate = (id: string | null) => {
    if (!id) return;
    const tpl = tplResp?.items.find((x) => x.key === id);
    if (!tpl) return;
    setForm((f) => ({
      ...f,
      name: f.name || tpl.name,
      description: tpl.description,
      module: tpl.module,
      metric_key: tpl.metric_key,
      aggregation: tpl.aggregation,
      operator: tpl.operator,
      threshold_warn: tpl.threshold_warn,
      threshold_crit: tpl.threshold_crit,
      dual_threshold: tpl.dual_threshold,
      duration_type: tpl.duration_type,
      duration_seconds: tpl.duration_seconds,
      severity: tpl.severity,
    }));
  };

  const onPickMetric = (key: string | null) => {
    if (!key) return;
    const m = metrics.find((x) => x.key === key);
    set('metric_key', key);
    if (m) {
      set('module', m.module);
      if (m.default_warn != null) set('threshold_warn', m.default_warn);
      if (m.default_crit != null) set('threshold_crit', m.default_crit);
    }
  };

  const MetricSelect = (
    <Select value={form.metric_key} onValueChange={onPickMetric}>
      <SelectTrigger className={errors.metric_key ? 'border-red-500' : ''}>
        <SelectValue placeholder={t('editor.selectMetric')} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectGroup key={g.module}>
            <SelectLabel className={g.available ? '' : 'text-muted-foreground/50'}>
              {t(`module.${g.module}`)}
              {!g.available && <span className="ml-1 text-xs">({t('editor.collectorPending')})</span>}
            </SelectLabel>
            {g.metrics.map((m) => (
              <SelectItem key={m.key} value={m.key} disabled={!m.available}>
                {t(`metric.${m.key}`)}{m.unit ? ` (${m.unit})` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = t('editor.err.nameRequired');
    if (form.name.startsWith('__deleted__')) e.name = t('editor.err.reservedPrefix');
    const w = form.threshold_warn, c = form.threshold_crit;
    // Required-threshold check must mirror the backend for ALL operators (eq
    // included): dual needs both bounds, single needs threshold_warn. eq was
    // previously exempted client-side, so an eq rule with a blank threshold
    // passed here then 400'd server-side with only a generic toast. Positivity
    // stays non-eq only (eq==0 is a legitimate "equals zero" target).
    if (form.dual_threshold ? (w == null || c == null) : (w == null)) {
      e.threshold = t('editor.err.thresholdRequired');
    } else if (form.operator !== 'eq' && ((w != null && w <= 0) || (c != null && c <= 0))) {
      e.threshold = t('editor.err.thresholdPositive');
    }
    if (form.duration_type === 'time' && form.duration_seconds <= 0) e.duration = t('editor.err.durationPositive');
    if (form.duration_type === 'samples' && form.sample_count <= 0) e.duration = t('editor.err.samplesPositive');
    const rcpts = recipients.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    // Backend rejects (400) when email OR recovery notification is on with zero
    // recipients; enforce the same here as an inline error instead of a toast.
    if (form.notify_email_enabled || form.recovery_notify) {
      if (rcpts.length === 0) e.recipients = t('editor.err.recipientsRequired');
      else if (rcpts.some((r) => !EMAIL_RE.test(r))) e.recipients = t('editor.err.email');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (!validate()) return;
    const rcpts = recipients.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    try {
      await save.mutateAsync({ payload: { ...form, notify_recipients: rcpts }, id: rule?.id });
      toast.success(t('editor.saved'));
      onClose();
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? t('editor.saveFailed'));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="text-lg font-semibold">{rule ? t('action.edit') : t('action.addRule')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} data-testid="alert-rule-cancel">{t('cancel')}</Button>
          <Button variant="outline" disabled title={t('editor.testUnavailable')} data-testid="alert-rule-save-test">
            {t('editor.saveAndTest')}
          </Button>
          <Button onClick={onSave} disabled={save.isPending} data-testid="alert-rule-save">{t('save')}</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 space-y-1 border-r p-4" data-testid="alert-rule-step-nav">
          {(['basic', 'trigger', 'notification', 'advanced', 'preview'] as const).map((step, index) => (
            <Button
              key={step}
              variant="ghost"
              className="w-full justify-start"
              data-testid={`alert-rule-step-${step}`}
              onClick={() => document.getElementById(`alert-rule-section-${step}`)?.scrollIntoView({ behavior: 'smooth' })}
            >
              {index + 1}. {t(`editor.step${step[0].toUpperCase()}${step.slice(1)}`)}
            </Button>
          ))}
        </nav>
        <div className="flex-1 space-y-6 overflow-y-auto p-6" data-testid="alert-rule-editor">
        {/* Basic info + template prefill */}
        <details open id="alert-rule-section-basic" className="rounded-lg border p-4" data-testid="editor-basic">
          <summary className="mb-4 cursor-pointer font-semibold">{t('editor.stepBasic')}</summary>
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('label.ruleName')} *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} className={errors.name ? 'border-red-500' : ''} />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>{t('editor.severity')}</Label>
              <Select value={form.severity} onValueChange={(v) => set('severity', v as AlertRulePayload['severity'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['p0', 'p1', 'p2', 'p3', 'p4'] as const).map((s) => (
                    <SelectItem key={s} value={s}>{t(`severity.${SEVERITY_KEY[s]}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('editor.description')}</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>{t('editor.template')}</Label>
            <Select value="" onValueChange={applyTemplate}>
              <SelectTrigger data-testid="template-select"><SelectValue placeholder={t('editor.selectTemplate')} /></SelectTrigger>
              <SelectContent>
                {(tplResp?.items ?? []).map((tp) => (
                  <SelectItem key={tp.key} value={tp.key}>{tp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          </div>
        </details>

        {/* Trigger condition */}
        <details open id="alert-rule-section-trigger" className="rounded-lg border p-4" data-testid="editor-trigger">
          <summary className="mb-4 cursor-pointer font-semibold">{t('editor.stepTrigger')}</summary>
          <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('editor.metric')} *</Label>{MetricSelect}</div>
            <div className="space-y-2">
              <Label>{t('editor.operator')} *</Label>
              <Select value={form.operator} onValueChange={(v) => set('operator', v as AlertRulePayload['operator'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['gt', 'ge', 'lt', 'le', 'eq'] as const).map((op) => (
                    <SelectItem key={op} value={op}>{t(`op.${op}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <Label>{t('editor.dualThreshold')}</Label>
              <Switch checked={form.dual_threshold} onCheckedChange={(v) => set('dual_threshold', v)} />
            </div>
            {form.dual_threshold ? (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-yellow-600">{t('editor.warnThreshold')}</Label>
                  <Input type="number" value={form.threshold_warn ?? ''} onChange={(e) => set('threshold_warn', num(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-red-600">{t('editor.critThreshold')}</Label>
                  <Input type="number" data-testid="crit-threshold-input" value={form.threshold_crit ?? ''} onChange={(e) => set('threshold_crit', num(e.target.value))} />
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <Input type="number" className="w-32" value={form.threshold_warn ?? ''} onChange={(e) => set('threshold_warn', num(e.target.value))} placeholder={t('editor.threshold')} />
                {unit && <span className="text-muted-foreground">{unit}</span>}
              </div>
            )}
            {errors.threshold && <p className="text-sm text-red-500">{errors.threshold}</p>}
          </div>

          <div className="space-y-3">
            <Label>{t('editor.duration')} *</Label>
            <RadioGroup value={form.duration_type} onValueChange={(v) => set('duration_type', v as AlertRulePayload['duration_type'])} className="flex gap-4">
              <label className="flex items-center gap-2"><RadioGroupItem value="time" id="dt-time" />{t('editor.durationTime')}</label>
              <label className="flex items-center gap-2"><RadioGroupItem value="samples" id="dt-samples" />{t('editor.durationSamples')}</label>
            </RadioGroup>
            {form.duration_type === 'time' ? (
              <div className="flex items-center gap-2">
                <Input type="number" className="w-24" value={form.duration_seconds} onChange={(e) => set('duration_seconds', Number(e.target.value))} />
                <span className="text-sm text-muted-foreground">{t('editor.seconds')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input type="number" className="w-20" value={form.sample_count} onChange={(e) => set('sample_count', Number(e.target.value))} />
                <span className="text-sm text-muted-foreground">{t('editor.samplesUnit')}</span>
              </div>
            )}
            {errors.duration && <p className="text-sm text-red-500">{errors.duration}</p>}
          </div>
          </div>
        </details>

        {/* Notification config */}
        <details open id="alert-rule-section-notification" className="rounded-lg border p-4" data-testid="editor-notification">
          <summary className="mb-4 cursor-pointer font-semibold">{t('editor.stepNotification')}</summary>
          <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>{t('notify.email')}</Label>
            <Switch checked={form.notify_email_enabled} onCheckedChange={(v) => set('notify_email_enabled', v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>{t('editor.recoveryNotify')}</Label>
            <Switch checked={form.recovery_notify} onCheckedChange={(v) => set('recovery_notify', v)} />
          </div>
          {/* Recipients are required by the backend when EITHER email or recovery
              notification is on, so show the field whenever either is enabled. */}
          {(form.notify_email_enabled || form.recovery_notify) && (
            <div className="space-y-2">
              <Label>{t('editor.recipients')}</Label>
              <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="ops@company.com" />
              {errors.recipients && <p className="text-xs text-red-500">{errors.recipients}</p>}
            </div>
          )}
          </div>
        </details>

        {/* Advanced noise reduction (Phase-2: rendered but disabled) */}
        <div id="alert-rule-section-advanced" data-testid="alert-rule-section-advanced">
          <h3 className="mb-2 font-semibold">{t('editor.stepAdvanced')}</h3>
          <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <fieldset disabled className="pointer-events-none space-y-4 rounded-lg border p-4 opacity-50" data-testid="editor-advanced-disabled">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t('editor.advancedTitle')}</span>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <div>{t('editor.combinedConditions')}</div>
                    <div>{t('editor.statusChange')}</div>
                    <div>{t('editor.surgeDrop')}</div>
                    <div>{t('editor.escalation')}</div>
                    <div>{t('editor.suppress')}</div>
                    <div>{t('editor.silence')}</div>
                  </div>
                </fieldset>
              }
            />
            <TooltipContent>{t('editor.nextIteration')}</TooltipContent>
          </Tooltip>
          </TooltipProvider>
        </div>

        {/* Preview */}
        <div id="alert-rule-section-preview" className="rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-800/50" data-testid="editor-preview">
          <h3 className="mb-2 font-semibold">{t('editor.stepPreview')}</h3>
          {t('editor.previewSummary', {
            severity: t(`severity.${SEVERITY_KEY[form.severity]}`),
            metric: form.metric_key ? t(`metric.${form.metric_key}`) : t('editor.selectMetric'),
            operator: t(`op.${form.operator}`),
            threshold: String(form.threshold_crit ?? form.threshold_warn ?? '?'),
            duration: form.duration_type === 'time'
              ? `${form.duration_seconds}${t('editor.seconds')}`
              : `${form.sample_count}${t('editor.samplesUnit')}`,
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

const SEVERITY_KEY: Record<AlertRulePayload['severity'], string> = {
  p0: 'critical',
  p1: 'major',
  p2: 'minor',
  p3: 'warning',
  p4: 'info',
};
