'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useForm, useWatch, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Resolver } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  HelpCircle, Lightbulb, Play, Check, X, Zap,
  Shield, Clock, Ban, Users, Globe, ExternalLink, AlertTriangle,
  Plus, Trash2,
} from 'lucide-react';
import {
  Sheet, SheetContent, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible, CollapsibleContent,
} from '@/components/ui/collapsible';
import { CollapsibleSectionTrigger } from '@/components/ui/collapsible-section-trigger';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  createBehaviorControlRule, updateBehaviorControlRule,
} from '@/lib/api/behavior-control';
import type {
  BehaviorControlFormData, BehaviorControlRuleView,
  BehaviorDirection, BehaviorObjectType, BehaviorDimension,
  BehaviorTimeWindow, BehaviorProductAction, BehaviorControlFormObjectConfig,
  BehaviorCondition,
} from '@/types/behavior-control';
import { BACKEND_TO_PRODUCT } from '@/types/behavior-control';
import Link from 'next/link';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { simulateBehaviorControl } from '@/lib/behavior-control-simulator';
import { createBehaviorControlSchema, getBehaviorControlPriorityRange } from './schema';

const BEHAVIOR_DIMENSIONS: BehaviorDimension[] = [
  'ip_count',
  'recipient_count',
  'mail_count',
  'attachment_size',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: BehaviorControlRuleView | null;
  defaults?: Partial<BehaviorControlFormData>;
}

function defaultForm(priority: number): BehaviorControlFormData {
  return {
    name: '', priority, is_active: true,
    direction: 'outbound',
    object_config: { type: 'sender', sub_type: 'individual', value: '' },
    time_window: '15min',
    conditions: [{ dim: 'mail_count', threshold: 0 }],
    or_enabled: false,
    // 旧字段由 conditions[0] 派生，保持兼容
    dim_a: 'mail_count', threshold_a: 0,
    action: 'review',
  };
}

const OBJECT_TYPE_DEFAULTS: Record<BehaviorObjectType, BehaviorControlFormObjectConfig> = {
  global: { type: 'global' },
  sender: { type: 'sender', sub_type: 'individual', value: '' },
  senderIp: { type: 'senderIp', sub_type: 'single', value: '' },
  senderDomain: { type: 'senderDomain', value: '' },
};

function describeObject(
  oc: BehaviorControlFormData['object_config'],
  t: ReturnType<typeof useTranslations>,
): string {
  switch (oc.type) {
    case 'global':
      return t('behaviorControl.preview.objAny');
    case 'sender':
      return `${t(`behaviorControl.subType.${oc.sub_type}`)}「${oc.value ?? ''}」`;
    case 'senderIp':
      if (oc.sub_type === 'single') return `IP「${oc.value ?? ''}」`;
      return `${t('behaviorControl.subType.ipGroup')}「${oc.value ?? ''}」`;
    case 'senderDomain':
      return `${t('behaviorControl.object.senderDomain')}「${oc.value ?? ''}」`;
  }
}

interface GroupOption { name: string; memberCount?: number }

export function BehaviorControlDrawer({ open, onOpenChange, editing, defaults }: Props) {
  const t = useTranslations();
  const qc = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();
  const priorityRange = useMemo(() => getBehaviorControlPriorityRange(isSystemAdmin), [isSystemAdmin]);
  const schema = useMemo(() => createBehaviorControlSchema(priorityRange), [priorityRange]);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simSender, setSimSender] = useState('');
  const [simIp, setSimIp] = useState('192.168.1.1');
  const [simUniqueSenderIPCount, setSimUniqueSenderIPCount] = useState(1);
  const [simMailCount, setSimMailCount] = useState(50);
  const [simRecipientCount, setSimRecipientCount] = useState(30);
  const [simResult, setSimResult] = useState<{ hit: boolean; reason: string } | null>(null);

  const groupsQuery = useQuery({
    queryKey: ['groups', 'behavior-control'],
    queryFn: async () => {
      const res = await apiRequest<{ items: { id: number; name: string; metadata: string; is_active: boolean }[] }>(
        '/unified-rules?rule_class=tag&page=groups&include=member_count&page_size=5000',
      );
      return res.items || [];
    },
    staleTime: 30_000,
    enabled: open,
  });

  const groupTypeOptions = useCallback((groupType: string): GroupOption[] => {
    if (!groupsQuery.data) return [];
    return groupsQuery.data
      .filter((r) => {
        if (!r.metadata) return false;
        try {
          const m = JSON.parse(r.metadata);
          return m.group_type === groupType;
        } catch { return false; }
      })
      .map((r) => {
        try {
          const m = JSON.parse(r.metadata);
          return { name: r.name, memberCount: m.member_count as number | undefined };
        } catch {
          return { name: r.name };
        }
      });
  }, [groupsQuery.data]);

  const senderGroups = useMemo(() => groupTypeOptions('sender'), [groupTypeOptions]);
  const ipGroups = useMemo(() => groupTypeOptions('ip'), [groupTypeOptions]);

  const initial = useMemo<BehaviorControlFormData>(() => {
    if (!editing?.meta) return { ...defaultForm(priorityRange.defaultValue), ...defaults };
    const m = editing.meta;
    // 从旧字段还原 conditions[]（resolveBehaviorControlRule 已预填，此处作兜底）
    const metaWithConditions = m as typeof m & { conditions?: BehaviorCondition[] };
    const conditions: BehaviorCondition[] = metaWithConditions.conditions ?? (() => {
      const arr: BehaviorCondition[] = [{ dim: m.dim_a, threshold: m.threshold_a }];
      if (m.or_enabled && m.dim_b && m.threshold_b != null) {
        arr.push({ dim: m.dim_b, threshold: m.threshold_b });
      }
      return arr;
    })();
    return {
      name: editing.rule.name,
      description: editing.rule.description ?? '',
      priority: editing.rule.priority,
      is_active: editing.rule.is_active,
      valid_from: editing.rule.valid_from ?? '',
      valid_until: editing.rule.valid_until ?? '',
      direction: m.direction,
      object_config: m.object_config as BehaviorControlFormData['object_config'],
      time_window: m.time_window,
      conditions,
      or_enabled: conditions.length > 1 ? m.or_enabled : false,
      // 旧字段保留
      dim_a: m.dim_a,
      threshold_a: m.threshold_a,
      dim_b: m.dim_b,
      threshold_b: m.threshold_b,
      action: BACKEND_TO_PRODUCT[editing.rule.action as keyof typeof BACKEND_TO_PRODUCT] ?? 'review',
    };
  }, [editing, defaults, priorityRange]);

  const methods = useForm<BehaviorControlFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<BehaviorControlFormData>,
    defaultValues: initial,
    // Validate on submit (RHF default), not onBlur. The drawer auto-focuses the
    // required-but-empty name field, so onBlur made the *first* click on any of the
    // object-type / direction / action selects blur it → async zod validation → a
    // re-render that swallowed that first click's onClick.
    mode: 'onSubmit',
  });
  const {
    handleSubmit, formState, reset, register, setValue, watch, getValues, control,
  } = methods;
  const watchAll = useWatch({ control }) as BehaviorControlFormData;
  const objectConfigError = (
    formState.errors.object_config as { value?: { message?: string } } | undefined
  )?.value?.message;

  useEffect(() => {
    reset(initial);
    setShowExamples(false);
    setShowSimulator(false);
    setSimResult(null);
  }, [initial, reset]);

  const saveMutation = useMutation({
    mutationFn: async (form: BehaviorControlFormData) =>
      (editing ? updateBehaviorControlRule(editing.rule.id, form) : createBehaviorControlRule(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['behavior-control-rules'] });
      toast.success(t('behaviorControl.toast.saveOk'));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleClose = useCallback((next: boolean) => {
    if (!next && formState.isDirty) {
      setCloseConfirmOpen(true);
      return;
    }
    onOpenChange(next);
  }, [onOpenChange, formState.isDirty]);

  const objectType = watch('object_config.type');
  const senderSubType = watch('object_config.sub_type');
  const ipSubType = watch('object_config.sub_type');
  const orEnabled = watch('or_enabled');
  const description = watch('description');
  const conditions = watch('conditions');

  const runSimulation = useCallback(() => {
    const currentConditions = getValues('conditions');
    const hit = simulateBehaviorControl({
      conditions: currentConditions,
      orEnabled: getValues('or_enabled'),
      inputs: {
        uniqueSenderIPCount: simUniqueSenderIPCount,
        mailCount: simMailCount,
        recipientCount: simRecipientCount,
      },
    });
    if (!hit) {
      setSimResult({ hit: false, reason: t('behaviorControl.simulator.missReason') });
      return;
    }
    const unitKey = hit.dimension === 'ip_count'
      ? 'unitIp'
      : hit.dimension === 'recipient_count'
        ? 'unitRecipient'
        : hit.dimension === 'mail_count'
          ? 'unitMail'
          : 'unitAttachment';
    setSimResult({
      hit: true,
      reason: t('behaviorControl.simulator.hitReason', {
        condition: hit.condition,
        dimension: t(`behaviorControl.dim.${hit.dimension}`).replace(/上限$/, ''),
        count: hit.count,
        threshold: hit.threshold,
        unit: t(`behaviorControl.simulator.${unitKey}`),
      }),
    });
  }, [getValues, simMailCount, simRecipientCount, simUniqueSenderIPCount, t]);

  const needsUniqueSenderIPCount = (conditions ?? []).some((c) => c?.dim === 'ip_count');

  const isIncomplete = !watchAll.name
    || !(watchAll.conditions?.length > 0)
    || (watchAll.conditions ?? []).some((c) => !c.threshold || c.threshold <= 0);

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          className="data-[side=right]:w-[920px] data-[side=right]:sm:max-w-[920px] p-0 flex flex-col"
          side="right"
        >
          <FormProvider {...methods}>
            <form onSubmit={handleSubmit((v) => saveMutation.mutate(v as BehaviorControlFormData))} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-4 border-b flex-shrink-0">
                <SheetTitle className="text-[18px] font-semibold">
                  {editing ? t('behaviorControl.editTitle') : t('behaviorControl.createTitle')}
                </SheetTitle>
                <p className="text-sm text-muted-foreground mt-1">{t('behaviorControl.drawerSubtitle')}</p>
              </div>

              <div className="flex flex-1 overflow-hidden">
                <TooltipProvider>
                  <div className="w-[560px] flex-shrink-0 overflow-y-auto p-6 border-r">
                    <div className="space-y-6">
                      {/* ===== 基础设置 ===== */}
                      <div className="bg-muted/40 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-5 w-1 bg-blue-500 rounded-full" />
                          <h3 className="font-medium">{t('behaviorControl.form.section.basic')}</h3>
                        </div>

                        <div className="space-y-4">
                          {/* 规则名称 */}
                          <div className="flex items-center gap-3">
                            <Label className="min-w-[100px] text-right">
                              <span className="text-red-500">*</span> {t('behaviorControl.form.name')}
                            </Label>
                            <div className="flex-1">
                              <Input
                                placeholder={t('behaviorControl.form.namePlaceholder')}
                                {...register('name')}
                                className={cn(formState.errors.name && 'border-red-500')}
                              />
                              {formState.errors.name && (
                                <p className="text-xs text-red-500 mt-1">
                                  {t(`behaviorControl.errors.${formState.errors.name.message}`)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* 管控方向 */}
                          <div className="flex items-center gap-3">
                            <Label className="min-w-[100px] text-right">
                              <span className="text-red-500">*</span> {t('behaviorControl.form.directionLabel')}
                            </Label>
                            <Select
                              value={watchAll.direction}
                              onValueChange={(v) => setValue('direction', v as BehaviorDirection, { shouldDirty: true })}
                            >
                              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(['inbound', 'outbound', 'internal', 'bidirectional'] as BehaviorDirection[]).map((d) => (
                                  <SelectItem key={d} value={d}>{t(`behaviorControl.direction.${d}`)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 管控对象类型 */}
                          <div className="flex items-center gap-3">
                            <Label className="min-w-[100px] text-right">
                              <span className="text-red-500">*</span> {t('behaviorControl.form.objectTypeLabel')}
                            </Label>
                            <Select
                              value={objectType}
                              onValueChange={(v) => {
                                setValue('object_config', OBJECT_TYPE_DEFAULTS[v as BehaviorObjectType], { shouldDirty: true });
                              }}
                            >
                              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(['global', 'sender', 'senderIp', 'senderDomain'] as BehaviorObjectType[]).map((ot) => (
                                  <SelectItem key={ot} value={ot}>{t(`behaviorControl.object.${ot}`)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 发信人子类型 */}
                          {objectType === 'sender' && (
                            <>
                              <div className="flex items-center gap-3">
                                <Label className="min-w-[100px] text-right">
                                  <span className="text-red-500">*</span> {t('behaviorControl.form.senderSubTypeLabel')}
                                </Label>
                                <Select
                                  value={senderSubType}
                                  onValueChange={(v) => {
                                    setValue('object_config', { type: 'sender', sub_type: v as 'individual' | 'group', value: '' }, { shouldDirty: true });
                                  }}
                                >
                                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {(['individual', 'group'] as const).map((st) => (
                                      <SelectItem key={st} value={st}>{t(`behaviorControl.subType.${st}`)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {senderSubType === 'individual' && (
                                <div className="flex items-center gap-3">
                                  <Label className="min-w-[100px] text-right">
                                    <span className="text-red-500">*</span> {t('behaviorControl.form.emailLabel')}
                                  </Label>
                                  <div className="flex-1">
                                    <Input
                                      placeholder={t('behaviorControl.form.emailPlaceholder')}
                                      value={watchAll.object_config.type === 'sender' ? (watchAll.object_config.value ?? '') : ''}
                                      onChange={(e) => setValue('object_config', { type: 'sender', sub_type: 'individual', value: e.target.value }, { shouldDirty: true })}
                                      className={cn(objectConfigError && 'border-red-500')}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">{t('behaviorControl.form.emailHint')}</p>
                                    {objectConfigError && (
                                      <p className="text-xs text-red-500 mt-1">
                                        {t(`behaviorControl.errors.${objectConfigError}`)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {senderSubType === 'group' && (
                                <div className="flex items-center gap-3">
                                  <Label className="min-w-[100px] text-right">
                                    <span className="text-red-500">*</span> {t('behaviorControl.form.groupLabel')}
                                  </Label>
                                  <div className="flex-1">
                                    <Select
                                      value={watchAll.object_config.type === 'sender' ? (watchAll.object_config.value ?? '') : ''}
                                      onValueChange={(v) => setValue('object_config', { type: 'sender', sub_type: 'group', value: v ?? '' }, { shouldDirty: true })}
                                    >
                                      <SelectTrigger className={cn('w-full', objectConfigError && 'border-red-500')}>
                                        <SelectValue placeholder={t('behaviorControl.form.groupPlaceholder')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {senderGroups.map((g) => (
                                          <SelectItem key={g.name} value={g.name}>
                                            {g.name}{g.memberCount != null ? ` (${g.memberCount})` : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs text-muted-foreground">{t('behaviorControl.form.groupSource')}</span>
                                      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-blue-600" asChild>
                                        <Link href="/security/groups" target="_blank" rel="noopener noreferrer">
                                          {t('behaviorControl.form.manageGroup')} <ExternalLink className="h-3 w-3 ml-1" />
                                        </Link>
                                      </Button>
                                    </div>
                                    {objectConfigError && (
                                      <p className="text-xs text-red-500 mt-1">
                                        {t(`behaviorControl.errors.${objectConfigError}`)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                            </>
                          )}

                          {/* IP子类型 */}
                          {objectType === 'senderIp' && (
                            <>
                              <div className="flex items-center gap-3">
                                <Label className="min-w-[100px] text-right">
                                  <span className="text-red-500">*</span> {t('behaviorControl.form.ipTypeLabel')}
                                </Label>
                                <Select
                                  value={ipSubType}
                                  onValueChange={(v) => {
                                    setValue('object_config', { type: 'senderIp', sub_type: v as 'single' | 'ipGroup', value: '' }, { shouldDirty: true });
                                  }}
                                >
                                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="single">{t('behaviorControl.subType.single')}</SelectItem>
                                    <SelectItem value="ipGroup">{t('behaviorControl.subType.ipGroup')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {ipSubType === 'single' && (
                                <div className="flex items-center gap-3">
                                  <Label className="min-w-[100px] text-right">
                                    <span className="text-red-500">*</span> {t('behaviorControl.form.ipLabel')}
                                  </Label>
                                  <div className="flex-1">
                                    <Input
                                      placeholder={t('behaviorControl.form.ipPlaceholder')}
                                      value={watchAll.object_config.type === 'senderIp' ? (watchAll.object_config.value ?? '') : ''}
                                      onChange={(e) => setValue('object_config', { type: 'senderIp', sub_type: 'single', value: e.target.value }, { shouldDirty: true })}
                                      className={cn(objectConfigError && 'border-red-500')}
                                    />
                                    {objectConfigError && (
                                      <p className="text-xs text-red-500 mt-1">
                                        {t(`behaviorControl.errors.${objectConfigError}`)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {ipSubType === 'ipGroup' && (
                                <div className="flex items-center gap-3">
                                  <Label className="min-w-[100px] text-right">
                                    <span className="text-red-500">*</span> {t('behaviorControl.form.ipGroupLabel')}
                                  </Label>
                                  <div className="flex-1">
                                    <Select
                                      value={watchAll.object_config.type === 'senderIp' ? (watchAll.object_config.value ?? '') : ''}
                                      onValueChange={(v) => setValue('object_config', { type: 'senderIp', sub_type: 'ipGroup', value: v ?? '' }, { shouldDirty: true })}
                                    >
                                      <SelectTrigger className={cn('w-full', objectConfigError && 'border-red-500')}>
                                        <SelectValue placeholder={t('behaviorControl.form.ipGroupPlaceholder')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {ipGroups.map((g) => (
                                          <SelectItem key={g.name} value={g.name}>
                                            {g.name}{g.memberCount != null ? ` (${g.memberCount})` : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs text-muted-foreground">{t('behaviorControl.form.ipGroupSource')}</span>
                                      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-blue-600" asChild>
                                        <Link href="/security/groups" target="_blank" rel="noopener noreferrer">
                                          {t('behaviorControl.form.manageIpGroup')} <ExternalLink className="h-3 w-3 ml-1" />
                                        </Link>
                                      </Button>
                                    </div>
                                    {objectConfigError && (
                                      <p className="text-xs text-red-500 mt-1">
                                        {t(`behaviorControl.errors.${objectConfigError}`)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {/* 域名输入 */}
                          {objectType === 'senderDomain' && (
                            <div className="flex items-center gap-3">
                              <Label className="min-w-[100px] text-right">
                                <span className="text-red-500">*</span> {t('behaviorControl.form.domainLabel')}
                              </Label>
                              <div className="flex-1">
                                <Input
                                  placeholder={t('behaviorControl.form.domainPlaceholder')}
                                  value={watchAll.object_config.type === 'senderDomain' ? (watchAll.object_config.value ?? '') : ''}
                                  onChange={(e) => setValue('object_config', { type: 'senderDomain', value: e.target.value }, { shouldDirty: true })}
                                  className={cn(objectConfigError && 'border-red-500')}
                                />
                                {objectConfigError && (
                                  <p className="text-xs text-red-500 mt-1">
                                    {t(`behaviorControl.errors.${objectConfigError}`)}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* 有效期 */}
                          <div className="flex items-center gap-3">
                            <Label className="min-w-[100px] text-right flex items-center justify-end gap-1">
                              {t('behaviorControl.form.expireLabel')}
                              <Tooltip>
                                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
                                <TooltipContent className="max-w-[300px]">
                                  <p>{t('behaviorControl.form.expireTooltip')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </Label>
                            <div className="flex-1 flex items-center gap-2">
                              <Input type="date" {...register('valid_until')} className="w-40" />
                              <span className="text-xs text-muted-foreground">{t('behaviorControl.form.expireHint')}</span>
                            </div>
                          </div>
                          {formState.errors.valid_until && (
                            <div className="flex gap-3">
                              <div className="min-w-[100px]" />
                              <p className="text-xs text-red-500">{t(`behaviorControl.errors.${formState.errors.valid_until.message}`)}</p>
                            </div>
                          )}

                          {/* 优先级 */}
                          <div className="flex items-center gap-3">
                            <Label className="min-w-[100px] text-right flex items-center justify-end gap-1">
                              {t('behaviorControl.form.priorityLabel')}
                              <Tooltip>
                                <TooltipTrigger render={<HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />} />
                                <TooltipContent className="max-w-[300px]">
                                  <p>{t('behaviorControl.form.priorityTooltip', priorityRange)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </Label>
                            <div className="flex-1 flex items-center gap-2">
                              <Input
                                type="number"
                                {...register('priority', { valueAsNumber: true })}
                                className={cn('w-24', formState.errors.priority && 'border-red-500')}
                              />
                              <span className="text-xs text-muted-foreground">{t('behaviorControl.form.priorityHint', priorityRange)}</span>
                            </div>
                          </div>
                          {formState.errors.priority && (
                            <div className="flex gap-3">
                              <div className="min-w-[100px]" />
                              <p className="text-xs text-red-500">{t(`behaviorControl.errors.${formState.errors.priority.message}`, priorityRange)}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ===== 检测条件 ===== */}
                      <div className="bg-muted/40 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-5 w-1 bg-amber-500 rounded-full" />
                          <h3 className="font-medium">{t('behaviorControl.form.section.detection')}</h3>
                        </div>

                        <div className="space-y-4">
                          {/* 时间窗口 */}
                          <div className="flex items-center gap-3">
                            <Label className="min-w-[100px] text-right">
                              <span className="text-red-500">*</span> {t('behaviorControl.form.timeWindow')}
                            </Label>
                            <Select
                              value={watchAll.time_window}
                              onValueChange={(v) => setValue('time_window', v as BehaviorTimeWindow, { shouldDirty: true })}
                            >
                              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(['1min', '5min', '15min', '1hour', '6hour', '24hour', 'day'] as BehaviorTimeWindow[]).map((w) => (
                                  <SelectItem key={w} value={w}>{t(`behaviorControl.window.${w}`)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 动态条件列表 */}
                          {(watchAll.conditions ?? []).map((cond, idx) => {
                            const condErrors = (formState.errors.conditions as Record<number, { threshold?: { message?: string } }> | undefined)?.[idx];
                            return (
                              <div key={idx} className="border border-border rounded-md p-3 space-y-3 bg-background/60">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {t('behaviorControl.form.conditionN', { n: idx + 1 })}
                                  </span>
                                  {idx > 0 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                      onClick={() => {
                                        const next = (watchAll.conditions ?? []).filter((_, i) => i !== idx);
                                        setValue('conditions', next, { shouldDirty: true });
                                      }}
                                      aria-label={t('behaviorControl.form.conditionN', { n: idx + 1 })}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>

                                {/* 检测维度 */}
                                <div className="flex items-center gap-3">
                                  <Label className="min-w-[80px] text-right text-sm">
                                    <span className="text-red-500">*</span> {t('behaviorControl.col.detection')}
                                  </Label>
                                  <Select
                                    value={cond.dim ?? ''}
                                    onValueChange={(v) => {
                                      const next = [...(watchAll.conditions ?? [])];
                                      next[idx] = { ...next[idx], dim: v as BehaviorDimension };
                                      setValue('conditions', next, { shouldDirty: true });
                                    }}
                                  >
                                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {BEHAVIOR_DIMENSIONS.map((d) => (
                                        <SelectItem key={d} value={d}>{t(`behaviorControl.dim.${d}`)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* 阈值 */}
                                <div className="flex items-center gap-3">
                                  <Label className="min-w-[80px] text-right text-sm">
                                    <span className="text-red-500">*</span> {t('behaviorControl.form.threshold')}
                                  </Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min={1}
                                      placeholder={t('behaviorControl.form.thresholdPlaceholder')}
                                      value={cond.threshold > 0 ? cond.threshold : ''}
                                      onChange={(e) => {
                                        const next = [...(watchAll.conditions ?? [])];
                                        next[idx] = { ...next[idx], threshold: parseInt(e.target.value, 10) || 0 };
                                        setValue('conditions', next, { shouldDirty: true });
                                      }}
                                      className={cn('w-28', condErrors?.threshold && 'border-red-500')}
                                    />
                                    <span className="text-sm text-muted-foreground">
                                      {cond.dim ? t(`behaviorControl.unit.${cond.dim}`) : ''}
                                    </span>
                                  </div>
                                </div>
                                {condErrors?.threshold && (
                                  <div className="flex gap-3">
                                    <div className="min-w-[80px]" />
                                    <p className="text-xs text-red-500">
                                      {t(`behaviorControl.errors.${condErrors.threshold.message}`)}
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* 添加条件按钮 */}
                          <div className="flex items-center gap-3">
                            <div className="min-w-[100px]" />
                            <div className="flex items-center gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={(watchAll.conditions ?? []).length >= 4}
                                onClick={() => {
                                  const next = [
                                    ...(watchAll.conditions ?? []),
                                    { dim: 'mail_count' as BehaviorDimension, threshold: 0 },
                                  ];
                                  setValue('conditions', next, { shouldDirty: true });
                                }}
                                className="h-8 text-xs gap-1.5"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {t('behaviorControl.form.addCondition')}
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                {t('behaviorControl.form.conditionCount', { count: (watchAll.conditions ?? []).length })}
                              </span>
                            </div>
                          </div>

                          {/* 条件关系：多于 1 条时显示 */}
                          {(watchAll.conditions ?? []).length > 1 && (
                            <div className="flex items-center gap-3">
                              <Label className="min-w-[100px] text-right text-sm">
                                {t('behaviorControl.form.conditionRelation')}
                              </Label>
                              <div className="flex gap-4">
                                {([
                                  { value: false, label: t('behaviorControl.form.relationAnd') },
                                  { value: true, label: t('behaviorControl.form.relationOr') },
                                ] as { value: boolean; label: string }[]).map(({ value, label }) => (
                                  <label key={String(value)} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                    <input
                                      type="radio"
                                      name="or_enabled"
                                      checked={orEnabled === value}
                                      onChange={() => setValue('or_enabled', value, { shouldDirty: true })}
                                      className="accent-primary"
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ===== 执行动作 ===== */}
                      <div className="bg-muted/40 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="h-5 w-1 bg-red-500 rounded-full" />
                          <h3 className="font-medium">{t('behaviorControl.form.section.action')}</h3>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Label className="min-w-[100px] text-right">
                              <span className="text-red-500">*</span> {t('behaviorControl.form.actionLabel')}
                            </Label>
                            <Select
                              value={watchAll.action}
                              onValueChange={(v) => setValue('action', v as BehaviorProductAction, { shouldDirty: true })}
                            >
                              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(['review', 'quarantine', 'drop', 'block'] as BehaviorProductAction[]).map((a) => (
                                  <SelectItem key={a} value={a}>{t(`behaviorControl.action.${a}`)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-start gap-3">
                            <Label className="min-w-[100px] text-right mt-2">{t('behaviorControl.form.remark')}</Label>
                            <div className="flex-1">
                              <Textarea
                                placeholder={t('behaviorControl.form.remarkPlaceholder')}
                                {...register('description')}
                                maxLength={200}
                                rows={3}
                              />
                              <p className="text-xs text-muted-foreground text-right mt-1">
                                {(description?.length ?? 0)}/200
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 右栏：预览和帮助区 */}
                  <div className="flex-1 overflow-y-auto bg-muted/40 p-6">
                    <div className="space-y-6">
                      {/* 规则效果预览 */}
                      <div className="bg-background rounded-lg p-5 border">
                        <div className="flex items-center gap-2 mb-4">
                          <Zap className="h-4 w-4 text-blue-500" />
                          <h3 className="font-medium">{t('behaviorControl.preview.title')}</h3>
                        </div>

                        {isIncomplete ? (
                          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                              {t('behaviorControl.preview.incomplete')}
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <div className="space-y-3 text-sm">
                            <div className="flex items-start gap-2">
                              <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <span className="text-muted-foreground">{t('behaviorControl.preview.objectPrefix')}</span>
                                <Badge variant="secondary" className="mx-1.5">{describeObject(watchAll.object_config, t)}</Badge>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <span className="text-muted-foreground">{t('behaviorControl.preview.directionPrefix')}</span>
                                <Badge variant="secondary" className="mx-1.5">{t(`behaviorControl.direction.${watchAll.direction}`)}</Badge>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <span className="text-muted-foreground">{t('behaviorControl.preview.windowPrefix')}</span>
                                <Badge variant="secondary" className="mx-1.5">{t(`behaviorControl.window.${watchAll.time_window}`)}</Badge>
                                <span className="text-muted-foreground">{t('behaviorControl.preview.windowSuffix')}</span>
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Ban className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div className="flex flex-wrap items-center gap-y-1">
                                {(watchAll.conditions ?? []).map((cond, idx) => {
                                  const dimLabel = cond.dim
                                    ? t(`behaviorControl.dim.${cond.dim}`).replace(/上限$/, '')
                                    : '';
                                  const sep = idx > 0
                                    ? (watchAll.or_enabled
                                        ? t('behaviorControl.preview.or')
                                        : t('behaviorControl.preview.and', { defaultValue: 'AND' }))
                                    : null;
                                  return (
                                    <span key={idx} className="flex items-center gap-0.5">
                                      {sep && (
                                        <span className="text-muted-foreground mx-1 font-medium">{sep}</span>
                                      )}
                                      <span className="text-muted-foreground">{dimLabel}{t('behaviorControl.preview.exceed')}</span>
                                      <Badge variant="outline" className="mx-1.5 font-mono">{cond.threshold > 0 ? cond.threshold : '—'}</Badge>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex items-start gap-2">
                              <Shield className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <div>
                                <span className="text-muted-foreground">{t('behaviorControl.preview.actionPrefix')}</span>
                                <Badge className="mx-1.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                  {t(`behaviorControl.action.${watchAll.action}`)}
                                </Badge>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{t('behaviorControl.preview.expirePrefix')}</span>
                              <span>{watchAll.valid_until || t('behaviorControl.preview.permanent')}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{t('behaviorControl.preview.priorityPrefix')}</span>
                              <Badge variant="outline" className="font-mono">{watchAll.priority}</Badge>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 配置示例 */}
                      <Collapsible open={showExamples} onOpenChange={setShowExamples}>
                        <CollapsibleSectionTrigger>
                          <Lightbulb className="h-4 w-4" />
                          <span>{t('behaviorControl.examples.toggle')}</span>
                        </CollapsibleSectionTrigger>
                        <CollapsibleContent className="mt-3 space-y-3">
                          {([
                            {
                              name: t('behaviorControl.examples.normalName'),
                              desc: t('behaviorControl.examples.normalDesc'),
                              effect: t('behaviorControl.examples.normalEffect'),
                              preset: {
                                time_window: '15min' as BehaviorTimeWindow,
                                conditions: [
                                  { dim: 'mail_count' as BehaviorDimension, threshold: 50 },
                                  { dim: 'ip_count' as BehaviorDimension, threshold: 2 },
                                ],
                                or_enabled: false,
                              },
                            },
                            {
                              name: t('behaviorControl.examples.stolenName'),
                              desc: t('behaviorControl.examples.stolenDesc'),
                              effect: t('behaviorControl.examples.stolenEffect'),
                              preset: {
                                time_window: '15min' as BehaviorTimeWindow,
                                conditions: [
                                  { dim: 'ip_count' as BehaviorDimension, threshold: 10 },
                                  { dim: 'mail_count' as BehaviorDimension, threshold: 200 },
                                ],
                                or_enabled: true,
                              },
                            },
                            {
                              name: t('behaviorControl.examples.salesName'),
                              desc: t('behaviorControl.examples.salesDesc'),
                              effect: t('behaviorControl.examples.salesEffect'),
                              preset: {
                                time_window: '1hour' as BehaviorTimeWindow,
                                conditions: [
                                  { dim: 'recipient_count' as BehaviorDimension, threshold: 500 },
                                ],
                                or_enabled: false,
                              },
                            },
                          ] as const).map((example) => (
                            <div
                              key={example.name}
                              className="bg-background rounded-lg p-4 border cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors group"
                              onClick={() => {
                                setValue('time_window', example.preset.time_window, { shouldDirty: true });
                                setValue('conditions', example.preset.conditions.map(c => ({ ...c })), { shouldDirty: true });
                                setValue('or_enabled', example.preset.or_enabled, { shouldDirty: true });
                              }}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-medium text-sm">{example.name}</h4>
                                  <p className="text-xs text-muted-foreground">{example.desc}</p>
                                </div>
                                <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2 mt-0.5">
                                  {t('behaviorControl.examples.fill')}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">{example.effect}</p>
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>

                      {/* 模拟测试 */}
                      <Collapsible open={showSimulator} onOpenChange={setShowSimulator}>
                        <CollapsibleSectionTrigger>
                          <Play className="h-4 w-4" />
                          <span>{t('behaviorControl.simulator.toggle')}</span>
                        </CollapsibleSectionTrigger>
                        <CollapsibleContent className="mt-3">
                          <div className="bg-background rounded-lg p-4 border space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs mb-1.5 block">{t('behaviorControl.simulator.sender')}</Label>
                                <Input
                                  value={simSender}
                                  onChange={(e) => setSimSender(e.target.value)}
                                  placeholder={t('behaviorControl.simulator.senderPlaceholder')}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs mb-1.5 block">{t('behaviorControl.simulator.ip')}</Label>
                                <Input
                                  value={simIp}
                                  onChange={(e) => setSimIp(e.target.value)}
                                  placeholder="192.168.1.1"
                                  className="h-8 text-sm"
                                />
                              </div>
                              {needsUniqueSenderIPCount && (
                                <div>
                                  <Label className="text-xs mb-1.5 block">{t('behaviorControl.simulator.ipCount')}</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={simUniqueSenderIPCount}
                                    onChange={(e) => setSimUniqueSenderIPCount(parseInt(e.target.value, 10) || 0)}
                                    className="h-8 text-sm"
                                  />
                                </div>
                              )}
                              <div>
                                <Label className="text-xs mb-1.5 block">{t('behaviorControl.simulator.mailCount')}</Label>
                                <Input
                                  type="number"
                                  value={simMailCount}
                                  onChange={(e) => setSimMailCount(parseInt(e.target.value, 10) || 0)}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs mb-1.5 block">{t('behaviorControl.simulator.recipientCount')}</Label>
                                <Input
                                  type="number"
                                  value={simRecipientCount}
                                  onChange={(e) => setSimRecipientCount(parseInt(e.target.value, 10) || 0)}
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
                            <Button type="button" size="sm" className="w-full" onClick={runSimulation}>
                              {t('behaviorControl.simulator.run')}
                            </Button>

                            {simResult && (
                              <div className={cn(
                                'rounded-lg p-3 text-sm',
                                simResult.hit
                                  ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                                  : 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800',
                              )}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  {simResult.hit ? (
                                    <>
                                      <X className="h-4 w-4 text-red-600" />
                                      <span className="font-medium text-red-700 dark:text-red-400">{t('behaviorControl.simulator.hit')}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check className="h-4 w-4 text-green-600" />
                                      <span className="font-medium text-green-700 dark:text-green-400">{t('behaviorControl.simulator.miss')}</span>
                                    </>
                                  )}
                                </div>
                                <p className={cn(
                                  'text-xs',
                                  simResult.hit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400',
                                )}
                                >
                                  {simResult.reason}
                                </p>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>

                      {/* 配置提示 */}
                      <div className="bg-background rounded-lg p-4 border">
                        <h4 className="font-medium text-sm mb-3">{t('behaviorControl.tips.title')}</h4>
                        <ul className="space-y-2 text-xs text-muted-foreground">
                          {(['item1', 'item2', 'item3', 'item4', 'item5', 'item6'] as const).map((k) => (
                            <li key={k} className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              {t(`behaviorControl.tips.${k}`)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </TooltipProvider>
              </div>
              <div className="flex justify-end gap-2 border-t px-6 py-4 flex-shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => handleClose(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </FormProvider>
        </SheetContent>
      </Sheet>

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('behaviorControl.closeConfirm.title')}</DialogTitle>
            <DialogDescription>{t('behaviorControl.closeConfirm.body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseConfirmOpen(false)}>
              {t('behaviorControl.closeConfirm.stay')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => { setCloseConfirmOpen(false); onOpenChange(false); }}
            >
              {t('behaviorControl.closeConfirm.discard')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
