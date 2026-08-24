'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, Power, PowerOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  getUnifiedRules,
  deleteUnifiedRule,
  toggleUnifiedRule,
  exportUnifiedRules,
  previewUnifiedRulesImport,
  executeUnifiedRulesImport,
} from '@/lib/api/unified-rules';
import type { Rule, StageType, RuleNode, RuleMetadata, AcceptHeaderEntry, CreateRuleRequest } from '@/types/unified-rules';
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTenant } from '@/hooks/use-tenant';
import { useApiRequest } from '@/lib/api/client';
import { readRulePrefill, removeRulePrefill } from '@/lib/rule-prefill';
import { Badge } from '@/components/ui/badge';
import { ConditionTreeBuilder } from './ConditionTreeBuilder';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { RuleImportExportDialog } from './RuleImportExportDialog';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const advancedRuleSchema = z.object({
  name: z.string().min(1, 'nameRequired'),
  action: z.enum(['accept', 'proceed', 'reject', 'quarantine', 'sideline', 'audit']),
  priority: z.number().optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

type AdvancedRuleForm = z.infer<typeof advancedRuleSchema>;

const defaultTree: RuleNode = {
  type: 'AND',
  children: [{ type: 'condition', field: 'client_ip', operator: 'contain', value: '' }],
};

interface StageRulesPageProps {
  stage: StageType;
}

export function StageRulesPage({ stage }: StageRulesPageProps) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const { effectiveTenantId, isSystemAdmin, isViewingAllTenants } = useTenant();
  const { apiRequest } = useApiRequest();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conditionTree, setConditionTree] = useState<RuleNode>(defaultTree);
  const [originalConditionTree, setOriginalConditionTree] = useState<RuleNode | null>(null);
  const [maxCheckTime, setMaxCheckTime] = useState<number>(30);
  const [sidelineTimeout, setSidelineTimeout] = useState<number>(1440);
  const [auditTimeout, setAuditTimeout] = useState<number>(10080);
  const [subjectPrefix, setSubjectPrefix] = useState<string>('');
  const [acceptHeaders, setAcceptHeaders] = useState<AcceptHeaderEntry[]>([]);
  const [prefillSource, setPrefillSource] = useState<'investigation' | null>(null);

  const queryKey = ['unified-rules', 'action', stage, effectiveTenantId];

  const { data: rules, isLoading } = useQuery({
    queryKey,
    queryFn: () => getUnifiedRules({ rule_class: 'action', stage }, apiRequest),
  });

  const { data: tenantOptions = [] } = useQuery({
    queryKey: ['tenants', 'options'],
    queryFn: async () => {
      const response = await apiRequest<{ items: Array<{ id: number; name: string }> }>('/tenants');
      return response.items.map((tenant) => ({ id: tenant.id, name: tenant.name }));
    },
    enabled: isSystemAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUnifiedRule(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => toggleUnifiedRule(id, isActive, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const form = useForm<AdvancedRuleForm>({
    resolver: zodResolver(advancedRuleSchema),
    defaultValues: { name: '', action: stage === 'sideline' ? 'accept' : 'reject', priority: 100, is_active: true },
  });

  const parseAcceptMeta = (rule: Rule): { prefix: string; headers: AcceptHeaderEntry[] } => {
    if (!rule.metadata) return { prefix: '', headers: [] };
    try {
      const meta: RuleMetadata = typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : rule.metadata;
      return {
        prefix: meta.subject_prefix || '',
        headers: meta.add_headers || [],
      };
    } catch {
      return { prefix: typeof rule.metadata === 'string' ? rule.metadata : '', headers: [] };
    }
  };

  const clearPrefillQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const prefillKey = params.get('prefill_key');
    if (prefillKey) {
      removeRulePrefill(prefillKey);
    }
    params.delete('prefill_rule');
    params.delete('prefill_key');
    params.delete('return_task_id');
    params.delete('return_mail_log_id');
    params.delete('edit_rule_id');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [pathname, router, searchParams]);

  const applyPrefillRequest = useCallback((request: CreateRuleRequest) => {
    setEditingRule(null);
    setPrefillSource('investigation');
    setConditionTree(request.condition_tree || defaultTree);
    setMaxCheckTime(30);
    setSidelineTimeout(1440);
    setAuditTimeout(10080);
    setSubjectPrefix('');
    setAcceptHeaders([]);

    const metadata = request.metadata as RuleMetadata | undefined;
    if (metadata?.max_check_time) setMaxCheckTime(metadata.max_check_time);
    if (metadata?.timeout_minutes) {
      if (request.action === 'sideline') setSidelineTimeout(metadata.timeout_minutes);
      if (request.action === 'audit') setAuditTimeout(metadata.timeout_minutes);
    }
    if (metadata?.subject_prefix) setSubjectPrefix(metadata.subject_prefix);
    if (metadata?.add_headers) setAcceptHeaders(metadata.add_headers);

    form.reset({
      name: request.name || '',
      action: (request.action as AdvancedRuleForm['action']) || 'reject',
      priority: request.priority ?? 100,
      description: request.description || '',
      is_active: request.is_active ?? false,
    });
    setDialogOpen(true);
  }, [form]);

  const handleOpenDialog = useCallback((rule?: Rule) => {
    if (rule) {
      setEditingRule(rule);
      setPrefillSource(null);
      let parsedTree: RuleNode = defaultTree;
      try {
        parsedTree = typeof rule.condition_tree === 'string'
          ? JSON.parse(rule.condition_tree)
          : rule.condition_tree;
      } catch {
        // use default
      }
      setConditionTree(parsedTree);
      if (rule.is_system) {
        setOriginalConditionTree(parsedTree);
      } else {
        setOriginalConditionTree(null);
      }
      let parsedMaxTime = 30;
      let parsedSidelineTimeout = 1440;
      let parsedAuditTimeout = 10080;
      let parsedPrefix = '';
      let parsedHeaders: AcceptHeaderEntry[] = [];
      if (rule.metadata) {
        try {
          const meta: RuleMetadata = typeof rule.metadata === 'string'
            ? JSON.parse(rule.metadata)
            : rule.metadata;
          if (meta.max_check_time) parsedMaxTime = meta.max_check_time;
          if (meta.timeout_minutes) {
            if (rule.action === 'sideline') parsedSidelineTimeout = meta.timeout_minutes;
            if (rule.action === 'audit') parsedAuditTimeout = meta.timeout_minutes;
          }
          if (meta.subject_prefix) parsedPrefix = meta.subject_prefix;
          if (meta.add_headers) parsedHeaders = meta.add_headers;
        } catch {
          parsedPrefix = typeof rule.metadata === 'string' ? rule.metadata : '';
        }
      }
      setMaxCheckTime(parsedMaxTime);
      setSidelineTimeout(parsedSidelineTimeout);
      setAuditTimeout(parsedAuditTimeout);
      setSubjectPrefix(parsedPrefix);
      setAcceptHeaders(parsedHeaders);
      form.reset({
        name: rule.name,
        action: rule.action as AdvancedRuleForm['action'],
        priority: rule.priority,
        description: rule.description || '',
        is_active: rule.is_active,
      });
    } else {
      setEditingRule(null);
      setPrefillSource(null);
      setConditionTree(defaultTree);
      setOriginalConditionTree(null);
      setMaxCheckTime(30);
      setSidelineTimeout(1440);
      setAuditTimeout(10080);
      setSubjectPrefix('');
      setAcceptHeaders([]);
      const defaultAction = stage === 'sideline' ? 'accept' : 'reject';
      form.reset({ name: '', action: defaultAction, priority: 100, is_active: true });
    }
    setDialogOpen(true);
  }, [form]);

  useEffect(() => {
    const prefillKey = searchParams.get('prefill_key');
    const raw = searchParams.get('prefill_rule');
    if ((!prefillKey && !raw) || dialogOpen || editingRule) {
      return;
    }

    try {
      const parsed = prefillKey
        ? readRulePrefill(prefillKey)
        : JSON.parse(raw!) as CreateRuleRequest;
      if (!parsed) {
        throw new Error('missing prefill payload');
      }
      if (parsed.stage !== stage) {
        return;
      }
      if (prefillKey) {
        removeRulePrefill(prefillKey);
      }
      applyPrefillRequest(parsed);
    } catch {
      toast.error(t('investigations.prefillRuleInvalid'));
      clearPrefillQuery();
    }
  }, [applyPrefillRequest, clearPrefillQuery, dialogOpen, editingRule, searchParams, stage, t]);

  useEffect(() => {
    const editRuleID = searchParams.get('edit_rule_id');
    if (!editRuleID || dialogOpen || editingRule || !rules || rules.length === 0) {
      return;
    }

    const parsedID = Number(editRuleID);
    if (!Number.isFinite(parsedID)) {
      clearPrefillQuery();
      return;
    }

    const matchedRule = rules.find((rule) => rule.id === parsedID);
    if (!matchedRule) {
      clearPrefillQuery();
      return;
    }

    handleOpenDialog(matchedRule);
  }, [clearPrefillQuery, dialogOpen, editingRule, handleOpenDialog, rules, searchParams]);

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open && (searchParams.get('prefill_rule') || searchParams.get('prefill_key') || searchParams.get('edit_rule_id'))) {
      clearPrefillQuery();
    }
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.getValues();
    if (Number.isNaN(values.priority)) form.setValue('priority', undefined as unknown as number);
    form.handleSubmit(
      async (data) => {
        setIsSubmitting(true);
        try {
          const body: Record<string, unknown> = {
            ...data,
            stage,
            condition_tree: conditionTree,
          };
          if (data.action === 'sideline') {
            body.metadata = {
              max_check_time: maxCheckTime,
              timeout_minutes: sidelineTimeout,
            };
          } else if (data.action === 'audit') {
            body.metadata = {
              timeout_minutes: auditTimeout,
            };
          } else if (data.action === 'accept') {
            const meta: Record<string, unknown> = {};
            if (subjectPrefix) meta.subject_prefix = subjectPrefix;
            if (acceptHeaders.length > 0) meta.add_headers = acceptHeaders;
            body.metadata = Object.keys(meta).length > 0 ? meta : null;
          } else {
            body.metadata = null;
          }
          const url = editingRule ? `/unified-rules/${editingRule.id}` : '/unified-rules';
          const bodyPayload = { ...body, rule_class: 'action' };
          await apiRequest(url, {
            method: editingRule ? 'PUT' : 'POST',
            body: bodyPayload,
          });
          queryClient.invalidateQueries({ queryKey });
          toast.success(t(editingRule ? 'common.updateSuccess' : 'common.createSuccess'));
          const returnTaskId = searchParams.get('return_task_id');
          const returnMailLogId = searchParams.get('return_mail_log_id');
          if (editingRule && returnTaskId && searchParams.get('edit_rule_id')) {
            const params = new URLSearchParams({ task_id: returnTaskId, rule_updated: '1' });
            if (returnMailLogId) {
              params.set('mail_log_id', returnMailLogId);
            }
            router.push(`/${locale}/investigations?${params.toString()}`);
            return;
          }
          if (!editingRule && prefillSource === 'investigation' && returnTaskId) {
            const params = new URLSearchParams({ task_id: returnTaskId, rule_created: '1' });
            if (returnMailLogId) {
              params.set('mail_log_id', returnMailLogId);
            }
            router.push(`/${locale}/investigations?${params.toString()}`);
            return;
          }
          handleDialogOpenChange(false);
        } catch {
          toast.error(t('common.error'));
        } finally {
          setIsSubmitting(false);
        }
      },
      () => {}
    )();
  };

  const addHeaderEntry = () => {
    setAcceptHeaders([...acceptHeaders, { name: '', value: '' }]);
  };

  const updateHeaderEntry = (index: number, field: 'name' | 'value', val: string) => {
    const updated = [...acceptHeaders];
    updated[index] = { ...updated[index], [field]: val };
    setAcceptHeaders(updated);
  };

  const removeHeaderEntry = (index: number) => {
    setAcceptHeaders(acceptHeaders.filter((_, i) => i !== index));
  };

  const makeColumns = (): ColumnDef<Rule>[] => [
    { accessorKey: 'id', header: 'ID', size: 60 },
    ...(isViewingAllTenants
      ? [
          {
            id: 'tenant_name',
            header: t('common.tenant'),
            cell: ({ row }: { row: { original: Rule } }) => {
              const rule = row.original;
              return rule.tenant_id == null ? (
                <Badge variant="secondary">{t('rules.globalRule')}</Badge>
              ) : (
                <span>{rule.tenant_name || rule.tenant_id}</span>
              );
            },
          } as ColumnDef<Rule>,
        ]
      : []),
    {
      accessorKey: 'name',
      header: t('advancedRules.name'),
      cell: ({ row }) => {
        const rule = row.original;
        return (
          <div className="flex items-center gap-1.5">
            {rule.is_system && (
              <span title={t('rules.systemRuleTooltip')} className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border/60">
                <Lock className="h-2.5 w-2.5" />
                {t('rules.systemRule')}
              </span>
            )}
            <span>{rule.name}</span>
          </div>
        );
      },
    },
    { accessorKey: 'priority', header: t('rules.priority'), size: 80 },
    {
      accessorKey: 'action',
      header: t('rules.action'),
      cell: ({ row }) => {
        const action = row.original.action;
        const acceptMeta = parseAcceptMeta(row.original);
        const hasMeta = action === 'accept' && (acceptMeta.prefix || acceptMeta.headers.length > 0);
        return (
          <div className="flex items-center gap-1">
            <StatusBadge
              status={t(`rules.${action}`)}
              variant={action === 'accept' ? 'success' : action === 'reject' ? 'error' : 'warning'}
            />
            {hasMeta && (
              <span className="text-[10px] text-muted-foreground">
                {acceptMeta.prefix && `[${acceptMeta.prefix}]`}
                {acceptMeta.headers.length > 0 && ` +${acceptMeta.headers.length}H`}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: t('rules.isActive'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.is_active ? t('common.enabled') : t('common.disabled')}
          variant={row.original.is_active ? 'success' : 'default'}
        />
      ),
    },
    { accessorKey: 'updated_at', header: t('rules.updatedAt'), size: 160 },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => {
        const rule = row.original;
        // GT-12729：由租户配置(tenant_config)物化生成的规则,DB 层 CRUD 已 403,
        // 前端同步隐藏编辑/删除入口并禁用启停开关,避免用户点了才收到后端拒绝。
        const isTenantConfigManaged = (() => {
          try {
            return JSON.parse(rule.metadata || '{}')?.managed_by === 'tenant_config';
          } catch {
            return false;
          }
        })();
        const canEdit = (!rule.is_system || isSystemAdmin) && !isTenantConfigManaged;
        const canDelete = !rule.is_system && !isTenantConfigManaged;
        return (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={(rule.is_system && !isSystemAdmin) || isTenantConfigManaged}
              onClick={() => toggleMutation.mutate({ id: rule.id, isActive: !rule.is_active })}
              title={rule.is_active ? t('common.disabled') : t('common.enabled')}
            >
              {rule.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" disabled={!canEdit} onClick={() => handleOpenDialog(rule)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" disabled={!canDelete} onClick={() => setDeleteId(rule.id)} className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  const stageTitleKey = `sidebar.stage${stage.charAt(0).toUpperCase() + stage.slice(1)}` as const;
  const stageTitle = t(stageTitleKey);

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('ruleImportExport.stageEyebrow')}
        title={stageTitle}
        description={t('ruleImportExport.stagePageDescription')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportExportOpen(true)}>
              {t('ruleImportExport.trigger')}
            </Button>
            <Button onClick={() => handleOpenDialog()} data-testid={`stage-rule-create-${stage}`}>
              <Plus className="h-4 w-4 mr-2" />
              {t('rules.createRule')}
            </Button>
          </div>
        }
      />

      <PageSurface className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <DataTable columns={makeColumns()} data={rules || []} />
        )}
      </PageSurface>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-[28px] border-border/70 shadow-2xl" data-testid={`stage-rule-dialog-${stage}`}>
          <DialogHeader>
            <DialogTitle>{editingRule ? t('rules.editRule') : t('rules.createRule')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onFormSubmit} className="space-y-4">
            {prefillSource === 'investigation' && !editingRule ? (
              <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {t('investigations.prefillRuleBanner')}
              </div>
            ) : null}
            {editingRule?.is_system && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0" />
                {t('rules.systemRuleEditBanner')}
              </div>
            )}
            <div className="space-y-2">
              <Label>{t('advancedRules.name')} *</Label>
              <Input
                {...form.register('name')}
                disabled={!!editingRule?.is_system}
                className={editingRule?.is_system ? 'opacity-50 cursor-not-allowed' : ''}
                data-testid={`stage-rule-name-${stage}`}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">{t('advancedRules.conditionTree')}</Label>
              <ConditionTreeBuilder
                value={conditionTree}
                onChange={setConditionTree}
                stage={stage}
                lockedStructure={!!editingRule?.is_system}
                originalNode={originalConditionTree || undefined}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('rules.action')} *</Label>
                <Select value={form.watch('action')} onValueChange={(v) => form.setValue('action', v as AdvancedRuleForm['action'])}>
                  <SelectTrigger data-testid={`stage-rule-action-${stage}`}><SelectValue>{{ accept: t('rules.accept'), proceed: t('rules.proceed'), reject: t('rules.reject'), quarantine: t('rules.quarantine'), sideline: t('rules.sideline'), audit: t('rules.audit') }[form.watch('action')]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accept" data-testid={`stage-rule-action-${stage}-option-accept`}>{t('rules.accept')}</SelectItem>
                    <SelectItem value="proceed" data-testid={`stage-rule-action-${stage}-option-proceed`}>{t('rules.proceed')}</SelectItem>
                    <SelectItem value="reject" data-testid={`stage-rule-action-${stage}-option-reject`}>{t('rules.reject')}</SelectItem>
                    <SelectItem value="quarantine" data-testid={`stage-rule-action-${stage}-option-quarantine`}>{t('rules.quarantine')}</SelectItem>
                    {stage !== 'sideline' && !editingRule?.is_system && (
                      <SelectItem value="sideline" data-testid={`stage-rule-action-${stage}-option-sideline`}>{t('rules.sideline')}</SelectItem>
                    )}
                    {stage !== 'sideline' && !editingRule?.is_system && (
                      <SelectItem value="audit" data-testid={`stage-rule-action-${stage}-option-audit`}>{t('rules.audit')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('rules.priority')}</Label>
                <Input type="number" {...form.register('priority', { valueAsNumber: true })} data-testid={`stage-rule-priority-${stage}`} />
              </div>
              {!editingRule?.is_system && (
                <div className="space-y-2">
                  <Label>{t('rules.description')}</Label>
                  <Textarea {...form.register('description')} />
                </div>
              )}
            </div>

            {form.watch('action') === 'accept' && (
              <div className="space-y-3 rounded-md border p-4">
                <Label className="text-base font-semibold">{t('advancedRules.acceptConfig')}</Label>
                <div className="space-y-2">
                  <Label>{t('advancedRules.subjectPrefixConfig')}</Label>
                  <Input
                    value={subjectPrefix}
                    onChange={(e) => setSubjectPrefix(e.target.value)}
                    placeholder="[SPAM]"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('advancedRules.addHeadersConfig')}</Label>
                  {acceptHeaders.map((h, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        className="flex-1"
                        value={h.name}
                        onChange={(e) => updateHeaderEntry(i, 'name', e.target.value)}
                        placeholder={t('advancedRules.addHeaderName')}
                      />
                      <Input
                        className="flex-1"
                        value={h.value}
                        onChange={(e) => updateHeaderEntry(i, 'value', e.target.value)}
                        placeholder={t('advancedRules.addHeaderValue')}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        onClick={() => removeHeaderEntry(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addHeaderEntry}>
                    <Plus className="h-4 w-4 mr-1" />
                    {t('advancedRules.addHeaderEntry')}
                  </Button>
                </div>
              </div>
            )}

            {form.watch('action') === 'sideline' && !editingRule?.is_system && (
              <div className="space-y-3 rounded-md border p-4">
                <Label className="text-base font-semibold">{t('advancedRules.sidelineConfig')}</Label>
                <div className="space-y-2">
                  <Label>{t('advancedRules.maxCheckTime')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={maxCheckTime}
                      onChange={(e) => setMaxCheckTime(Number(e.target.value) || 30)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">{t('advancedRules.minutes')}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('advancedRules.timeoutMinutes')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={-1}
                      value={sidelineTimeout}
                      onChange={(e) => setSidelineTimeout(Number(e.target.value) || 1440)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">{t('advancedRules.minutes')}</span>
                  </div>
                </div>
              </div>
            )}

            {form.watch('action') === 'audit' && !editingRule?.is_system && (
              <div className="space-y-3 rounded-md border p-4">
                <Label className="text-base font-semibold">{t('advancedRules.auditConfig')}</Label>
                <div className="space-y-2">
                  <Label>{t('advancedRules.timeoutMinutes')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={-1}
                      value={auditTimeout}
                      onChange={(e) => setAuditTimeout(Number(e.target.value) || 10080)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">{t('advancedRules.minutes')}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch checked={form.watch('is_active')} onCheckedChange={(v) => form.setValue('is_active', v)} />
              <Label>{t('rules.isActive')}</Label>
            </div>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid={`stage-rule-save-${stage}`}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title={t('rules.deleteRule')}
        description={t('common.confirmDelete')}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        variant="destructive"
      />

      <RuleImportExportDialog
        open={importExportOpen}
        onOpenChange={setImportExportOpen}
        scopeLabel={t('ruleImportExport.scopeLabel')}
        variant="unified-rules"
        adminContext={isSystemAdmin ? 'system-admin' : 'tenant-admin'}
        tenantOptions={tenantOptions}
        onExport={(selection) => exportUnifiedRules(selection, apiRequest)}
        onPreviewImport={(payload) => previewUnifiedRulesImport(payload, apiRequest)}
        onExecuteImport={async (payload) => {
          const response = await executeUnifiedRulesImport(payload, apiRequest);
          queryClient.invalidateQueries({ queryKey: ['unified-rules'] });
          return response;
        }}
      />
    </PageShell>
  );
}
