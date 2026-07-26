'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { ThreatRetroStrategy } from '@/types/threat-retro';

interface Props {
  draft: ThreatRetroStrategy;
  patch: (p: Partial<ThreatRetroStrategy>) => void;
  errors: { name?: string };
}

export function BasicInfoBlock({ draft, patch, errors }: Props) {
  const t = useTranslations('threatRetroStrategy.basicInfo');
  return (
    <section className="space-y-4">
      <SectionTitle index={1} title={t('title')} />

      <div className="space-y-1.5">
        <Label htmlFor="strategy-name">{t('name')}</Label>
        <Input
          id="strategy-name"
          data-testid="strategy-name-input"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          className={cn(errors.name && 'border-destructive')}
          placeholder={t('namePlaceholder')}
        />
        {errors.name ? (
          <p className="text-xs text-destructive">{t('nameRequired')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>{t('status')}</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('statusHint')}</p>
        </div>
        <Switch
          checked={draft.status === 'enabled'}
          onCheckedChange={(v) => patch({ status: v ? 'enabled' : 'disabled' })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t('mode')}</Label>
        <Input value={t('modeDeep')} disabled data-testid="strategy-mode-deep" />
      </div>
    </section>
  );
}

export function SectionTitle({ index, title }: { index: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        {index}
      </span>
      <h4 className="text-sm font-semibold">{title}</h4>
    </div>
  );
}
