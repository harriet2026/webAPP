'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, ArrowLeft, Globe, ChevronDown, ChevronRight, Zap, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getTenant,
  getTenantDomains,
  createTenantDomain,
  updateTenantDomain,
  deleteTenantDomain,
  testEwsConnection,
  bulkSetMailSystemType,
} from '@/lib/api/tenants';
import type { TenantDomain, CreateTenantDomainRequest, UpdateTenantDomainRequest } from '@/types/tenant';
import { MAIL_SYSTEM_TYPE_LABELS, type MailSystemType, type ExchangeConfig } from '@/types/tenant-domain';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/use-permission';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { AccessDeniedPanel, LoadingPanel } from '@/components/shared/state-panel';
import { listDkimKeys, type DkimKey } from '@/lib/api/dkim';
import { DkimManageDrawer } from '@/components/dkim/dkim-manage-drawer';
import { DkimStatusBadge } from '@/components/dkim/dkim-status-badge';
import { DomainVerifyStatus } from '@/components/tenants/domain-verify-status';
import { useProductForm } from '@/contexts/product-form-context';

const domainSchema = z.object({
  domain: z.string().min(1, 'domainRequired'),
  // next_hop_* are serialized with `omitempty` on the backend (TenantDomain): a
  // verified-but-not-yet-routed domain returns them absent. If they carried a
  // .min(1) "required" rule, form.reset of such a domain (which falls back to
  // ''/25 below) would fail validation and silently block the whole form's Save
  // (GT-12056). Keep them present-but-allowed-empty; the port range is still
  // enforced whenever a value is entered.
  next_hop_type: z.string(),
  next_hop_host: z.string(),
  next_hop_port: z.number().min(1, 'portRange').max(65535, 'portRange'),
  is_active: z.boolean().optional(),
  mail_system_type: z.string().optional(),
});

type DomainForm = z.infer<typeof domainSchema>;

const DEFAULT_EXCHANGE_CONFIG: ExchangeConfig = {
  ews_endpoint: '',
  admin_email: '',
  admin_password: '',
  auth_type: 'ntlm',
  ssl_verify: true,
  max_search_days: 30,
  timeout_seconds: 30,
  max_retries: 3,
};

// Backend masks the stored admin_password with this sentinel on read paths and
// treats it as "keep existing" on write paths (see api/tenant_domain_actions.go).
const KEEP_PASSWORD_SENTINEL = '__OSG_KEEP_PASSWORD__';

export default function TenantDomainsPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canManageTenants } = usePermission();
  const { capabilities } = useProductForm();
  const isSaas = !!capabilities?.saas;

  const tenantId = Number(params.id);
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<TenantDomain | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTypeOpen, setBulkTypeOpen] = useState(false);
  const [bulkMailSystemType, setBulkMailSystemType] = useState<MailSystemType>('standard_smtp');
  const [hadStoredPassword, setHadStoredPassword] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [exchangeConfig, setExchangeConfig] = useState<ExchangeConfig>({ ...DEFAULT_EXCHANGE_CONFIG });
  const [ewsExpanded, setEwsExpanded] = useState(false);
  const [testingEws, setTestingEws] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId),
    enabled: !!tenantId,
  });

  const { data: domains, isLoading } = useQuery({
    queryKey: ['tenant-domains', tenantId],
    queryFn: () => getTenantDomains(tenantId),
    enabled: !!tenantId,
  });

  const [dkimDomain, setDkimDomain] = useState<string | null>(() => searchParams.get('dkim'));

  useEffect(() => {
    const d = searchParams.get('dkim');
    if (d) setDkimDomain(d);
  }, [searchParams]);

  // Fetch all DKIM keys for the tenant once, then build a per-domain active-key map
  // so the table column can render the active selector + DNS status inline.
  const { data: dkimKeys } = useQuery({
    queryKey: ['dkim-keys', tenantId, dkimDomain],
    queryFn: () => listDkimKeys({ tenant_id: tenantId, page: 1, page_size: 100 }),
    enabled: !!tenantId,
  });

  const activeKeyByDomain = useMemo(() => {
    const map: Record<string, DkimKey> = {};
    for (const k of dkimKeys?.items ?? []) {
      if (k.is_active) map[k.domain] = k;
    }
    return map;
  }, [dkimKeys]);

  const hasKeyByDomain = useMemo(() => {
    const set = new Set<string>();
    for (const k of dkimKeys?.items ?? []) set.add(k.domain);
    return set;
  }, [dkimKeys]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTenantDomain(id, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-domains', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const form = useForm<DomainForm>({
    resolver: zodResolver(domainSchema),
    defaultValues: {
      domain: '',
      next_hop_type: 'domain',
      next_hop_host: '',
      next_hop_port: 25,
      is_active: true,
      mail_system_type: 'standard_smtp',
    },
  });

  const watchMailSystemType = form.watch('mail_system_type');

  const handleOpenDialog = (domain?: TenantDomain) => {
    if (domain) {
      setEditingDomain(domain);
      form.reset({
        domain: domain.domain,
        next_hop_type: domain.next_hop_type ?? 'domain',
        next_hop_host: domain.next_hop_host ?? '',
        next_hop_port: domain.next_hop_port ?? 25,
        is_active: domain.is_active,
        mail_system_type: domain.mail_system_type || 'standard_smtp',
      });
      const cfg = (domain.mail_system_config as unknown as ExchangeConfig) || {
        ...DEFAULT_EXCHANGE_CONFIG,
      };
      // Show an empty password field for the masked sentinel; the password is
      // preserved on submit unless the admin types a new one.
      const stored = cfg.admin_password === KEEP_PASSWORD_SENTINEL;
      setHadStoredPassword(stored);
      if (stored) {
        cfg.admin_password = '';
      }
      setExchangeConfig(cfg);
      setEwsExpanded((domain.mail_system_type || 'standard_smtp') === 'exchange');
    } else {
      setEditingDomain(null);
      setHadStoredPassword(false);
      form.reset({
        domain: '',
        next_hop_type: 'domain',
        next_hop_host: '',
        next_hop_port: 25,
        is_active: true,
        mail_system_type: 'standard_smtp',
      });
      setExchangeConfig({ ...DEFAULT_EXCHANGE_CONFIG });
      setEwsExpanded(false);
    }
    setDialogOpen(true);
  };

  const handleTestEws = async () => {
    if (!exchangeConfig.admin_password) {
      toast.error('请输入管理员密码后再测试连接');
      return;
    }
    setTestingEws(true);
    try {
      const result = await testEwsConnection(exchangeConfig as unknown as Record<string, unknown>, tenantId);
      if (result.success) {
        toast.success('EWS 连接测试成功');
      } else {
        toast.error(`EWS 连接失败: ${result.message}`);
      }
    } catch {
      toast.error('EWS 连接测试失败');
    } finally {
      setTestingEws(false);
    }
  };

  const handleSubmit = async (data: DomainForm) => {
    setIsSubmitting(true);
    try {
      const mailSystemType = data.mail_system_type || 'standard_smtp';
      const mailSystemConfig: ExchangeConfig | null =
        mailSystemType === 'exchange' ? { ...exchangeConfig } : null;
      // Left blank while editing a domain that already had a password → tell the
      // backend to keep the stored one instead of clearing it.
      if (mailSystemConfig && editingDomain && hadStoredPassword && !mailSystemConfig.admin_password) {
        mailSystemConfig.admin_password = KEEP_PASSWORD_SENTINEL;
      }

      if (editingDomain) {
        const updateData: UpdateTenantDomainRequest = {
          domain: data.domain,
          next_hop_type: data.next_hop_type,
          next_hop_host: data.next_hop_host,
          next_hop_port: data.next_hop_port,
          is_active: data.is_active,
          mail_system_type: mailSystemType,
          mail_system_config: mailSystemConfig as Record<string, unknown> | null,
        };
        await updateTenantDomain(editingDomain.id, updateData, tenantId);
        toast.success(t('common.updateSuccess'));
      } else {
        const createData: CreateTenantDomainRequest = {
          domain: data.domain,
          next_hop_type: data.next_hop_type,
          next_hop_host: data.next_hop_host,
          next_hop_port: data.next_hop_port,
          tenant_id: tenantId,
          mail_system_type: mailSystemType,
          mail_system_config: mailSystemConfig as Record<string, unknown> | null,
        };
        await createTenantDomain(tenantId, createData);
        toast.success(t('common.createSuccess'));
      }
      queryClient.invalidateQueries({ queryKey: ['tenant-domains', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setDialogOpen(false);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!domains) return;
    if (selectedIds.size === domains.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(domains.map((d) => d.id)));
    }
  }, [domains, selectedIds]);

  const handleBulkSetType = async () => {
    setBulkSubmitting(true);
    try {
      await bulkSetMailSystemType({
        domain_ids: Array.from(selectedIds),
        mail_system_type: bulkMailSystemType,
      }, tenantId);
      toast.success(`已更新 ${selectedIds.size} 个域名的邮件系统类型`);
      setSelectedIds(new Set());
      setBulkTypeOpen(false);
      queryClient.invalidateQueries({ queryKey: ['tenant-domains', tenantId] });
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBulkSubmitting(false);
    }
  };

  const columns: ColumnDef<TenantDomain>[] = useMemo(() => [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={domains && domains.length > 0 && selectedIds.size === domains.length}
          onCheckedChange={toggleAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelect(row.original.id)}
          aria-label={`Select domain ${row.original.id}`}
        />
      ),
      size: 40,
    },
    { accessorKey: 'id', header: 'ID', size: 60 },
    {
      accessorKey: 'domain',
      header: t('tenants.domain'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          {row.original.domain}
        </div>
      ),
    },
    {
      accessorKey: 'next_hop_type',
      header: t('tenants.nextHopType'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.next_hop_type === 'ip' ? 'IP' : t('tenants.nextHopTypeDomain')}
          variant={row.original.next_hop_type === 'ip' ? 'default' : 'success'}
        />
      ),
    },
    { accessorKey: 'next_hop_host', header: t('tenants.nextHopHost') },
    { accessorKey: 'next_hop_port', header: t('tenants.nextHopPort'), size: 80 },
    {
      accessorKey: 'mail_system_type',
      header: '邮件系统',
      cell: ({ row }) => {
        const mst = (row.original.mail_system_type || 'standard_smtp') as MailSystemType;
        return (
          <Badge variant={mst === 'exchange' ? 'default' : mst === 'coremail' ? 'secondary' : 'outline'}>
            {MAIL_SYSTEM_TYPE_LABELS[mst]}
          </Badge>
        );
      },
    },
    ...(isSaas
      ? [
          {
            id: 'verify',
            header: t('tenants.verify.column'),
            cell: ({ row }: { row: { original: TenantDomain } }) => (
              <DomainVerifyStatus tenantId={tenantId} domain={row.original} />
            ),
          } as ColumnDef<TenantDomain>,
        ]
      : []),
    {
      accessorKey: 'is_active',
      header: t('common.status'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.is_active ? t('common.enabled') : t('common.disabled')}
          variant={row.original.is_active ? 'success' : 'default'}
        />
      ),
    },
    {
      id: 'dkim',
      header: t('dkim.column'),
      cell: ({ row }) => {
        const active = activeKeyByDomain[row.original.domain];
        if (active) {
          return (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs">{active.selector}</span>
              <DkimStatusBadge status={active.dns_status} />
            </div>
          );
        }
        if (hasKeyByDomain.has(row.original.domain)) {
          return <span className="text-xs text-muted-foreground">{t('dkim.noActive')}</span>;
        }
        return <span className="text-xs text-muted-foreground">{t('dkim.none')}</span>;
      },
    },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDkimDomain(row.original.domain)}
            title={t('dkim.manage')}
          >
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteId(row.original.id)}
            className="text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [domains, selectedIds, toggleAll, toggleSelect, t, activeKeyByDomain, hasKeyByDomain, isSaas, tenantId]);

  if (!canManageTenants) {
    return <AccessDeniedPanel description={t('common.accessDenied')} />;
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={t('tenants.domainsEyebrow')}
        title={t('tenants.domainManagement')}
        description={tenant ? tenant.name : t('tenants.title')}
        actions={<div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('./..')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="outline" onClick={() => setBulkTypeOpen(true)}>
              <Zap className="h-4 w-4 mr-2" />
              批量设置类型 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('tenants.addDomain')}
          </Button>
        </div>}
      />

      {isLoading ? (
        <LoadingPanel />
      ) : (
        <PageSurface>
          <DataTable columns={columns} data={domains || []} />
        </PageSurface>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-[28px] border-border/70 shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingDomain ? t('tenants.editDomain') : t('tenants.addDomain')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('tenants.domain')} *</Label>
              <Input
                {...form.register('domain')}
                placeholder="example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('tenants.nextHopType')} *</Label>
              <Select value={form.watch('next_hop_type')} onValueChange={(v) => form.setValue('next_hop_type', v as 'domain' | 'ip')}>
                <SelectTrigger className="w-full">
                  <SelectValue>{{ domain: t('tenants.nextHopTypeDomain'), ip: t('tenants.nextHopTypeIp') }[form.watch('next_hop_type')]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="domain">{t('tenants.nextHopTypeDomain')}</SelectItem>
                  <SelectItem value="ip">{t('tenants.nextHopTypeIp')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>{t('tenants.nextHopHost')} *</Label>
                <Input
                  {...form.register('next_hop_host')}
                  placeholder={form.watch('next_hop_type') === 'ip' ? '192.168.1.1' : 'smtp.internal'}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('tenants.nextHopPort')} *</Label>
                <Input
                  type="number"
                  {...form.register('next_hop_port', { valueAsNumber: true })}
                  placeholder="25"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>邮件系统类型</Label>
              <Select
                value={watchMailSystemType || 'standard_smtp'}
                onValueChange={(v) => {
                  form.setValue('mail_system_type', v ?? undefined);
                  if (v === 'exchange') setEwsExpanded(true);
                  else setEwsExpanded(false);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard_smtp">标准 SMTP</SelectItem>
                  <SelectItem value="coremail">Coremail</SelectItem>
                  <SelectItem value="exchange">Exchange</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {watchMailSystemType === 'exchange' && (
              <Collapsible open={ewsExpanded} onOpenChange={setEwsExpanded}>
                <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border p-3 text-sm font-medium hover:bg-muted/50">
                  {ewsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  EWS 连接参数
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 space-y-3 rounded-lg border p-4">
                    <div className="space-y-2">
                      <Label>EWS Endpoint</Label>
                      <Input
                        value={exchangeConfig.ews_endpoint}
                        onChange={(e) => setExchangeConfig((prev) => ({ ...prev, ews_endpoint: e.target.value }))}
                        placeholder="https://exchange.example.com/EWS/Exchange.asmx"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>管理员邮箱</Label>
                      <Input
                        value={exchangeConfig.admin_email}
                        onChange={(e) => setExchangeConfig((prev) => ({ ...prev, admin_email: e.target.value }))}
                        placeholder="admin@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>管理员密码</Label>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          value={exchangeConfig.admin_password}
                          onChange={(e) => setExchangeConfig((prev) => ({ ...prev, admin_password: e.target.value }))}
                          placeholder="••••••••"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleTestEws}
                          disabled={testingEws}
                        >
                          {testingEws ? <Loader2 className="h-4 w-4 animate-spin" /> : '测试连接'}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>认证方式</Label>
                      <Select
                        value={exchangeConfig.auth_type}
                        onValueChange={(v) => setExchangeConfig((prev) => ({ ...prev, auth_type: v as ExchangeConfig['auth_type'] }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ntlm">NTLM</SelectItem>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="oauth2">OAuth2</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={exchangeConfig.ssl_verify}
                        onCheckedChange={(v) => setExchangeConfig((prev) => ({ ...prev, ssl_verify: v }))}
                      />
                      <Label>SSL 验证</Label>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>最大搜索天数</Label>
                        <Input
                          type="number"
                          value={exchangeConfig.max_search_days}
                          onChange={(e) => setExchangeConfig((prev) => ({ ...prev, max_search_days: parseInt(e.target.value) || 30 }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>超时(秒)</Label>
                        <Input
                          type="number"
                          value={exchangeConfig.timeout_seconds}
                          onChange={(e) => setExchangeConfig((prev) => ({ ...prev, timeout_seconds: parseInt(e.target.value) || 30 }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>最大重试</Label>
                        <Input
                          type="number"
                          value={exchangeConfig.max_retries}
                          onChange={(e) => setExchangeConfig((prev) => ({ ...prev, max_retries: parseInt(e.target.value) || 3 }))}
                        />
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {editingDomain && (
              <div className="flex items-center space-x-2">
                <Switch
                  checked={form.watch('is_active')}
                  onCheckedChange={(v) => form.setValue('is_active', v)}
                />
                <Label>{t('common.active')}</Label>
              </div>
            )}
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
        title={t('tenants.deleteDomain')}
        description={t('common.confirmDelete')}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        variant="destructive"
      />

      <Dialog open={bulkTypeOpen} onOpenChange={setBulkTypeOpen}>
        <DialogContent className="max-w-sm rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>批量设置邮件系统类型</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              已选择 {selectedIds.size} 个域名
            </p>
            <div className="space-y-2">
              <Label>邮件系统类型</Label>
              <Select value={bulkMailSystemType} onValueChange={(v) => setBulkMailSystemType(v as MailSystemType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard_smtp">标准 SMTP</SelectItem>
                  <SelectItem value="coremail">Coremail</SelectItem>
                  <SelectItem value="exchange">Exchange</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTypeOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleBulkSetType} disabled={bulkSubmitting}>
              {bulkSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dkimDomain && (
        <DkimManageDrawer
          open={!!dkimDomain}
          onOpenChange={(o) => !o && setDkimDomain(null)}
          tenantId={tenantId}
          domain={dkimDomain}
        />
      )}
    </PageShell>
  );
}
