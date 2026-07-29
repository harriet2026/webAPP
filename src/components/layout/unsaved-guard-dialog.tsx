'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useUnsavedGuard } from '@/contexts/unsaved-guard-context';

export function UnsavedGuardDialog() {
  const t = useTranslations('common');
  const {
    pendingNav,
    currentGuard,
    handleKeepEditing,
    handleDiscardAndLeave,
    handleSaveAndLeave,
    isSaving,
  } = useUnsavedGuard();

  const open = !!pendingNav;
  const hasSave = !!currentGuard?.onSave;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('unsavedChangesLeaveTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('unsavedChangesLeaveDesc')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {/* 继续编辑 */}
          <Button
            variant="outline"
            onClick={handleKeepEditing}
            disabled={isSaving}
            data-testid="unsaved-guard-keep-editing"
          >
            {t('keepEditing')}
          </Button>

          {/* 放弃修改并离开 */}
          <Button
            variant="ghost"
            onClick={handleDiscardAndLeave}
            disabled={isSaving}
            className="text-destructive hover:text-destructive"
            data-testid="unsaved-guard-discard"
          >
            {t('discardAndLeave')}
          </Button>

          {/* 保存后离开（仅当页面提供了 onSave 回调时显示） */}
          {hasSave && (
            <Button
              onClick={handleSaveAndLeave}
              disabled={isSaving}
              data-testid="unsaved-guard-save-and-leave"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('saveAndLeave')}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
