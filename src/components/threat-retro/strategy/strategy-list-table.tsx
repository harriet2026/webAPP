'use client';

import { useMemo, useState } from 'react';
import { Copy, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/shared/empty-state';
import type { ThreatRetroStrategy } from '@/types/threat-retro';

interface Props {
  data: ThreatRetroStrategy[];
  isLoading?: boolean;
  isAdmin: boolean;
  onEdit: (s: ThreatRetroStrategy) => void;
  onClone: (s: ThreatRetroStrategy) => void;
  onDelete: (s: ThreatRetroStrategy) => void;
  onToggle: (s: ThreatRetroStrategy, enabled: boolean) => void;
  onCreate: () => void;
}

function modeBadgeClass(mode: 'realtime' | 'deep'): string {
  return mode === 'realtime'
    ? 'border-transparent bg-rose-500/15 text-rose-700 dark:text-rose-300'
    : 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300';
}

function triggerSummary(s: ThreatRetroStrategy, t: ReturnType<typeof useTranslations>): string {
  if (s.mode === 'realtime') {
    return t('list.realtimeUnsupportedSummary');
  }
  return t('list.deepSummary', {
    times: s.schedule.run_times.length,
    lookback: s.lookback_window_minutes,
  });
}

export function StrategyListTable({
  data,
  isLoading,
  isAdmin,
  onEdit,
  onClone,
  onDelete,
  onToggle,
  onCreate,
}: Props) {
  const t = useTranslations('threatRetroStrategy');
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return data;
    return data.filter((s) => s.name.toLowerCase().includes(k));
  }, [data, keyword]);

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-medium">{t('list.title')}</h3>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="h-9 w-64 pl-8"
          />
        </div>
        <Button onClick={onCreate} disabled={!isAdmin} data-testid="strategy-add" className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t('list.create')}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-muted/20">{t('list.colName')}</TableHead>
			  <TableHead className="bg-muted/20">{t('list.colMode')}</TableHead>
              <TableHead className="bg-muted/20">{t('list.colTrigger')}</TableHead>
              <TableHead className="bg-muted/20">{t('list.colStatus')}</TableHead>
              <TableHead className="bg-muted/20">{t('list.colStats')}</TableHead>
              <TableHead className="bg-muted/20">{t('list.colNextRun')}</TableHead>
              <TableHead className="bg-muted/20 text-right">{t('list.colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
				<TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
				<TableCell colSpan={7} className="h-24">
                  <EmptyState title={t('list.empty')} />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id ?? s.name}>
                  <TableCell>
					<div className="flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color_dot || '#1677FF' }} />
                        <span className="font-medium">{s.name}</span>
                    </div>
                  </TableCell>
				  <TableCell>
					<Badge className={modeBadgeClass(s.mode)}>
					  {s.mode === 'realtime' ? t('list.modeBadge.realtimeUnsupported') : t('list.modeBadge.deep')}
					</Badge>
				  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {triggerSummary(s, t)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={s.status === 'enabled'}
                      disabled={!isAdmin || s.mode === 'realtime'}
                      aria-label={t('list.colStatus')}
                      onCheckedChange={(v) => onToggle(s, Boolean(v))}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.stats
                      ? t('list.stats', {
                          triggers: s.stats.triggers,
                          found: s.stats.leaks_found,
                          recalled: s.stats.recalled,
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.next_run ? s.next_run.replace('T', ' ').replace(/:\d{2}([+-])/, '$1') : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="ghost" size="icon" title={t('list.edit')} aria-label={t('list.edit')} disabled={!isAdmin || s.mode === 'realtime'} onClick={() => onEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('list.clone')}
                        aria-label={t('list.clone')}
                        disabled={!isAdmin || s.mode === 'realtime'}
                        onClick={() => onClone(s)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('list.delete')}
                        aria-label={t('list.delete')}
                        className="text-destructive"
                        disabled={!isAdmin}
                        onClick={() => onDelete(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
