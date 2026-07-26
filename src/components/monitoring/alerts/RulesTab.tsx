'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SEVERITY_CONFIG } from './severity';
import { useAlertRules, useDeleteAlertRule } from './hooks';
import { EmptyState } from '../infrastructure/StateBanners';
import { AlertRuleEditor } from './AlertRuleEditor';
import type { AlertRule } from '@/types/alerts';

const OP_SYMBOL: Record<string, string> = { gt: '>', ge: '≥', lt: '<', le: '≤', eq: '=' };

export function RulesTab({ onDrawerOpenChange }: { onDrawerOpenChange: (open: boolean) => void }) {
  const t = useTranslations('alertCenter');
  const { data, isLoading, isError, refetch } = useAlertRules();
  const rules = data?.items ?? [];
  const delRule = useDeleteAlertRule();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRule | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<AlertRule | undefined>(undefined);

  useEffect(() => onDrawerOpenChange(open), [open, onDrawerOpenChange]);

  const openNew = () => { setEditing(undefined); setOpen(true); };
  const openEdit = (r: AlertRule) => { setEditing(r); setOpen(true); };
  const cond = (r: AlertRule) =>
    `${OP_SYMBOL[r.operator] ?? r.operator}${r.threshold_crit ?? r.threshold_warn ?? '?'}`;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(undefined);
    try {
      await delRule.mutateAsync(id);
    } catch (e) {
      // 409 (rule has unresolved events) comes back as a conflict error; surface
      // the server message, falling back to the spec wording.
      const msg = (e as { message?: string })?.message ?? t('action.deleteFailed');
      // toast is imported lazily to keep the happy-path import list light
      const { toast } = await import('sonner');
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4" data-testid="alert-rules">
      <div className="flex justify-end">
        <Button onClick={openNew} data-testid="alert-rule-add"><Plus className="mr-2 h-4 w-4" />{t('action.addRule')}</Button>
      </div>
      {isLoading ? (
        <div className="space-y-2" data-testid="alert-rules-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/40 p-6 text-center" data-testid="alert-rules-error">
          <p className="text-sm text-destructive">{t('loadFailed')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()} data-testid="alert-rules-retry">
            {t('retry')}
          </Button>
        </div>
      ) : rules.length === 0 ? (
        <div data-testid="alert-rules-empty"><EmptyState /></div>
      ) : (
        <Card data-testid="alert-rules-table">
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('label.ruleName')}</TableHead>
                  <TableHead>{t('label.condition')}</TableHead>
                  <TableHead>{t('label.severity')}</TableHead>
                  <TableHead>{t('label.enabled')}</TableHead>
                  <TableHead>{t('label.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => {
                  const sev = SEVERITY_CONFIG[r.severity];
                  return (
                    <TableRow key={r.id} data-testid={`rule-row-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="font-mono text-sm">{cond(r)}</TableCell>
                      <TableCell><Badge className={sev.badge}>{t(`severity.${sev.key}`)}</Badge></TableCell>
                      <TableCell data-testid={`rule-enabled-${r.id}`}>{r.enabled ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-gray-400" />}</TableCell>
                      <TableCell className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)} data-testid={`rule-edit-${r.id}`}>{t('action.edit')}</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setPendingDelete(r)}
                          data-testid={`rule-delete-${r.id}`}
                          aria-label={t('action.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[80vw] max-w-none p-0 sm:max-w-none" data-testid="alert-rule-drawer">
          <AlertRuleEditor rule={editing} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(undefined); }}>
        <AlertDialogContent data-testid="rule-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('action.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? t('action.deleteConfirm', { name: pendingDelete.name }) : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} data-testid="rule-delete-confirm">{t('action.confirmDelete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
