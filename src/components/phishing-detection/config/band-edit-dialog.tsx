'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { BandDisposition, PhishBand } from '@/types/phishing-config';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  band: PhishBand;
  bandIndex: number;
  disabled?: boolean;
  onApply: (next: Partial<PhishBand>) => void;
}

const DISPOSITIONS: BandDisposition[] = ['accept', 'mark', 'quarantine'];

export function BandEditDialog({
  open,
  onOpenChange,
  band,
  bandIndex,
  disabled,
  onApply,
}: Props) {
  const t = useTranslations('phishingConfig.bands');
  // Draft: snapshot the band into local state on open; apply on OK.
  const [draft, setDraft] = useState<PhishBand>(band);

  useEffect(() => {
    if (open) setDraft({ ...band, mark_positions: [...(band.mark_positions ?? [])] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bandIndex]);

  const patch = (p: Partial<PhishBand>) =>
    setDraft((cur) => ({ ...cur, ...p }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('dialogTitle', { index: bandIndex + 1 })}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="band-min">{t('colMin')}</Label>
              <Input
                id="band-min"
                type="number"
                min={0}
                max={100}
                disabled={disabled}
                value={draft.min}
                onChange={(e) => patch({ min: Number(e.target.value) })}
                data-testid="band-dialog-min"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="band-max">{t('colMax')}</Label>
              <Input
                id="band-max"
                type="number"
                min={0}
                max={100}
                disabled={disabled}
                value={draft.max}
                onChange={(e) => patch({ max: Number(e.target.value) })}
                data-testid="band-dialog-max"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t('colDisposition')}</Label>
            <div className="flex flex-wrap gap-2">
              {DISPOSITIONS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={draft.disposition === d ? 'default' : 'outline'}
                  disabled={disabled}
                  onClick={() => {
                    const p: Partial<PhishBand> = { disposition: d };
                    if (d === 'mark' && !draft.mark_positions?.length) {
                      p.mark_positions = ['subject_prefix'];
                    }
                    patch(p);
                  }}
                  data-testid={`band-dialog-disposition-${d}`}
                >
                  {t(`disposition.${d}`)}
                </Button>
              ))}
            </div>
          </div>

          {draft.disposition === 'mark' ? (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div>
                <Label className="text-xs">{t('markPositionLabel')}</Label>
                <div className="mt-1 flex flex-wrap gap-3">
                  {(['subject_prefix', 'header'] as const).map((pos) => (
                    <label
                      key={pos}
                      className="flex items-center gap-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={draft.mark_positions?.includes(pos) ?? false}
                        disabled={disabled}
                        onChange={() => {
                          const cur = new Set(draft.mark_positions ?? []);
                          if (cur.has(pos)) cur.delete(pos);
                          else cur.add(pos);
                          patch({ mark_positions: Array.from(cur) });
                        }}
                        data-testid={`band-dialog-pos-${pos}`}
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
              </div>
              <div className="space-y-1">
                <Label htmlFor="band-mark-text" className="text-xs">
                  {t('markTextLabel')}
                </Label>
                <Input
                  id="band-mark-text"
                  className="h-8"
                  value={draft.mark_text ?? ''}
                  disabled={disabled}
                  onChange={(e) => patch({ mark_text: e.target.value })}
                  maxLength={20}
                  data-testid="band-dialog-mark-text"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('markTextHint')}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={disabled}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={() => onApply(draft)}
            disabled={disabled}
            data-testid="band-dialog-apply"
          >
            {t('apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
