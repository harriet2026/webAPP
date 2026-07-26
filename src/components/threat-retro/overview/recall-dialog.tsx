'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { RecallPolicy } from '@/types/threat-retro';
import type { ThreatRetroLeakMail } from '@/types/threat-retro';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaks: ThreatRetroLeakMail[];
  policies: { unread_policy: RecallPolicy; read_policy: RecallPolicy };
  onConfirm: (policies: { unread_policy: RecallPolicy; read_policy: RecallPolicy }) => void;
  isLoading?: boolean;
}

export function RecallDialog({ open, onOpenChange, leaks, policies, onConfirm, isLoading }: Props) {
  const t = useTranslations('threatRetro.recall');

  const subject = leaks[0]?.subject ?? '';
  const count = leaks.length;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('description', { subject, count })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm"><div><p className="text-muted-foreground">{t('unreadPolicy')}</p><strong>{t(`policy.${policies.unread_policy}`)}</strong></div><div><p className="text-muted-foreground">{t('readPolicy')}</p><strong>{t(`policy.${policies.read_policy}`)}</strong></div></div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="threat-retro-recall-confirm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(policies)}
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
