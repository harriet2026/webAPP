'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldBan } from 'lucide-react';
import { useTopDomains } from './hooks/useTopDomains';
import { BlacklistConfirmDialog } from './BlacklistConfirmDialog';
import { ShowAllDomainsDrawer } from './ShowAllDomainsDrawer';
import { useTenant } from '@/hooks/use-tenant';
import type { Direction } from '@/lib/api/link-attachment-security';
import { formatFirstSeen } from './domain-format';

interface TopMaliciousDomainsCardProps {
  startDate: string;
  endDate: string;
  direction: Direction;
}

export function TopMaliciousDomainsCard({ startDate, endDate, direction }: TopMaliciousDomainsCardProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { isAdmin } = useTenant();
  const { data, isLoading } = useTopDomains({ startDate, endDate, direction, limit: 5 });
  const [blacklistDomain, setBlacklistDomain] = useState<string | null>(null);
  const [showAllOpen, setShowAllOpen] = useState(false);

  const domains = data?.items ?? [];

  return (
    <Card className="gap-0 rounded-lg border-0 bg-muted/40 py-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
        <CardTitle className="text-sm font-medium">{t('side.topMaliciousDomains')}</CardTitle>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setShowAllOpen(true)}
        >
          {t('side.showAllDomains')}
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded" />
            ))}
          </div>
        ) : domains.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            {t('empty.noMaliciousDomain')}
          </div>
        ) : (
          <div className="space-y-2" data-testid="top-malicious-domains-list">
            {domains.map((d) => (
              <div
                key={d.domain}
                className="rounded-lg border border-border/60 bg-background/80 p-2.5 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge variant="outline" className="h-6 w-6 shrink-0 justify-center p-0 text-xs tabular-nums">
                    {d.rank}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={d.domain}>
                    {d.domain}
                  </span>
                  {!d.blacklisted && isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-danger"
                      onClick={() => setBlacklistDomain(d.domain)}
                    >
                      <ShieldBan className="h-3.5 w-3.5 text-rose-500" />
                      <span className="text-xs">{t('topDomains.block')}</span>
                    </Button>
                  )}
                  {!d.blacklisted && !isAdmin && (
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
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">{t('topDomains.count')}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{d.count.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('topDomains.blockRate')}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{d.block_rate.toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('topDomains.firstSeen')}</dt>
                    <dd className="mt-0.5 whitespace-nowrap font-medium">
                      {formatFirstSeen(d.first_seen, locale, t('topDomains.unknownDate'))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('topDomains.status')}</dt>
                    <dd className="mt-0.5">
                      <Badge variant={d.blacklisted ? 'secondary' : 'outline'} className="text-[10px]">
                        {t(d.blacklisted ? 'topDomains.blocked' : 'topDomains.unblocked')}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}

        {blacklistDomain && (
          <BlacklistConfirmDialog
            domain={blacklistDomain}
            direction={direction}
            open={!!blacklistDomain}
            onOpenChange={(open) => { if (!open) setBlacklistDomain(null); }}
            onSuccess={() => setBlacklistDomain(null)}
          />
        )}

        <ShowAllDomainsDrawer
          open={showAllOpen}
          onOpenChange={setShowAllOpen}
          startDate={startDate}
          endDate={endDate}
          direction={direction}
        />
      </CardContent>
    </Card>
  );
}
