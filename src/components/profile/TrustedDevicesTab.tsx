'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useTrustedDevices, useRevokeTrustedDevice } from './api';
import type { AdminTrustedDevice } from './types';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';
import { formatTimestamp } from '@/lib/format-time';

/**
 * TrustedDevicesTab — lists the caller's active "trust this device" cookies
 * (Spec §1.5) and lets them revoke one. These are distinct from SessionsTab:
 * a trusted device skips the 2FA challenge on future logins. Backend:
 * GET /profile/trusted-devices, DELETE /profile/trusted-devices/:id.
 */
export function TrustedDevicesTab() {
  const t = useTranslations('profile');
  const apiErrorMessage = useApiErrorMessage();
  const tc = useTranslations('common');
  const { data, isLoading } = useTrustedDevices();
  const revoke = useRevokeTrustedDevice();

  const [target, setTarget] = useState<AdminTrustedDevice | null>(null);

  const items = data?.items ?? [];

  const handleRevoke = async (d: AdminTrustedDevice) => {
    try {
      await revoke.mutateAsync(d.id);
      setTarget(null);
      toast.success(t('trustedDevices.revoked'));
    } catch (e) {
      toast.error(apiErrorMessage(e, tc('error')));
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">{t('tabs.devices')}</h3>
        <span className="text-sm text-muted-foreground">
          {t('trustedDevices.count', { n: items.length })}
        </span>
      </div>
      <div className="my-4 border-t border-border" />

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{t('devices.device')}</TableHead>
                <TableHead>{t('devices.browser')}</TableHead>
                <TableHead>{t('devices.ip')}</TableHead>
                <TableHead>{t('trustedDevices.createdAt')}</TableHead>
                <TableHead>{t('trustedDevices.lastUsed')}</TableHead>
                <TableHead>{t('trustedDevices.expires')}</TableHead>
                <TableHead className="text-right">{tc('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    {t('trustedDevices.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium text-foreground">{d.device || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{d.browser || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{d.ip || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTimestamp(d.created_at) || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTimestamp(d.last_used_at) || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatTimestamp(d.expires_at) || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:bg-destructive/5"
                        disabled={revoke.isPending}
                        onClick={() => setTarget(d)}
                        data-testid={`profile-trusted-device-revoke-${d.id}`}
                      >
                        {t('trustedDevices.revoke')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent className="max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('trustedDevices.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('trustedDevices.revokeConfirm', { name: target?.device ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="profile-trusted-device-revoke-cancel">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => target && handleRevoke(target)}
              data-testid="profile-trusted-device-revoke-confirm"
            >
              {t('trustedDevices.revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
