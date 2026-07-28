'use client';

import { Mail, User, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { UserListView, UserListAction } from '@/lib/api/user-list';

// GT-12500：修改时间按本地时区展示（分钟精度，与 sender-filter 列表同款）。
function formatLocalMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// D-003: admin can only read + delete user-list rules — no edit affordance.
const ACTION_VARIANT: Record<UserListAction, string> = {
  block: 'border-rose-200/80 bg-rose-500/10 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-300',
  quarantine: 'border-amber-200/80 bg-amber-500/10 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300',
  whitelist: 'border-emerald-200/80 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-300',
};

export function UserListTable(props: {
  rows: UserListView[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: (ids: number[], checked: boolean) => void;
  onDelete: (row: UserListView) => void;
}) {
  const t = useTranslations('userList');
  const { rows, selectedIds } = props;
  const pageIds = rows.map((r) => r.id);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const actionLabel = (a: UserListAction) => (a === 'block' ? t('block') : a === 'quarantine' ? t('quarantine') : t('allow'));

  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={(c) => props.onToggleAll(pageIds, Boolean(c))}
                  aria-label="全选"
                />
              </TableHead>
              <TableHead className="min-w-28">{t('ruleId')}</TableHead>
              <TableHead className="min-w-32">{t('sender')}</TableHead>
              <TableHead className="min-w-32">{t('recipient')}</TableHead>
              <TableHead className="w-24">{t('action')}</TableHead>
              <TableHead className="w-20">{t('status')}</TableHead>
              <TableHead className="min-w-32">{t('createdBy')}</TableHead>
              <TableHead className="min-w-36">{t('modifyTime')}</TableHead>
              <TableHead className="w-24 text-right">{t('operation')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {t('noData')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className={selectedIds.has(r.id) ? 'bg-primary/5' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(r.id)}
                      onCheckedChange={() => props.onToggleRow(r.id)}
                      aria-label={`选择 ${r.ruleId}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.ruleId}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <Mail className="inline size-3.5 mr-1 text-muted-foreground" />
                    {r.sender}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <User className="inline size-3.5 mr-1 text-muted-foreground" />
                    {r.recipient}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ACTION_VARIANT[r.action]}>
                      {actionLabel(r.action)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'enabled' ? 'default' : 'secondary'}>
                      {r.status === 'enabled' ? t('enabled') : t('disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.createdBy}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatLocalMinute(r.modifyTime)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            aria-label={t('delete')}
                            onClick={() => props.onDelete(r)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        }
                      />
                      <TooltipContent>{t('delete')}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
