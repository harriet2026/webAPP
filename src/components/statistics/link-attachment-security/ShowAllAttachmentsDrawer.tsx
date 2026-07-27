'use client';

import { useTranslations } from 'next-intl';
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
import { useTopAttachments } from './hooks/useTopAttachments';
import type { Direction } from '@/lib/api/link-attachment-security';

interface ShowAllAttachmentsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
  direction: Direction;
  limit?: number;
  tenantId: number | null;
}

export function ShowAllAttachmentsDrawer({
  open,
  onOpenChange,
  startDate,
  endDate,
  direction,
  limit = 20,
  tenantId,
}: ShowAllAttachmentsDrawerProps) {
  const t = useTranslations('linkAttachmentSecurity');
  const { data, isLoading } = useTopAttachments({ startDate, endDate, direction, limit, tenantId });
  const attachments = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{t('side.topMaliciousAttachments')}</SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <ScrollArea className="flex-1 px-4">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : attachments.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              {t('empty.noAttachmentMail')}
            </div>
          ) : (
            <div className="space-y-2 py-4">
              {attachments.map((a) => (
                <div
                  key={a.md5}
                  className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
                >
                  <Badge variant="secondary" className="w-7 justify-center text-xs tabular-nums">
                    {a.rank}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{a.file_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {a.md5_short}
                      {' · '}
                      {a.threat_type}
                    </div>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
