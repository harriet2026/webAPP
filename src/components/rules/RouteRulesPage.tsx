'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, Power, PowerOff } from 'lucide-react';
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
import type { Rule, RuleNode, RuleMetadata } from '@/types/unified-rules';
import { listActiveProxysvrGroups } from '@/lib/api/proxysvr';
import type { ProxysvrGroup } from '@/types/proxysvr';
import { useState, useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { ConditionTreeBuilder } from './ConditionTreeBuilder';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { RuleImportExportDialog } from './RuleImportExportDialog';

const routeRuleSchema = z.object({
  name: z.string().min(1, 'nameRequired'),
  priority: z.number().min(1).max(65535).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

type RouteRuleForm = z.infer<typeof routeRuleSchema>;

const defaultTree: RuleNode = {
  type: 'AND',
  children: [{ type: 'condition', field: 'sender', operator: 'contain', value: '' }],
};

export function RouteRulesPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { effectiveTenantId, isSystemAdmin, isViewingAllTenants } = useTenant();
  const { apiRequest } = useApiRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [conditionTree, setConditionTree] = useState<RuleNode>(defaultTree);
  const [nextHopType, setNextHopType] = useState<'ip' | 'domain'>('domain');
  const [nextHopHost, setNextHopHost] = useState('');
  const [nextHopPort, setNextHopPort] = useState(25);
  const [channel, setChannel] = useState<'smtp' | 'proxysvr'>('smtp');
  const [proxysvrGroupId, setProxysvrGroupId] = useState<number | null>(null);

  const queryKey = ['unified-rules', 'route', 'data', effectiveTenantId];

  const { data: rules, isLoading } = useQuery({
    queryKey,
    queryFn: () => getUnifiedRules({ rule_class: 'route', stage: 'data' }, apiRequest),
  });

  const { data: activeGroups = [] } = useQuery<ProxysvrGroup[]>({
    queryKey: ['proxysvr-groups', 'active'],
    queryFn: () => listActiveProxysvrGroups(apiRequest),
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
      toast.error(error.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => toggleUnifiedRule(id, isActive, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.updateSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const form = useForm<RouteRuleForm>({
    resolver: zodResolver(routeRuleSchema),
    defaultValues: { name: '', priority: 100, is_active: true },
  });

  const handleOpenDialog = (rule?: Rule) => {
    if (rule) {
      setEditingRule(rule);
      let parsedTree: RuleNode = defaultTree;
      try {
        parsedTree = typeof rule.condition_tree === 'string'
          ? JSON.parse(rule.condition_tree)
          : rule.condition_tree;
      } catch {
        // use default
      }
      setConditionTree(parsedTree);
      let parsedHopType: 'ip' | 'domain' = 'domain';
      let parsedHopHost = '';
      let parsedHopPort = 25;
      let parsedChannel: 'smtp' | 'proxysvr' = 'smtp';
      let parsedGroupId: number | null = null;
      if (rule.metadata) {
        try {
          const meta: RuleMetadata = typeof rule.metadata === 'string'
            ? JSON.parse(rule.metadata)
            : rule.metadata;
          if (meta.next_hop_type) parsedHopType = meta.next_hop_type as 'ip' | 'domain';
          if (meta.next_hop_host) parsedHopHost = meta.next_hop_host;
          if (meta.next_hop_port) parsedHopPort = meta.next_hop_port;
          if (meta.channel === 'proxysvr') {
            parsedChannel = 'proxysvr';
            parsedGroupId = typeof meta.proxysvr_group_id === 'number' ? meta.proxysvr_group_id : null;
          }
        } catch {
          // use defaults
        }
      }
      setNextHopType(parsedHopType);
      setNextHopHost(parsedHopHost);
      setNextHopPort(parsedHopPort);
      setChannel(parsedChannel);
      setProxysvrGroupId(parsedGroupId);
      form.reset({
        name: rule.name,
        priority: rule.priority,
        description: rule.description || '',
        is_active: rule.is_active,
      });
    } else {
      setEditingRule(null);
      setConditionTree(defaultTree);
      setNextHopType('domain');
      setNextHopHost('');
      setNextHopPort(25);
      setChannel('smtp');
      setProxysvrGroupId(null);
      form.reset({ name: '', priority: 100, is_active: true });
    }
    setDialogOpen(true);
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.getValues();
    if (Number.isNaN(values.priority)) form.setValue('priority', undefined as unknown as number);
    form.handleSubmit(
      async (data) => {
        if (channel === 'smtp' && !nextHopHost.trim()) {
          toast.error(t('routeRules.nextHopHostRequired'));
          return;
        }
        if (channel === 'proxysvr' && !proxysvrGroupId) {
          toast.error(t('routeRules.proxysvrGroupRequired'));
          return;
        }
        setIsSubmitting(true);
        try {
          const metadata: Record<string, unknown> =
            channel === 'proxysvr'
              ? { channel: 'proxysvr', proxysvr_group_id: proxysvrGroupId }
              : {
                  channel: 'smtp',
                  next_hop_type: nextHopType,
                  next_hop_host: nextHopHost.trim(),
                  next_hop_port: nextHopPort,
                };
          const body: Record<string, unknown> = {
            ...data,
            rule_class: 'route',
            stage: 'data',
            condition_tree: conditionTree,
            metadata,
          };
          const url = editingRule ? `/unified-rules/${editingRule.id}` : '/unified-rules';
          await apiRequest(url, {
            method: editingRule ? 'PUT' : 'POST',
            body,
          });
          queryClient.invalidateQueries({ queryKey });
          toast.success(t(editingRule ? 'common.updateSuccess' : 'common.createSuccess'));
          setDialogOpen(false);
        } catch {
          toast.error(t('common.error'));
        } finally {
          setIsSubmitting(false);
        }
      },
      () => {}
    )();
  };

  const parseMetadata = (rule: Rule): {
    channel: 'smtp' | 'proxysvr';
    type: string;
    host: string;
    port: number;
    groupId: number | null;
  } => {
    try {
      const meta: RuleMetadata = typeof rule.metadata === 'string'
        ? JSON.parse(rule.metadata)
        : rule.metadata;
      return {
        channel: meta.channel === 'proxysvr' ? 'proxysvr' : 'smtp',
        type: meta.next_hop_type || '-',
        host: meta.next_hop_host || '-',
        port: meta.next_hop_port || 25,
        groupId: typeof meta.proxysvr_group_id === 'number' ? meta.proxysvr_group_id : null,
      };
    } catch {
      return { channel: 'smtp', type: '-', host: '-', port: 25, groupId: null };
    }
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
    { accessorKey: 'name', header: t('advancedRules.name') },
    { accessorKey: 'priority', header: t('rules.priority'), size: 80 },
    {
      id: 'next_hop',
      header: t('routeRules.nextHop'),
      cell: ({ row }) => {
        const meta = parseMetadata(row.original);
        if (meta.channel === 'proxysvr') {
          const g = activeGroups.find((x) => x.id === meta.groupId);
          return (
            <span className="text-sm">
              {t('routeRules.channelProxysvr')}: {g?.name ?? `#${meta.groupId ?? '-'}`}
            </span>
          );
        }
        return (
          <span className="font-mono text-sm">
            {meta.host}:{meta.port}
          </span>
        );
      },
    },
    {
      id: 'hop_type',
      header: t('routeRules.hopType'),
      cell: ({ row }) => {
        const meta = parseMetadata(row.original);
        if (meta.channel === 'proxysvr') {
          return <StatusBadge status={t('routeRules.channelProxysvr')} variant="info" />;
        }
        return <StatusBadge status={meta.type} variant={meta.type === 'ip' ? 'info' : 'success'} />;
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
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleMutation.mutate({ id: row.original.id, isActive: !row.original.is_active })}
            title={row.original.is_active ? t('common.disabled') : t('common.enabled')}
          >
            {row.original.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          </Button>
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
        eyebrow={t('ruleImportExport.routeEyebrow')}
        title={t('sidebar.routeRules')}
        description={t('ruleImportExport.routePageDescription')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportExportOpen(true)}>
              {t('ruleImportExport.trigger')}
            </Button>
            <Button onClick={() => handleOpenDialog()}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? t('rules.editRule') : t('rules.createRule')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('advancedRules.name')} *</Label>
              <Input {...form.register('name')} />
            </div>

            <div className="space-y-2">
              <Label className="text-base font-semibold">{t('advancedRules.conditionTree')}</Label>
              <ConditionTreeBuilder
                value={conditionTree}
                onChange={setConditionTree}
                stage="data"
              />
            </div>

            <div className="space-y-3 rounded-md border p-4">
              <Label className="text-base font-semibold">{t('routeRules.routeConfig')}</Label>
              <div className="space-y-2">
                <Label>{t('routeRules.channel')} *</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as 'smtp' | 'proxysvr')}>
                  <SelectTrigger data-testid="route-channel-select">
                    <SelectValue>
                      {{ smtp: t('routeRules.channelSmtp'), proxysvr: t('routeRules.channelProxysvr') }[channel]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smtp">{t('routeRules.channelSmtp')}</SelectItem>
                    <SelectItem value="proxysvr">{t('routeRules.channelProxysvr')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {channel === 'smtp' && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('routeRules.hopType')} *</Label>
                    <Select value={nextHopType} onValueChange={(v) => setNextHopType(v as 'ip' | 'domain')}>
                      <SelectTrigger><SelectValue>{{ domain: t('routeRules.domainType'), ip: t('routeRules.ipType') }[nextHopType]}</SelectValue></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="domain">{t('routeRules.domainType')}</SelectItem>
                        <SelectItem value="ip">{t('routeRules.ipType')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('routeRules.nextHopHost')} *</Label>
                    <Input
                      value={nextHopHost}
                      onChange={(e) => setNextHopHost(e.target.value)}
                      placeholder={nextHopType === 'domain' ? 'mail.example.com' : '192.168.1.1'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('routeRules.nextHopPort')}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={65535}
                      value={nextHopPort}
                      onChange={(e) => setNextHopPort(Number(e.target.value) || 25)}
                      className="w-24"
                    />
                  </div>
                </div>
              )}

              {channel === 'proxysvr' && (
                <div className="space-y-2">
                  <Label>{t('routeRules.proxysvrGroup')} *</Label>
                  <Select
                    value={proxysvrGroupId ? String(proxysvrGroupId) : null}
                    onValueChange={(v) => setProxysvrGroupId(v ? Number(v) : null)}
                  >
                    <SelectTrigger data-testid="route-proxysvr-group-select">
                      <SelectValue placeholder={t('routeRules.proxysvrGroupPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeGroups.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          {t('routeRules.noActiveProxysvrGroups')}
                        </SelectItem>
                      ) : (
                        activeGroups.map((g) => (
                          <SelectItem key={g.id} value={String(g.id)}>
                            {g.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('rules.priority')}</Label>
                <Input type="number" {...form.register('priority', { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>{t('rules.description')}</Label>
                <Textarea {...form.register('description')} />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch checked={form.watch('is_active')} onCheckedChange={(v) => form.setValue('is_active', v)} />
              <Label>{t('rules.isActive')}</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
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
