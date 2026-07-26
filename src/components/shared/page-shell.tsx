import * as React from 'react';

import { cn } from '@/lib/utils';

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'framed';
  'data-testid'?: string;
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  icon?: React.ElementType;
  actions?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'framed';
  'data-testid'?: string;
}

interface PageSurfaceProps {
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

interface PageBodyProps {
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export interface FramedPageProps {
  children: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  'data-testid'?: string;
}

export function PageShell({
  children,
  className,
  variant = 'default',
  'data-testid': testId,
}: PageShellProps) {
  return (
    <div
      className={cn(
        variant === 'framed'
          ? 'min-w-0 min-h-[calc(100dvh-7.5rem)] bg-gray-100 dark:bg-gray-900'
          : 'space-y-6',
        className,
      )}
      data-layout={variant}
      data-slot="page-shell"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
  className,
  variant = 'default',
  'data-testid': testId,
}: PageHeaderProps) {
  const framed = variant === 'framed';

  return (
    <section
      className={cn(
        framed
          ? '@container m-0 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-950'
          : '-mx-8 -mt-8 mb-2 border-b border-border bg-card px-8 py-4',
        className,
      )}
      data-slot="page-header"
      data-testid={testId}
    >
      <div
        className={cn(
          framed
            ? 'flex flex-col items-stretch gap-3 @[560px]:flex-row @[560px]:items-center @[560px]:justify-between @[560px]:gap-6'
            : 'flex items-center justify-between gap-4',
        )}
      >
        <div className={cn('min-w-0', (!framed || Icon) && 'flex items-start gap-3')}>
          {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
          <div className={cn('min-w-0', !framed && 'space-y-1')}>
            {eyebrow ? <div className="text-xs font-medium text-body">{eyebrow}</div> : null}
            <h1
              className={cn(
                framed
                  ? 'text-xl font-bold text-gray-900 dark:text-gray-100'
                  : 'text-xl font-semibold tracking-tight text-foreground',
              )}
            >
              {title}
            </h1>
            {description ? (
              <p
                className={cn(
                  'max-w-3xl',
                  framed
                    ? 'text-sm leading-5 font-normal text-gray-500 dark:text-gray-400'
                    : 'text-xs leading-4 text-body',
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div
            className={cn(
              'flex shrink-0 items-center gap-3',
              framed && 'self-end @[560px]:self-auto',
            )}
            data-slot="page-header-actions"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PageBody({ children, className, 'data-testid': testId }: PageBodyProps) {
  return (
    <div
      className={cn('min-w-0 space-y-6 bg-gray-100 p-6 dark:bg-gray-900', className)}
      data-slot="page-body"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/**
 * Standard route-level page frame extracted from the demo dashboard.
 *
 * Use this component for normal admin pages so the outer canvas, title band,
 * typography, action placement, and body rhythm cannot drift page by page.
 * Lower-level PageShell/PageHeader/PageBody remain exported for embedded or
 * deliberately exceptional compositions.
 */
export function FramedPage({
  children,
  title,
  description,
  actions,
  'data-testid': testId,
}: FramedPageProps) {
  return (
    <PageShell variant="framed" data-testid={testId}>
      <PageHeader
        variant="framed"
        title={title}
        description={description}
        actions={actions}
        data-testid={testId ? `${testId}-header` : undefined}
      />
      <PageBody data-testid={testId ? `${testId}-body` : undefined}>
        {children}
      </PageBody>
    </PageShell>
  );
}

export function PageSurface({ children, className, 'data-testid': testId }: PageSurfaceProps) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5', className)} data-testid={testId}>
      {children}
    </section>
  );
}
