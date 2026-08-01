'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { useDevices, useLogoutDevice, useLogoutOthers } from './api';
import { formatTimestamp } from '@/lib/format-time';
import type { Session } from './types';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

export function SessionsTab() {
  const t = useTranslations('profile');
  const apiErrorMessage = useApiErrorMessage();
  const tc = useTranslations('common');
  const { data, isLoading } = useDevices();
  const logoutDevice = useLogoutDevice();
  const logoutOthers = useLogoutOthers();
  const router = useRouter();
  const locale = useLocale();
  const { logout } = useAuth();

  const [single, setSingle] = useState<Session | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const devices = data?.items ?? [];
  const onlineDevices = devices;
  const others = devices.filter((d) => !d.current);

  const handleLogoutSingle = async (d: Session) => {
    try {
      if (d.current) {
        await logoutDevice.mutateAsync(d.session_id);
        setSingle(null);
        toast.success(t('devices.loggedOut'));
        setTimeout(() => {
          logout();
          router.push(`/${locale}/login`);
        }, 800);
      } else {
        await logoutDevice.mutateAsync(d.session_id);
        setSingle(null);
        toast.success(t('devices.loggedOutDevice', { name: d.device }));
      }
    } catch (e) {
      toast.error(apiErrorMessage(e, tc('error')));
    }
  };

  const handleLogoutOthers = async () => {
    try {
      const res = await logoutOthers.mutateAsync();
      setBatchOpen(false);
      toast.success(t('devices.loggedOutOthers', { n: res.count }));
    } catch (e) {
      toast.error(apiErrorMessage(e, tc('error')));
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium">{t('tabs.sessions')}</h3>
        <span className="text-sm text-muted-foreground">
          {t('devices.onlineCount', { n: onlineDevices.length })}
        </span>
      </div>
      <div className="my-4 border-t border-border" />

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t('devices.device')}</TableHead>
                  <TableHead>{t('devices.browser')}</TableHead>
                  <TableHead>{t('devices.ip')}</TableHead>
                  <TableHead>{t('devices.location')}</TableHead>
                  <TableHead>{t('devices.loginTime')}</TableHead>
                  <TableHead>{t('devices.status')}</TableHead>
                  <TableHead className="text-right">{tc('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      {tc('noData')}
                    </TableCell>
                  </TableRow>
                ) : (
                  devices.map((d) => (
                    <TableRow
                      key={d.session_id}
                      className={cn(d.current && 'bg-primary/5')}
                    >
                      <TableCell className="font-medium text-foreground">{d.device}</TableCell>
                      <TableCell className="text-muted-foreground">{d.browser}</TableCell>
                      <TableCell className="text-muted-foreground">{d.ip}</TableCell>
                      <TableCell className="text-muted-foreground">{d.location || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{formatTimestamp(d.login_time) || '—'}</TableCell>
                      <TableCell>
                        {d.current ? (
                          <Badge variant="outline" className="border-green-200 bg-green-50 font-normal text-green-600 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
                            {t('devices.current')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 font-normal text-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400">
                            {t('devices.online')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:bg-destructive/5"
                          disabled={logoutDevice.isPending}
                          onClick={() => setSingle(d)}
                          data-testid={`profile-device-logout-${d.session_id}`}
                        >
                          {t('devices.logout')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              disabled={others.length === 0 || logoutOthers.isPending}
              onClick={() => setBatchOpen(true)}
              data-testid="profile-devices-logout-others"
            >
              {t('devices.logoutOthers')}
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={!!single} onOpenChange={(o) => !o && setSingle(null)}>
        <AlertDialogContent className="max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('devices.logoutTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {single?.current
                ? t('devices.logoutCurrentConfirm')
                : t('devices.logoutConfirm', { name: single?.device ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="profile-device-single-cancel">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => single && handleLogoutSingle(single)}
              data-testid="profile-device-single-confirm"
            >
              {t('devices.logout')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={batchOpen} onOpenChange={setBatchOpen}>
        <AlertDialogContent className="max-w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('devices.logoutOthersTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('devices.logoutOthersConfirm', { n: others.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="profile-device-batch-cancel">{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleLogoutOthers}
              data-testid="profile-device-batch-confirm"
            >
              {t('devices.logout')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
