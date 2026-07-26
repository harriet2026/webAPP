'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ServerPagination } from '@/components/shared/server-pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApiRequest } from '@/lib/api/client';
import {
  listSpoofBrands, deleteSpoofBrand, setSpoofBrandObserve,
} from '@/lib/api/spoofing-detection';
import type { SpoofBrandDTO } from '@/types/spoofing-detection';
import { useSpoofingAccess } from './spoofing-access';
import { SpoofingBrandCard } from './spoofing-brand-card';
import { SpoofingBrandForm } from './spoofing-brand-form';
import { spoofingQueryKeys } from './spoofing-query-keys';

const PAGE_SIZE = 100;

export function SpoofingBrandsPage({ auditOnly }: { auditOnly?: boolean }) {
  const tsd = useTranslations('spoofingDetection');
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit } = useSpoofingAccess();
  const qc = useQueryClient();
  const readonly = auditOnly || !canEdit;

  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [modeFilter, setModeFilter] = useState('all');
  const [deleting, setDeleting] = useState<SpoofBrandDTO | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SpoofBrandDTO | null>(null);

  const listQuery = useQuery({
    queryKey: spoofingQueryKeys.brands(effectiveTenantId, { keyword, modeFilter, page, pageSize: PAGE_SIZE }),
    queryFn: () => listSpoofBrands({
      page,
      page_size: PAGE_SIZE,
      keyword: keyword.trim() || undefined,
      disposition_mode: modeFilter === 'all' ? undefined : modeFilter,
    }, apiRequest),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: spoofingQueryKeys.brands(effectiveTenantId) });

  const observeMutation = useMutation({
    mutationFn: ({ id, next }: { id: number; next: boolean }) => setSpoofBrandObserve(id, next, apiRequest),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSpoofBrand(id, apiRequest),
    onSuccess: () => { invalidate(); toast.success(tsd('brand.delete')); },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const filtered = items;
  const modeFilterLabel = modeFilter === 'all' ? tsd('brand.allModes') : tsd(`brand.mode.${modeFilter}`);

  return (
    <>
      <Card className="gap-0 rounded-lg border-border bg-card py-0 shadow-sm">
        <CardHeader className="space-y-4 px-6 py-5">
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">{tsd('brand.title')}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{tsd('brand.subtitle')}</p>
            </div>
            <Button disabled={readonly} onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />{tsd('brand.add')}
            </Button>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={keyword} onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
                placeholder={tsd('brand.searchPlaceholder')} className="h-9 pl-9" />
            </div>
            <Select value={modeFilter} onValueChange={(v) => { setModeFilter(v ?? 'all'); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue>{modeFilterLabel}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tsd('brand.allModes')}</SelectItem>
                <SelectItem value="observe">{tsd('brand.mode.observe')}</SelectItem>
                <SelectItem value="standard">{tsd('brand.mode.standard')}</SelectItem>
                <SelectItem value="strict">{tsd('brand.mode.strict')}</SelectItem>
                <SelectItem value="custom">{tsd('brand.mode.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          {filtered.map((b) => (
            <SpoofingBrandCard key={b.id} brand={b} disabled={readonly || b.read_only}
              onObserve={(next) => observeMutation.mutate({ id: b.id, next })}
              onEdit={() => { setEditing(b); setFormOpen(true); }}
              onDelete={() => setDeleting(b)} />
          ))}
          {filtered.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{tsd('brand.emptyFiltered')}</p> : null}
          <div data-testid="spoof-brand-pagination">
            <ServerPagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tsd('brand.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{tsd('brand.deleteConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tsd('brandForm.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700"
              onClick={() => { if (deleting) deleteMutation.mutate(deleting.id); setDeleting(null); }}>
              {tsd('brand.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SpoofingBrandForm
        key={`${effectiveTenantId ?? 'platform'}-${formOpen ? (editing ? `edit-${editing.id}` : 'add') : 'closed'}`}
        open={formOpen} onOpenChange={setFormOpen} editing={editing}
        onSaved={() => { invalidate(); setFormOpen(false); }} />
    </>
  );
}
