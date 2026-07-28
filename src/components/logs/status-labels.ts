// GT-12610：邮件日志「投递状态 / 工作流结果」枚举的本地化标签。
// 列表页（logs/email/page.tsx）与详情弹窗（email-detail-modal.tsx）共用，
// 杜绝两处映射漂移。未知枚举值按原文透出（如实展示，不臆造译文）。

export const DELIVERY_STATUS_KEYS = new Set([
  'unknown', 'delivered', 'in_delivery', 'failed', 'cancelled', 'partial_delivered',
]);

export const WORKFLOW_OUTCOME_KEYS = new Set([
  'approved', 'rejected', 'released', 'expired', 'bounced',
]);

type Translator = (key: string) => string;

export function deliveryStatusLabel(v: string, t: Translator): string {
  return DELIVERY_STATUS_KEYS.has(v) ? t(`logs.deliveryStatusValue.${v}`) : v;
}

export function workflowOutcomeLabel(v: string, t: Translator): string {
  return WORKFLOW_OUTCOME_KEYS.has(v) ? t(`logs.workflowOutcomeValue.${v}`) : v;
}
