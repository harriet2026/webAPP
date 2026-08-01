'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Lock, Save, Trash2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingPanel } from '@/components/shared/state-panel';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  useLoginPolicy,
  useUpdateLoginPolicy,
  useAddLoginIPRule,
  useDeleteLoginIPRule,
  type LoginPolicy,
  type LoginPolicyWrite,
} from '@/lib/api/login-policy';
import { isBelowBaseline, type StrictnessField } from '@/lib/api/strictness';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

// GT-11959. Layout follows the product design (section cards, label left / control
// right), with ONE deliberate departure: password complexity is an "at least N of
// four" dropdown, not four independent checkboxes.
//
// The design's four checkboxes are the model the 2026-07-04 password-strength spec
// explicitly REPLACED (it removed requireUpperLower / requireSpecial in favour of
// the N-of-4 count, and there are guard tests keeping those flags gone). Drawing
// the checkboxes while the backend counts classes would be a FAKE alignment: an
// admin ticking "uppercase + special" would get "any 2 of 4" enforced, so a
// lowercase+digit password would sail through the rule they thought they had set.

const SESSION_TIMEOUT_TIERS = [300, 1800, 3600, 7200, 86400];
const HISTORY_TIERS = [0, 1, 2, 3, 5, 8, 10];
const VALIDITY_TIERS = [0, 30, 60, 90, 180, 365];
const MAX_ONLINE_TIERS = [0, 1, 2, 3, 5, 8, 10];

// Platform-scope-only. -1 = permanent: only an admin unlock lifts it, which is why
// there is an unlock action on the user list.
const MAX_ATTEMPTS_TIERS = [3, 4, 5, 6, 8, 10];
const LOCKOUT_TIERS = [15, 30, 60, 360, 1440, -1];
const CAPTCHA_TIERS = [1, 2, 3, 4, 5];

function SectionCard({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm" data-testid={testId}>
      <h3 className="mb-3 text-sm font-semibold text-body">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-1.5">
      <div className="w-48 flex-shrink-0">
        <span className="text-sm text-body">{label}</span>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function LoginSecurityTab({ tenantId }: { tenantId?: number | null }) {
  const t = useTranslations('loginSecurity');
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading } = useLoginPolicy(tenantId);
  const update = useUpdateLoginPolicy(tenantId);
  const addRule = useAddLoginIPRule(tenantId);
  const delRule = useDeleteLoginIPRule(tenantId);

  const [draft, setDraft] = useState<LoginPolicyWrite>({});
  // Which fields the user actually TOUCHED this session.
  //
  // §4.4: the server deliberately never rewrites a tenant's stale below-baseline
  // override — the tenant's intent is preserved, the baseline is simply what gets
  // enforced. The client was undoing that: the draft seeds every field from
  // `effective`, so a tenant whose saved minLength=8 had been out-tightened to 12
  // saw 12, and saving ANY unrelated field silently rewrote their 8 to 12 in the
  // database. Only send what was edited.
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [newCidr, setNewCidr] = useState('');
  const [newRemark, setNewRemark] = useState('');
  // GT-12316：重置确认弹窗开关。必须声明在 isLoading 早退 return 之前，
  // 否则加载完成后 hooks 数量变化会触发 Rules of Hooks 崩溃（整页白屏）。
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Seeds from EFFECTIVE: a tenant whose saved value has been out-tightened by the
  // platform must see what is actually enforced, not the inert number they once
  // chose.
  //
  // `effective.ipMode` is the mode of THIS scope's own layer (the server special-
  // cases it, because ipMode is not merged — the layers are evaluated independently
  // and both must pass). It used to carry the BASELINE's mode, which meant a tenant
  // saved `whitelist`, reloaded, saw 关闭, and the next save of any unrelated field
  // wrote `ipMode: "none"` back over its own whitelist.
  useEffect(() => {
    if (!data) return;
    const e = data.effective;
    setDraft({
      minLength: e.minLength,
      minCharClasses: e.minCharClasses,
      historyLimit: e.historyLimit,
      passwordMaxAgeDays: e.passwordMaxAgeDays,
      sessionTimeoutSecs: e.sessionTimeoutSecs,
      maxOnline: e.maxOnline,
      overflowPolicy: e.overflowPolicy,
      ipMode: e.ipMode,
      // Platform-only. Seeded for every scope so the tenant read-only view has
      // something to show, but only sent on a platform save (see onSave).
      maxLoginAttempts: data.globalOnly.maxLoginAttempts,
      lockoutMinutes: data.globalOnly.lockoutMinutes,
      captchaAfterFailures: data.globalOnly.captchaAfterFailures,
      // Plan D §5 (A-18). Tenant scope self-toggle; platform scope global force.
      // Seeded from `effective` for the same reason as everything else above —
      // a tenant whose saved self-toggle is being overridden by a platform force
      // must see the enforced state, not an inert one it once chose.
      twoFactorEnabled: e.twoFactorEnabled,
      forceTwoFactor: e.forceTwoFactor,
    });
  }, [data]);

  const isTenant = data?.scope === 'tenant';
  const baseline = data?.baseline;

  // Grey out options the server would reject anyway. UX only — the server
  // re-validates every write, because a caller talking to the API directly is not
  // running this code.
  const blocked = useMemo(
    () => (field: StrictnessField, v: number | string) =>
      isTenant && baseline ? isBelowBaseline(field, v, baseline[field as keyof LoginPolicy] as number | string) : false,
    [isTenant, baseline],
  );

  const belowBaseline = new Set(data?.belowBaseline ?? []);

  if (isLoading || !data) return <LoadingPanel />;

  const set = <K extends keyof LoginPolicyWrite>(k: K, v: LoginPolicyWrite[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setTouched((s) => new Set(s).add(k as string));
  };

  const PLATFORM_ONLY = ['maxLoginAttempts', 'lockoutMinutes', 'captchaAfterFailures'];

  const dirty = touched.size > 0;

  // GT-12316：取消——把 draft 恢复到服务端最新值（与挂载时的 seed 一致），
  // 清空 touched。放弃全部未保存修改。
  const onCancel = () => {
    if (!data) return;
    const e = data.effective;
    setDraft({
      minLength: e.minLength,
      minCharClasses: e.minCharClasses,
      historyLimit: e.historyLimit,
      passwordMaxAgeDays: e.passwordMaxAgeDays,
      sessionTimeoutSecs: e.sessionTimeoutSecs,
      maxOnline: e.maxOnline,
      overflowPolicy: e.overflowPolicy,
      ipMode: e.ipMode,
      maxLoginAttempts: data.globalOnly.maxLoginAttempts,
      lockoutMinutes: data.globalOnly.lockoutMinutes,
      captchaAfterFailures: data.globalOnly.captchaAfterFailures,
      twoFactorEnabled: e.twoFactorEnabled,
      forceTwoFactor: e.forceTwoFactor,
    });
    setTouched(new Set());
  };

  // GT-12316：重置——平台视角回产品默认值（对齐 internal/api/login_policy.go
  // baselineLoginPolicy() 的代码缺省），租户视角回平台基线。仅填充 draft 并
  // 标记 touched，仍需点「保存」才持久化（原型 layer-4 重置确认弹窗语义）。
  const onResetToDefault = () => {
    if (!data) return;
    const target: LoginPolicyWrite = isTenant && baseline
      ? {
          minLength: baseline.minLength,
          minCharClasses: baseline.minCharClasses,
          historyLimit: baseline.historyLimit,
          passwordMaxAgeDays: baseline.passwordMaxAgeDays,
          sessionTimeoutSecs: baseline.sessionTimeoutSecs,
          maxOnline: baseline.maxOnline,
          overflowPolicy: baseline.overflowPolicy,
          ipMode: 'none',
        }
      : {
          minLength: 10,
          minCharClasses: 2,
          historyLimit: 3,
          passwordMaxAgeDays: 0,
          sessionTimeoutSecs: 86400,
          maxOnline: 0,
          overflowPolicy: 'kick_earliest',
          ipMode: 'none',
        };
    setDraft((d) => ({ ...d, ...target }));
    setTouched((prev) => {
      const next = new Set(prev);
      Object.keys(target).forEach((k) => next.add(k));
      return next;
    });
    setResetConfirmOpen(false);
    toast.info(t('resetApplied'));
  };

  const onSave = () => {
    const body: LoginPolicyWrite = {};
    for (const k of touched) {
      // Platform-only fields are rejected by the server on a tenant scope
      // (deliberately — a tenant admin is told why rather than watching the change
      // vanish), so never send them from there.
      if (isTenant && PLATFORM_ONLY.includes(k)) continue;
      (body as Record<string, unknown>)[k] = (draft as Record<string, unknown>)[k];
    }
    update.mutate(body, {
      onSuccess: () => {
        setTouched(new Set());
        toast.success(t('saved'));
      },
      onError: (e) => toast.error(apiErrorMessage(e, t('saveFailed'))),
    });
  };

  const numSelect = (
    field: StrictnessField,
    tiers: number[],
    value: number | undefined,
    onChange: (v: number) => void,
    fmt: (n: number) => string = String,
  ) => (
    <Select value={String(value ?? '')} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 w-40" id={`lp-${field}`} aria-label={t(`fields.${field}`)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tiers.map((n) => (
          <SelectItem key={n} value={String(n)} disabled={blocked(field, n)}>
            {fmt(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const belowHint = (field: string) =>
    belowBaseline.has(field) ? (
      <span role="alert" className="text-xs text-warning">
        {t('belowBaseline')}
      </span>
    ) : null;

  const tenantRules = data.ipRules.tenant ?? [];
  const platformRules = data.ipRules.platform ?? [];
  const rules = isTenant ? tenantRules : platformRules;

  return (
    <div className="space-y-4" data-testid="login-security-tab">
      {isTenant && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{t('tenantBanner')}</span>
        </div>
      )}

      <SectionCard title={t('sections.password')}>
        <Row label={t('fields.minLength')}>
          {numSelect('minLength', data.tiers.minLength ?? [], draft.minLength ?? undefined, (v) =>
            set('minLength', v),
          )}
          {belowHint('minLength')}
        </Row>
        <Row label={t('fields.minCharClasses')} hint={t('hints.minCharClasses')}>
          {numSelect(
            'minCharClasses',
            data.tiers.minCharClasses ?? [1, 2, 3, 4],
            draft.minCharClasses ?? undefined,
            (v) => set('minCharClasses', v),
            (n) => t('classCount', { n }),
          )}
          {belowHint('minCharClasses')}
        </Row>
        <Row label={t('fields.historyLimit')} hint={t('hints.historyLimit')}>
          {numSelect(
            'historyLimit',
            HISTORY_TIERS,
            draft.historyLimit ?? undefined,
            (v) => set('historyLimit', v),
            (n) => (n === 0 ? t('unlimited') : t('times', { n })),
          )}
          {belowHint('historyLimit')}
        </Row>
        <Row label={t('fields.passwordMaxAgeDays')} hint={t('hints.passwordMaxAgeDays')}>
          {numSelect(
            'passwordMaxAgeDays',
            VALIDITY_TIERS,
            draft.passwordMaxAgeDays ?? undefined,
            (v) => set('passwordMaxAgeDays', v),
            (n) => (n === 0 ? t('neverExpires') : t('days', { n })),
          )}
          {belowHint('passwordMaxAgeDays')}
        </Row>
      </SectionCard>

      <SectionCard title={t('sections.loginControl')}>
        {/* Read-only, and labelled as such rather than omitted: these are NOT
            layered, because they are evaluated pre-auth and keyed by username — an
            unknown user has no tenant and would fall back to the baseline while a
            real one used its tenant's value, and the difference between those two
            answers tells an attacker whether the account exists. */}
        <Row label={t('fields.maxLoginAttempts')} hint={isTenant ? t('platformOnly') : undefined}>
          {isTenant ? (
            <span className="text-sm tabular-nums text-muted-foreground" data-testid="global-max-attempts">
              {data.globalOnly.maxLoginAttempts}
            </span>
          ) : (
            <Select
              value={String(draft.maxLoginAttempts ?? data.globalOnly.maxLoginAttempts)}
              onValueChange={(v) => set('maxLoginAttempts', Number(v))}
            >
              <SelectTrigger className="h-9 w-40" aria-label={t('fields.maxLoginAttempts')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAX_ATTEMPTS_TIERS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t('times', { n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Row>
        <Row label={t('fields.lockoutMinutes')} hint={isTenant ? t('platformOnly') : t('hints.lockoutMinutes')}>
          {isTenant ? (
            <span className="text-sm tabular-nums text-muted-foreground">
              {data.globalOnly.lockoutMinutes === -1
                ? t('permanentLock')
                : t('minutes', { n: data.globalOnly.lockoutMinutes })}
            </span>
          ) : (
            <Select
              value={String(draft.lockoutMinutes ?? data.globalOnly.lockoutMinutes)}
              onValueChange={(v) => set('lockoutMinutes', Number(v))}
            >
              <SelectTrigger className="h-9 w-40" aria-label={t('fields.lockoutMinutes')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCKOUT_TIERS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === -1 ? t('permanentLock') : t('minutes', { n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Row>
        <Row label={t('fields.captchaAfterFailures')} hint={isTenant ? t('platformOnly') : t('hints.captchaAfterFailures')}>
          {isTenant ? (
            <span className="text-sm tabular-nums text-muted-foreground">
              {data.globalOnly.captchaAfterFailures}
            </span>
          ) : (
            <Select
              value={String(draft.captchaAfterFailures ?? data.globalOnly.captchaAfterFailures)}
              onValueChange={(v) => set('captchaAfterFailures', Number(v))}
            >
              <SelectTrigger className="h-9 w-40" aria-label={t('fields.captchaAfterFailures')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTCHA_TIERS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {t('times', { n })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Row>
        <Row label={t('fields.sessionTimeoutSecs')}>
          {numSelect(
            'sessionTimeoutSecs',
            SESSION_TIMEOUT_TIERS,
            draft.sessionTimeoutSecs ?? undefined,
            (v) => set('sessionTimeoutSecs', v),
            (n) => t('seconds', { n }),
          )}
          {belowHint('sessionTimeoutSecs')}
        </Row>
      </SectionCard>

      <SectionCard title={t('sections.ipControl')}>
        <Row label={t('fields.ipMode')}>
          <Select value={draft.ipMode ?? 'none'} onValueChange={(v) => set('ipMode', v as LoginPolicy['ipMode'])}>
            <SelectTrigger className="h-9 w-40" aria-label={t('fields.ipMode')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['none', 'whitelist', 'blacklist'] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`ipModes.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        {draft.ipMode && draft.ipMode !== 'none' && (
          <div className="space-y-2 pt-2">
            {/* A tenant sees ONLY its own rules. The platform layer is evaluated
                separately and a login must pass both — showing platform rules here
                would suggest the tenant could delete them, and clearing the list
                would look like it had lifted a platform restriction. */}
            <ul className="divide-y divide-border rounded-md border border-border" data-testid="ip-rules">
              {rules.length === 0 && (
                <li className="px-3 py-3 text-center text-sm text-muted-foreground">{t('noRules')}</li>
              )}
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="font-mono text-sm">{r.cidr}</span>
                  <span className="flex-1 text-sm text-muted-foreground">{r.remark || '—'}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    onClick={() =>
                      delRule.mutate(r.id, {
                        onError: (e) => toast.error(apiErrorMessage(e, t('saveFailed'))),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t('delete')}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newCidr}
                onChange={(e) => setNewCidr(e.target.value)}
                placeholder="192.168.1.0/24"
                className="h-9 w-48"
                aria-label={t('fields.cidr')}
              />
              <Input
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
                placeholder={t('fields.remark')}
                className="h-9 w-40"
                aria-label={t('fields.remark')}
              />
              <Button
                variant="outline"
                className="h-9"
                onClick={() =>
                  addRule.mutate(
                    { cidr: newCidr.trim(), remark: newRemark.trim() },
                    {
                      onSuccess: () => {
                        setNewCidr('');
                        setNewRemark('');
                      },
                      // The lock-out guard lives on the server: saving a whitelist
                      // that omits your own address shuts you out of the console
                      // with no way back in. Surface its message verbatim.
                      onError: (e) => toast.error(apiErrorMessage(e, t('saveFailed'))),
                    },
                  )
                }
              >
                <Plus className="h-4 w-4" />
                {t('addRule')}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('sections.sso')}>
        <Row label={t('fields.maxOnline')} hint={t('hints.maxOnline')}>
          {numSelect(
            'maxOnline',
            MAX_ONLINE_TIERS,
            draft.maxOnline ?? undefined,
            (v) => set('maxOnline', v),
            (n) => (n === 0 ? t('unlimited') : String(n)),
          )}
          {belowHint('maxOnline')}
        </Row>
        <Row label={t('fields.overflowPolicy')} hint={t('hints.overflowPolicy')}>
          <Select
            value={draft.overflowPolicy ?? 'kick_earliest'}
            onValueChange={(v) => set('overflowPolicy', v as LoginPolicy['overflowPolicy'])}
          >
            <SelectTrigger className="h-9 w-48" aria-label={t('fields.overflowPolicy')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['kick_earliest', 'reject_new'] as const).map((m) => (
                <SelectItem key={m} value={m} disabled={blocked('overflowPolicy', m)}>
                  {t(`overflowPolicies.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {belowHint('overflowPolicy')}
        </Row>
      </SectionCard>

      <SectionCard title={t('sections.twoFactor')} testId="login-security-2fa">
        {isTenant ? (
          <Row
            label={t('fields.twoFactorEnabled')}
            hint={data.effective.forceTwoFactor ? undefined : t('hints.twoFactorEnabled')}
          >
            <Switch
              data-testid="twofactor-enabled-toggle"
              checked={data.effective.forceTwoFactor ? true : (draft.twoFactorEnabled ?? false)}
              disabled={data.effective.forceTwoFactor}
              onCheckedChange={(v) => set('twoFactorEnabled', v)}
            />
            {data.effective.forceTwoFactor && (
              <span
                data-testid="twofactor-locked-hint"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('hints.twoFactorLocked')}
              </span>
            )}
          </Row>
        ) : (
          <Row label={t('fields.forceTwoFactor')} hint={t('hints.forceTwoFactor')}>
            <Switch
              data-testid="twofactor-force-toggle"
              checked={draft.forceTwoFactor ?? false}
              onCheckedChange={(v) => set('forceTwoFactor', v)}
            />
          </Row>
        )}
      </SectionCard>

      {/* GT-12316：底部按钮对齐原型——重置为默认 / 取消(dirty 可用) /
          保存(dirty 可用)，并给出未保存脏状态提示。 */}
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <span
            data-testid="login-security-dirty"
            className="mr-auto inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('unsavedChanges')}
          </span>
        )}
        <Button
          variant="outline"
          onClick={() => setResetConfirmOpen(true)}
          data-testid="login-security-reset"
        >
          {isTenant ? t('resetToBaseline') : t('resetToDefault')}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={!dirty}
          data-testid="login-security-cancel"
        >
          {t('cancel')}
        </Button>
        <Button onClick={onSave} disabled={update.isPending || !dirty} data-testid="login-security-save">
          {update.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t('save')}
        </Button>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={isTenant ? t('resetToBaseline') : t('resetToDefault')}
        description={t('resetConfirmDescription')}
        onConfirm={onResetToDefault}
      />
    </div>
  );
}
