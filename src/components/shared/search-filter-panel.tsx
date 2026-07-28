'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { shouldApplyFiltersOnEnter } from '@/hooks/use-applied-filter-state';
import { PageFilters } from './page-filters';

export interface SearchFilterCondition {
  key: string;
  label?: ReactNode;
  control: ReactNode;
  className?: string;
  labelClassName?: string;
}

type ActionPlacement = 'toolbar' | 'grid' | 'footer' | 'none';

interface SearchFilterPanelProps {
  testId?: string;
  className?: string;
  contentClassName?: string;
  toolbar?: ReactNode;
  toolbarClassName?: string;
  toolbarContentClassName?: string;
  suggestions?: ReactNode;
  conditions?: SearchFilterCondition[];
  conditionsContent?: ReactNode;
  showConditions?: boolean;
  conditionsTestId?: string;
  conditionsSectionClassName?: string;
  conditionGridClassName?: string;
  conditionClassName?: string;
  labelClassName?: string;
  afterConditions?: ReactNode;
  footer?: ReactNode;
  onSearch?: () => void;
  onReset?: () => void;
  searchLabel?: ReactNode;
  resetLabel?: ReactNode;
  searchIcon?: ReactNode;
  resetIcon?: ReactNode;
  searchTestId?: string;
  resetTestId?: string;
  searchDisabled?: boolean;
  resetDisabled?: boolean;
  searchButtonClassName?: string;
  resetButtonClassName?: string;
  actionsPlacement?: ActionPlacement;
  actionsClassName?: string;
  extraActions?: ReactNode;
}

/**
 * Shared search workbench for log/list pages.
 *
 * It owns the stable interaction and layout skeleton while callers provide the
 * page-specific condition controls. Complex capabilities such as AI parsing,
 * templates, and nested advanced-rule builders stay in optional slots.
 */
export function SearchFilterPanel({
  testId,
  className,
  contentClassName,
  toolbar,
  toolbarClassName,
  toolbarContentClassName,
  suggestions,
  conditions = [],
  conditionsContent,
  showConditions = true,
  conditionsTestId,
  conditionsSectionClassName,
  conditionGridClassName,
  conditionClassName,
  labelClassName,
  afterConditions,
  footer,
  onSearch,
  onReset,
  searchLabel,
  resetLabel,
  searchIcon,
  resetIcon,
  searchTestId,
  resetTestId,
  searchDisabled,
  resetDisabled,
  searchButtonClassName,
  resetButtonClassName,
  actionsPlacement = 'footer',
  actionsClassName,
  extraActions,
}: SearchFilterPanelProps) {
  const hasBuiltInActions = !!onSearch || !!onReset || !!extraActions;
  const actions = hasBuiltInActions ? (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-2',
        actionsPlacement === 'grid' && 'self-end',
        actionsClassName,
      )}
      data-testid="search-filter-panel-actions"
    >
      {onSearch ? (
        <Button
          type="button"
          onClick={onSearch}
          disabled={searchDisabled}
          className={searchButtonClassName}
          data-testid={searchTestId}
        >
          {searchIcon}
          {searchLabel}
        </Button>
      ) : null}
      {onReset ? (
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          disabled={resetDisabled}
          className={resetButtonClassName}
          data-testid={resetTestId}
        >
          {resetIcon}
          {resetLabel}
        </Button>
      ) : null}
      {extraActions}
    </div>
  ) : null;

  const conditionNodes = conditions.map((condition) => (
    <div
      key={condition.key}
      className={cn('space-y-1', conditionClassName, condition.className)}
      data-filter-condition={condition.key}
    >
      {condition.label !== undefined ? (
        <label
          className={cn(
            'text-xs text-muted-foreground',
            labelClassName,
            condition.labelClassName,
          )}
        >
          {condition.label}
        </label>
      ) : null}
      {condition.control}
    </div>
  ));

  return (
    <PageFilters
      data-testid={testId}
      className={className}
      onKeyDown={(event) => {
        if (
          !onSearch ||
          event.defaultPrevented ||
          !shouldApplyFiltersOnEnter(event)
        ) {
          return;
        }
        event.preventDefault();
        onSearch();
      }}
    >
      <div className={cn('space-y-3', contentClassName)}>
        {toolbar ? (
          actionsPlacement === 'toolbar' ? (
            <div className={cn('flex flex-wrap items-center gap-3', toolbarClassName)}>
              <div className={cn('min-w-0 flex-1', toolbarContentClassName)}>
                {toolbar}
              </div>
              {actions}
            </div>
          ) : (
            <div className={toolbarClassName}>{toolbar}</div>
          )
        ) : actionsPlacement === 'toolbar' ? actions : null}

        {suggestions}

        {showConditions && (conditionsContent || conditionNodes.length > 0) ? (
          <div
            data-testid={conditionsTestId}
            className={conditionsSectionClassName}
          >
            {conditionsContent ?? (
              <div className={cn('grid grid-cols-1 gap-4', conditionGridClassName)}>
                {conditionNodes}
                {actionsPlacement === 'grid' ? actions : null}
              </div>
            )}
          </div>
        ) : null}

        {afterConditions}
        {actionsPlacement === 'footer' ? actions : null}
        {footer}
      </div>
    </PageFilters>
  );
}
