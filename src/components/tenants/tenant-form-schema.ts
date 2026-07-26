import { z } from 'zod';

// RFC 1035-ish: labels + dotted + TLD. Good enough for client-side gate; the
// backend re-validates authoritatively.
export const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const domainItemSchema = z.object({
  domain: z.string().min(1).regex(DOMAIN_REGEX, 'invalidDomain'),
  // next_hop_* are optional: SaaS tenants register domains first (DNS verify),
  // then configure routing separately (Spec 2A §2.5).
  next_hop_type: z.enum(['domain', 'ip']).optional(),
  next_hop_host: z.string().optional(),
  // Optional. The drawer registers this input with a setValueAs that maps an
  // empty field to `undefined` (NOT NaN) so a domain-only registration passes
  // this optional check — an empty number input via valueAsNumber would yield
  // NaN, which z.number() rejects and would silently block submit.
  next_hop_port: z.number().int().min(1).max(65535).optional(),
});

// Kept in a dedicated, import-light module (no React / next-intl navigation) so
// the validation rules can be unit-tested directly (tenant-form-schema.test.ts)
// without dragging the radix/portal-heavy drawer (and its `next/navigation`
// imports) into the test environment.
//
// `requireDomains` is true in BOTH modes (spec §5 / spec 2A L228 "域名登记";
// the prototype likewise enforces `draft.domains.length === 0` regardless of
// mode). GT-11844 restored domain management in the edit drawer, so the edit
// form is now seeded from GET /tenants/:id/domains rather than reset to [] —
// a min(1) rule no longer deadlocks submit there.
//
// GT-12290：`requireAdmin` 只在**创建**模式为 true —— 创建租户时必须同时建出该租户的
// 第一个管理员（主管理员）；编辑抽屉不渲染这两个字段，故必须豁免，否则编辑保存会被
// 一个用户根本看不见的必填项挡住。
export function makeTenantFormSchema(requireDomains: boolean, requireAdmin: boolean) {
  const domains = requireDomains
    ? z.array(domainItemSchema).min(1, 'domainsRequired')
    : z.array(domainItemSchema);
  const adminAccount = requireAdmin
    ? z.string().trim().min(1, 'adminAccountRequired')
    : z.string().optional().or(z.literal(''));
  const adminPassword = requireAdmin
    ? z.string().min(1, 'adminPasswordRequired')
    : z.string().optional().or(z.literal(''));
  return z.object({
    name: z.string().min(1, 'nameRequired'),
    code: z.string().min(1, 'codeRequired'),
    language: z.enum(['zh', 'en', 'th', 'ru']),
    // Expire date is optional but, when supplied, must not be earlier than today
    // (spec §5: "选填则不早于当日"). Compare on the day boundary in UTC so a
    // same-day selection anywhere in the world is always accepted.
    expire_at: z
      .string()
      .nullable()
      .refine(
        (v) => v === null || v === '' || v >= new Date().toISOString().slice(0, 10),
        'expireAtBeforeToday',
      ),
    domains,
    capability_flags: z.array(z.string()),
    admin_account: adminAccount,
    admin_password: adminPassword,
  });
}

// Default (create) schema — also the one exercised by the unit tests.
export const tenantFormSchema = makeTenantFormSchema(true, true);

export type TenantFormValues = z.infer<typeof tenantFormSchema>;

// GT-11553: the apiserver answers 409 for two unrelated reasons, distinguished
// only by the error envelope's `code` (internal/api/tenants.go):
//   - `code_conflict`   -> duplicate tenant code   (create path, lines 48/64)
//   - `tenant_modified` -> optimistic-lock drift   (update path, line 315)
// The drawer used to map every 409 to the optimistic-lock copy ("该租户已被他人
// 修改,请刷新后重试"), which is simply wrong on the create path — a duplicate
// code is the caller's input error, not a concurrent edit. Kept here (rather
// than inline in the drawer) so it is unit-testable without rendering the
// portal-heavy Sheet — same rationale as makeTenantFormSchema above.
export function tenantConflictToastKey(errorCode?: string): 'toast.codeConflict' | 'toast.conflict' {
  return errorCode === 'code_conflict' ? 'toast.codeConflict' : 'toast.conflict';
}

// GT-11844: the edit drawer stages domains and applies the difference on save
// (the prototype's TagInput semantics). Extracted as a pure function because
// getting this wrong is destructive — a domain classified as "removed" has its
// next-hops and egress bindings deleted with it.
//
// Matching is by domain NAME, not identity: the form only round-trips names,
// so re-typing an existing name must be a no-op rather than delete+recreate
// (which would drop that domain's routing config and its verified status).
// Names are trimmed and blanks ignored so a half-filled new row can't be read
// as "delete everything".
export function diffTenantDomains<T extends { domain: string }>(
  current: T[],
  wanted: { domain: string }[],
): { removed: T[]; added: { domain: string }[] } {
  const wantedNames = new Set(
    wanted.map((d) => d.domain.trim()).filter((d) => d.length > 0),
  );
  const currentNames = new Set(current.map((d) => d.domain));
  return {
    removed: current.filter((d) => !wantedNames.has(d.domain)),
    added: wanted.filter(
      (d) => d.domain.trim().length > 0 && !currentNames.has(d.domain.trim()),
    ),
  };
}

export const EMPTY_TENANT_FORM: TenantFormValues = {
  name: '',
  code: '',
  language: 'zh',
  expire_at: null,
  domains: [],
  capability_flags: [],
  admin_account: '',
  admin_password: '',
};
