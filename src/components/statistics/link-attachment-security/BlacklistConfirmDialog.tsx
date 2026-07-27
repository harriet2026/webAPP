'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useBlacklistDomain } from './hooks/useBlacklistDomain';
import type { Direction } from '@/lib/api/link-attachment-security';

interface BlacklistConfirmDialogProps {
  domain: string;
  direction: Direction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  tenantId: number | null;
}

const DIRECTIONS: Direction[] = ['all', 'receive', 'send', 'internal'];

export function BlacklistConfirmDialog({
  domain,
  direction,
  open,
  onOpenChange,
  onSuccess,
  tenantId,
}: BlacklistConfirmDialogProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const tCommon = useTranslations('common');
  const [selectedDirection, setSelectedDirection] = useState<Direction>('receive');
  const mutation = useBlacklistDomain(tenantId);

  const handleConfirm = () => {
    mutation.mutate(
      { domain, direction: selectedDirection },
      {
        onSuccess: () => {
          toast.success(t('topDomains.blockSuccess', { domain }));
          onSuccess();
        },
        onError: (err) => {
          // 409 = the domain already has a blacklist rule for this direction
          // (spec §3.2.4). Surface the dedicated message; anything else falls
          // back to a generic failure toast so the user always gets feedback.
          if (err instanceof ApiError && err.status === 409) {
            toast.error(t('topDomains.blockConflict'));
          } else {
            toast.error(t('topDomains.blockFailed'));
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('topDomains.block')}</DialogTitle>
          <DialogDescription>
            {t('topDomains.blockConfirm', { domain })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 py-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">
            {t('direction.label')}
          </Label>
          <Select value={selectedDirection} onValueChange={(v) => setSelectedDirection(v as Direction)}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`topDomains.blockDirection.${d}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {tCommon('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={mutation.isPending}
          >
            {t('topDomains.block')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
