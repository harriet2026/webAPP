'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { useTopAttachments } from './hooks/useTopAttachments';
import { ShowAllAttachmentsDrawer } from './ShowAllAttachmentsDrawer';
import type { Direction } from '@/lib/api/link-attachment-security';

interface TopMaliciousAttachmentsCardProps {
  startDate: string;
  endDate: string;
  direction: Direction;
}

export function TopMaliciousAttachmentsCard({ startDate, endDate, direction }: TopMaliciousAttachmentsCardProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const locale = useLocale();
  const router = useRouter();
  const { data, isLoading } = useTopAttachments({ startDate, endDate, direction, limit: 5 });
  const [showAllOpen, setShowAllOpen] = useState(false);

  const attachments = data?.items ?? [];

  return (
    <Card className="gap-0 rounded-lg border-0 bg-muted/40 py-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
        <CardTitle className="text-sm font-medium">{t('side.topMaliciousAttachments')}</CardTitle>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setShowAllOpen(true)}
        >
          {t('side.showAllAttachments')}
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full rounded" />
            ))}
          </div>
        ) : attachments.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            {t('empty.noAttachmentMail')}
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map((a) => (
              <div
                key={a.md5}
                className="flex items-center gap-2 text-sm"
              >
                <Badge variant="outline" className="h-6 w-6 justify-center p-0 text-xs tabular-nums">
                  {a.rank}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs">{a.file_name}</div>
                </div>
                <Badge variant="secondary" className="text-[10px]">{a.file_ext.toUpperCase()}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => {
                    router.push(`/${locale}/logs/email?attachment_md5=${a.md5}`);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="text-xs">{t('topAttachments.viewSample')}</span>
                </Button>
              </div>
            ))}
          </div>
        )}

        <ShowAllAttachmentsDrawer
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
