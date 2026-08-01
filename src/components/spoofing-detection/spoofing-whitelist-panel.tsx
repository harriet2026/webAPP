'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { spoofingQueryKeys } from './spoofing-query-keys';
import { listSpoofWhitelist, createSpoofWhitelist, deleteSpoofWhitelist } from '@/lib/api/spoofing-detection';
import { useSpoofingAccess } from './spoofing-access';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export function SpoofingWhitelistPanel({ auditOnly = false }: { auditOnly?: boolean }) {
  const tsd = useTranslations('spoofingDetection');
  const apiErrorMessage = useApiErrorMessage();
  const { apiRequest, effectiveTenantId } = useApiRequest();
  const { canEdit } = useSpoofingAccess();
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [matchType, setMatchType] = useState<'email' | 'domain'>('email');
  const readOnly = !canEdit || auditOnly;

  const listQuery = useQuery({ queryKey: spoofingQueryKeys.whitelist(effectiveTenantId), queryFn: () => listSpoofWhitelist(apiRequest) });
  const invalidate = () => qc.invalidateQueries({ queryKey: spoofingQueryKeys.whitelist(effectiveTenantId) });

  const addMutation = useMutation({
    mutationFn: () => createSpoofWhitelist({ value: value.trim(), match_type: matchType }, apiRequest),
    onSuccess: () => { setValue(''); invalidate(); toast.success(tsd('whitelist.add')); },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) { toast.error(tsd('whitelist.errDup')); return; }
      toast.error(apiErrorMessage(e, 'error'));
    },
  });
  const delMutation = useMutation({
    mutationFn: (id: number) => deleteSpoofWhitelist(id, apiRequest),
    onSuccess: invalidate,
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="border-b px-4 py-3">
        <h4 className="text-sm font-semibold">{tsd('whitelist.title')}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{tsd('whitelist.subtitle')}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {listQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{tsd('whitelist.empty')}</p>
        ) : items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <span className="flex-1 truncate font-mono text-xs">{it.value}</span>
            <Badge variant="outline" className="text-[10px]">{tsd(`whitelist.${it.match_type}`)}</Badge>
            {readOnly ? null : (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-rose-500" onClick={() => delMutation.mutate(it.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {readOnly ? null : (
        <div className="flex items-center gap-2 border-t p-3">
          <Input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={tsd('whitelist.valuePlaceholder')} className="h-8 flex-1 text-sm" />
          <Select value={matchType} onValueChange={(v) => setMatchType((v ?? 'email') as 'email' | 'domain')}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">{tsd('whitelist.email')}</SelectItem>
              <SelectItem value="domain">{tsd('whitelist.domain')}</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!value.trim() || addMutation.isPending} onClick={() => addMutation.mutate()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
