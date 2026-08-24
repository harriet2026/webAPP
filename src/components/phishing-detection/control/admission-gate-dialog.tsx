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

export function AdmissionGateDialog({
  open,
  onOpenChange,
  onGoToConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToConfig: () => void;
}) {
  const t = useTranslations('phishingDetection.control');
  const tc = useTranslations('common');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('gateTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('gateDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onGoToConfig}>{t('goToConfig')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
