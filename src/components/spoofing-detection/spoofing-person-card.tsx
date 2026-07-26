'use client';

import { useTranslations } from 'next-intl';
import { Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { SpoofPersonDTO } from '@/types/spoofing-detection';

const LEVEL_CLS: Record<string, string> = {
  high: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  medium: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  low: 'bg-muted text-muted-foreground',
};

// tryT returns the translation for `key` if it exists, else `fallback`.
// Guard against next-intl rendering the raw key path when backend returns a
// value not in the i18n vocabulary (GT-11656/11658 'all all' symptom).
function tryT(t: (key: string) => string, key: string, fallback: string): string {
  const raw = t(key);
  return raw === key ? fallback : raw;
}

export function SpoofingPersonCard({ person, selected, disabled, onSelect, onObserve, onEdit, onDelete }: {
  person: SpoofPersonDTO;
  selected: boolean;
  disabled?: boolean;
  onSelect: (c: boolean) => void;
  onObserve: (next: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tsd = useTranslations('spoofingDetection');
  // i18n keys are fixed vocabularies (level: high/medium/low; category:
  // executive/finance/business/hr/tech/custom). If backend ever returns a
  // value outside the known set (e.g. legacy 'all' filter leaked into data,
  // or a new category not yet in i18n), next-intl renders the raw key path
  // (GT-11656 'all all' symptom). Fall back to a localized placeholder so
  // the user never sees a raw key string.
  const levelLabel = tryT(tsd, `person.level.${person.protection_level}`, tsd('person.levelUnknown'));
  const categoryLabel = tryT(tsd, `person.category.${person.category}`, tsd('person.categoryUnknown'));
  const primaryEmail = person.legit_emails?.[0]?.email ?? '-';
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-accent/40',
      person.observe_mode ? 'border-dashed border-amber-300' : 'border-border/70')}>
      <Checkbox checked={selected} disabled={disabled} onCheckedChange={(c) => onSelect(!!c)} />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-sm font-medium text-blue-700 dark:text-blue-300">
        {(person.display_name || '?').slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{person.display_name}</span>
          <Badge variant="outline" className={cn('shrink-0 px-1.5 py-0 text-[10px]', LEVEL_CLS[person.protection_level])}>
            {levelLabel}
          </Badge>
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
            {categoryLabel}
          </Badge>
          {person.read_only ? <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">{tsd('inheritedReadOnly')}</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {primaryEmail}
        </p>
      </div>
      <div className="hidden w-40 shrink-0 flex-col lg:flex">
        <span className="text-[11px] text-muted-foreground">{tsd('person.legitEmails')}</span>
        <span className="truncate text-xs">{primaryEmail}</span>
      </div>
      <div className="hidden w-32 shrink-0 flex-col xl:flex">
        <span className="text-[11px] text-muted-foreground">{tsd('person.detectionConfig')}</span>
        <span className="text-xs">
          {tsd('person.sensitivityShort')} {person.sensitivity} · {tsd('person.thresholdShort')} {person.confidence_threshold}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={cn('hidden text-xs sm:inline', person.observe_mode ? 'text-amber-600' : 'text-muted-foreground')}>
          {person.observe_mode ? tsd('person.observe') : tsd('person.detect')}
        </span>
        <Switch aria-label={person.observe_mode ? tsd('person.observe') : tsd('person.detect')}
          checked={person.observe_mode} disabled={disabled} onCheckedChange={onObserve} />
      </div>
      <div className="flex shrink-0 items-center">
        <Button aria-label={tsd('person.edit')} title={tsd('person.edit')} variant="ghost" size="icon" className="h-8 w-8" disabled={disabled} onClick={onEdit}><Edit className="h-3.5 w-3.5" /></Button>
        <Button aria-label={tsd('person.delete')} title={tsd('person.delete')} variant="ghost" size="icon" className="h-8 w-8 text-rose-500" disabled={disabled} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
