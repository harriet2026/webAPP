'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Loader2, Wifi } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { useScopedApiRequest } from '@/lib/api/client';
import { listTenantDomains, probeDomain } from '@/lib/api/mail-routing';
import {
  listNexthops,
  createNexthop,
  updateNexthop,
  deleteNexthop,
} from '@/lib/api/tenant-routing';
import { createTenantDomain, deleteTenantDomain } from '@/lib/api/tenants';
import type {
  TenantDomain,
  TenantDomainNexthop,
  NextHopType,
} from '@/types/tenant';
import { formatDate } from '@/lib/utils';

interface ReceivingTabProps {
  tenantId: number;
}

interface NexthopFormState {
  host: string;
  port: string;
  next_hop_type: NextHopType;
  priority: string;
  is_active: boolean;
}

const EMPTY_FORM: NexthopFormState = {
  host: '',
  port: '25',
  next_hop_type: 'domain',
  priority: '0',
  is_active: true,
};

type ProbeStatus = 'normal' | 'abnormal' | 'partial' | 'unchecked';

/** Compute per-domain aggregate probe status from a list of nexthops. */
function aggregateProbeStatus(nexthops: TenantDomainNexthop[]): ProbeStatus {
  const active = nexthops.filter((nh) => nh.is_active);
  if (active.length === 0) return 'unchecked';
  const neverProbed = active.every((nh) => !nh.probe_status || nh.probe_status === 'unchecked');
  if (neverProbed) return 'unchecked';
  const normal = active.filter((nh) => nh.probe_status === 'normal').length;
  if (normal === active.length) return 'normal';
  if (normal === 0) return 'abnormal';
  return 'partial';
}

function lastProbeTime(nexthops: TenantDomainNexthop[]): string | null {
  const times = nexthops
    .filter((nh) => nh.is_active && nh.last_probe_time)
    .map((nh) => new Date(nh.last_probe_time!).getTime());
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

const STATUS_CLASSES: Record<ProbeStatus, string> = {
  normal: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  abnormal: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  partial: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  unchecked: 'bg-muted text-muted-foreground',
};

export function ReceivingTab({ tenantId }: ReceivingTabProps) {
  const t = useTranslations('mailRouting');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['mail-routing-domains', tenantId],
    queryFn: () => listTenantDomains(tenantId, apiRequest),
  });

  const [sheet, setSheet] = useState<{
    open: boolean;
    domain: TenantDomain | null;
    editing: TenantDomainNexthop | null;
  }>({ open: false, domain: null, editing: null });
  const [form, setForm] = useState<NexthopFormState>({ ...EMPTY_FORM });
  const [deleteTarget, setDeleteTarget] = useState<{
    domain: TenantDomain;
    nh: TenantDomainNexthop;
  } | null>(null);

  const [domainSheet, setDomainSheet] = useState(false);
  const [domainName, setDomainName] = useState('');
  const [domainDeleteTarget, setDomainDeleteTarget] = useState<TenantDomain | null>(null);
  const [probingDomainId, setProbingDomainId] = useState<number | null>(null);
  // Authoritative server-computed aggregate probe status per domain, captured
  // from the probe response (DomainProbeResult.probe_status). Preferred over the
  // client recomputation so the badge always reflects the server's verdict and
  // cannot drift if the server-side aggregation logic changes (review M17).
  const [serverStatusByDomain, setServerStatusByDomain] = useState<Record<number, ProbeStatus>>({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mail-routing-domains', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['mail-routing-nexthops', tenantId] });
  };

  const createMutation = useMutation({
    mutationFn: ({ domain, payload }: { domain: TenantDomain; payload: NexthopFormState }) =>
      createNexthop(tenantId, domain.id, {
        host: payload.host.trim(),
        port: Number(payload.port),
        next_hop_type: payload.next_hop_type,
        priority: Number(payload.priority) || 0,
        is_active: payload.is_active,
      }, apiRequest),
    onSuccess: () => {
      toast.success(tc('createSuccess'));
      setSheet({ open: false, domain: null, editing: null });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      domain,
      editing,
      payload,
    }: {
      domain: TenantDomain;
      editing: TenantDomainNexthop;
      payload: NexthopFormState;
    }) =>
      updateNexthop(tenantId, domain.id, editing.id, {
        host: payload.host.trim(),
        port: Number(payload.port),
        next_hop_type: payload.next_hop_type,
        priority: Number(payload.priority) || 0,
        is_active: payload.is_active,
      }, apiRequest),
    onSuccess: () => {
      toast.success(tc('updateSuccess'));
      setSheet({ open: false, domain: null, editing: null });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ domain, nh }: { domain: TenantDomain; nh: TenantDomainNexthop }) =>
      deleteNexthop(tenantId, domain.id, nh.id, apiRequest),
    onSuccess: () => {
      toast.success(tc('deleteSuccess'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const probeMutation = useMutation({
    mutationFn: (domainId: number) => probeDomain(tenantId, domainId, apiRequest),
    onMutate: (domainId) => setProbingDomainId(domainId),
    onSettled: () => setProbingDomainId(null),
    onSuccess: (data, domainId) => {
      // Persist the server's aggregate verdict as authoritative for display.
      setServerStatusByDomain((prev) => ({ ...prev, [domainId]: data.probe_status }));
      toast.success(t('receiving.probeSuccess'));
      invalidate();
    },
    onError: (e: Error) => toast.error(t('receiving.probeFailed') + ': ' + e.message),
  });

  const createDomainMutation = useMutation({
    mutationFn: (name: string) =>
      createTenantDomain(tenantId, { domain: name, next_hop_type: 'domain', next_hop_host: '', next_hop_port: 0 }, apiRequest),
    onSuccess: () => {
      toast.success(tc('createSuccess'));
      setDomainSheet(false);
      setDomainName('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDomainMutation = useMutation({
    // apiRequest is scoped to this tenant (useScopedApiRequest(tenantId)), so it
    // injects X-Tenant-ID; the explicit tenantId arg is left undefined here.
    mutationFn: (domain: TenantDomain) => deleteTenantDomain(domain.id, undefined, apiRequest),
    onSuccess: () => {
      toast.success(tc('deleteSuccess'));
      setDomainDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = (domain: TenantDomain, existingPort?: number | string) => {
    // Spec §4.2 wants port entered once per domain and applied to every nexthop
    // (M15). Pre-fill from the domain's existing active nexthop port so new
    // nexthops stay consistent with the domain's canonical port.
    const port = existingPort ? String(existingPort) : EMPTY_FORM.port;
    setForm({ ...EMPTY_FORM, port });
    setSheet({ open: true, domain, editing: null });
  };

  const openEdit = (domain: TenantDomain, nh: TenantDomainNexthop) => {
    setForm({
      host: nh.host,
      port: String(nh.port),
      next_hop_type: (nh.next_hop_type === 'ip' ? 'ip' : 'domain') as NextHopType,
      priority: String(nh.priority),
      is_active: nh.is_active,
    });
    setSheet({ open: true, domain, editing: nh });
  };

  const submit = () => {
    if (!sheet.domain) return;
    const port = Number(form.port);
    if (!form.host.trim()) {
      toast.error(t('receiving.hostRequired'));
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error(t('receiving.portInvalid'));
      return;
    }
    if (sheet.editing) {
      updateMutation.mutate({ domain: sheet.domain, editing: sheet.editing, payload: form });
    } else {
      createMutation.mutate({ domain: sheet.domain, payload: form });
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const submitDomain = () => {
    const name = domainName.trim();
    if (!name) return;
    createDomainMutation.mutate(name);
  };

  if (domains.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-2">
          <Button size="sm" onClick={() => setDomainSheet(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('receiving.addDomain')}
          </Button>
        </div>
        <EmptyState title={t('receiving.noDomains')} />
        <Sheet open={domainSheet} onOpenChange={(open) => !open && setDomainSheet(false)}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>{t('receiving.addDomain')}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 px-4 py-4">
              <div className="space-y-1.5">
                <Label>{t('receiving.domainColumn')}</Label>
                <Input
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  placeholder="example.com"
                  onKeyDown={(e) => e.key === 'Enter' && submitDomain()}
                />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setDomainSheet(false)}>{tc('cancel')}</Button>
              <Button onClick={submitDomain} disabled={createDomainMutation.isPending}>
                {createDomainMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {tc('save')}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDomainSheet(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('receiving.addDomain')}
        </Button>
      </div>
      {domains.map((domain) => (
        <DomainCard
          key={domain.id}
          tenantId={tenantId}
          domain={domain}
          probing={probingDomainId === domain.id}
          serverStatus={serverStatusByDomain[domain.id]}
          onProbe={() => probeMutation.mutate(domain.id)}
          onAddNexthop={(existingPort) => openCreate(domain, existingPort)}
          onEditNexthop={(nh) => openEdit(domain, nh)}
          onDeleteNexthop={(nh) => setDeleteTarget({ domain, nh })}
          onDeleteDomain={() => setDomainDeleteTarget(domain)}
        />
      ))}

      <Sheet
        open={sheet.open}
        onOpenChange={(open) => !open && setSheet({ open: false, domain: null, editing: null })}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {sheet.editing ? t('receiving.editNexthop') : t('receiving.addNexthop')}
            </SheetTitle>
            <SheetDescription>
              {sheet.domain?.domain ? `${sheet.domain.domain} · ` : ''}
              {t('receiving.priorityLabel')}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-1.5">
              <Label>{t('receiving.hostLabel')} *</Label>
              <Input
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="mx.example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('receiving.portLabel')} *</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('receiving.typeLabel')}</Label>
                <Select
                  value={form.next_hop_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, next_hop_type: v as NextHopType }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domain">domain</SelectItem>
                    <SelectItem value="ip">ip</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('receiving.priorityLabel')}</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: !!v }))}
              />
              <Label>{t('receiving.activeLabel')}</Label>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheet({ open: false, domain: null, editing: null })}>
              {tc('cancel')}
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={tc('confirmDelete')}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ domain: deleteTarget.domain, nh: deleteTarget.nh });
          }
        }}
      />

      <Sheet open={domainSheet} onOpenChange={(open) => !open && setDomainSheet(false)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('receiving.addDomain')}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-1.5">
              <Label>{t('receiving.domainColumn')}</Label>
              <Input
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                placeholder="example.com"
                onKeyDown={(e) => e.key === 'Enter' && submitDomain()}
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setDomainSheet(false)}>{tc('cancel')}</Button>
            <Button onClick={submitDomain} disabled={createDomainMutation.isPending}>
              {createDomainMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!domainDeleteTarget}
        onOpenChange={(open) => !open && setDomainDeleteTarget(null)}
        title={tc('confirmDelete')}
        variant="destructive"
        onConfirm={() => {
          if (domainDeleteTarget) {
            deleteDomainMutation.mutate(domainDeleteTarget);
          }
        }}
      />
    </div>
  );
}

interface DomainCardProps {
  tenantId: number;
  domain: TenantDomain;
  probing: boolean;
  serverStatus?: ProbeStatus;
  onProbe: () => void;
  onAddNexthop: (existingPort?: number | string) => void;
  onEditNexthop: (nh: TenantDomainNexthop) => void;
  onDeleteNexthop: (nh: TenantDomainNexthop) => void;
  onDeleteDomain: () => void;
}

function DomainCard({
  tenantId,
  domain,
  probing,
  serverStatus,
  onProbe,
  onAddNexthop,
  onEditNexthop,
  onDeleteNexthop,
  onDeleteDomain,
}: DomainCardProps) {
  const t = useTranslations('mailRouting');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);

  const { data: nexthops = [] } = useQuery({
    queryKey: ['mail-routing-nexthops', tenantId, domain.id],
    queryFn: () => listNexthops(tenantId, domain.id, apiRequest),
  });

  // The nexthops list endpoint returns {"items": null} when empty (not []),
  // so listNexthops resolves to null and the `= []` default above does NOT
  // apply (defaults only catch undefined). Normalize here so the spreads/filters
  // below never hit "null is not iterable".
  const nexthopList = nexthops ?? [];
  const sorted = [...nexthopList].sort((a, b) => b.priority - a.priority || a.id - b.id);
  // Prefer the server-computed aggregate (authoritative, from the probe
  // response); fall back to the client recomputation only before the first
  // probe (review M17).
  const clientStatus = aggregateProbeStatus(nexthopList);
  const status: ProbeStatus = serverStatus ?? clientStatus;
  const probeTime = lastProbeTime(nexthopList);

  const hostsSummary = sorted
    .filter((nh) => nh.is_active)
    .map((nh) => nh.host)
    .join(', ') || '—';

  const activePort = sorted.find((nh) => nh.is_active)?.port ?? '—';

  // For the partial badge, show normal/total so ops sees the split (spec §4.2,
  // review M14).
  const activeNexthops = sorted.filter((nh) => nh.is_active);
  const normalCount = activeNexthops.filter((nh) => nh.probe_status === 'normal').length;
  const statusLabel =
    status === 'partial' && activeNexthops.length > 0
      ? `${t('receiving.status.partial')} (${normalCount}/${activeNexthops.length})`
      : t(`receiving.status.${status}`);

  return (
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-sm font-semibold">{domain.domain}</span>
          <span className="text-sm text-muted-foreground">{hostsSummary}</span>
          <span className="text-sm text-muted-foreground">:{activePort}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
          >
            {/* During a probe, show the spinner in the status badge itself (spec
                §4.2 / review M16), not only on the button. */}
            {probing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            {statusLabel}
          </span>
          {probeTime && (
            <span className="text-xs text-muted-foreground">
              {t('receiving.lastProbeColumn')}: {formatDate(probeTime)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onProbe}
            disabled={probing}
            title={t('receiving.statusHint')}
          >
            {probing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Wifi className="mr-1 h-4 w-4" />
            )}
            {probing ? t('receiving.probing') : t('receiving.probeButton')}
          </Button>
          <Button size="sm" onClick={() => onAddNexthop(activePort === '—' ? undefined : activePort)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('receiving.addNexthop')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            title={t('receiving.deleteDomain')}
            onClick={onDeleteDomain}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {sorted.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t('receiving.noNexthops')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('receiving.hostLabel')}</TableHead>
              <TableHead>{t('receiving.portLabel')}</TableHead>
              <TableHead>{t('receiving.typeLabel')}</TableHead>
              <TableHead>{t('receiving.priorityLabel')}</TableHead>
              <TableHead>{t('receiving.activeLabel')}</TableHead>
              <TableHead>{t('receiving.statusColumn')}</TableHead>
              <TableHead className="text-right">{t('receiving.actionsColumn')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((nh) => {
              const nhStatus = (nh.probe_status as ProbeStatus) ?? 'unchecked';
              return (
                <TableRow key={nh.id}>
                  <TableCell className="font-mono text-sm">{nh.host}</TableCell>
                  <TableCell className="tabular-nums">{nh.port}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{nh.next_hop_type}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{nh.priority}</TableCell>
                  <TableCell>
                    <span
                      className={nh.is_active ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}
                    >
                      {nh.is_active ? tc('active') : tc('inactive')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm ${STATUS_CLASSES[nhStatus]}`}>
                      {t(`receiving.status.${nhStatus}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => onEditNexthop(nh)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => onDeleteNexthop(nh)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
