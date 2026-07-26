type AdminAuditLogLike = {
  admin_user_id?: number;
  actor_user_id?: number;
  tenant_id?: number;
  effective_tenant_id?: number;
  details?: Record<string, unknown>;
};

type ImpersonationDetails = {
  enabled?: boolean;
  target_tenant_id?: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getAdminAuditContext(log: AdminAuditLogLike) {
  const details = log.details ?? {};
  const impersonation = asRecord(details.impersonation) as ImpersonationDetails | undefined;
  const actorUserId = log.actor_user_id ?? log.admin_user_id;
  const effectiveTenantId =
    log.effective_tenant_id ??
    asNumber(details.effective_tenant_id) ??
    asNumber(impersonation?.target_tenant_id) ??
    log.tenant_id;

  return {
    actorUserId,
    effectiveTenantId,
    effectiveTenantSource: asString(details.effective_tenant_source),
    requestedTenantIdHeader: asString(details.requested_tenant_id_header),
    isImpersonating: Boolean(impersonation?.enabled),
  };
}

export function formatAdminAuditDetailsPreview(details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) {
    return '-';
  }

  const previewParts = [
    asString(details.method),
    asString(details.path),
    asString(details.requested_tenant_id_header),
  ].filter(Boolean);

  const effectiveTenantId = asNumber(details.effective_tenant_id);
  if (effectiveTenantId !== undefined) {
    previewParts.push(`tenant:${effectiveTenantId}`);
  }

  if (previewParts.length > 0) {
    return previewParts.join(' | ');
  }

  return JSON.stringify(details);
}

// diffText: 把 before_value/after_value 渲染为详情抽屉「变更对比」卡片里的纯文本。
// - Mock fixture 用 { text: '...' } 携带 demo 的纯文本前/后值 → 直出原文（1:1 demo）。
// - 真实后端写的是结构化对象 → 扁平化为 `key: value` 多行；值本身是对象则对该值 JSON.stringify（降级策略 A）。
// - 空/无 → 破折号占位。
export function diffText(value?: Record<string, unknown>): string {
  if (!value || Object.keys(value).length === 0) return '—';
  if (typeof value.text === 'string') return value.text;
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('\n');
}

// summaryText: 详情抽屉「操作摘要」取值。
// - Mock fixture 把 human 摘要放 details.summary → 优先直出（1:1 demo）。
// - 真实后端无 human 摘要字段 → 用 formatAdminAuditDetailsPreview(details) 兜底；仍为空则破折号（降级策略 A）。
export function summaryText(log: { details?: Record<string, unknown> }): string {
  const s = log.details && typeof log.details.summary === 'string' ? log.details.summary : undefined;
  if (s) return s;
  const preview = formatAdminAuditDetailsPreview(log.details);
  return preview && preview !== '-' ? preview : '—';
}
