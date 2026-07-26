'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState, DegradedBanner } from './StateBanners';
import { BackupLogDrawer } from './BackupLogDrawer';
import { useStorage, useBackup } from './hooks';
import { degradeMessage } from '@/lib/monitoring/degrade';
import { cn } from '@/lib/utils';

interface StorageTabProps {
  node: string;
}

function usageColor(pct: number) {
  if (pct >= 95) return 'bg-red-500';
  if (pct >= 85) return 'bg-yellow-500';
  return 'bg-green-500';
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number, locale: string) {
  const value = seconds < 60 ? seconds : seconds / 60;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: seconds < 60 ? 'second' : 'minute',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}

export function StorageTab({ node }: StorageTabProps) {
  const t = useTranslations('infrastructure');
  const locale = useLocale();
  const { data: storageData, isLoading: stLoading, isError: stError } = useStorage(node);
  const { data: backupData, isLoading: bkLoading, isError: bkError } = useBackup(node);

  if (stLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[200px] rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    );
  }

  if (stError) {
    return <DegradedBanner message={t('agentOffline')} />;
  }

  const partitions = storageData?.partitions ?? [];
  const tasks = backupData?.tasks ?? [];

  return (
    <div className="space-y-4" data-testid="monitor-infrastructure-storage">
      {storageData?.degraded && (
        <DegradedBanner message={degradeMessage(storageData.degraded_code, t)} />
      )}
      <Card data-testid="monitor-infrastructure-partitions-card">
        <CardHeader>
          <CardTitle>{t('storage.partitions')}</CardTitle>
        </CardHeader>
        <CardContent>
          {partitions.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <div className="space-y-4">
              {partitions.map((p) => (
                <div key={p.device} className="space-y-1.5" data-testid={`monitor-infrastructure-partition-${p.mount.replaceAll('/', '-') || 'root'}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono">
                      {p.device} → {p.mount}
                    </span>
                    <span className="text-muted-foreground">
                      {formatBytes(p.used_bytes)} / {formatBytes(p.total_bytes)} ({p.usage_pct}%)
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-muted">
                    <div
                      className={cn('h-3 rounded-full transition-all', usageColor(p.usage_pct))}
                      style={{ width: `${Math.min(p.usage_pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card data-testid="monitor-infrastructure-backup-card">
        <CardHeader>
          <CardTitle>{t('storage.backupTasks')}</CardTitle>
        </CardHeader>
        <CardContent>
          {backupData?.degraded && (
            <div className="mb-4">
              <DegradedBanner message={degradeMessage(backupData.degraded_code, t)} />
            </div>
          )}
          {bkLoading ? (
            <Skeleton className="h-[120px] w-full rounded-lg" />
          ) : bkError ? (
            <DegradedBanner message={t('storage.logLoadError')} />
          ) : tasks.length === 0 ? (
            <EmptyState message={t('noData')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('storage.name')}</TableHead>
                  <TableHead>{t('storage.execTime')}</TableHead>
                  <TableHead>{t('storage.duration')}</TableHead>
                  <TableHead>{t('storage.size')}</TableHead>
                  <TableHead>{t('storage.status')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} data-testid={`monitor-infrastructure-backup-row-${task.id}`}>
                    <TableCell className="font-mono">{task.name}</TableCell>
                    <TableCell>{task.exec_time}</TableCell>
                    <TableCell>{formatDuration(task.duration, locale)}</TableCell>
                    <TableCell>{formatBytes(task.size)}</TableCell>
                    <TableCell>
                      <Badge variant={task.status === 'success' ? 'default' : 'destructive'}>
                        {task.status === 'success' ? t('storage.statusSuccess') : t('storage.statusFailed')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <BackupLogDrawer node={node} task={task} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
