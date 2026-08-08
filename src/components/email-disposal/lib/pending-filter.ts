import type { AdvancedFilter } from '@/types/log';

// 「待处置邮件」的统一口径：display_status ∈
// {quarantine_pending, audit_pending}，即「隔离中 + 待审核」（GT-12608/GT-12818）。
// 系统状态 KPI 卡的待处置计数（dashboard/system-status/hooks.ts）与
// 「去处置」深链落地页（email-disposal-center-page.tsx 读 ?view=pending）
// 共用本常量——两边必须永远一致，否则卡片数字与落地列表对不上。
// GT-12649/GT-12660 起 action 是最终展示级执行动作；quarantine_pending（隔离中）
// 与 audit_pending（待审核）都是流程中间态，不属于 action 枚举，因此待处置筛选
// 必须使用 display_status。
export const PENDING_DISPOSAL_FILTER: AdvancedFilter = {
  operator: 'AND',
  groups: [
    {
      operator: 'AND',
      conditions: [
        {
          field: 'display_status',
          op: 'in',
          value: ['quarantine_pending', 'audit_pending'],
        },
      ],
    },
  ],
};

// GT-12608：深链初始筛选映射。view=pending → 待处置口径；其余（含 null）
// 返回 null，由调用方落回自己的默认筛选。
export function pendingViewFilter(view: string | null): AdvancedFilter | null {
  return view === 'pending' ? PENDING_DISPOSAL_FILTER : null;
}
