'use client';

import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// 字段名 + PRD Hover Tooltip（GT 决策#3）。
// 原本内嵌在 SandboxTab.tsx，为让链接保护 Tab 也能复用同一提示样式而提取为共享组件。
export function FieldLabel({ children, tip, small, testId }: {
  children: React.ReactNode;
  tip: string;
  small?: boolean;
  testId: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Label className={small ? 'text-sm' : 'font-medium'} data-testid={testId} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[280px] text-xs"
        data-testid={`${testId}-content`}
      >
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
