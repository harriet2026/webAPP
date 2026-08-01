'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, Tag, AlertTriangle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { getUnifiedRules, getSystemTags, deleteUnifiedRule } from '@/lib/api/unified-rules';
import type { Rule, RuleNode, StageType, SystemTag } from '@/types/unified-rules';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { useApiRequest } from '@/lib/api/client';
import { ConditionTreeBuilder } from '@/components/rules/ConditionTreeBuilder';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import {
  AddonsPanel,
  emptyAddonsState,
  serializeAddons,
  parseAddons,
} from '@/components/security/advanced-filter-rules/AddonsPanel';
import type { AddonsState } from '@/components/security/advanced-filter-rules/validation';
import { isInternalIP } from '@/components/security/advanced-filter-rules/rule-form';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const STAGES: { value: StageType; label: string }[] = [
  { value: 'onconnect', label: 'On Connect' },
  { value: 'mail', label: 'MAIL FROM' },
  { value: 'rcpt', label: 'RCPT TO' },
  { value: 'header', label: 'Header' },
  { value: 'data', label: 'Body/Data' },
];

const defaultTree: RuleNode = {
  type: 'AND',
  children: [{ type: 'condition', field: 'sender', operator: 'isNotNull', value: '' }],
};

function parseRuleMetadata(rule: Rule): Record<string, unknown> {
  if (!rule.metadata) return {};
  try {
    return JSON.parse(rule.metadata);
  } catch {
    return {};
  }
}

/**
 * Build the metadata for a tag rule submission.
 * Preserves any non-addon keys already on the rule (e.g. group_type)
 * and writes the canonical addons[] shape.
 * No `primary_action` is written (tag rules have no primary action).
 * When no addons are configured, strips feature/addons keys so the rule
 * is not treated as an addon-carrier by HasAddonMetadata.
 */
function buildTagMetadata(
  editingRule: Rule | null,
  addonsState: AddonsState,
): Record<string, unknown> {
  const base: Record<string, unknown> = editingRule ? parseRuleMetadata(editingRule) : {};
  const addons = serializeAddons(addonsState);
  if (addons.length === 0) {
    // No addons — strip the feature/addons keys so the saved metadata is not
    // mistakenly recognized as an addon rule (HasAddonMetadata would return true
    // for {"feature":"advanced_rules","addons":[]}).
    const { addons: _a, feature: _f, ...rest } = base as Record<string, unknown>;
    return rest;
  }
  return { ...base, addons, feature: 'advanced_rules' };
}

export default function RulesPage() {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const tAdv = useTranslations('advancedRulesFeature');
  const queryClient = useQueryClient();
  const { effectiveTenantId, isViewingAllTenants } = useTenant();
  const { apiRequest } = useApiRequest();
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [priority, setPriority] = useState(100);
  const [isActive, setIsActive] = useState(true);
  const [stage, setStage] = useState<StageType>('data');
  const [conditionTree, setConditionTree] = useState<RuleNode>(defaultTree);
  const [addonsState, setAddonsState] = useState<AddonsState>(emptyAddonsState);

  const initialFilterStage = (() => {
    const p = searchParams.get('stage') as StageType | null;
    return p && STAGES.some(s => s.value === p) ? p : 'all' as const;
  })();
  const [filterStage, setFilterStage] = useState<StageType | 'all'>(initialFilterStage);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['unified-rules', 'tag', effectiveTenantId],
    queryFn: () => getUnifiedRules({ rule_class: 'tag' }, apiRequest),
  });

  const { data: systemTags } = useQuery({
    queryKey: ['system-tags'],
    queryFn: () => getSystemTags(apiRequest),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUnifiedRule(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-rules', 'tag', effectiveTenantId] });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setTags([]);
    setCustomTagInput('');
    setPriority(100);
    setIsActive(true);
    setStage('data');
    setConditionTree(defaultTree);
    setAddonsState(emptyAddonsState());
  };

  const handleOpenDialog = (rule?: Rule) => {
    if (rule) {
      setEditingRule(rule);
      setName(rule.name);
      setDescription(rule.description || '');
      setTags(rule.tags || []);
      setCustomTagInput('');
      setPriority(rule.priority);
      setIsActive(rule.is_active);
      setStage(rule.stage as StageType);
      try {
        const parsed = typeof rule.condition_tree === 'string'
          ? JSON.parse(rule.condition_tree)
          : rule.condition_tree;
        setConditionTree(parsed);
      } catch {
        setConditionTree(defaultTree);
      }
      setAddonsState(parseAddons(parseRuleMetadata(rule)));
    } else {
      setEditingRule(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (tags.length === 0) {
        toast.error(t('tagRules.tags') + ' ' + t('common.required').toLowerCase());
        return;
      }

      // Client-side guard: forwardServer must not use an internal address.
      // AddonsPanel's forwardServer form writes the address under
      // `target_address` (see AddonsPanel.tsx's AddonParamsForm); tolerate a
      // legacy `server_address` key too so a rule saved by the pre-rewrite
      // addons editor still round-trips through this guard on edit.
      const forwardServer = addonsState.forwardServer;
      const forwardServerAddress =
        typeof forwardServer?.params.target_address === 'string' && forwardServer.params.target_address
          ? forwardServer.params.target_address
          : typeof forwardServer?.params.server_address === 'string'
            ? forwardServer.params.server_address
            : '';
      if (forwardServer?.enabled && forwardServerAddress) {
        if (isInternalIP(forwardServerAddress)) {
          toast.error(tAdv('addons.forwardServerErrorInternalAddress'));
          return;
        }
      }

      const body = {
        name,
        description,
        rule_class: 'tag' as const,
        stage,
        condition_tree: conditionTree,
        tags: tags,
        priority,
        is_active: isActive,
        metadata: buildTagMetadata(editingRule, addonsState),
      };

      const url = editingRule ? `/unified-rules/${editingRule.id}` : '/unified-rules';
      const method = editingRule ? 'PUT' : 'POST';
      await apiRequest<Rule>(url, { method, body });
      queryClient.invalidateQueries({ queryKey: ['unified-rules', 'tag', effectiveTenantId] });
      toast.success(t(editingRule ? 'common.updateSuccess' : 'common.createSuccess'));
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<Rule>[] = [
    { accessorKey: 'id', header: 'ID', size: 60 },
    ...(isViewingAllTenants ? [{
      id: 'tenant_name',
      header: t('common.tenant'),
      cell: ({ row }: { row: { original: Rule } }) => (
        <span>{row.original.tenant_name || row.original.tenant_id || '-'}</span>
      ),
    } as ColumnDef<Rule>] : []),
    {
      accessorKey: 'name',
      header: t('advancedRules.name'),
    },
    {
      id: 'stage',
      header: t('rules.stage'),
      cell: ({ row }) => <span className="text-sm">{row.original.stage}</span>,
    },
    {
      accessorKey: 'tags',
      header: t('tagRules.tags'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.tags || []).map((tag, i) => {
            const isSys = tag.startsWith('sys:');
            return (
              <Badge key={i} variant={isSys ? 'default' : 'secondary'} className="text-xs">
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            );
          })}
        </div>
      ),
    },
    { accessorKey: 'priority', header: t('rules.priority'), size: 80 },
    {
      accessorKey: 'is_active',
      header: t('rules.isActive'),
      cell: ({ row }) => <StatusBadge status={row.original.is_active ? t('common.enabled') : t('common.disabled')} variant={row.original.is_active ? 'success' : 'default'} />,
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.original.id)} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('tagRules.eyebrow')}
        title={t('tagRules.title')}
        description={t('tagRules.subtitle')}
        actions={
          <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('rules.createRule')}
          </Button>
        }
      />

      <PageSurface>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{t('rules.stage')}</span>
          <Select value={filterStage} onValueChange={(v) => setFilterStage(v as StageType | 'all')}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {STAGES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={(rules || []).filter(r => filterStage === 'all' || r.stage === filterStage)}
          />
        )}
      </PageSurface>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? t('rules.editRule') : t('rules.createRule')}</DialogTitle>
          </DialogHeader>
          {editingRule && (editingRule as Rule & { page?: string }).page === 'groups' && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p>{t('groups.warningOnTagPage')}</p>
                <Link href="/security/groups" className="mt-1 inline-block text-amber-700 underline dark:text-amber-300">
                  {t('groups.goToGroupManagement')}
                </Link>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('advancedRules.name')} *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('advancedRules.name')} />
            </div>

            <div className="space-y-2">
              <Label>{t('rules.stage')} *</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as StageType)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">{t('advancedRules.conditionTree')}</Label>
              <ConditionTreeBuilder
                value={conditionTree}
                onChange={setConditionTree}
                stage={stage}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('rules.priority')}</Label>
                <Input type="number" value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>{t('tagRules.tags')} *</Label>
                <div className="space-y-2">
                  {(systemTags || []).length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">{t('tagRules.systemTags')}</span>
                      <div className="flex flex-wrap gap-1">
                        {(systemTags || []).map((st: SystemTag) => {
                          const selected = tags.includes(st.key);
                          return (
                            <Badge
                              key={st.key}
                              variant={selected ? 'default' : 'outline'}
                              className="cursor-pointer text-xs select-none"
                              title={st.description}
                              onClick={() => {
                                setTags(selected
                                  ? tags.filter(t => t !== st.key)
                                  : [...tags, st.key]);
                              }}
                            >
                              {st.key}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{t('tagRules.customTags')}</span>
                    <div className="flex gap-1">
                      <Input
                        value={customTagInput}
                        onChange={e => setCustomTagInput(e.target.value)}
                        placeholder={t('tagRules.tagPlaceholder')}
                        className="flex-1 h-8 text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const v = customTagInput.trim();
                            if (v && !tags.includes(v)) {
                              setTags([...tags, v]);
                            }
                            setCustomTagInput('');
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => {
                          const v = customTagInput.trim();
                          if (v && !tags.includes(v)) {
                            setTags([...tags, v]);
                          }
                          setCustomTagInput('');
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag, i) => {
                        const isSys = tag.startsWith('sys:');
                        return (
                          <Badge
                            key={i}
                            variant={isSys ? 'default' : 'secondary'}
                            className="text-xs cursor-pointer group"
                            onClick={() => setTags(tags.filter((_, idx) => idx !== i))}
                          >
                            {tag}
                            <span className="ml-1 opacity-50 group-hover:opacity-100">&times;</span>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 col-span-2">
                <Label>{t('rules.description')}</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              </div>
            </div>

            {/* Addon editor — all 7 addon types + detailedLog (no primaryAction gate).
                showDetailedLog renders the "详细日志/Detailed Log" toggle that the
                pre-rewrite addons editor had on this page (the advanced-filter-rules
                disposition Tab keeps it off per D-7). */}
            <div className="border-t pt-4">
              <AddonsPanel
                value={addonsState}
                onChange={setAddonsState}
                showDetailedLog
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>{t('rules.isActive')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
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
    </PageShell>
  );
}
