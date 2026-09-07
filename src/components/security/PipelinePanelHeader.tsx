'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface PipelinePanelHeaderProps {
  className?: string;
  title: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  enabledLabel: string;
  disabledLabel: string;
  actions?: React.ReactNode;
  switchTestId?: string;
  rootTestId?: string;
  titleTestId?: string;
  /** 状态文字（已启用/已禁用）的 testid。不传时沿用 `<titleTestId>-status` 的旧值，
   *  渲染结果不变；传字面量是为了让 qc 的 testid 契约防线能静态看见它
   *  —— 整段模板拼出来的 testid 在那道防线眼里等于不存在。 */
  statusTestId?: string;
  ariaLabel?: string;
  switchTitle?: string;
  /** 面板主体：传入即包进同一张卡片的 CardContent（表头在上、border-b 分隔、主体在下），
   *  形成「一个面板一张卡」。不传则只渲染表头卡片（向后兼容）。 */
  children?: React.ReactNode;
  /** 覆盖 CardContent 的容器类（默认 pt-6）。主体自带贴边布局时可传 "p-0"。 */
  contentClassName?: string;
}

/** 策略流水线统一表头：有边框卡片 + 底边框；标题在左，蓝色状态文字 + Switch 在右。
 *  纯展示，enabled 状态由调用方持有（各面板的 enable 来源不同）。
 *  传入 children 时，主体渲染进同一张卡片（一个面板一张卡）；不传则仅表头卡片。 */
export function PipelinePanelHeader({
  className,
  title,
  enabled,
  onToggle,
  disabled,
  enabledLabel,
  disabledLabel,
  actions,
  switchTestId = 'master-switch-toggle',
  rootTestId,
  titleTestId,
  statusTestId,
  ariaLabel,
  switchTitle,
  children,
  contentClassName,
}: PipelinePanelHeaderProps) {
  return (
    <Card className={className} data-testid={rootTestId}>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg" data-testid={titleTestId}>
            {title}
          </CardTitle>
          <div className="flex items-center gap-3">
            {actions}
            <span
              className={cn('text-sm font-medium', enabled ? 'text-primary' : 'text-muted-foreground')}
              data-testid={statusTestId ?? (titleTestId ? `${titleTestId}-status` : undefined)}
            >
              {enabled ? enabledLabel : disabledLabel}
            </span>
            <Switch
              checked={enabled}
              disabled={disabled}
              onCheckedChange={onToggle}
              data-testid={switchTestId}
              aria-label={ariaLabel}
              title={switchTitle}
            />
          </div>
        </div>
      </CardHeader>
      {children != null && (
        <CardContent className={contentClassName ?? 'pt-6'}>{children}</CardContent>
      )}
    </Card>
  );
}
