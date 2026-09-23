'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type PageItem = number | 'start-ellipsis' | 'end-ellipsis';

export const RULE_LIST_DEFAULT_PAGE_SIZE = 10;

export function getRuleListPageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (page <= 4) return [1, 2, 3, 4, 5, 'end-ellipsis', totalPages];
  if (page >= totalPages - 3) {
    return [1, 'start-ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'start-ellipsis', page - 1, page, page + 1, 'end-ellipsis', totalPages];
}

interface RuleListPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  goToPageLabel: string;
  pageLabel: string;
  testIdPrefix: string;
  totalText?: string;
  pageSizeOptions?: number[];
  pageSizeLabel?: (pageSize: number) => string;
}

export function RuleListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  goToPageLabel,
  pageLabel,
  testIdPrefix,
  totalText,
  pageSizeOptions = [10, 20, 50, 100],
  pageSizeLabel,
}: RuleListPaginationProps) {
  const t = useTranslations('common');
  const [jumpPage, setJumpPage] = useState('');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  const pageSizeSelector = (
    <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
      <SelectTrigger data-testid={`${testIdPrefix}-page-size`} className="h-8 w-[110px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {pageSizeOptions.map((size) => (
          <SelectItem data-testid={`${testIdPrefix}-page-size-${size}`} key={size} value={String(size)}>
            {pageSizeLabel?.(size) ?? t('perPage', { count: size })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div data-testid={`${testIdPrefix}-pagination`} className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <div data-testid={`${testIdPrefix}-total`} className="text-sm text-muted-foreground">
        {totalText ?? t('total', { count: total })}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {totalPages > 1 && (
          <>
            <div className="flex items-center gap-1">
              <Button
                data-testid={`${testIdPrefix}-prev-page`}
                aria-label={t('prev')}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                &lt;
              </Button>
              {getRuleListPageItems(currentPage, totalPages).map((item) => (
                typeof item === 'number' ? (
                  <Button
                    data-testid={`${testIdPrefix}-page-${item}`}
                    key={item}
                    aria-label={t('page', { page: item })}
                    aria-current={currentPage === item ? 'page' : undefined}
                    variant={currentPage === item ? 'default' : 'outline'}
                    size="sm"
                    className={cn('h-8 w-8 p-0', currentPage === item && 'bg-primary text-primary-foreground')}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </Button>
                ) : (
                  <span key={item} className="px-1 text-muted-foreground" aria-hidden="true">...</span>
                )
              ))}
              <Button
                data-testid={`${testIdPrefix}-next-page`}
                aria-label={t('next')}
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                &gt;
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{goToPageLabel}</span>
              <input
                data-testid={`${testIdPrefix}-jump-input`}
                aria-label={goToPageLabel}
                type="number"
                min={1}
                max={totalPages}
                value={jumpPage}
                className="h-8 w-14 rounded-md border bg-background px-2 text-center text-sm"
                onChange={(event) => setJumpPage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const value = Number(jumpPage);
                  if (Number.isInteger(value) && value >= 1 && value <= totalPages) {
                    onPageChange(value);
                    setJumpPage('');
                  }
                }}
              />
              <span>{pageLabel}</span>
            </label>
          </>
        )}
        {pageSizeSelector}
      </div>
    </div>
  );
}
