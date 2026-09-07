'use client';

import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// 字段名 + PRD Hover Tooltip（GT 决策#3）。
// 原本内嵌在 SandboxTab.tsx，为让链接保护 Tab 也能复用同一提示样式而提取为共享组件。
//
// 提示体的 data-testid 前缀必须是**字面量**（`field-tooltip-${testId}`，不是
// `${testId}-content`）：qc 的 testid 契约按前缀通配登记模板形态的 testid
// （qc/scripts/playwright/lib/yml/testid-contract.ts 的 TPL_RE 要求 `${` 之前至少有
// 一个字面字符），以变量开头的模板一个都登记不到，引用它的用例会被判 testid.missing。
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
        data-testid={`field-tooltip-${testId}`}
      >
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
