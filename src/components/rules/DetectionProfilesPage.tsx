'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  getDetectionProfiles,
  createDetectionProfile,
  updateDetectionProfile,
  deleteDetectionProfile,
  type DetectionProfile,
} from '@/lib/api/detection-profiles';
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/hooks/use-tenant';
import { useApiRequest } from '@/lib/api/client';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

type ConfigType = 'rbl' | 'exec_impersonation' | 'domain_lookalike';

interface DetectionProfilesPageProps {
  configType: ConfigType;
}

export function DetectionProfilesPage({ configType }: DetectionProfilesPageProps) {
  const t = useTranslations();
  const apiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { effectiveTenantId, isViewingAllTenants } = useTenant();
  const { apiRequest } = useApiRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DetectionProfile | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [isActive, setIsActive] = useState(true);

  const queryKey = ['detection-profiles', configType, effectiveTenantId];

  const { data: profiles, isLoading } = useQuery({
    queryKey,
    queryFn: () => getDetectionProfiles(configType, apiRequest),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDetectionProfile(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (error: Error) => {
      toast.error(apiErrorMessage(error));
    },
  });

  const resetForm = () => {
    setName('');
    setValue('');
    setIsActive(true);
  };

  const handleOpenDialog = (profile?: DetectionProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setName(profile.name);
      setValue(profile.value || '');
      setIsActive(profile.is_active);
    } else {
      setEditingProfile(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (!name.trim()) {
        toast.error(t('common.required'));
        return;
      }

      if (editingProfile) {
        await updateDetectionProfile(
          editingProfile.id,
          { name: name.trim(), value: value.trim(), is_active: isActive },
          apiRequest,
        );
        toast.success(t('common.updateSuccess'));
      } else {
        await createDetectionProfile(
          { config_type: configType, name: name.trim(), value: value.trim(), is_active: isActive },
          apiRequest,
        );
        toast.success(t('common.createSuccess'));
      }
      queryClient.invalidateQueries({ queryKey });
      setDialogOpen(false);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const titleKey = configType === 'rbl'
    ? 'detectionProfiles.rbl'
    : configType === 'exec_impersonation'
      ? 'detectionProfiles.execImpersonation'
      : 'detectionProfiles.domainLookalike';

  const columns: ColumnDef<DetectionProfile>[] = [
    { accessorKey: 'id', header: 'ID', size: 60 },
    ...(isViewingAllTenants
      ? [
          {
            id: 'tenant_name',
            header: t('common.tenant'),
            cell: ({ row }: { row: { original: DetectionProfile } }) => {
              const p = row.original;
              return p.tenant_id == null ? (
                <Badge variant="secondary">{t('rules.globalRule')}</Badge>
              ) : (
                <span>{p.tenant_name || p.tenant_id}</span>
              );
            },
          } as ColumnDef<DetectionProfile>,
        ]
      : []),
    { accessorKey: 'name', header: t('detectionProfiles.name') },
    ...(configType === 'rbl'
      ? [{ accessorKey: 'value', header: t('detectionProfiles.rblDomain'), size: 200 } as ColumnDef<DetectionProfile>]
      : configType === 'exec_impersonation'
        ? [{ accessorKey: 'value', header: t('detectionProfiles.execUsernames'), size: 200 } as ColumnDef<DetectionProfile>]
        : [{ accessorKey: 'value', header: t('detectionProfiles.lookalikeDomains'), size: 200 } as ColumnDef<DetectionProfile>]),
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

  const valueLabel =
    configType === 'rbl'
      ? t('detectionProfiles.rblDomain')
      : configType === 'exec_impersonation'
        ? t('detectionProfiles.execUsernames')
        : t('detectionProfiles.lookalikeDomains');
  const valuePlaceholder =
    configType === 'rbl'
      ? 'e.g. zen.spamhaus.org'
      : configType === 'exec_impersonation'
        ? t('detectionProfiles.execUsernamesPlaceholder')
        : t('detectionProfiles.lookalikeDomainsPlaceholder');
  const valueHelp =
    configType === 'rbl'
      ? t('detectionProfiles.rblDomainHelp')
      : configType === 'exec_impersonation'
        ? t('detectionProfiles.execUsernamesHelp')
        : t('detectionProfiles.lookalikeDomainsHelp');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t(titleKey)}</h1>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('rules.createRule')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <DataTable columns={columns} data={profiles || []} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProfile ? t('rules.editRule') : t('rules.createRule')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('detectionProfiles.name')} *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('detectionProfiles.name')}
              />
            </div>
            <div className="space-y-2">
              <Label>{valueLabel}</Label>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={valuePlaceholder}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{valueHelp}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>{t('rules.isActive')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
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
    </div>
  );
}
