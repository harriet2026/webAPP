import type { AdvancedFilter } from '@/types/log';

// 「待处置邮件」的统一口径：action ∈ {quarantine, sideline}（GT-12608）。
// 系统状态 KPI 卡的待处置计数（dashboard/system-status/hooks.ts）与
// 「去处置」深链落地页（email-disposal-center-page.tsx 读 ?view=pending）
// 共用本常量——两边必须永远一致，否则卡片数字与落地列表对不上。
export const PENDING_DISPOSAL_FILTER: AdvancedFilter = {
  operator: 'AND',
  groups: [
    {
      operator: 'OR',
      conditions: [
        { field: 'action', op: 'eq', value: 'quarantine' },
        { field: 'action', op: 'eq', value: 'sideline' },
      ],
    },
  ],
};

// GT-12608：深链初始筛选映射。view=pending → 待处置口径；其余（含 null）
// 返回 null，由调用方落回自己的默认筛选。
export function pendingViewFilter(view: string | null): AdvancedFilter | null {
  return view === 'pending' ? PENDING_DISPOSAL_FILTER : null;
}
