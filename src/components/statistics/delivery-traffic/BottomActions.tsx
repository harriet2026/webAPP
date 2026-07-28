'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { exportDeliveryTrafficCsvUrl, type Direction } from '@/lib/api/delivery-traffic';
import { isMockEnabled } from '@/lib/mock/storage';
import { mockDeliveryTrafficCsv } from '@/lib/mock/fixtures';

interface BottomActionsProps {
  startDate: string;
  endDate: string;
  direction: Direction;
  tenantId: number | null;
  disabled: boolean;
}

export function BottomActions({ startDate, endDate, direction, tenantId, disabled }: BottomActionsProps) {
  const t = useTranslations('deliveryTraffic.bottomActions');
  const tCommon = useTranslations('common');

  const csvUrl = useMemo(() => {
    if (isMockEnabled()) {
      const csv = mockDeliveryTrafficCsv(direction, startDate, endDate);
      return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    }
    return exportDeliveryTrafficCsvUrl({ startDate, endDate, direction, tenantId });
  }, [startDate, endDate, direction, tenantId]);

  const filename = `delivery-traffic-${direction}-${startDate}-${endDate}.csv`;

  const action = (button: React.ReactNode) => disabled ? (
    <Tooltip><TooltipTrigger render={<span className="inline-flex" />}>{button}</TooltipTrigger><TooltipContent>{tCommon('accessDenied')}</TooltipContent></Tooltip>
  ) : button;

  const csvButton = <Button variant="outline" size="sm" disabled={disabled}><Download className="h-4 w-4" />{t('exportCsv')}</Button>;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm" data-testid="delivery-bottom-actions">
        {disabled ? action(csvButton) : <a href={csvUrl} download={filename}>{csvButton}</a>}
      </div>
    </TooltipProvider>
  );
}
