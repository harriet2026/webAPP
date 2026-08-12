'use client';

import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface BlockDialogProps {
  open: boolean;
  /**
   * drop：未投递邮件"丢弃"（阻止继续投递）；recall：已投递邮件"召回"。
   * 两者底层都调用同一个 block() 接口，仅确认对话框的文案/配色随场景切换。
   */
  variant: 'drop' | 'recall';
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BlockDialog({ open, variant, onOpenChange, onConfirm }: BlockDialogProps) {
  const t = useTranslations('phishingDetection');
  const tCommon = useTranslations('common');
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(variant === 'recall' ? 'block.recallTitle' : 'block.dropTitle')}
      description={t(variant === 'recall' ? 'block.recallDescription' : 'block.dropDescription')}
      confirmText={t(variant === 'recall' ? 'block.recallConfirm' : 'block.dropConfirm')}
      cancelText={tCommon('cancel')}
      onConfirm={onConfirm}
      variant={variant === 'recall' ? 'default' : 'destructive'}
    />
  );
}
