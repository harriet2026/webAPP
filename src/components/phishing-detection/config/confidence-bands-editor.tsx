'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { HelpCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { useApiRequest, ApiError } from '@/lib/api/client';
import { getBands, putBands } from '@/lib/api/phishing-config';
import type { BandDisposition, PhishBand } from '@/types/phishing-config';
import { BandEditDialog } from './band-edit-dialog';

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

interface Props {
  // observe mode disables the whole editor (Plan 5 / O6 / TC-13).
  observeMode: boolean;
}

function isValidationError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  return err.message || null;
}

function defaultBands(): PhishBand[] {
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



export function ConfidenceBandsEditor({ observeMode }: Props) {
  const t = useTranslations('phishingConfig.bands');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const { data: loaded = null, isLoading } = useQuery({
    queryKey: ['phish-bands'],
    queryFn: () => getBands(apiRequest),
  });

  // Local draft: edits apply to a copy of the loaded bands. Save PUTs the
  // full set; cancel/discard reverts by dropping the draft (the next render
  // re-reads `loaded`).
  const [draft, setDraft] = useState<PhishBand[] | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Compute the visible bands: prefer the draft (user edits) over the loaded
  // baseline. Bands are backend-validated to be contiguous 0–100, so an empty
  // loaded array means "never configured" — fall back to the default band set
  // so the operator can edit/seed it. Without this, `[] ?? defaultBands()`
  // keeps the empty array and the editor renders an unrecoverable empty table
  // (TC-12/TC-14).
  const baseline = useMemo(
    () => (loaded && loaded.length > 0 ? loaded : defaultBands()),
    [loaded],
  );
  const bands = draft ?? baseline;
  const hasDraft = draft !== null;

  const errMsg = useMemo(() => validateBandsContiguous(bands), [bands]);
  const errText = errMsg ? t(`validation.${errMsg.code}`, errMsg.values) : null;
  const dirty = useMemo(() => {
    if (!loaded) return false;
    return JSON.stringify(bands) !== JSON.stringify(loaded);
  }, [bands, loaded]);

  const saveMutation = useMutation({
    mutationFn: (next: PhishBand[]) => putBands(next, apiRequest),
    onSuccess: () => {
      toast.success(t('saved'));
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: ['phish-bands'] });
    },
    onError: (err) => toast.error(isValidationError(err) ?? t('saveFailed')),
  });

  const patchBand = (idx: number, patch: Partial<PhishBand>) => {
    setDraft((cur) => {
      const base = cur ?? baseline;
      const next = base.map((b, i) => (i === idx ? { ...b, ...patch } : b));
      return next;
    });
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

  const reset = () => {
    setDraft(null);
  };

  const disabled = observeMode;

  return (
    <Card data-testid="confidence-bands-editor">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {observeMode ? (
          <div
            className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400"
            data-testid="bands-observe-banner"
          >
            {t('observeBanner')}
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('colRange')}</TableHead>
                  <TableHead>{t('colDisposition')}</TableHead>
                  <TableHead>{t('colMarkSettings')}</TableHead>
                  <TableHead className="text-right">{t('colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bands.map((band, idx) => (
                  <TableRow key={`band-${idx}`} data-testid={`band-row-${idx}`}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          className="h-8 w-16"
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
                          className="h-8 w-16"
                          value={band.max}
                          disabled={disabled}
                          onChange={(e) => setMax(idx, Number(e.target.value))}
                          data-testid={`band-max-${idx}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <DispositionSelect
                        value={band.disposition}
                        disabled={disabled}
                        onChange={(d) => setDisposition(idx, d)}
                        testId={`band-disposition-${idx}`}
                      />
                    </TableCell>
                    <TableCell>
                      {band.disposition === 'mark' ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-2">
                            {(['subject_prefix', 'header'] as const).map((pos) => (
                              <label
                                key={pos}
                                className="flex items-center gap-1 text-xs"
                              >
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
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={disabled}
                        onClick={() => setEditingIdx(idx)}
                        aria-label={t('advancedEdit')}
                        data-testid={`band-edit-${idx}`}
                      >
                        {t('advancedEdit')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {errMsg ? (
              <p
                className="text-sm font-medium text-destructive"
                data-testid="bands-validation-error"
                role="alert"
              >
                {errText}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              {hasDraft ? (
                <Button variant="outline" onClick={reset} disabled={disabled}>
                  {t('discard')}
                </Button>
              ) : null}
              <Button
                onClick={() => saveMutation.mutate(bands)}
                disabled={disabled || !!errMsg || !dirty || saveMutation.isPending}
                data-testid="bands-save"
              >
                {saveMutation.isPending ? t('saving') : t('save')}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {editingIdx !== null ? (
        <BandEditDialog
          open
          onOpenChange={(o) => !o && setEditingIdx(null)}
          band={bands[editingIdx]}
          bandIndex={editingIdx}
          disabled={disabled}
          onApply={(next) => {
            patchBand(editingIdx, next);
            setEditingIdx(null);
          }}
        />
      ) : null}
    </Card>
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

  return (
    <div className="space-y-1" data-testid={testId}>
      <select
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
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
