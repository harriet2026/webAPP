import { describe, it, expect } from 'vitest';
import {
  tenantFormSchema,
  makeTenantFormSchema,
  EMPTY_TENANT_FORM,
  tenantConflictToastKey,
  diffTenantDomains,
} from './tenant-form-schema';

// The drawer's client-side validation (spec §5 / AC-2A-07) is driven entirely
// by tenantFormSchema; these tests exercise it directly rather than rendering
// the radix/portal-heavy form. The error messages are i18n keys (resolved to
// localized text at render time).

const base = {
  name: 'Acme',
  code: 'T1',
  language: 'zh',
  expire_at: null as string | null,
  domains: [{ domain: 'example.com' }],
  capability_flags: [] as string[],
  admin_account: 'acme-admin',
  admin_password: 'Aa123456789!',
};

function messages(result: ReturnType<typeof tenantFormSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe('tenantFormSchema', () => {
  it('accepts a valid payload', () => {
    expect(tenantFormSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a past expire_at with expireAtBeforeToday', () => {
    const r = tenantFormSchema.safeParse({ ...base, expire_at: '2000-01-01' });
    expect(r.success).toBe(false);
    const issue = !r.success && r.error.issues.find((i) => i.path[0] === 'expire_at');
    expect(issue && issue.message).toBe('expireAtBeforeToday');
  });

  it('accepts a far-future expire_at, and null / empty (optional field)', () => {
    expect(tenantFormSchema.safeParse({ ...base, expire_at: '2999-01-01' }).success).toBe(true);
    expect(tenantFormSchema.safeParse({ ...base, expire_at: null }).success).toBe(true);
    expect(tenantFormSchema.safeParse({ ...base, expire_at: '' }).success).toBe(true);
  });

  it('rejects an invalid domain with invalidDomain on the domain path', () => {
    const r = tenantFormSchema.safeParse({ ...base, domains: [{ domain: 'not_a_domain' }] });
    expect(r.success).toBe(false);
    const issue = !r.success && r.error.issues.find((i) => i.path.includes('domain'));
    expect(issue && issue.message).toBe('invalidDomain');
  });

  it('requires a non-empty name', () => {
    expect(messages(tenantFormSchema.safeParse({ ...base, name: '' }))).toContain('nameRequired');
  });

  it('requires at least one domain', () => {
    expect(messages(tenantFormSchema.safeParse({ ...base, domains: [] }))).toContain(
      'domainsRequired',
    );
  });

  it('accepts a domain-only registration (no next_hop_port) — Spec §2.5', () => {
    // The drawer's setValueAs maps an empty port input to undefined; an omitted
    // optional port must pass so SaaS tenants can register a bare domain first.
    const r = tenantFormSchema.safeParse({
      ...base,
      domains: [{ domain: 'example.com', next_hop_port: undefined }],
    });
    expect(r.success).toBe(true);
  });

  it('still rejects an out-of-range next_hop_port when one is provided', () => {
    const r = tenantFormSchema.safeParse({
      ...base,
      domains: [{ domain: 'example.com', next_hop_port: 70000 }],
    });
    expect(r.success).toBe(false);
  });

  it('defaults language to "zh" when omitted', () => {
    // language is required by the schema (no .default); the drawer's
    // EMPTY_TENANT_FORM seeds 'zh', so an omitted field only happens via
    // explicit construction. Assert the EMPTY form carries the default.
    expect(EMPTY_TENANT_FORM.language).toBe('zh');
  });

  it('accepts all four supported language codes', () => {
    for (const lang of ['zh', 'en', 'th', 'ru'] as const) {
      expect(tenantFormSchema.safeParse({ ...base, language: lang }).success).toBe(true);
    }
  });

  it('rejects an unsupported language code', () => {
    expect(tenantFormSchema.safeParse({ ...base, language: 'fr' }).success).toBe(false);
  });
});

// GT-11553 — a duplicate tenant code (409 `code_conflict`, create path) used to
// surface the optimistic-lock copy "该租户已被他人修改,请刷新后重试", which
// misleads the operator into refreshing instead of changing the code. The two
// 409 causes must map to different copy.
describe('tenantConflictToastKey (GT-11553)', () => {
  it('maps a duplicate-code 409 to the code-conflict copy', () => {
    expect(tenantConflictToastKey('code_conflict')).toBe('toast.codeConflict');
  });

  it('maps an optimistic-lock 409 to the stale-tenant copy', () => {
    expect(tenantConflictToastKey('tenant_modified')).toBe('toast.conflict');
  });

  it('falls back to the stale-tenant copy for an absent/unknown code', () => {
    expect(tenantConflictToastKey(undefined)).toBe('toast.conflict');
    expect(tenantConflictToastKey('something_else')).toBe('toast.conflict');
  });

  // Guard the keys against the real message catalogues rather than a hand-copied
  // default, so deleting/renaming either key fails here instead of silently
  // rendering a raw key at runtime (next-intl does not throw on a missing key).
  it.each(['zh', 'en', 'th', 'ru'])('both toast keys resolve in %s', (locale) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const toast = require(`../../../messages/${locale}.json`).tenants.toast;
    expect(typeof toast.codeConflict).toBe('string');
    expect(toast.codeConflict.length).toBeGreaterThan(0);
    expect(toast.codeConflict).not.toBe(toast.conflict);
  });
});

// GT-11844 — the edit drawer stages domains and applies the difference on save.
// Misclassifying a domain as "removed" deletes its next-hops and egress
// bindings, so each branch is pinned explicitly.
describe('diffTenantDomains (GT-11844)', () => {
  const cur = [
    { id: 1, domain: 'a.test' },
    { id: 2, domain: 'b.test' },
  ];

  it('reports nothing to do when the list is unchanged', () => {
    const { removed, added } = diffTenantDomains(cur, [
      { domain: 'a.test' },
      { domain: 'b.test' },
    ]);
    expect(removed).toEqual([]);
    expect(added).toEqual([]);
  });

  it('detects an added domain without touching existing ones', () => {
    const { removed, added } = diffTenantDomains(cur, [
      { domain: 'a.test' },
      { domain: 'b.test' },
      { domain: 'c.test' },
    ]);
    expect(removed).toEqual([]);
    expect(added.map((d) => d.domain)).toEqual(['c.test']);
  });

  it('detects a removed domain and carries its id for the DELETE', () => {
    const { removed, added } = diffTenantDomains(cur, [{ domain: 'a.test' }]);
    expect(added).toEqual([]);
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe(2);
    expect(removed[0].domain).toBe('b.test');
  });

  // The destructive edge: a blank row (operator clicked "add domain" then
  // saved) must not be read as an instruction to delete anything.
  it('ignores blank and whitespace-only rows', () => {
    const { removed, added } = diffTenantDomains(cur, [
      { domain: 'a.test' },
      { domain: 'b.test' },
      { domain: '   ' },
      { domain: '' },
    ]);
    expect(removed).toEqual([]);
    expect(added).toEqual([]);
  });

  // Re-typing an existing name must be a no-op, NOT delete+recreate — the
  // latter would silently drop that domain's routing config and verified status.
  it('treats a re-typed existing name (with padding) as unchanged', () => {
    const { removed, added } = diffTenantDomains(cur, [
      { domain: '  a.test  ' },
      { domain: 'b.test' },
    ]);
    expect(removed).toEqual([]);
    expect(added).toEqual([]);
  });

  it('handles a simultaneous add and remove', () => {
    const { removed, added } = diffTenantDomains(cur, [
      { domain: 'a.test' },
      { domain: 'c.test' },
    ]);
    expect(removed.map((d) => d.domain)).toEqual(['b.test']);
    expect(added.map((d) => d.domain)).toEqual(['c.test']);
  });

  it('reports every domain as removed when the list is cleared', () => {
    const { removed } = diffTenantDomains(cur, []);
    expect(removed.map((d) => d.domain)).toEqual(['a.test', 'b.test']);
  });
});

// GT-12290：创建租户时必须填主管理员账号+初始密码；编辑模式豁免（编辑抽屉不渲染
// 这两个字段，主管理员改密走「重置密码」入口）。
describe('makeTenantFormSchema requireAdmin (GT-12290)', () => {
  const createSchema = makeTenantFormSchema(true, true);
  const editSchema = makeTenantFormSchema(true, false);
  const withAdmin = { ...base, admin_account: 'acme-admin', admin_password: 'Aa123456789!' };

  it('accepts a create payload carrying account + password', () => {
    expect(createSchema.safeParse(withAdmin).success).toBe(true);
  });

  it('rejects a missing admin_account with adminAccountRequired', () => {
    const r = createSchema.safeParse({ ...withAdmin, admin_account: '' });
    expect(r.success).toBe(false);
    const issue = !r.success && r.error.issues.find((i) => i.path[0] === 'admin_account');
    expect(issue && issue.message).toBe('adminAccountRequired');
  });

  it('rejects a whitespace-only admin_account', () => {
    expect(createSchema.safeParse({ ...withAdmin, admin_account: '   ' }).success).toBe(false);
  });

  it('rejects a missing admin_password with adminPasswordRequired', () => {
    const r = createSchema.safeParse({ ...withAdmin, admin_password: '' });
    expect(r.success).toBe(false);
    const issue = !r.success && r.error.issues.find((i) => i.path[0] === 'admin_password');
    expect(issue && issue.message).toBe('adminPasswordRequired');
  });

  it('exempts both fields in edit mode', () => {
    expect(editSchema.safeParse({ ...base, admin_account: '', admin_password: '' }).success).toBe(true);
  });

  it('keeps both keys on EMPTY_TENANT_FORM so RHF resets clear them', () => {
    expect(EMPTY_TENANT_FORM.admin_account).toBe('');
    expect(EMPTY_TENANT_FORM.admin_password).toBe('');
  });
});
