'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DataTable } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useApiRequest } from '@/lib/api/client';
import {
  listProxysvrGroups,
  createProxysvrGroup,
  updateProxysvrGroup,
  deleteProxysvrGroup,
  listProxysvrEndpoints,
} from '@/lib/api/proxysvr';
import type { ProxysvrGroup, ProxysvrGroupRequest } from '@/types/proxysvr';

export function ProxysvrGroupsSection() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { apiRequest } = useApiRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProxysvrGroup | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  // ordered member endpoint ids; ord = array index
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [pickEndpoint, setPickEndpoint] = useState<string>('');

  const groupsKey = ['proxysvr-groups'];

  const { data: groups, isLoading } = useQuery({
    queryKey: groupsKey,
    queryFn: () => listProxysvrGroups(apiRequest),
  });

  const { data: endpoints = [] } = useQuery({
    queryKey: ['proxysvr-endpoints'],
    queryFn: () => listProxysvrEndpoints(apiRequest),
  });

  const endpointName = (id: number) => endpoints.find((e) => e.id === id)?.name ?? `#${id}`;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProxysvrGroup(id, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupsKey });
      toast.success(t('common.deleteSuccess'));
      setDeleteId(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openDialog = (g?: ProxysvrGroup) => {
    if (g) {
      setEditing(g);
      setName(g.name);
      setIsActive(g.is_active);
      setMemberIds([...(g.members ?? [])].sort((a, b) => a.ord - b.ord).map((m) => m.endpoint_id));
    } else {
      setEditing(null);
      setName('');
      setIsActive(true);
      setMemberIds([]);
    }
    setPickEndpoint('');
    setDialogOpen(true);
  };

  const addMember = (idStr: string) => {
    const id = Number(idStr);
    if (!id || memberIds.includes(id)) return;
    setMemberIds((m) => [...m, id]);
    setPickEndpoint('');
  };

  const moveMember = (idx: number, dir: -1 | 1) => {
    setMemberIds((m) => {
      const next = [...m];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return m;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeMember = (idx: number) => setMemberIds((m) => m.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t('proxysvr.groupNameRequired'));
      return;
    }
    if (memberIds.length === 0) {
      toast.error(t('proxysvr.groupMembersRequired'));
      return;
    }
    setIsSubmitting(true);
    try {
      const body: ProxysvrGroupRequest = {
        name: name.trim(),
        is_active: isActive,
        members: memberIds.map((endpoint_id, ord) => ({ endpoint_id, ord })),
      };
      if (editing) {
        await updateProxysvrGroup(editing.id, body, apiRequest);
        toast.success(t('common.updateSuccess'));
      } else {
        await createProxysvrGroup(body, apiRequest);
        toast.success(t('common.createSuccess'));
      }
      queryClient.invalidateQueries({ queryKey: groupsKey });
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<ProxysvrGroup>[] = [
    { accessorKey: 'id', header: 'ID', size: 60 },
    { accessorKey: 'name', header: t('proxysvr.name') },
    {
      id: 'members',
      header: t('proxysvr.members'),
      cell: ({ row }) => (
        <span className="text-sm">
          {[...(row.original.members ?? [])]
            .sort((a, b) => a.ord - b.ord)
            .map((m) => endpointName(m.endpoint_id))
            .join(' → ')}
        </span>
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

  const available = endpoints.filter((e) => !memberIds.includes(e.id));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button data-testid="proxysvr-group-create" onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          {t('proxysvr.createGroup')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <DataTable columns={columns} data={groups || []} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-[28px] border-border/70 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? t('proxysvr.editGroup') : t('proxysvr.createGroup')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('proxysvr.name')} *</Label>
              <Input name="group_name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2 rounded-md border p-4">
              <Label className="text-base font-semibold">{t('proxysvr.members')} *</Label>
              <Select
                value={pickEndpoint || null}
                onValueChange={(v) => v && addMember(String(v))}
              >
                <SelectTrigger data-testid="proxysvr-member-select" className="flex-1">
                  <SelectValue placeholder={t('proxysvr.addMember')} />
                </SelectTrigger>
                <SelectContent>
                  {available.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      {t('proxysvr.noMoreEndpoints')}
                    </SelectItem>
                  ) : (
                    available.map((ep) => (
                      <SelectItem key={ep.id} value={String(ep.id)}>
                        {ep.name} ({ep.host}:{ep.port})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <ol className="space-y-1" data-testid="proxysvr-member-list">
                {memberIds.map((id, idx) => (
                  <li
                    key={id}
                    className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                  >
                    <span className="font-mono">
                      {idx + 1}. {endpointName(id)}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveMember(idx, -1)}
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveMember(idx, 1)}
                        disabled={idx === memberIds.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMember(idx)}
                        className="text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
              {memberIds.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('proxysvr.membersEmptyHint')}</p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
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
        title={t('proxysvr.deleteGroup')}
        description={t('common.confirmDelete')}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        variant="destructive"
      />
    </div>
  );
}
