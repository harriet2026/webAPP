'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Textarea } from '@/components/ui/textarea';

const schema = z.object({
  reason: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

interface ExemptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
  isLoading?: boolean;
}

export function ExemptDialog({ open, onOpenChange, onSubmit, isLoading }: ExemptDialogProps) {
  const t = useTranslations('phishingDetection');
  const tCommon = useTranslations('common');
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ reason: '' });
    }
  }, [open, form]);

  const handleSubmit = form.handleSubmit((values) => {
    onSubmit(values.reason);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('exempt.title')}</DialogTitle>
          <DialogDescription>{t('exempt.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            {...form.register('reason')}
            placeholder={t('exempt.reasonPlaceholder')}
            className="min-h-24"
          />
          {form.formState.errors.reason ? (
            <p className="text-xs text-destructive">{t('exempt.reasonRequired')}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('exempt.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
