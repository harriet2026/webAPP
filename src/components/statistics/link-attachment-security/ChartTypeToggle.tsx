'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { LineChart, AreaChart } from 'lucide-react';

interface ChartTypeToggleProps {
  value: 'line' | 'area';
  onChange: (v: 'line' | 'area') => void;
}

export function ChartTypeToggle({ value, onChange }: ChartTypeToggleProps) {
  const t = useTranslations('linkAttachmentSecurity');

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
      <Button
        variant={value === 'line' ? 'default' : 'ghost'}
        size="sm"
        className="h-7 px-2.5"
        onClick={() => onChange('line')}
      >
        <LineChart className="h-3.5 w-3.5" />
        <span className="text-xs">{t('chartType.line')}</span>
      </Button>
      <Button
        variant={value === 'area' ? 'default' : 'ghost'}
        size="sm"
        className="h-7 px-2.5"
        onClick={() => onChange('area')}
      >
        <AreaChart className="h-3.5 w-3.5" />
        <span className="text-xs">{t('chartType.area')}</span>
      </Button>
    </div>
  );
}
