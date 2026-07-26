'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useBackupDetail } from './hooks';
import type { BackupTask } from '@/types/monitoring';

interface BackupLogDrawerProps {
  node: string;
  task: BackupTask;
}

export function BackupLogDrawer({ node, task }: BackupLogDrawerProps) {
  const t = useTranslations('infrastructure');
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useBackupDetail(node, task.id, open);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        data-testid={`monitor-infrastructure-backup-log-${task.id}`}
        render={
          <button className="text-sm text-primary hover:underline" />
        }
      >
        {t('storage.viewLog')}
      </SheetTrigger>
      <SheetContent
        className="p-0 data-[side=right]:w-[min(100vw,560px)] data-[side=right]:max-w-none"
        data-testid="monitor-infrastructure-backup-log-drawer"
      >
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <SheetTitle data-testid="monitor-infrastructure-backup-log-title">
            {t('storage.logTitle', { name: task.name })}
          </SheetTitle>
          <SheetDescription>
            {t('storage.logDescription', { time: task.exec_time, node })}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-3" data-testid="monitor-infrastructure-backup-log-loading">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive" data-testid="monitor-infrastructure-backup-log-error">
              {t('storage.logLoadError')}
            </p>
          ) : data?.log ? (
            <pre
              className="whitespace-pre-wrap break-words rounded-lg border bg-muted p-4 font-mono text-xs leading-5"
              data-testid="monitor-infrastructure-backup-log-content"
            >
              {data.log}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="monitor-infrastructure-backup-log-empty">
              {t('storage.logEmpty')}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
