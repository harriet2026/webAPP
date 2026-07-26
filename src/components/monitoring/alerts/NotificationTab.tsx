'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSmtpConfig } from './hooks';

export function NotificationTab({ onConfigure }: { onConfigure: () => void }) {
  const t = useTranslations('alertCenter');
  const { data: cfg, isLoading, isError, refetch } = useSmtpConfig(true);
  const target = cfg?.use_internal_postfix
    ? t('notify.internalPostfix')
    : cfg?.sender_email || t('notify.notConfigured');
  // The email channel is "ready" when a delivery path actually exists: internal
  // Postfix (always available) or an external server that has been configured.
  // Don't hard-code a green check (review L9) — an unconfigured external SMTP
  // would otherwise read as ready while every notification fails.
  const ready = !!cfg && (cfg.use_internal_postfix || !!cfg.server);

  return (
    <Card data-testid="alert-notification">
      <CardHeader><CardTitle className="text-base">{t('channels')}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {isLoading && <div className="p-6 text-sm text-muted-foreground" data-testid="alert-notification-loading">{t('loading')}</div>}
        {isError && (
          <div className="p-6 text-center" data-testid="alert-notification-error">
            <p className="text-sm text-destructive">{t('loadFailed')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()} data-testid="alert-notification-retry">
              {t('retry')}
            </Button>
          </div>
        )}
        {!isLoading && !isError && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('label.channelName')}</TableHead>
              <TableHead>{t('label.target')}</TableHead>
              <TableHead>{t('label.enabled')}</TableHead>
              <TableHead>{t('label.action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow data-testid="channel-email">
              <TableCell className="font-medium">{t('notify.email')}</TableCell>
              <TableCell className="text-muted-foreground">{target}</TableCell>
              <TableCell>
                {ready
                  ? <CheckCircle className="h-5 w-5 text-green-500" />
                  : <XCircle className="h-5 w-5 text-muted-foreground" />}
              </TableCell>
              <TableCell><Button variant="ghost" size="sm" onClick={onConfigure} data-testid="channel-email-configure">{t('action.configure')}</Button></TableCell>
            </TableRow>
          </TableBody>
        </Table>
        )}
      </CardContent>
    </Card>
  );
}
