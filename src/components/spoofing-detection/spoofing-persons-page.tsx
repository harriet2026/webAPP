'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ServerPagination } from '@/components/shared/server-pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApiRequest } from '@/lib/api/client';
import {
  listSpoofPersons, deleteSpoofPerson, setSpoofPersonObserve, bulkSpoofPersons,
} from '@/lib/api/spoofing-detection';
import type { SpoofPersonDTO } from '@/types/spoofing-detection';
import { useSpoofingAccess } from './spoofing-access';
import { SpoofingPersonCard } from './spoofing-person-card';
import { SpoofingBatchDialog } from './spoofing-batch-dialog';
import { SpoofingPersonForm } from './spoofing-person-form';
import { spoofingQueryKeys } from './spoofing-query-keys';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

const PAGE_SIZE = 100;

export function SpoofingPersonsPage({ auditOnly }: { auditOnly?: boolean }) {
  const tsd = useTranslations('spoofingDetection');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit } = useSpoofingAccess();
  const qc = useQueryClient();
  const readonly = auditOnly || !canEdit;

  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [levelFilter, setLevelFilter] = useState('all');
  const [observeFilter, setObserveFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleting, setDeleting] = useState<SpoofPersonDTO | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SpoofPersonDTO | null>(null);

  const listQuery = useQuery({
    queryKey: spoofingQueryKeys.persons(effectiveTenantId, { keyword, page, pageSize: PAGE_SIZE, levelFilter, observeFilter }),
    queryFn: () => listSpoofPersons({
      page,
      page_size: PAGE_SIZE,
      keyword: keyword.trim() || undefined,
      protection_level: levelFilter === 'all' ? undefined : levelFilter,
      observe_mode: observeFilter === 'all' ? undefined : observeFilter === 'on',
    }, apiRequest),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: spoofingQueryKeys.persons(effectiveTenantId) });

  const observeMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: boolean }) => setSpoofPersonObserve(id, next, apiRequest),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSpoofPerson(id, apiRequest),
    onSuccess: () => { invalidate(); toast.success(tsd('person.delete')); },
  });
  const bulkMutation = useMutation({
    mutationFn: (body: Parameters<typeof bulkSpoofPersons>[0]) => bulkSpoofPersons(body, apiRequest),
    onSuccess: () => { invalidate(); setSelectedIds([]); setBatchOpen(false); },
    onError: (e) => toast.error(apiErrorMessage(e, 'error')),
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const filtered = items;
  const editable = filtered.filter((p) => !p.read_only);
  const allSelected = editable.length > 0 && editable.every((p) => selectedIds.includes(p.id));
  const levelFilterLabel = levelFilter === 'all' ? tsd('person.allLevels') : tsd(`person.level.${levelFilter}`);
  const observeFilterLabel = observeFilter === 'all'
    ? tsd('person.allObserve')
    : tsd(observeFilter === 'on' ? 'person.observeOn' : 'person.observeOff');

  return (
    <>
      <Card className="gap-0 rounded-lg border-border bg-card py-0 shadow-sm">
        <CardHeader className="space-y-4 px-6 py-5">
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">{tsd('person.title')}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{tsd('person.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && !readonly ? (
                <Button variant="outline" onClick={() => setBatchOpen(true)}>
                  <Users className="mr-2 h-4 w-4" />{tsd('batch.selected', { n: selectedIds.length })}
                </Button>
              ) : null}
              <Button data-testid="spoof-person-add" disabled={readonly} onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />{tsd('person.add')}
              </Button>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
                placeholder={tsd('person.searchPlaceholder')} className="h-9 pl-9" />
            </div>
            <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v ?? 'all'); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue>{levelFilterLabel}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tsd('person.allLevels')}</SelectItem>
                <SelectItem value="high">{tsd('person.level.high')}</SelectItem>
                <SelectItem value="medium">{tsd('person.level.medium')}</SelectItem>
                <SelectItem value="low">{tsd('person.level.low')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={observeFilter} onValueChange={(v) => { setObserveFilter(v ?? 'all'); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-36"><SelectValue>{observeFilterLabel}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tsd('person.allObserve')}</SelectItem>
                <SelectItem value="on">{tsd('person.observeOn')}</SelectItem>
                <SelectItem value="off">{tsd('person.observeOff')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {editable.length > 0 && !readonly ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={allSelected}
                onCheckedChange={(c) => setSelectedIds(c ? editable.map((p) => p.id) : [])} />
              {tsd('person.selectAllCurrent')}
            </label>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-2 px-6 pb-6">
          {filtered.map((p) => (
            <SpoofingPersonCard key={p.id} person={p} disabled={readonly || p.read_only}
              selected={!p.read_only && selectedIds.includes(p.id)}
              onSelect={(c) => setSelectedIds((prev) => c ? [...prev, p.id] : prev.filter((x) => x !== p.id))}
              onObserve={(next) => observeMutation.mutate({ id: p.id, next })}
              onEdit={() => { setEditing(p); setFormOpen(true); }}
              onDelete={() => setDeleting(p)} />
          ))}
          {filtered.length === 0 && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Users className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{tsd('person.emptyTitle')}</p>
              <p className="mt-1 mb-4 text-xs text-muted-foreground">{tsd('person.emptyDescription')}</p>
              <Button disabled={readonly} onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />{tsd('person.add')}
              </Button>
            </div>
          ) : null}
          {filtered.length === 0 && items.length > 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{tsd('person.emptyFiltered')}</p>
          ) : null}
          <div data-testid="spoof-person-pagination">
            <ServerPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tsd('person.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{tsd('person.deleteConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tsd('personForm.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700"
              onClick={() => { if (deleting) deleteMutation.mutate(deleting.id); setDeleting(null); }}>
              {tsd('person.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SpoofingBatchDialog key={batchOpen ? 'batch-open' : 'batch-closed'} open={batchOpen} onOpenChange={setBatchOpen}
        count={selectedIds.length}
        onApply={(action, value) => {
          if (action === 'observe_on') bulkMutation.mutate({ action: 'set_observe', ids: selectedIds, observe_mode: true });
          else if (action === 'observe_off') bulkMutation.mutate({ action: 'set_observe', ids: selectedIds, observe_mode: false });
          else if (action === 'threshold' && value != null) bulkMutation.mutate({ action: 'set_threshold', ids: selectedIds, confidence_threshold: value });
        }} />

      <SpoofingPersonForm
        key={`${effectiveTenantId ?? 'platform'}-${formOpen ? (editing ? `edit-${editing.id}` : 'add') : 'form-closed'}`}
        open={formOpen} onOpenChange={setFormOpen} editing={editing}
        onSaved={() => { invalidate(); setFormOpen(false); }} />
    </>
  );
}
