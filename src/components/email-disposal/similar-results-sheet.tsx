'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils';
import type { DisposalMailItem } from '@/types/email-disposal';
// GT-12923 阶段三：不再在本文件重复维护一份 DisplayStatus → Badge 配色表，
// 直接复用邮件处置中心 / 检测日志共用的唯一状态源，避免两处枚举同步遗漏。
import { DISPLAY_STATUS_VARIANTS as STATUS_VARIANTS } from '@/lib/display-status';

const ACTION_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  accept: 'default',
  reject: 'destructive',
  bounce: 'destructive',
  quarantine: 'destructive',
  sideline: 'secondary',
  mixed: 'outline',
};

interface SimilarResultsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DisposalMailItem[];
  total: number;
  loading?: boolean;
  onItemClick?: (id: number) => void;
  aiEnabled?: boolean;
}

export function SimilarResultsSheet({
  open,
  onOpenChange,
  items,
  total,
  loading = false,
  onItemClick,
  aiEnabled = false,
}: SimilarResultsSheetProps) {
  const t = useTranslations('emailDisposal');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('similarResults.title')}</SheetTitle>
          <SheetDescription>
            {t('similarResults.description', { n: total })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              <span className="text-muted-foreground">{t('similarResults.loading')}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('similarResults.empty')}
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t('table.time')}</TableHead>
                    <TableHead className="text-xs">{t('table.sender')}</TableHead>
                    <TableHead className="text-xs">{t('table.recipient')}</TableHead>
                    <TableHead className="text-xs">{t('table.subject')}</TableHead>
                    {aiEnabled && <TableHead className="text-xs">{t('table.similarity')}</TableHead>}
                    <TableHead className="text-xs">{t('table.action')}</TableHead>
                    <TableHead className="text-xs">{t('table.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={cn(onItemClick && 'cursor-pointer')}
                      onClick={onItemClick ? () => onItemClick(item.id) : undefined}
                    >
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(item.timestamp)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">
                        <Tooltip>
                          <TooltipTrigger render={<span className="cursor-default" />}>
                            {item.sender}
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md text-xs">{item.sender}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">
                        <Tooltip>
                          <TooltipTrigger render={<span className="cursor-default" />}>
                            {(item.recipientList ?? (item.recipient ? [item.recipient] : [])).join(', ') || '—'}
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md text-xs">{(item.recipientList ?? (item.recipient ? [item.recipient] : [])).join(', ') || '—'}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{item.subject}</TableCell>
                      {aiEnabled && (
                        <TableCell className="text-xs whitespace-nowrap">
                          {item.similarity != null ? `${item.similarity}%` : '—'}
                        </TableCell>
                      )}
                      <TableCell className="text-xs">
                        <Badge variant={ACTION_VARIANTS[item.action] || 'outline'}>
                          {item.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={STATUS_VARIANTS[item.displayStatus] || 'outline'}>
                          {t(`filters.statuses.${item.displayStatus}`)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
