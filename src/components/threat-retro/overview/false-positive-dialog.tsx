'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

const REASONS = ['not_phishing', 'legitimate_business', 'internal_test', 'other'] as const;
type Reason = (typeof REASONS)[number];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { reason: string; add_whitelist: boolean }) => void;
  isLoading?: boolean;
  allowWhitelist?: boolean;
}

export function FalsePositiveDialog({ open, onOpenChange, onSubmit, isLoading, allowWhitelist = true }: Props) {
  const t = useTranslations('threatRetro.falsePositive');
  const [reason, setReason] = useState<Reason>('not_phishing');
  const [detail, setDetail] = useState('');
  const [addWhitelist, setAddWhitelist] = useState(false);

  // Snapshot defaults when the dialog opens (no useEffect → no cascading renders).
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setReason('not_phishing');
      setDetail('');
      setAddWhitelist(false);
    }
  }

  const reasonText = (r: Reason) => t(`reasons.${r}`);

  const submit = () => {
    onSubmit({ reason: detail.trim() ? `${reasonText(reason)}: ${detail.trim()}` : reasonText(reason), add_whitelist: addWhitelist });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)} className="gap-2">
            {REASONS.map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`fp-${r}`} />
                <Label htmlFor={`fp-${r}`} className="cursor-pointer text-sm">
                  {reasonText(r)}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('detailPlaceholder')}
            className="min-h-20"
          />

          {allowWhitelist ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={addWhitelist} onCheckedChange={(v) => setAddWhitelist(Boolean(v))} />
              <span>{t('addWhitelist')}</span>
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
