'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Clock, ShieldX, FileX } from 'lucide-react';
import { Button } from '@/components/ui/button';

// testId 是可选入参而非写死的字面量：这些状态块在同一个页面里可能渲染多次
// （DeliveryTab 一页就有 4 处 EmptyState），写死会让 Playwright 命中多个节点。
// 默认值即约定的稳定名，调用方需要区分时再显式传入。
export function DegradedBanner({
  message,
  testId = 'monitor-infrastructure-degraded-banner',
}: { message?: string; testId?: string }) {
  const t = useTranslations('infrastructure');
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message ?? t('agentOffline')}</span>
    </div>
  );
}

export function TimeoutBanner({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('infrastructure');
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

export function EmptyState({
  message,
  testId = 'monitor-infrastructure-empty-state',
}: { message?: string; testId?: string }) {
  const t = useTranslations('infrastructure');
  return (
    <div data-testid={testId} className="flex flex-col items-center justify-center py-12">
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
