'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, ChevronDown, ChevronUp, ServerOff, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Direction, QueueHealth, QueueHealthSingle } from '@/lib/api/delivery-traffic';
import { isQueueHealthAll } from '@/lib/api/delivery-traffic';

interface QueueHealthCardProps {
  queueHealth?: QueueHealth;
  direction: Direction;
  isLoading: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const BACKGROUND: Record<Direction, string> = {
  all: 'bg-gray-50 dark:bg-gray-800',
  receive: 'bg-sky-50 dark:bg-sky-950/20',
  send: 'bg-emerald-50 dark:bg-emerald-950/20',
  internal: 'bg-violet-50 dark:bg-violet-950/20',
};

function QueueAlert({ current }: { current: number }) {
  const t = useTranslations('deliveryTraffic.queueHealth');
  if (current <= 1000) return null;
  return (
    <Badge variant="destructive" className="animate-pulse" data-testid="delivery-queue-alert">
      <AlertTriangle className="h-3.5 w-3.5" />{t('warning')}
    </Badge>
  );
}

export function QueueHealthCard({ queueHealth, direction, isLoading }: QueueHealthCardProps) {
  const t = useTranslations('deliveryTraffic');
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div></CardContent></Card>
    );
  }

  if (!queueHealth) {
    return (
      <Card className="border-destructive/30 bg-destructive/5" data-testid="delivery-queue-offline">
        <CardContent className="flex items-center gap-3 py-6 text-destructive"><ServerOff className="h-5 w-5" /><span className="font-medium">{t('queueHealth.offline')}</span></CardContent>
      </Card>
    );
  }

  const single = !isQueueHealthAll(queueHealth) ? queueHealth as QueueHealthSingle : null;

  return (
      <Card className={`${BACKGROUND[direction]} rounded-xl shadow-sm backdrop-blur-none`} data-testid="delivery-queue-health">
        <CardHeader className="grid-rows-[auto_auto] pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4" />{t('queueHealth.title')}</CardTitle>
              {single && <QueueAlert current={single.current} />}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={expanded ? t('queueHealth.collapse') : t('queueHealth.expand')}
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              data-testid="delivery-queue-expand"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isQueueHealthAll(queueHealth) ? (
            <div className="grid grid-cols-3 gap-4">
              {([
                ['receive', 'text-blue-600 dark:text-blue-400'],
                ['send', 'text-green-600 dark:text-green-400'],
                ['internal', 'text-purple-600 dark:text-purple-400'],
              ] as const).map(([key, tone]) => (
                <div key={key} className="text-center">
                  <div className="text-sm text-muted-foreground">{t(`queueHealth.${key}Queue`)}</div>
                  <div className={`text-xl font-bold tabular-nums ${tone}`}>{queueHealth[key].toLocaleString()}</div>
                </div>
              ))}
            </div>
          ) : direction === 'internal' ? (
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              <span className="font-medium text-green-600 dark:text-green-400">{t('queueHealth.internalHealthy')}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('queueHealth.currentLength')}</span>
                <span className="font-medium tabular-nums">{queueHealth.current.toLocaleString()}</span>
              </div>
              {expanded && <>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{t('queueHealth.oldestAge')}</span>
                  <span className="font-medium tabular-nums">{formatDuration(queueHealth.oldest_age_ms)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">{single?.top_domain ? t('queueHealth.topDomain') : t('queueHealth.processingRate')}</span>
                  <span className="font-medium tabular-nums">
                    {single?.top_domain ? `${single.top_domain} (${single.top_domain_count ?? 0})` : `${queueHealth.processing_rate.toFixed(1)}/s`}
                  </span>
                </div>
              </>}
            </div>
          )}
        </CardContent>
      </Card>
  );
}
