'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldBan } from 'lucide-react';
import { useState } from 'react';
import { useTopDomains } from './hooks/useTopDomains';
import { BlacklistConfirmDialog } from './BlacklistConfirmDialog';
import { useTenant } from '@/hooks/use-tenant';
import type { Direction } from '@/lib/api/link-attachment-security';
import { formatFirstSeen } from './domain-format';

interface ShowAllDomainsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
  direction: Direction;
  limit?: number;
  tenantId: number | null;
}

export function ShowAllDomainsDrawer({
  open,
  onOpenChange,
  startDate,
  endDate,
  direction,
  limit = 20,
  tenantId,
}: ShowAllDomainsDrawerProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { isAdmin } = useTenant();
  const { data, isLoading } = useTopDomains({ startDate, endDate, direction, limit, tenantId });
  const [blacklistDomain, setBlacklistDomain] = useState<string | null>(null);
  const domains = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{t('side.topMaliciousDomains')}</SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <ScrollArea className="flex-1 px-4">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : domains.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              {t('empty.noLinkMail')}
            </div>
          ) : (
            <div className="space-y-2 py-4">
              {domains.map((d) => (
                <div
                  key={d.domain}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
                >
                  <Badge variant="secondary" className="w-7 justify-center text-xs tabular-nums">
                    {d.rank}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{d.domain}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('topDomains.count')}: {d.count.toLocaleString()}
                      {' · '}
                      {t('topDomains.blockRate')}: {d.block_rate.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('topDomains.firstSeen')}:{' '}
                      {formatFirstSeen(d.first_seen, locale, t('topDomains.unknownDate'))}
                    </div>
                  </div>
                  {d.blacklisted ? (
                    <Badge variant="destructive" className="text-[10px]">
                      {t('topDomains.blocked')}
                    </Badge>
                  ) : isAdmin ? (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {t('topDomains.unblocked')}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setBlacklistDomain(d.domain)}
                      >
                        <ShieldBan className="h-3.5 w-3.5 text-rose-500" />
                        <span className="text-xs">{t('topDomains.block')}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {t('topDomains.unblocked')}
                      </Badge>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger render={
                            <span>
                              <Button variant="ghost" size="sm" className="h-7 px-2" disabled>
                                <ShieldBan className="h-3.5 w-3.5 text-rose-500" />
                                <span className="text-xs">{t('topDomains.block')}</span>
                              </Button>
                            </span>
                          } />
                          <TooltipContent>{tCommon('accessDenied')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {blacklistDomain && (
          <BlacklistConfirmDialog
            domain={blacklistDomain}
            direction={direction}
            open={!!blacklistDomain}
            onOpenChange={(o) => { if (!o) setBlacklistDomain(null); }}
            onSuccess={() => setBlacklistDomain(null)}
            tenantId={tenantId}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
