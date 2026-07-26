'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface BlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BlockDialog({ open, onOpenChange, onConfirm }: BlockDialogProps) {
  const t = useTranslations('phishingDetection');
  const tCommon = useTranslations('common');
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('block.title')}
      description={t('block.description')}
      confirmText={t('block.confirm')}
      cancelText={tCommon('cancel')}
      onConfirm={onConfirm}
      variant="destructive"
    />
  );
}
