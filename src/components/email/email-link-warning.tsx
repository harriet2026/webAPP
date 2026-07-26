'use client';

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

interface EmailLinkWarningProps {
  url: string | null;
  onContinue: () => void;
  onCancel: () => void;
}

export function EmailLinkWarning({ url, onContinue, onCancel }: EmailLinkWarningProps) {
  const t = useTranslations('emailPreview');

  if (!url) return null;

  return (
    <AlertDialog open={!!url} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('linkWarningTitle')}</AlertDialogTitle>
          <AlertDialogDescription className="break-all">
            {t('linkWarningDesc')}
            <br />
            <code className="mt-2 block rounded bg-muted p-2 text-xs">{url}</code>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>{t('continue')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
