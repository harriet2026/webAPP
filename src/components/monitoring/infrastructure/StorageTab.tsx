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

// 分区用量的档位是**唯一**判据来源：进度条配色与 data-level 都从这里派生，
// 所以 QC 用例断言 data-level 等价于断言配色（expect_attribute 的白名单不含
// class，配色判据只能靠语义属性表达）。阈值沿用原 usageColor 的 >=（注意与
// ProcessesTab 的 overlay2Color 用 > 不同，两处不可互抄）。
function usageLevel(pct: number): 'critical' | 'warning' | 'normal' {
  if (pct >= 95) return 'critical';
  if (pct >= 85) return 'warning';
  return 'normal';
}

const USAGE_BAR_CLASS: Record<ReturnType<typeof usageLevel>, string> = {
  critical: 'bg-red-500',
  warning: 'bg-yellow-500',
  normal: 'bg-green-500',
};

function usageColor(pct: number) {
  return USAGE_BAR_CLASS[usageLevel(pct)];
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
                      data-testid="storage-partition-bar"
                      data-level={usageLevel(p.usage_pct)}
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
