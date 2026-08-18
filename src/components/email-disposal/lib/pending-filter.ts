import type { AdvancedFilter } from '@/types/log';

// 「待处置邮件」的统一口径：display_status ∈
// {quarantine_pending, audit_pending}，即「隔离中 + 待审核」（GT-12608/GT-12818）。
// 系统状态 KPI 卡的待处置计数（dashboard/system-status/hooks.ts）与
// 「去处置」深链落地页（email-disposal-center-page.tsx 读 ?view=pending）
// 共用本常量——两边必须永远一致，否则卡片数字与落地列表对不上。
// GT-12649/GT-12660 起 action 是最终展示级执行动作；quarantine_pending（隔离中）
// 与 audit_pending（待审核）都是流程中间态，不属于 action 枚举，因此待处置筛选
// 必须使用 display_status。sideline_pending（检测中）是旁路中间态，绝大多数会被
// 自动放行/总等待截止点推进，GT-12818 起不再计入待处置。
//
// 已知缺口（待后端支持）：旁路的 manual_hold 档（models.SidelineStatusManualHold）
// 只等管理员、不会自动收敛，但它的展示态也是 sideline_pending，因而被本口径一起
// 排除了。后端目前既没有单独的展示态、也没在字段注册表暴露 sideline_state，纯前端
// 表达不出来——见 design/implement/spec/2026-08-10-webapp-v0-9771-backend-alignment.md C1。
//
// GT-12782 Task 4：display_status 的筛选语义是「后端下发的展示状态列表包含
// 该状态」（一致邮件等值、mixed 邮件包含）。本常量是**请求参数**侧，语义由
// 后端 displayStatusFilterSQL 统一承载：内部含被隔离/待审核收件人的 mixed
// 邮件也计入「待处置」——这是刻意的包含语义（信里有待处置的收件人就该被
// 处置入口看到），KPI 卡与落地列表读同一谓词，天然一致。
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
