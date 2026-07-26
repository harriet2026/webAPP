'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/auth-context';
import { useApiRequest } from '@/lib/api/client';
import { addPasswordBookEntry, deletePasswordBookEntry, listPasswordBook } from '@/lib/api/attachment-security';
import type { PasswordBookEntry } from '@/types/attachment-security';

export function PasswordBookTable() {
  const t = useTranslations('attachmentSecurity.encrypted.passwordBook');
  const validation = useTranslations('attachmentSecurity.validation');
  const { isSystemAdmin } = useAuth();
  const { apiRequest } = useApiRequest();
  const [entries, setEntries] = useState<PasswordBookEntry[]>([]);
  const [loading, setLoading] = useState(isSystemAdmin);
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadEntries = useCallback(async () => {
    if (!isSystemAdmin) return;
    setLoading(true);
    try {
      setEntries(await listPasswordBook(apiRequest));
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [apiRequest, isSystemAdmin, t]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleAdd = async () => {
    const next = password.trim();
    if (!next) {
      toast.error(validation('emptyPassword'));
      return;
    }
    if (entries.some((entry) => entry.password === next)) {
      toast.error(validation('duplicatePassword'));
      return;
    }
    setAdding(true);
    try {
      const created = await addPasswordBookEntry(next, null, apiRequest);
      setEntries((current) => [...current, created]);
      setPassword('');
      toast.success(t('addSuccess'));
    } catch {
      toast.error(t('addFailed'));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deletePasswordBookEntry(id, apiRequest);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      toast.success(t('deleteSuccess'));
    } catch {
      toast.error(t('deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  };

  if (!isSystemAdmin) {
    return (
      <section className="rounded-lg border border-border/70 bg-muted/30 p-4" data-testid="password-book-restricted">
        <Label className="font-medium">{t('globalTitle')}</Label>
        <p className="mt-2 text-sm text-muted-foreground">{t('systemAdminOnly')}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4" data-testid="password-book-table">
      <Label className="font-medium">{t('globalTitle')}</Label>

      {loading ? (
        <div className="flex justify-center py-6" data-testid="password-book-loading"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border bg-background py-6 text-center text-sm text-muted-foreground" data-testid="password-book-empty">{t('empty')}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">{t('password')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('createdAt')}</th>
                <th className="w-20 px-3 py-2 text-left font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0" data-testid={`password-book-row-${entry.id}`}>
                  <td className="px-3 py-2 font-mono">{entry.password}</td>
                  <td className="px-3 py-2 text-muted-foreground">{entry.created_at.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deletingId === entry.id}
                      aria-label={t('delete')}
                      data-testid={`password-book-delete-${entry.id}`}
                    >
                      {deletingId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" data-testid="password-book-add-form">
        <Input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder={t('newPasswordPlaceholder')}
          className="w-48"
          data-testid="password-book-input"
        />
        <Button variant="outline" size="sm" onClick={handleAdd} disabled={adding} data-testid="password-book-add-btn">
          {adding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
          <span data-testid="password-book-confirm-add">{t('add')}</span>
        </Button>
      </div>
    </section>
  );
}
