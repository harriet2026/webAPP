'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Clock, ShieldX, FileX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DegradedBanner({ message }: { message?: string }) {
  const t = useTranslations('mailflow');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message ?? t('agentOffline')}</span>
    </div>
  );
}

export function TimeoutBanner({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('mailflow');
  return (
    <div className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300">
      <Clock className="h-4 w-4 shrink-0" />
      <span>{t('loadTimeout')}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const t = useTranslations('mailflow');
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <FileX className="h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-medium">{message ?? t('noData')}</h3>
    </div>
  );
}

export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <ShieldX className="h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-medium">403</h3>
      <p className="mt-2 text-sm text-muted-foreground">Forbidden</p>
    </div>
  );
}
