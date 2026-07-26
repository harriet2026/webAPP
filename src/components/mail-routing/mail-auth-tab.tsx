'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';

import { useScopedApiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/client';
import {
  listMailAuthConfigs,
  createMailAuthConfig,
  updateMailAuthConfig,
  deleteMailAuthConfig,
  testMailAuthConnection,
} from '@/lib/api/mail-auth';
import type {
  MailAuthConfig,
  MailAuthConfigPayload,
  MailAuthDomainScope,
} from '@/lib/api/mail-auth';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_SCENES = ['smtpsend', 'userspace', 'mailsync'] as const;

const ALL_PROTOCOLS = ['smtp', 'ldap', 'pop3', 'imap'] as const;

/** Default ports by protocol × ssl_enabled. */
const PROTOCOL_PORTS: Record<string, { plain: number; ssl: number }> = {
  smtp: { plain: 25, ssl: 465 },
  ldap: { plain: 389, ssl: 636 },
  pop3: { plain: 110, ssl: 995 },
  imap: { plain: 143, ssl: 993 },
};

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  priority: number;
  scopeAll: boolean;
  domainsInput: string; // comma-separated when scopeAll=false
  protocol: string;
  serverHost: string;
  serverPort: number;
  sslEnabled: boolean;
  authTimeout: number;
  starttls: boolean;
  skipVerify: boolean;
  authMech: string;
  bindDnTemplate: string;
  scenes: string[];
  isActive: boolean;
}

const defaultForm = (): FormState => ({
  priority: 100,
  scopeAll: true,
  domainsInput: '',
  protocol: 'smtp',
  serverHost: '',
  serverPort: PROTOCOL_PORTS.smtp.plain,
  sslEnabled: false,
  authTimeout: 30,
  starttls: false,
  skipVerify: false,
  authMech: 'PLAIN',
  bindDnTemplate: '',
  scenes: ['smtpsend'],
  isActive: true,
});

function formToPayload(f: FormState): MailAuthConfigPayload {
  const domainScope: MailAuthDomainScope = f.scopeAll
    ? { all: true }
    : { domains: f.domainsInput.split(',').map((d) => d.trim()).filter(Boolean) };

  let protocol_config: Record<string, unknown> = {};
  switch (f.protocol) {
    case 'smtp':
      protocol_config = { starttls: f.starttls, auth_mech: f.authMech || 'PLAIN' };
      break;
    case 'ldap':
      protocol_config = {
        bind_dn_template: f.bindDnTemplate,
        starttls: f.starttls,
        skip_verify: f.skipVerify,
      };
      break;
    case 'pop3':
    case 'imap':
      protocol_config = { starttls: f.starttls, skip_verify: f.skipVerify };
      break;
  }

  return {
    priority: f.priority,
    domain_scope: domainScope,
    protocol: f.protocol,
    server_host: f.serverHost.trim(),
    server_port: f.serverPort,
    ssl_enabled: f.sslEnabled,
    auth_timeout: f.authTimeout,
    protocol_config,
    scenes: f.scenes,
    is_active: f.isActive,
  };
}

function configToForm(c: MailAuthConfig): FormState {
  const pc = c.protocol_config ?? {};
  const ds = c.domain_scope as { all?: true; domains?: string[] } | undefined;
  return {
    priority: c.priority,
    scopeAll: !!ds?.all,
    domainsInput: (ds?.domains ?? []).join(', '),
    protocol: c.protocol,
    serverHost: c.server_host,
    serverPort: c.server_port,
    sslEnabled: c.ssl_enabled,
    authTimeout: c.auth_timeout,
    starttls: !!pc.starttls,
    skipVerify: !!pc.skip_verify,
    authMech: (pc.auth_mech as string) || 'PLAIN',
    bindDnTemplate: (pc.bind_dn_template as string) || '',
    scenes: c.scenes ?? [],
    isActive: c.is_active,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface MailAuthTabProps {
  tenantId: number;
  /** When set (auth-log deep-link `?config=<id>`), highlight that config row. */
  highlightConfigId?: number;
}

export function MailAuthTab({ tenantId, highlightConfigId }: MailAuthTabProps) {
  const t = useTranslations('mailRouting.auth');
  const tc = useTranslations('common');
  const { apiRequest } = useScopedApiRequest(tenantId);
  const queryClient = useQueryClient();

  const queryKey = ['mail-auth-configs', tenantId];

  const { data: configs = [], isLoading } = useQuery<MailAuthConfig[]>({
    queryKey,
    queryFn: () => listMailAuthConfigs(apiRequest),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MailAuthConfig | null>(null);

  const [testTarget, setTestTarget] = useState<MailAuthConfig | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testUsername, setTestUsername] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency_ms: number } | null>(null);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMailAuthConfig(id, apiRequest),
    onSuccess: () => {
      toast.success(tc('deleteSuccess'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── Dialog helpers ───────────────────────────────────────────────────────

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setDialogOpen(true);
  }

  function openEdit(cfg: MailAuthConfig) {
    setEditingId(cfg.id);
    setForm(configToForm(cfg));
    setDialogOpen(true);
  }

  function handleProtocolChange(proto: string | null) {
    if (!proto) return;
    const ports = PROTOCOL_PORTS[proto] ?? { plain: 25, ssl: 465 };
    setForm((f) => ({
      ...f,
      protocol: proto,
      serverPort: f.sslEnabled ? ports.ssl : ports.plain,
    }));
  }

  function handleSSLChange(checked: boolean) {
    const ports = PROTOCOL_PORTS[form.protocol] ?? { plain: 25, ssl: 465 };
    setForm((f) => ({ ...f, sslEnabled: checked, serverPort: checked ? ports.ssl : ports.plain }));
  }

  function toggleScene(scene: string) {
    setForm((f) => ({
      ...f,
      scenes: f.scenes.includes(scene)
        ? f.scenes.filter((s) => s !== scene)
        : [...f.scenes, scene],
    }));
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  function validate(f: FormState): string | null {
    if (!f.protocol) return t('errors.protocolRequired');
    if (!f.serverHost.trim()) return t('errors.hostRequired');
    if (!Number.isInteger(f.serverPort) || f.serverPort < 1 || f.serverPort > 65535) return t('errors.portRange');
    if (!Number.isInteger(f.authTimeout) || f.authTimeout < 1 || f.authTimeout > 300) return t('errors.timeoutRange');
    if (f.scenes.length === 0) return t('errors.scenesRequired');
    if (f.protocol === 'ldap' && !f.bindDnTemplate.trim()) return t('errors.bindDnRequired');
    if (!f.scopeAll && f.domainsInput.split(',').map((d) => d.trim()).filter(Boolean).length === 0) {
      return t('errors.domainsRequired');
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate(form);
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        await updateMailAuthConfig(editingId, payload, apiRequest);
        toast.success(tc('updateSuccess'));
      } else {
        await createMailAuthConfig(payload, apiRequest);
        toast.success(tc('createSuccess'));
      }
      invalidate();
      setDialogOpen(false);
    } catch (e) {
      // 409 conflict → surface the apiserver message directly (overlap hint).
      if (e instanceof ApiError && e.status === 409) {
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : t('errors.saveFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Test connection ──────────────────────────────────────────────────────

  function openTest(cfg: MailAuthConfig) {
    setTestTarget(cfg);
    setTestUsername('');
    setTestPassword('');
    setTestResult(null);
    setTestOpen(true);
  }

  const testMutation = useMutation({
    mutationFn: (vars: { cfg: MailAuthConfig; username: string; password: string }) =>
      testMailAuthConnection(
        {
          protocol: vars.cfg.protocol,
          server_host: vars.cfg.server_host,
          server_port: vars.cfg.server_port,
          ssl_enabled: vars.cfg.ssl_enabled,
          auth_timeout: vars.cfg.auth_timeout,
          protocol_config: vars.cfg.protocol_config,
          ...(vars.username ? { username: vars.username, password: vars.password } : {}),
        },
        apiRequest,
      ),
    onSuccess: (result) => setTestResult(result),
    onError: (e: Error) =>
      setTestResult({ success: false, message: e.message, latency_ms: 0 }),
  });

  function runTest() {
    if (!testTarget) return;
    setTestResult(null);
    testMutation.mutate({ cfg: testTarget, username: testUsername, password: testPassword });
  }

  // ─── Table columns ────────────────────────────────────────────────────────

  function domainScopeLabel(ds: MailAuthDomainScope): string {
    if ('all' in ds && ds.all) return t('fields.domainScopeAll');
    return ('domains' in ds ? ds.domains : []).join(', ') || '—';
  }

  const columns: ColumnDef<MailAuthConfig>[] = [
    { accessorKey: 'priority', header: t('columns.priority'), size: 80 },
    {
      id: 'domainScope',
      header: t('columns.domainScope'),
      cell: ({ row }) => (
        <span className="block max-w-[240px] truncate" title={domainScopeLabel(row.original.domain_scope)}>
          {domainScopeLabel(row.original.domain_scope)}
        </span>
      ),
    },
    {
      accessorKey: 'protocol',
      header: t('columns.protocol'),
      cell: ({ row }) => <Badge variant="outline">{row.original.protocol.toUpperCase()}</Badge>,
    },
    {
      id: 'server',
      header: t('columns.server'),
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.server_host}:{row.original.server_port}
        </span>
      ),
    },
    {
      id: 'scenes',
      header: t('columns.scenes'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {(row.original.scenes ?? []).map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {t(`scenes.${s}` as `scenes.${string}`)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'is_active',
      header: t('columns.status'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.is_active ? tc('active') : tc('inactive')}
          variant={row.original.is_active ? 'success' : 'default'}
        />
      ),
    },
    {
      id: 'actions',
      header: t('columns.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openTest(row.original)} title={t('testConnection')}>
            <Zap className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
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
        <div>
          <h3 className="text-lg font-semibold">{t('title')}</h3>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          {t('addConfig')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={configs}
          noDataText={t('noConfigs')}
          rowClassName={(row) =>
            highlightConfigId && row.id === highlightConfigId
              ? 'bg-amber-100 dark:bg-amber-950/30'
              : ''
          }
        />
      )}

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('editConfig') : t('addConfig')}</DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Priority + active */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('fields.priority')}</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-center gap-2 pt-7">
                <Checkbox
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: Boolean(v) }))}
                />
                <Label>{t('fields.isActive')}</Label>
              </div>
            </div>

            {/* Domain scope */}
            <div className="space-y-1.5">
              <Label>{t('fields.domainScope')}</Label>
              <Select
                value={form.scopeAll ? 'all' : 'specific'}
                onValueChange={(v) => setForm((f) => ({ ...f, scopeAll: v === 'all' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('fields.domainScopeAll')}</SelectItem>
                  <SelectItem value="specific">{t('fields.domainScopeSpecific')}</SelectItem>
                </SelectContent>
              </Select>
              {!form.scopeAll && (
                <Input
                  placeholder={t('fields.domains')}
                  value={form.domainsInput}
                  onChange={(e) => setForm((f) => ({ ...f, domainsInput: e.target.value }))}
                />
              )}
            </div>

            {/* Protocol */}
            <div className="space-y-1.5">
              <Label>{t('fields.protocol')}</Label>
              <Select value={form.protocol} onValueChange={handleProtocolChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_PROTOCOLS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(`protocols.${p}` as `protocols.${string}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Server host + port */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>{t('fields.serverHost')}</Label>
                <Input
                  value={form.serverHost}
                  onChange={(e) => setForm((f) => ({ ...f, serverHost: e.target.value }))}
                  placeholder="mail.example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.serverPort')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.serverPort}
                  onChange={(e) => setForm((f) => ({ ...f, serverPort: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* SSL + auth timeout */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 pt-6">
                <Checkbox checked={form.sslEnabled} onCheckedChange={(v) => handleSSLChange(Boolean(v))} />
                <Label>{t('fields.sslEnabled')}</Label>
              </div>
              <div className="space-y-1.5">
                <Label>{t('fields.authTimeout')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={300}
                  value={form.authTimeout}
                  onChange={(e) => setForm((f) => ({ ...f, authTimeout: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('fields.tlsModeHint')}</p>

            {/* Protocol-specific config */}
            {form.protocol === 'smtp' && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.starttls}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, starttls: Boolean(v) }))}
                  />
                  <Label>{t('fields.protocolConfig.starttls')}</Label>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('fields.protocolConfig.authMech')}</Label>
                  <Select value={form.authMech} onValueChange={(v) => setForm((f) => ({ ...f, authMech: v ?? 'PLAIN' }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLAIN">PLAIN</SelectItem>
                      <SelectItem value="LOGIN">LOGIN</SelectItem>
                      <SelectItem value="CRAM-MD5">CRAM-MD5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {form.protocol === 'ldap' && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label>{t('fields.protocolConfig.bindDnTemplate')}</Label>
                  <Input
                    placeholder="uid=%s,ou=users,dc=example,dc=com"
                    value={form.bindDnTemplate}
                    onChange={(e) => setForm((f) => ({ ...f, bindDnTemplate: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.starttls}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, starttls: Boolean(v) }))}
                  />
                  <Label>{t('fields.protocolConfig.starttls')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.skipVerify}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, skipVerify: Boolean(v) }))}
                  />
                  <Label>{t('fields.protocolConfig.skipVerify')}</Label>
                </div>
              </div>
            )}
            {(form.protocol === 'pop3' || form.protocol === 'imap') && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.starttls}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, starttls: Boolean(v) }))}
                  />
                  <Label>{t('fields.protocolConfig.starttls')}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={form.skipVerify}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, skipVerify: Boolean(v) }))}
                  />
                  <Label>{t('fields.protocolConfig.skipVerify')}</Label>
                </div>
              </div>
            )}

            {/* Scenes */}
            <div className="space-y-2">
              <Label>{t('fields.scenes')}</Label>
              <div className="flex flex-wrap gap-4">
                {ALL_SCENES.map((scene) => (
                  <div key={scene} className="flex items-center gap-2">
                    <Checkbox
                      checked={form.scenes.includes(scene)}
                      onCheckedChange={() => toggleScene(scene)}
                    />
                    <Label className="cursor-pointer">
                      {t(`scenes.${scene}` as `scenes.${string}`)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('deleteConfig')}
        description={t('deleteConfirm')}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />

      {/* ── Test connection dialog ── */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('testConnectionTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {testTarget?.server_host}:{testTarget?.server_port} ({testTarget?.protocol?.toUpperCase()})
            </p>
            <div className="space-y-1.5">
              <Label>{t('usernameOptional')}</Label>
              <Input
                value={testUsername}
                onChange={(e) => setTestUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('passwordOptional')}</Label>
              <Input
                type="password"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                autoComplete="off"
              />
            </div>
            {testResult && (
              <div
                className={`rounded-md p-3 text-sm ${
                  testResult.success
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                }`}
              >
                <p className="font-medium">
                  {testResult.success ? t('testSuccess') : t('testFailed')}
                </p>
                {testResult.message && <p className="mt-1">{testResult.message}</p>}
                {testResult.latency_ms > 0 && (
                  <p className="mt-1 text-xs opacity-80">{testResult.latency_ms}ms</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTestOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button type="button" onClick={runTest} disabled={testMutation.isPending}>
              {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {testMutation.isPending ? t('testing') : t('testConnection')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
