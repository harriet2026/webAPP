'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useApiRequest } from '@/lib/api/client';
import { useTenant } from '@/hooks/use-tenant';
import {
  listStrategies,
  updateStrategy,
  deleteStrategy,
  cloneStrategy,
} from '@/lib/api/threat-retro';
import { StrategyListTable } from './strategy-list-table';
import { StrategySheet } from './strategy-sheet';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { ThreatRetroStrategy } from '@/types/threat-retro';

export function StrategyTab() {
  const t = useTranslations('threatRetroStrategy');
  const { apiRequest } = useApiRequest();
  const { isAdmin } = useTenant();
  const qc = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ThreatRetroStrategy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ThreatRetroStrategy | null>(null);

  const listQuery = useQuery({
    queryKey: ['tr-strategies'],
    queryFn: () => listStrategies(apiRequest),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tr-strategies'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, s }: { id: number; s: ThreatRetroStrategy }) =>
      updateStrategy(id, s, apiRequest),
    onSuccess: () => {
      invalidate();
      setSheetOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.saveError')),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => cloneStrategy(id, apiRequest),
    onSuccess: () => {
      toast.success(t('toast.cloned'));
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.saveError')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteStrategy(id, apiRequest),
    onSuccess: () => {
      toast.success(t('toast.deleted'));
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('toast.saveError')),
  });

  // Hook into the sheet's save flow via a side-channel: when the sheet calls
  // onSaved, the appropriate mutation is whichever one we armed via editing.
  // The strategy-sheet's own saveMutation writes/updates directly through
  // api client; this tab's mutations are reserved for clone/delete/toggle.

  const onToggle = (s: ThreatRetroStrategy, enabled: boolean) => {
    updateMutation.mutate({ id: s.id!, s: { ...s, status: enabled ? 'enabled' : 'disabled' } });
  };

  return (
    <div className="space-y-3" data-testid="threat-retro-strategy-list">
      <StrategyListTable
        data={listQuery.data ?? []}
        isLoading={listQuery.isLoading}
        isAdmin={isAdmin}
        onEdit={(s) => {
          setEditing(s);
          setSheetOpen(true);
        }}
        onClone={(s) => cloneMutation.mutate(s.id!)}
        onDelete={(s) => setDeleteTarget(s)}
        onToggle={onToggle}
        onCreate={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      />

      <StrategySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initial={editing}
        list={listQuery.data ?? []}
        onSaved={() => invalidate()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('delete.title')}
        description={t('delete.description', { name: deleteTarget?.name ?? '' })}
        confirmText={t('delete.confirm')}
        cancelText={t('delete.cancel')}
        variant="destructive"
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id!)}
      />
    </div>
  );
}
