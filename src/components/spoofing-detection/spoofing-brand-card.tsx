'use client';

import { useTranslations } from 'next-intl';
import { Shield, Edit, Trash2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SpoofBrandDTO } from '@/types/spoofing-detection';

const MODE_CLS: Record<string, string> = {
  observe: 'border-gray-200 bg-gray-100 text-gray-600',
  standard: 'border-blue-200 bg-blue-100 text-blue-700',
  strict: 'border-red-200 bg-red-100 text-red-700',
  custom: 'border-violet-200 bg-violet-100 text-violet-700',
};

// tryT returns the translation for `key` if it exists, else `fallback`.
// Guard against next-intl rendering the raw key path when backend returns a
// disposition mode not in the i18n vocabulary (GT-11659 'quarantine' raw
// value symptom; same family as GT-11656/11658 'all all').
export function tryT(t: (key: string) => string, key: string, fallback: string): string {
  const raw = t(key);
  return raw === key ? fallback : raw;
}

export function SpoofingBrandCard({ brand, disabled, onObserve, onEdit, onDelete }: {
  brand: SpoofBrandDTO;
  disabled?: boolean;
  onObserve: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tsd = useTranslations('spoofingDetection');
  const modeLabel = tryT(tsd, `brand.mode.${brand.disposition.mode}`, tsd('brand.modeUnknown'));
  const domains = brand.protected_domains?.map((domain) => `${domain.domain} ≤${domain.edit_distance_threshold}`).join(', ') || '—';
  return (
    <div className={cn(
      'group flex items-start gap-4 rounded-lg border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md',
      brand.observe_mode ? 'border-dashed border-amber-300' : 'border-border/70',
    )}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Shield className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{brand.brand_name}</span>
          <Badge variant="outline" className={cn('text-[10px]', MODE_CLS[brand.disposition.mode])}>{modeLabel}</Badge>
          {brand.read_only ? <Badge variant="secondary" className="text-[10px]">{tsd('inheritedReadOnly')}</Badge> : null}
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          {tsd('brand.protectedDomains')}: {domains}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{tsd('brand.confidenceThreshold')}: {brand.confidence_threshold}%</span>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex cursor-help items-center gap-0.5" />}>
              {tsd('brand.keywordsCount', { count: brand.keywords?.length ?? 0 })}
              <Info className="h-3 w-3" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{tsd('brandForm.keywordsHint')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center">
        <span className={cn('hidden text-xs sm:inline', brand.observe_mode ? 'text-amber-600' : 'text-muted-foreground')}>
          {brand.observe_mode ? tsd('person.observe') : tsd('person.detect')}
        </span>
        <Switch aria-label={brand.observe_mode ? tsd('person.observe') : tsd('person.detect')}
          checked={brand.observe_mode} disabled={disabled} onCheckedChange={onObserve} />
        <Button aria-label={tsd('brand.edit')} title={tsd('brand.edit')} variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} onClick={onEdit}><Edit className="h-3.5 w-3.5" /></Button>
        <Button aria-label={tsd('brand.delete')} title={tsd('brand.delete')} variant="ghost" size="icon" className="h-8 w-8 text-rose-500" disabled={disabled} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
