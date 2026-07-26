'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ServerPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  // Optional page-size selector. When provided a dropdown is rendered that
  // lets the user pick how many rows per page (GT-11585).
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export function ServerPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: ServerPaginationProps) {
  const t = useTranslations('common');
  const totalPages = Math.ceil(total / pageSize);

  if (totalPages <= 1 && !onPageSizeChange) return null;

  return (
    <div className="flex items-center justify-between rounded-[20px] border border-border/70 bg-card/96 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground">
          {t('total', { count: total })}
        </div>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('rowsPerPage')}</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="h-8 w-[72px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('page', { page: 1 })}
          title={t('page', { page: 1 })}
          onClick={() => onPageChange(1)}
          disabled={page === 1}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('prev')}
          title={t('prev')}
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm text-muted-foreground px-2">
          {t('pageOf', { current: page, total: Math.max(1, totalPages) })}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('next')}
          title={t('next')}
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || totalPages === 0}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('page', { page: Math.max(1, totalPages) })}
          title={t('page', { page: Math.max(1, totalPages) })}
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages || totalPages === 0}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
