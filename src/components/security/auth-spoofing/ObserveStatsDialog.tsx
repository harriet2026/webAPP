'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useApiRequest } from '@/lib/api/client';
import { getObserveStats } from '@/lib/api/auth-spoofing';
import type { ObserveStatPoint } from '@/types/auth-spoofing';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ObserveStatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ObserveStatsDialog({ open, onOpenChange }: ObserveStatsDialogProps) {
  const t = useTranslations('authSpoofing');
  const { apiRequest } = useApiRequest();
  const [days, setDays] = useState(7);

  const { data, isLoading } = useQuery({
    queryKey: ['auth-spoofing-observe-stats', days],
    queryFn: () => getObserveStats(days, apiRequest),
    enabled: open,
  });

  const points = data?.points ?? [];
  const daysMap = new Map<string, number>();
  for (const p of points) {
    const total = daysMap.get(p.day) ?? 0;
    daysMap.set(p.day, total + p.hits);
  }
  const sortedDays = [...daysMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const maxHits = Math.max(...sortedDays.map(([, h]) => h), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('observeStats.title')}</DialogTitle>
          <DialogDescription>{t('observeStats.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              variant={days === d ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d} {t('observeStats.days')}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : sortedDays.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            {t('observeStats.noData')}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedDays.map(([day, hits]) => (
              <div key={day} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground min-w-[80px]">{day}</span>
                <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                      hits > 0 ? 'bg-chart-1' : 'bg-transparent',
                    )}
                    style={{ width: `${Math.max((hits / maxHits) * 100, hits > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <span className="text-xs font-medium min-w-[40px] text-right">{hits}</span>
              </div>
            ))}
          </div>
        )}

        {points.length > 0 && (
          <div className="space-y-1 text-xs text-muted-foreground border-t pt-3 mt-2">
            <div className="font-medium mb-1">{t('observeStats.breakdown')}</div>
            {(() => {
              const byRule = new Map<string, number>();
              for (const p of points) {
                const key = `${p.rule_name}/${p.subkey}`;
                byRule.set(key, (byRule.get(key) ?? 0) + p.hits);
              }
              return [...byRule.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([key, hits]) => (
                  <div key={key} className="flex justify-between">
                    <span>{key}</span>
                    <span>{hits}</span>
                  </div>
                ));
            })()}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('observeStats.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
