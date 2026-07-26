'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useApiRequest } from '@/lib/api/client';
import {
  listProxysvrEndpoints,
  createProxysvrEndpoint,
  updateProxysvrEndpoint,
  deleteProxysvrEndpoint,
} from '@/lib/api/proxysvr';
import type { ProxysvrEndpoint, ProxysvrEndpointRequest } from '@/types/proxysvr';

interface EndpointForm {
  name: string;
  host: string;
  port: number;
  presend_code: number;
  lid: string;
  license: string;
  is_active: boolean;
}

const emptyForm: EndpointForm = {
  name: '',
  host: '',
  port: 25,
  presend_code: 347,
  lid: '',
  license: '',
  is_active: true,
};

export function ProxysvrEndpointsSection() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProxysvrEndpoint | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<EndpointForm>(emptyForm);

  const queryKey = ['proxysvr-endpoints'];

  const { data: endpoints, isLoading } = useQuery({
    queryKey,
    queryFn: () => listProxysvrEndpoints(apiRequest),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProxysvrEndpoint(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openDialog = (ep?: ProxysvrEndpoint) => {
    if (ep) {
      setEditing(ep);
      setFormState({
        name: ep.name,
        host: ep.host,
        port: ep.port,
        presend_code: ep.presend_code,
        lid: ep.lid,
        license: '', // never prefill stored license
        is_active: ep.is_active,
      });
    } else {
      setEditing(null);
      setFormState(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim() || !formState.host.trim() || !formState.lid.trim()) {
      toast.error(t('proxysvr.endpointRequiredFields'));
      return;
    }
    setIsSubmitting(true);
    try {
      const body: ProxysvrEndpointRequest = {
        name: formState.name.trim(),
        host: formState.host.trim(),
        port: formState.port,
        presend_code: formState.presend_code,
        lid: formState.lid.trim(),
        is_active: formState.is_active,
        // omit license when blank so an edit keeps the stored value; never send use_tls (§7.5)
        ...(formState.license.trim() ? { license: formState.license } : {}),
      };
      if (editing) {
        await updateProxysvrEndpoint(editing.id, body, apiRequest);
        toast.success(t('common.updateSuccess'));
      } else {
        await createProxysvrEndpoint(body, apiRequest);
        toast.success(t('common.createSuccess'));
      }
      queryClient.invalidateQueries({ queryKey });
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<ProxysvrEndpoint>[] = [
    { accessorKey: 'id', header: 'ID', size: 60 },
    { accessorKey: 'name', header: t('proxysvr.name') },
    {
      id: 'addr',
      header: t('proxysvr.address'),
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.host}:{row.original.port}
        </span>
      ),
    },
    { accessorKey: 'presend_code', header: t('proxysvr.presendCode'), size: 110 },
    { accessorKey: 'lid', header: t('proxysvr.lid') },
    {
      id: 'license_present',
      header: t('proxysvr.license'),
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.license_present ? t('proxysvr.licenseSet') : t('proxysvr.licenseUnset')}
          variant={row.original.license_present ? 'success' : 'default'}
        />
      ),
    },
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
      id: 'actions',
      header: t('common.actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => openDialog(row.original)}>
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
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button data-testid="proxysvr-endpoint-create" onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('proxysvr.createEndpoint')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <DataTable columns={columns} data={endpoints || []} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('proxysvr.editEndpoint') : t('proxysvr.createEndpoint')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('proxysvr.name')} *</Label>
              <Input
                name="name"
                value={formState.name}
                onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>{t('proxysvr.host')} *</Label>
                <Input
                  name="host"
                  value={formState.host}
                  onChange={(e) => setFormState((s) => ({ ...s, host: e.target.value }))}
                  placeholder="proxysvr.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('proxysvr.port')}</Label>
                <Input
                  name="port"
                  type="number"
                  min={1}
                  max={65535}
                  value={formState.port}
                  onChange={(e) => setFormState((s) => ({ ...s, port: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('proxysvr.presendCode')}</Label>
                <Input
                  name="presend_code"
                  type="number"
                  value={formState.presend_code}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, presend_code: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t('proxysvr.lid')} *</Label>
                <Input
                  name="lid"
                  value={formState.lid}
                  onChange={(e) => setFormState((s) => ({ ...s, lid: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('proxysvr.license')}</Label>
              <Input
                name="license"
                type="password"
                autoComplete="new-password"
                value={formState.license}
                onChange={(e) => setFormState((s) => ({ ...s, license: e.target.value }))}
                placeholder={editing ? t('proxysvr.licenseEditPlaceholder') : ''}
              />
              <p className="text-xs text-muted-foreground">{t('proxysvr.licenseHint')}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={formState.is_active}
                onCheckedChange={(v) => setFormState((s) => ({ ...s, is_active: v }))}
              />
              <Label>{t('proxysvr.isActive')}</Label>
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
        title={t('proxysvr.deleteEndpoint')}
        description={t('common.confirmDelete')}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        variant="destructive"
      />
    </div>
  );
}
