'use client';

// 邮件路由四个 Tab（收信域管理/转发设置/出站路由/发信认证）共用的列表工具栏：搜索 + 重置筛选 +
// 筛选弹层（可选） + 右侧动作区（如「新建」）。对齐
// doc/html-spec/admin-forwarding/index.html §2.2，视觉/testid 约定沿用
// src/components/organization/shared.tsx::ListToolbar。

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  onReset,
  filterCount,
  filterContent,
  actions,
  testIdPrefix,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  onReset: () => void;
  filterCount?: number;
  filterContent?: ReactNode;
  actions?: ReactNode;
  testIdPrefix: string;
}) {
  const t = useTranslations('mailRouting.shared');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-64 pl-8"
          data-testid={`${testIdPrefix}-search`}
        />
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 flex-shrink-0"
              onClick={onReset}
              aria-label={t('reset')}
              data-testid={`${testIdPrefix}-reset`}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          }
        />
        <TooltipContent>{t('reset')}</TooltipContent>
      </Tooltip>
      <div className="ml-auto flex items-center gap-2">
        {filterContent && (
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" className="h-9 gap-1.5" data-testid={`${testIdPrefix}-filter`}>
                  <SlidersHorizontal className="h-4 w-4" />
                  {t('filter')}
                  {(filterCount ?? 0) > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] text-white">
                      {filterCount}
                    </span>
                  )}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-80 space-y-3" data-testid={`${testIdPrefix}-filter-popover`}>
              {filterContent}
            </PopoverContent>
          </Popover>
        )}
        {actions}
      </div>
    </div>
  );
}
