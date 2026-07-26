'use client';

import { useTranslations } from 'next-intl';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DIMENSION_CONFIG, type DimensionType } from './columns';

interface DimensionTabsProps {
  dimension: DimensionType;
  onSelect: (dim: DimensionType) => void;
  isPlatformScope: boolean;
}

const ALL_DIMENSIONS = Object.keys(DIMENSION_CONFIG) as DimensionType[];

export function DimensionTabs({ dimension, onSelect, isPlatformScope }: DimensionTabsProps) {
  const t = useTranslations('opsTopTrend');

  const dimensions = isPlatformScope
    ? ALL_DIMENSIONS
    : ALL_DIMENSIONS.filter((d) => d !== 'connection');

  return (
    <div className="flex gap-1 rounded-[10px] bg-card p-2 shadow-sm">
      {dimensions.map((dim) => {
        const cfg = DIMENSION_CONFIG[dim];
        const Icon = cfg.icon;
        const isActive = dimension === dim;
        return (
          <Tooltip key={dim}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  data-testid={`ops-dim-${dim}`}
                  onClick={() => onSelect(dim)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  }`}
                  style={isActive ? { backgroundColor: cfg.color } : undefined}
                />
              }
            >
              <Icon className="h-4 w-4" />
              <span>{t(cfg.labelKey)}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>{t(cfg.tipKey)}</p>
              {/* SMTP-session caliber note — connection dim only. The session vs
                  message-counting seam is the most surprising thing about this
                  tab, so the tooltip must call it out (spec §8.3). */}
              {dim === 'connection' ? (
                <p className="mt-1 border-t border-border/40 pt-1 text-xs text-muted-foreground">
                  {t('connCaliberTip')}
                </p>
              ) : null}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
