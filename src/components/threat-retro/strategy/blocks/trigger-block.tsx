'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LOOKBACK_OPTIONS, QUICK_ADD, quickAddTimes } from '../strategy-defaults';
import { SectionTitle } from './basic-info-block';
import type { ThreatRetroStrategy } from '@/types/threat-retro';

interface Props {
  draft: ThreatRetroStrategy;
  patch: (p: Partial<ThreatRetroStrategy>) => void;
  errors: {
    confidence?: string;
    cooldown?: string;
    listenSources?: string;
    runTimes?: string;
    lookback?: string;
  };
  overlapConflict: string | null;
}

export function TriggerBlock({ draft, patch, errors, overlapConflict }: Props) {
  const t = useTranslations('threatRetroStrategy.trigger');
  const tLookback = useTranslations('threatRetroStrategy.lookback');
  const [timeInput, setTimeInput] = useState('');

  const addTime = (time: string) => {
    const v = time.trim();
    if (!v || draft.schedule.run_times.includes(v)) return;
    patch({ schedule: { ...draft.schedule, run_times: [...draft.schedule.run_times, v].sort() } });
    setTimeInput('');
  };
  const removeTime = (time: string) =>
    patch({
      schedule: { ...draft.schedule, run_times: draft.schedule.run_times.filter((x) => x !== time) },
    });

  const toggleWeekday = (day: number) => {
    const cur = draft.schedule.weekdays ?? [];
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b);
    patch({ schedule: { ...draft.schedule, weekdays: next } });
  };

  const toggleMonthDay = (day: number) => {
    const cur = draft.schedule.month_days ?? [];
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort((a, b) => a - b);
    patch({ schedule: { ...draft.schedule, month_days: next } });
  };

  const addQuick = (step: number) => {
    const merged = new Set([...draft.schedule.run_times, ...quickAddTimes(step)]);
    patch({ schedule: { ...draft.schedule, run_times: Array.from(merged).sort() } });
  };

  return (
    <section className="space-y-4">
      <SectionTitle index={2} title={t('title')} />

      <>
          <div className="space-y-1.5">
            <Label>{t('runTimes')}</Label>
            <div className="flex flex-wrap gap-1.5" data-testid="strategy-run-times">
              {draft.schedule.run_times.map((time) => (
                <Badge key={time} variant="secondary" className="gap-1">
                  <span className="font-mono text-xs">{time}</span>
                  <button type="button" onClick={() => removeTime(time)} aria-label="remove">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {draft.schedule.run_times.length === 0 ? (
                <span className="text-xs text-muted-foreground">{t('noRunTimes')}</span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Input
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="w-32"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => addTime(timeInput)}>
                {t('addTime')}
              </Button>
            </div>
            {errors.runTimes ? (
              <p className="text-xs text-destructive">{t('runTimesRequired')}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>{t('quickAdd')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ADD.map((q) => (
                <Button
                  key={q.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={q.testId}
                  onClick={() => addQuick(q.stepMinutes)}
                >
                  {t(`quick.${q.key}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('weekdays')}</Label>
            <div className="flex flex-wrap gap-1.5" data-testid="strategy-weekdays">
              {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                const active = (draft.schedule.weekdays ?? []).includes(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    onClick={() => toggleWeekday(day)}
                  >
                    {t(`weekdayShort.${day}`)}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t('weekdaysHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t('monthDays')}</Label>
            <div className="grid grid-cols-7 gap-1" data-testid="strategy-month-days">
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
                const active = (draft.schedule.month_days ?? []).includes(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="h-8 px-0"
                    onClick={() => toggleMonthDay(day)}
                  >
                    {day}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t('monthDaysHint')}</p>
          </div>

          {overlapConflict ? (
            <p
              className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              data-testid="strategy-overlap-warn"
            >
              {t('overlapWarn', { name: overlapConflict })}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="lookback">{t('lookbackWindow')}</Label>
            <Select
              value={String(draft.lookback_window_minutes)}
              onValueChange={(v) => patch({ lookback_window_minutes: Number(v) })}
            >
              <SelectTrigger id="lookback" className="w-40" data-testid="strategy-lookback">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOOKBACK_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {tLookback(`opt.${opt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.lookback ? (
              <p className="text-xs text-destructive">{t('lookbackRange')}</p>
            ) : null}
          </div>
      </>
    </section>
  );
}
