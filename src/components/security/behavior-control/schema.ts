import { z } from 'zod';

const behaviorDimensionSchema = z.enum([
  'ip_count',
  'recipient_count',
  'mail_count',
  'attachment_size',
]);

const emailPattern = /^(\*@[\w.-]+\.\w+|[\w.-]+@[\w.-]+\.\w+)$/;
const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
const domainPattern = /^[\w.-]+\.\w+$/;

export type BehaviorControlPriorityRange = {
  min: number;
  max: number;
  defaultValue: number;
};

const tenantAdminPriorityRange: BehaviorControlPriorityRange = {
  min: 100,
  max: 1000,
  defaultValue: 600,
};

const systemAdminPriorityRange: BehaviorControlPriorityRange = {
  min: 0,
  max: 9999,
  defaultValue: 600,
};

// Keep the client-side form in step with internal/api.validatePriority.
// Tenant administrators have a deliberately narrower priority namespace,
// while system administrators can use the full project-wide range.
export function getBehaviorControlPriorityRange(isSystemAdmin: boolean): BehaviorControlPriorityRange {
  return isSystemAdmin ? systemAdminPriorityRange : tenantAdminPriorityRange;
}

const objectConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('global') }),
  z.object({
    type: z.literal('sender'),
    sub_type: z.enum(['individual', 'group']),
    value: z.string(),
  }).superRefine((d, ctx) => {
    const v = d.value.trim();
    // demo validateBehaviorRuleForm: 逐子类型给出专属空值/格式错误文案
    if (d.sub_type === 'individual') {
      if (!v) ctx.addIssue({ code: 'custom', path: ['value'], message: 'emailRequired' });
      else if (!emailPattern.test(v)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'invalidEmail' });
    } else if (d.sub_type === 'group') {
      if (!v) ctx.addIssue({ code: 'custom', path: ['value'], message: 'groupRequired' });
    }
  }),
  z.object({
    type: z.literal('senderIp'),
    sub_type: z.enum(['single', 'ipGroup']),
    value: z.string(),
  }).superRefine((d, ctx) => {
    const v = d.value.trim();
    if (d.sub_type === 'single') {
      if (!v) ctx.addIssue({ code: 'custom', path: ['value'], message: 'ipRequired' });
      else if (!ipPattern.test(v)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'invalidIp' });
    } else if (!v) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'ipGroupRequired' });
    }
  }),
  z.object({
    type: z.literal('senderDomain'),
    value: z.string(),
  }).superRefine((d, ctx) => {
    const v = d.value.trim();
    if (!v) ctx.addIssue({ code: 'custom', path: ['value'], message: 'domainRequired' });
    else if (!domainPattern.test(v)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'invalidDomain' });
  }),
]);

const conditionItemSchema = z.object({
  dim: behaviorDimensionSchema,
  threshold: z.number().int().positive('thresholdRequired').max(1_000_000, 'thresholdMax'),
});

export function createBehaviorControlSchema(priorityRange: BehaviorControlPriorityRange) {
  return z.object({
    name: z.string().min(1, 'nameRequired').max(50, 'nameMaxLength'),
    description: z.string().max(200, 'descriptionMaxLength').optional(),
    priority: z.number().int().min(priorityRange.min, 'priorityRange').max(priorityRange.max, 'priorityRange'),
    is_active: z.boolean(),
    valid_from: z.string().optional(),
    valid_until: z.string().optional(),
    direction: z.enum(['inbound', 'outbound', 'internal', 'bidirectional']),
    object_config: objectConfigSchema,
    time_window: z.enum(['1min', '5min', '15min', '1hour', '6hour', '24hour', 'day']),
    conditions: z.array(conditionItemSchema).min(1, 'conditionsMin').max(4, 'conditionsMax'),
    or_enabled: z.boolean(),
    // 以下旧字段保留供 API 映射层使用，不做前端校验
    dim_a: behaviorDimensionSchema.optional(),
    threshold_a: z.number().optional(),
    dim_b: behaviorDimensionSchema.optional(),
    threshold_b: z.number().optional(),
    action: z.enum(['audit', 'quarantine', 'discard', 'reject']),
  }).superRefine((d, ctx) => {
    if (d.valid_until && new Date(d.valid_until) < new Date(new Date().toDateString())) {
      ctx.addIssue({ path: ['valid_until'], code: 'custom', message: 'validUntilPast' });
    }
  });
}

// The broad schema remains the default export for callers that do not have an
// authenticated role. The drawer always creates a role-aware schema.
export const behaviorControlSchema = createBehaviorControlSchema(getBehaviorControlPriorityRange(true));
