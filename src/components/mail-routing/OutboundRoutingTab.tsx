'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, Power, PowerOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConditionTreeBuilder } from '@/components/rules/ConditionTreeBuilder';

import { useScopedApiRequest } from '@/lib/api/client';
import {
  getUnifiedRules,
  deleteUnifiedRule,
  toggleUnifiedRule,
} from '@/lib/api/unified-rules';
import { listActiveProxysvrGroups } from '@/lib/api/proxysvr';
import type { Rule, RuleNode } from '@/types/unified-rules';
import type { ProxysvrGroup } from '@/types/proxysvr';
import {
  defaultUserTree,
  stripIsOutbound,
  injectIsOutbound,
} from './outbound-condition';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE = 'mail_routing_outbound';

/** Fields allowed in the condition builder. is_outbound is shown but auto-set. */
const ALLOWED_FIELDS = ['is_outbound', 'client_ip', 'senderdomain', 'auth_user', 'recipient_domain', 'recipient'];

// IS_OUTBOUND_NODE / defaultUserTree / stripIsOutbound / injectIsOutbound live in
// ./outbound-condition so they can be unit-tested in isolation (review M3).

// ─── Zod schema ───────────────────────────────────────────────────────────────

const ruleFormSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().min(1).max(65535).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

type RuleFormValues = z.infer<typeof ruleFormSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

export interface OutboundRoutingTabProps {
  /** The tenant whose rules to manage. Sent as X-Tenant-ID by useScopedApiRequest(tenantId). */
  tenantId: number;
}

export function OutboundRoutingTab({ tenantId }: OutboundRoutingTabProps) {
  const t = useTranslations('mailRouting');
  const tRouteRules = useTranslations('routeRules');
  const tRules = useTranslations('rules');
  const tAdvanced = useTranslations('advancedRules');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const { apiRequest } = useScopedApiRequest(tenantId);

  // Dialog + editor state.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Condition tree managed separately (contains user-editable conditions;
  // is_outbound is injected automatically on submit).
  const [userTree, setUserTree] = useState<RuleNode>(defaultUserTree());

  // Channel state mirrors RouteRulesPage pattern.
  const [channel, setChannel] = useState<'smtp' | 'proxysvr'>('smtp');
  const [nextHopType, setNextHopType] = useState<'ip' | 'domain'>('domain');
  const [nextHopHost, setNextHopHost] = useState('');
  const [nextHopPort, setNextHopPort] = useState(25);
  const [proxysvrGroupId, setProxysvrGroupId] = useState<number | null>(null);

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: { name: '', priority: 100, description: '', is_active: true },
  });

  // ─── Query key includes tenantId so the list re-fetches on tenant switch.
  const queryKey = ['unified-rules', PAGE, tenantId];

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey,
    queryFn: () => getUnifiedRules({ rule_class: 'route', stage: 'data', page: PAGE }, apiRequest),
  });

  const { data: activeGroups = [] } = useQuery<ProxysvrGroup[]>({
    queryKey: ['proxysvr-groups', 'active'],
    queryFn: () => listActiveProxysvrGroups(apiRequest),
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUnifiedRule(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(tCommon('deleteSuccess'));
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      toggleUnifiedRule(id, isActive, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(tCommon('updateSuccess'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Dialog helpers ───────────────────────────────────────────────────────

  function openCreate() {
    setEditingRule(null);
    setUserTree(defaultUserTree());
    setChannel('smtp');
    setNextHopType('domain');
    setNextHopHost('');
    setNextHopPort(25);
    setProxysvrGroupId(null);
    form.reset({ name: '', priority: 100, description: '', is_active: true });
    setDialogOpen(true);
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    // Parse and strip is_outbound from stored tree; user only sees other conditions.
    let tree = defaultUserTree();
    try {
      const parsed: RuleNode = typeof rule.condition_tree === 'string'
        ? JSON.parse(rule.condition_tree)
        : rule.condition_tree;
      tree = stripIsOutbound(parsed);
    } catch { /* use default */ }
    setUserTree(tree);

    // Parse metadata.
    let ch: 'smtp' | 'proxysvr' = 'smtp';
    let hopType: 'ip' | 'domain' = 'domain';
    let hopHost = '';
    let hopPort = 25;
    let grpId: number | null = null;
    try {
      const meta = typeof rule.metadata === 'string'
        ? JSON.parse(rule.metadata)
        : rule.metadata;
      if (meta?.channel === 'proxysvr') {
        ch = 'proxysvr';
        grpId = typeof meta.proxysvr_group_id === 'number' ? meta.proxysvr_group_id : null;
      } else {
        hopType = (meta?.next_hop_type as 'ip' | 'domain') ?? 'domain';
        hopHost = meta?.next_hop_host ?? '';
        hopPort = meta?.next_hop_port ?? 25;
      }
    } catch { /* use defaults */ }
    setChannel(ch);
    setNextHopType(hopType);
    setNextHopHost(hopHost);
    setNextHopPort(hopPort);
    setProxysvrGroupId(grpId);
    form.reset({
      name: rule.name,
      priority: rule.priority,
      description: rule.description ?? '',
      is_active: rule.is_active,
    });
    setDialogOpen(true);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    form.handleSubmit(async (data) => {
      if (channel === 'smtp' && !nextHopHost.trim()) {
        toast.error(tRouteRules('nextHopHostRequired'));
        return;
      }
      if (channel === 'proxysvr' && !proxysvrGroupId) {
        toast.error(tRouteRules('proxysvrGroupRequired'));
        return;
      }
      setIsSubmitting(true);
      try {
        const metadata =
          channel === 'proxysvr'
            ? { channel: 'proxysvr', proxysvr_group_id: proxysvrGroupId }
            : { channel: 'smtp', next_hop_type: nextHopType, next_hop_host: nextHopHost.trim(), next_hop_port: nextHopPort };

        const body = {
          ...data,
          rule_class: 'route',
          stage: 'data',
          page: PAGE,
          condition_tree: injectIsOutbound(userTree),
          metadata,
        };
        const url = editingRule ? `/unified-rules/${editingRule.id}` : '/unified-rules';
        await apiRequest(url, { method: editingRule ? 'PUT' : 'POST', body });
        queryClient.invalidateQueries({ queryKey });
        toast.success(tCommon(editingRule ? 'updateSuccess' : 'createSuccess'));
        setDialogOpen(false);
      } catch (e) {
        // Surface the real backend message (e.g. 400 missing tenant context,
        // 409 conflict, validation) instead of a generic toast, consistent with
        // the relay/auth/receiving tabs (review minor).
        toast.error(e instanceof Error ? e.message : t('outbound.saveError'));
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  // ─── Table columns ────────────────────────────────────────────────────────

  function parseNextHop(rule: Rule) {
    try {
      const meta = typeof rule.metadata === 'string' ? JSON.parse(rule.metadata) : rule.metadata;
      if (meta?.channel === 'proxysvr') {
        const g = activeGroups.find((x) => x.id === meta.proxysvr_group_id);
        return `${tRouteRules('channelProxysvr')}: ${g?.name ?? `#${meta.proxysvr_group_id ?? '-'}`}`;
      }
      return `${meta?.next_hop_host ?? '-'}:${meta?.next_hop_port ?? 25}`;
    } catch {
      return '-';
    }
  }

  const columns: ColumnDef<Rule>[] = [
    { accessorKey: 'id', header: 'ID', size: 60 },
    { accessorKey: 'name', header: tAdvanced('name') },
    { accessorKey: 'priority', header: tRules('priority'), size: 80 },
    {
      id: 'next_hop',
      header: tRouteRules('nextHop'),
      cell: ({ row }) => <span className="font-mono text-sm">{parseNextHop(row.original)}</span>,
    },
    {
      accessorKey: 'is_active',
      header: tRules('isActive'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.is_active ? tCommon('enabled') : tCommon('disabled')}
          variant={row.original.is_active ? 'success' : 'default'}
        />
      ),
    },
    { accessorKey: 'updated_at', header: tRules('updatedAt'), size: 160 },
    {
      id: 'actions',
      header: tCommon('actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost" size="icon"
            onClick={() => toggleMutation.mutate({ id: row.original.id, isActive: !row.original.is_active })}
            title={row.original.is_active ? tCommon('disabled') : tCommon('enabled')}
          >
            {row.original.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(row.original.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-prose">{t('outbound.description')}</p>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          {t('outbound.createRule')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{t('outbound.empty')}</p>
      ) : (
        <DataTable columns={columns} data={rules} />
      )}

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? t('outbound.editRule') : t('outbound.createRule')}</DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>{tAdvanced('name')} *</Label>
              <Input {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-destructive text-xs">{t('outbound.nameRequired')}</p>
              )}
            </div>

            {/* Fixed is_outbound notice */}
            <div className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground">
              {t('outbound.isOutboundFixed')}
            </div>

            {/* Condition tree (user-editable, excluding is_outbound) */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">{tAdvanced('conditionTree')}</Label>
              <ConditionTreeBuilder
                value={userTree}
                onChange={setUserTree}
                stage="data"
                allowedFields={ALLOWED_FIELDS}
              />
            </div>

            {/* Channel config */}
            <div className="space-y-3 rounded-md border p-4">
              <Label className="text-base font-semibold">{t('outbound.channelSection')}</Label>
              <div className="space-y-2">
                <Label>{tRouteRules('channel')} *</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as 'smtp' | 'proxysvr')}>
                  <SelectTrigger>
                    <SelectValue>
                      {{ smtp: tRouteRules('channelSmtp'), proxysvr: tRouteRules('channelProxysvr') }[channel]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smtp">{tRouteRules('channelSmtp')}</SelectItem>
                    <SelectItem value="proxysvr">{tRouteRules('channelProxysvr')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {channel === 'smtp' && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{tRouteRules('hopType')} *</Label>
                    <Select value={nextHopType} onValueChange={(v) => setNextHopType(v as 'ip' | 'domain')}>
                      <SelectTrigger>
                        <SelectValue>{{ domain: tRouteRules('domainType'), ip: tRouteRules('ipType') }[nextHopType]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="domain">{tRouteRules('domainType')}</SelectItem>
                        <SelectItem value="ip">{tRouteRules('ipType')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{tRouteRules('nextHopHost')} *</Label>
                    <Input
                      value={nextHopHost}
                      onChange={(e) => setNextHopHost(e.target.value)}
                      placeholder={nextHopType === 'domain' ? 'mail.example.com' : '192.168.1.1'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{tRouteRules('nextHopPort')}</Label>
                    <Input
                      type="number" min={1} max={65535}
                      value={nextHopPort}
                      onChange={(e) => setNextHopPort(Number(e.target.value) || 25)}
                    />
                  </div>
                </div>
              )}

              {channel === 'proxysvr' && (
                <div className="space-y-2">
                  <Label>{tRouteRules('proxysvrGroup')} *</Label>
                  <Select
                    value={proxysvrGroupId ? String(proxysvrGroupId) : undefined}
                    onValueChange={(v) => setProxysvrGroupId(v ? Number(v) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tRouteRules('proxysvrGroupPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeGroups.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          {tRouteRules('noActiveProxysvrGroups')}
                        </SelectItem>
                      ) : (
                        activeGroups.map((g) => (
                          <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Priority + description */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tRules('priority')}</Label>
                <Input type="number" {...form.register('priority', { valueAsNumber: true })} />
                <p className="text-xs text-muted-foreground">{t('outbound.priorityHint')}</p>
              </div>
              <div className="space-y-2">
                <Label>{tRules('description')}</Label>
                <Textarea {...form.register('description')} />
              </div>
            </div>

            {/* is_active toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                checked={form.watch('is_active') ?? true}
                onCheckedChange={(v) => form.setValue('is_active', v)}
              />
              <Label>{tRules('isActive')}</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={tRules('deleteRule')}
        description={tCommon('confirmDelete')}
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
        variant="destructive"
      />
    </div>
  );
}
