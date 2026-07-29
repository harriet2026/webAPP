import { z } from 'zod';
import type { DisposalSettings } from '@/types/disposal-settings';
import {
  DISPOSAL_CATEGORY_KEYS,
  DISPOSAL_PERMISSION_KEYS,
  MALICIOUS_CATEGORY_KEYS,
} from '@/types/disposal-settings';

const timeRe = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

const permissionSchema = z.object({
  enabled: z.boolean(),
  valid_days: z.number().int().min(1).max(365),
});

const categoryNotifyEntrySchema = z.object({
  enabled: z.boolean(),
  min_score: z.number().min(0).max(1),
  max_score: z.number().min(0).max(1),
});

export const disposalSettingsSchema = z.object({
  quarantine: z.object({
    category_notify: z.record(z.string(), categoryNotifyEntrySchema),
    notify_frequency: z.enum(['daily', 'never', 'custom']),
    custom_weekdays: z.array(z.number().int().min(0).max(6)),
    notify_times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)),
    permissions: z.record(z.string(), permissionSchema),
    // GET omits portal_base_url when unset (json:"portal_base_url,omitempty"),
    // so form.reset would set it to undefined. Must NOT be required: the
    // backend enforces "required when recall/preview is enabled" itself via a
    // 400, surfaced next to the field — a required zod field would silently
    // block the whole page's Save button instead (GT-12056 replay).
    portal_base_url: z.string().optional().default(''),
    recipient_group_ids: z.array(z.number().int()),
    department_paths: z.array(z.string()),
  }),
  review: z.object({
    duration_mode: z.enum(['unlimited', 'custom']),
    custom_minutes: z.number().int(),
    // 后端强制 1-60（internal/api/disposal_settings.go），schema 上限须与其对齐。
    max_recheck_minutes: z.number().int().min(1).max(60),
    timeout_auto_deliver: z.boolean(),
    sender_notify_on_queue: z.boolean(),
    sender_notify_on_result: z.boolean(),
    reviewer_emails: z.array(z.string().email()),
    reviewer_notify_interval_minutes: z.number().int().min(1).max(1440),
    reviewer_active_start: z.string().regex(timeRe),
    reviewer_active_end: z.string().regex(timeRe),
    // 超时临时处置（旁路 Session worker 读取，见 task-8/task-12）：GET 可能省略
    // （json:"...,omitempty"），必须保持 optional，否则默认 z.object 的 strip
    // 模式会在 zodResolver 校验后把这些字段从提交数据里丢掉（GT-12056 同类问题）。
    timeout_temp_disposal: z.string().optional(),
    timeout_mark_positions: z.array(z.string()).optional(),
    timeout_mark_text: z.string().optional(),
  }),
  recall: z.object({
    task_timeout_seconds: z.number().int().min(1).max(300),
    threat_intel: z.object({
      read_policy: z.enum(['recall', 'notify', 'wait']),
      unread_policy: z.enum(['recall', 'notify', 'wait']),
    }),
    ai_detection: z.object({
      read_policy: z.enum(['recall', 'notify', 'wait']),
      unread_policy: z.enum(['recall', 'notify', 'wait']),
    }),
    notify_emails: z.array(z.string().email()),
    notify_frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']),
  }),
  // GET omits tz when empty (json:"tz,omitempty"), so a required z.string()
  // would silently block Save (validation fails on the missing key before
  // onSubmit runs). Optional here matches DisposalSettings.tz (tz?: string). tz
  // is system-managed and always pinned non-empty in onSubmit, so it must never
  // gate submission. (GT-12056)
  tz: z.string().optional(),
}).superRefine((data, ctx) => {
  if (
    data.review.duration_mode === 'custom' &&
    (data.review.custom_minutes < 1 || data.review.custom_minutes > 300)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'custom_minutes must be 1-300 when duration_mode is custom',
      path: ['review', 'custom_minutes'],
    });
  }
  if (data.quarantine.notify_frequency !== 'never' && data.quarantine.notify_times.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'notify_times must not be empty when frequency is not never',
      path: ['quarantine', 'notify_times'],
    });
  }
  if (data.quarantine.notify_frequency === 'custom' && data.quarantine.custom_weekdays.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'custom_weekdays must not be empty when frequency is custom',
      path: ['quarantine', 'custom_weekdays'],
    });
  }
  for (const [key, entry] of Object.entries(data.quarantine.category_notify)) {
    if (entry.min_score > entry.max_score) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'min_score must not be greater than max_score',
        path: ['quarantine', 'category_notify', key],
      });
    }
  }

  // 任意依赖终端入口的权限开启时，必须填写合法的外部访问地址。
  const PORTAL_DEPENDENT_PERMS = ['recall', 'preview', 'whitelist', 'blacklist'] as const;
  const anyPortalPermEnabled = PORTAL_DEPENDENT_PERMS.some(
    (k) => data.quarantine.permissions[k]?.enabled,
  );
  const baseUrl = (data.quarantine.portal_base_url ?? '').trim();
  let urlValid = false;
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      urlValid = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      urlValid = false;
    }
  }
  if (anyPortalPermEnabled && !urlValid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'portalBaseUrlRequired',
      path: ['quarantine', 'portal_base_url'],
    });
  }
});

export function defaultDisposalSettings(): DisposalSettings {
  // 后端默认（task-7-brief）：恶意 5 类（phishing/virus/account_compromised/
  // spoofing/harmful）enabled=true、min=0.6；spam enabled=true、min=0.7；
  // advertising/suspicious/sensitive enabled=false、min=0.7；max 全 1.0。
  const category_notify: Record<string, { enabled: boolean; min_score: number; max_score: number }> = {};
  DISPOSAL_CATEGORY_KEYS.forEach((k) => {
    const isMalicious = MALICIOUS_CATEGORY_KEYS.has(k);
    category_notify[k] = {
      enabled: isMalicious || k === 'spam',
      min_score: isMalicious ? 0.6 : 0.7,
      max_score: 1.0,
    };
  });
  const permissions: Record<string, { enabled: boolean; valid_days: number }> = {};
  DISPOSAL_PERMISSION_KEYS.forEach((k) => {
    permissions[k] = {
      enabled: k === 'recall' || k === 'preview',
      valid_days: k === 'recall' || k === 'preview' ? 30 : 2,
    };
  });
  return {
    quarantine: {
      category_notify,
      notify_frequency: 'daily',
      custom_weekdays: [],
      notify_times: ['09:00', '14:00'],
      permissions,
      portal_base_url: '',
      recipient_group_ids: [],
      department_paths: [],
    },
    review: {
      duration_mode: 'custom',
      custom_minutes: 15,
      max_recheck_minutes: 30,
      timeout_auto_deliver: true,
      sender_notify_on_queue: false,
      sender_notify_on_result: true,
      reviewer_emails: [],
      reviewer_notify_interval_minutes: 30,
      reviewer_active_start: '00:00:00',
      reviewer_active_end: '23:59:59',
    },
    recall: {
      task_timeout_seconds: 30,
      threat_intel: { read_policy: 'recall', unread_policy: 'recall' },
      ai_detection: { read_policy: 'notify', unread_policy: 'recall' },
      notify_emails: [],
      notify_frequency: 'realtime',
    },
    tz: '',
  };
}
