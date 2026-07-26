'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, Lock, Unlock, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import {
  getSMTPCredentials,
  createSMTPCredential,
  updateSMTPCredential,
  deleteSMTPCredential,
  unlockSMTPCredential,
  resetSMTPCredentialPassword,
  type SMTPCredential,
  type AuthBackend,
} from '@/lib/api/smtp-credentials';
import { useApiRequest } from '@/lib/api/client';
import { PageHeader, PageShell, PageSurface } from '@/components/shared/page-shell';
import { PageFilters } from '@/components/shared/page-filters';
import { Search, X } from 'lucide-react';
import { useProductForm } from '@/contexts/product-form-context';

// GT-12368: 本地账号库禁用时（OSG_LOCAL_AUTH_ENABLED=false），创建/编辑凭证的
// auth_backend 下拉不提供 local，避免用户选中一个后端会 400 拒绝的选项。
// 纯函数便于单测，不依赖 context/组件渲染。
export function backendOptions(localAuthEnabled: boolean): ('local' | 'smtp_relay' | 'ldap')[] {
  return localAuthEnabled ? ['local', 'smtp_relay', 'ldap'] : ['smtp_relay', 'ldap'];
}

const credentialSchema = z.object({
  username: z.string().min(1, 'usernameRequired'),
  password: z.union([z.string().min(6, 'passwordMinLength'), z.literal('')]).optional(),
  tenant_id: z.number().min(1, 'tenantRequired'),
  auth_backend: z.enum(['local', 'smtp_relay', 'ldap']),
  backend_config: z.string().optional(),
  is_active: z.boolean(),
});

type CredentialForm = z.infer<typeof credentialSchema>;

export default function SMTPCredentialsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();
  const { localAuthEnabled } = useProductForm();
  const opts = backendOptions(localAuthEnabled);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCred, setEditingCred] = useState<SMTPCredential | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [searchText, setSearchText] = useState('');

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['smtp-credentials'],
    queryFn: () => getSMTPCredentials(apiRequest),
  });

  const filteredCredentials = useMemo(() => {
    if (!credentials) return [];
    if (!searchText.trim()) return credentials;
    const q = searchText.trim().toLowerCase();
    return credentials.filter((c) =>
      c.username.toLowerCase().includes(q) ||
      String(c.id).includes(q) ||
      String(c.tenant_id).includes(q) ||
      c.auth_backend.toLowerCase().includes(q)
    );
  }, [credentials, searchText]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSMTPCredential(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtp-credentials'] });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlockMutation = useMutation({
    mutationFn: (id: number) => unlockSMTPCredential(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtp-credentials'] });
      toast.success(t('smtpCredentials.unlocked'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      resetSMTPCredentialPassword(id, password, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['smtp-credentials'] });
      toast.success(t('smtpCredentials.passwordReset'));
      setResetPasswordId(null);
      setNewPassword('');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const form = useForm<CredentialForm>({
    resolver: zodResolver(credentialSchema),
    defaultValues: {
      username: '',
      password: '',
      tenant_id: 1,
      auth_backend: opts[0],
      backend_config: '',
      is_active: true,
    },
  });

  const handleOpenDialog = (cred?: SMTPCredential) => {
    if (cred) {
      setEditingCred(cred);
      form.reset({
        username: cred.username,
        password: '',
        tenant_id: cred.tenant_id,
        auth_backend: cred.auth_backend,
        backend_config: cred.backend_config || '',
        is_active: cred.is_active,
      });
    } else {
      setEditingCred(null);
      form.reset({
        username: '',
        password: '',
        tenant_id: 1,
        auth_backend: opts[0],
        backend_config: '',
        is_active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (data: CredentialForm) => {
    setIsSubmitting(true);
    try {
      if (editingCred) {
        const updateData: Record<string, unknown> = {
          username: data.username,
          auth_backend: data.auth_backend,
          is_active: data.is_active,
          ...(data.backend_config ? { backend_config: data.backend_config } : {}),
        };
        await updateSMTPCredential(editingCred.id, updateData, apiRequest);
        toast.success(t('common.updateSuccess'));
      } else {
        if (!data.password) {
          toast.error(t('smtpCredentials.passwordRequired'));
          setIsSubmitting(false);
          return;
        }
        await createSMTPCredential({
          username: data.username,
          password: data.password,
          tenant_id: data.tenant_id,
          auth_backend: data.auth_backend,
          ...(data.backend_config ? { backend_config: data.backend_config } : {}),
        }, apiRequest);
        toast.success(t('common.createSuccess'));
      }
      queryClient.invalidateQueries({ queryKey: ['smtp-credentials'] });
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<SMTPCredential>[] = [
    { accessorKey: 'id', header: 'ID', size: 60 },
    { accessorKey: 'username', header: t('smtpCredentials.username') },
    { accessorKey: 'tenant_id', header: t('smtpCredentials.tenant'), size: 80 },
    {
      accessorKey: 'auth_backend',
      header: t('smtpCredentials.authBackend'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.auth_backend}
          variant={row.original.auth_backend === 'local' ? 'default' : 'info'}
        />
      ),
    },
    {
      accessorKey: 'is_active',
      header: t('common.status'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.is_active ? t('common.active') : t('common.inactive')}
          variant={row.original.is_active ? 'success' : 'error'}
        />
      ),
    },
    {
      accessorKey: 'failed_attempts',
      header: t('smtpCredentials.failedAttempts'),
      size: 100,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {row.original.failed_attempts}
          {row.original.locked_until && <Lock className="h-4 w-4 text-red-500" />}
        </div>
      ),
    },
    { accessorKey: 'last_login_at', header: t('smtpCredentials.lastLogin'), cell: ({ row }) => row.original.last_login_at || '-' },
    {
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.locked_until && (
            <Button variant="ghost" size="icon" onClick={() => unlockMutation.mutate(row.original.id)} title={t('smtpCredentials.unlock')}>
              <Unlock className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setResetPasswordId(row.original.id)} title={t('smtpCredentials.resetPassword')}>
            <Key className="h-4 w-4" />
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
        eyebrow={t('smtpCredentials.eyebrow')}
        title={t('smtpCredentials.title')}
        description={t('smtpCredentials.subtitle')}
        actions={<Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('smtpCredentials.create')}
        </Button>}
      />

      {isLoading ? (
        <PageSurface>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </PageSurface>
      ) : (
        <>
          <PageFilters>
            <div className="flex flex-wrap gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('smtpCredentials.username') + ' / ID ...'}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={() => setSearchText('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button variant="outline" onClick={() => setSearchText('')} disabled={!searchText}>
                {t('common.reset')}
              </Button>
            </div>
          </PageFilters>
          <PageSurface>
            <DataTable columns={columns} data={filteredCredentials} />
          </PageSurface>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editingCred ? t('smtpCredentials.edit') : t('smtpCredentials.create')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('smtpCredentials.username')} *</Label>
              <Input {...form.register('username')} />
            </div>
            {!editingCred && (
              <div className="space-y-2">
                <Label>{t('common.password')} *</Label>
                <Input type="password" {...form.register('password')} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('smtpCredentials.tenant')} *</Label>
                <Input type="number" {...form.register('tenant_id', { valueAsNumber: true })} />
              </div>
              <div className="space-y-2">
                <Label>{t('smtpCredentials.authBackend')} *</Label>
                <Select value={form.watch('auth_backend')} onValueChange={(v) => form.setValue('auth_backend', v as AuthBackend)}>
                  <SelectTrigger><SelectValue>{{ local: t('smtpCredentials.backendLocal'), smtp_relay: t('smtpCredentials.backendSmtpRelay'), ldap: t('smtpCredentials.backendLdap') }[form.watch('auth_backend')]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {opts.map((value) => (
                      <SelectItem key={value} value={value}>
                        {{ local: t('smtpCredentials.backendLocal'), smtp_relay: t('smtpCredentials.backendSmtpRelay'), ldap: t('smtpCredentials.backendLdap') }[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.watch('auth_backend') !== 'local' && (
              <div className="space-y-2">
                <Label>{t('smtpCredentials.backendConfig')}</Label>
                <Input {...form.register('backend_config')} />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Switch checked={form.watch('is_active')} onCheckedChange={(v) => form.setValue('is_active', v)} />
              <Label>{t('smtpCredentials.isActive')}</Label>
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
        title={t('smtpCredentials.delete')}
        description={t('common.confirmDelete')}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        variant="destructive"
      />

      <Dialog open={!!resetPasswordId} onOpenChange={(open) => !open && setResetPasswordId(null)}>
        <DialogContent className="max-w-sm rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{t('smtpCredentials.resetPassword')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('smtpCredentials.newPassword')}</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetPasswordId(null)}>{t('common.cancel')}</Button>
              <Button onClick={() => resetPasswordMutation.mutate({ id: resetPasswordId!, password: newPassword })} disabled={!newPassword || newPassword.length < 6}>
                {t('common.confirm')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
