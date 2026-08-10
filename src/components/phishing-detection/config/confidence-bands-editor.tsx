'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { BandDisposition, PhishBand } from '@/types/phishing-config';

const MAX_PREFIX_LEN = 20;

// BandValidationError carries a stable i18n code (+ interpolation values) so the
// caller can localize the message. Returning raw strings here would render
// untranslated text to en/ru/th operators.
export type BandValidationError = { code: string; values?: Record<string, number> };

export function validateBandsContiguous(
  bands: { min: number; max: number }[],
): BandValidationError | null {
  if (!bands.length) return { code: 'empty' };
  const s = [...bands].sort((a, b) => a.min - b.min);
  if (s[0].min !== 0) return { code: 'mustStartAt0' };
  if (s[s.length - 1].max !== 100) return { code: 'mustEndAt100' };
  for (let i = 0; i < s.length; i++) {
    if (s[i].min >= s[i].max) return { code: 'minLtMax', values: { min: s[i].min, max: s[i].max } };
    if (i > 0 && s[i].min !== s[i - 1].max) {
      return { code: 'contiguous' };
    }
  }
  return null;
}

export function defaultBands(): PhishBand[] {
  return [
    { min: 0, max: 40, disposition: 'accept' },
    { min: 40, max: 70, disposition: 'mark', mark_positions: ['subject_prefix'], mark_text: '[可疑]' },
    { min: 70, max: 90, disposition: 'quarantine' },
    { min: 90, max: 100, disposition: 'quarantine' },
  ];
}

function truncPrefix(text: string): { value: string; truncated: boolean } {
  if (text.length <= MAX_PREFIX_LEN) return { value: text, truncated: false };
  return { value: text.slice(0, MAX_PREFIX_LEN), truncated: true };
}

interface Props {
  bands: PhishBand[];
  onChange: (next: PhishBand[]) => void;
  // observe mode disables the whole table (Plan 5 / O6 / TC-13).
  disabled: boolean;
}

// Controlled confidence-band table. This used to be a self-contained Card
// with its own query/mutation/save button; per the disposition-policy PRD it
// is now embedded directly inside the "处置策略" card and shares that card's
// single Save/Cancel — so it only renders the table + row editing here.
export function ConfidenceBandsTable({ bands, onChange, disabled }: Props) {
  const t = useTranslations('phishingConfig.bands');

  const errMsg = validateBandsContiguous(bands);
  const errText = errMsg ? t(`validation.${errMsg.code}`, errMsg.values) : null;

  const patchBand = (idx: number, patch: Partial<PhishBand>) => {
    onChange(bands.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const setMin = (idx: number, v: number) => patchBand(idx, { min: v });
  const setMax = (idx: number, v: number) => patchBand(idx, { max: v });
  const setDisposition = (idx: number, d: BandDisposition) => {
    const patch: Partial<PhishBand> = { disposition: d };
    if (d === 'mark') {
      const cur = bands[idx];
      if (!cur?.mark_positions?.length) patch.mark_positions = ['subject_prefix'];
      if (!cur?.mark_text) patch.mark_text = '[可疑]';
    }
    patchBand(idx, patch);
  };
  const setMarkText = (idx: number, text: string) => {
    const { value, truncated } = truncPrefix(text);
    if (truncated) toast.message(t('prefixTruncated', { max: MAX_PREFIX_LEN }));
    patchBand(idx, { mark_text: value });
  };
  const togglePosition = (idx: number, pos: string) => {
    const cur = bands[idx];
    const positions = new Set(cur?.mark_positions ?? []);
    if (positions.has(pos)) positions.delete(pos);
    else positions.add(pos);
    patchBand(idx, { mark_positions: Array.from(positions) });
  };

  return (
    <div className="space-y-3" data-testid="confidence-bands-editor">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-32">{t('colRange')}</TableHead>
              <TableHead className="min-w-28">{t('colDisposition')}</TableHead>
              <TableHead className="min-w-48">{t('colMarkSettings')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bands.map((band, idx) => (
              <TableRow key={`band-${idx}`} data-testid={`band-row-${idx}`}>
                <TableCell className="py-2">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-7 w-14"
                      value={band.min}
                      disabled={disabled}
                      onChange={(e) => setMin(idx, Number(e.target.value))}
                      data-testid={`band-min-${idx}`}
                    />
                    <span className="text-muted-foreground">–</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-7 w-14"
                      value={band.max}
                      disabled={disabled}
                      onChange={(e) => setMax(idx, Number(e.target.value))}
                      data-testid={`band-max-${idx}`}
                    />
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <DispositionSelect
                    value={band.disposition}
                    disabled={disabled}
                    onChange={(d) => setDisposition(idx, d)}
                    testId={`band-disposition-${idx}`}
                  />
                </TableCell>
                <TableCell className="py-2">
                  {band.disposition === 'mark' ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap gap-2">
                        {(['subject_prefix', 'header'] as const).map((pos) => (
                          <label key={pos} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={band.mark_positions?.includes(pos) ?? false}
                              disabled={disabled}
                              onChange={() => togglePosition(idx, pos)}
                              data-testid={`band-mark-pos-${idx}-${pos}`}
                            />
                            {t(`markPosition.${pos}`)}
                            {pos === 'header' && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger render={<HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />} />
                                  <TooltipContent className="max-w-xs text-xs">
                                    {t('markPosition.headerHint')}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </label>
                        ))}
                      </div>
                      <Input
                        className="h-7 w-40 text-xs"
                        value={band.mark_text ?? ''}
                        disabled={disabled}
                        onChange={(e) => setMarkText(idx, e.target.value)}
                        placeholder={t('markTextPlaceholder')}
                        data-testid={`band-mark-text-${idx}`}
                      />
                      {(band.mark_text ?? '').length >= MAX_PREFIX_LEN ? (
                        <p className="text-[10px] text-muted-foreground">
                          {t('prefixTruncatedHint', { max: MAX_PREFIX_LEN })}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {errMsg ? (
        <p
          className="text-sm font-medium text-destructive"
          data-testid="bands-validation-error"
          role="alert"
        >
          {errText}
        </p>
      ) : null}
    </div>
  );
}

function DispositionSelect({
  value,
  disabled,
  onChange,
  testId,
}: {
  value: BandDisposition;
  disabled?: boolean;
  onChange: (v: BandDisposition) => void;
  testId?: string;
}) {
  const t = useTranslations('phishingConfig.bands');
  const options: Array<{ value: BandDisposition; label: string }> = [
    { value: 'accept', label: t('disposition.accept') },
    { value: 'mark', label: t('disposition.mark') },
    { value: 'quarantine', label: t('disposition.quarantine') },
  ];

  const colorClass: Record<BandDisposition, string> = {
    accept: 'border-input',
    mark: 'border-yellow-500/60 text-yellow-700 dark:text-yellow-400',
    quarantine: 'border-destructive/60 text-destructive',
  };

  return (
    <div className="space-y-1" data-testid={testId}>
      <select
        className={`h-7 rounded-md border bg-transparent px-2 text-xs font-medium ${colorClass[value]}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as BandDisposition)}
        data-testid={`${testId}-native`}
      >
        {options.map((opt) => (
          <option key={opt.label} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
