"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Save, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingPanel } from "@/components/shared/state-panel";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  useLoginPolicy,
  useUpdateLoginPolicy,
  useAddLoginIPRule,
  useDeleteLoginIPRule,
  type LoginPolicy,
  type LoginPolicyWrite,
} from "@/lib/api/login-policy";
import { useApiErrorMessage } from "@/lib/api/use-api-error-message";

// GT-13320. Layout follows the product design (section cards, label left / control
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

// -1 = permanent: only an admin unlock lifts it.
const MAX_ATTEMPTS_TIERS = [3, 4, 5, 6, 8, 10];
const LOCKOUT_TIERS = [15, 30, 60, 360, 1440, -1];
const CAPTCHA_TIERS = [1, 2, 3, 4, 5];

type NumericPolicyField =
  | "minLength"
  | "minCharClasses"
  | "historyLimit"
  | "passwordMaxAgeDays"
  | "sessionTimeoutSecs"
  | "maxOnline";

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
    <section
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
      data-testid={testId}
    >
      <h3 className="mb-3 text-sm font-semibold text-body">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
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
  const t = useTranslations("loginSecurity");
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading } = useLoginPolicy(tenantId);
  const update = useUpdateLoginPolicy(tenantId);
  const addRule = useAddLoginIPRule(tenantId);
  const delRule = useDeleteLoginIPRule(tenantId);

  const [edits, setEdits] = useState<LoginPolicyWrite>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [resetFields, setResetFields] = useState<Set<string>>(new Set());
  const [newCidr, setNewCidr] = useState("");
  const [newRemark, setNewRemark] = useState("");
  // GT-12316：重置确认弹窗开关。必须声明在 isLoading 早退 return 之前，
  // 否则加载完成后 hooks 数量变化会触发 Rules of Hooks 崩溃（整页白屏）。
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const serverDraft = useMemo<LoginPolicyWrite>(() => {
    if (!data) return {};
    const e = data.effective;
    return {
      minLength: e.minLength,
      minCharClasses: e.minCharClasses,
      historyLimit: e.historyLimit,
      passwordMaxAgeDays: e.passwordMaxAgeDays,
      sessionTimeoutSecs: e.sessionTimeoutSecs,
      maxOnline: e.maxOnline,
      overflowPolicy: e.overflowPolicy,
      ipMode: e.ipMode,
      maxLoginAttempts: e.maxLoginAttempts,
      lockoutMinutes: e.lockoutMinutes,
      captchaAfterFailures: e.captchaAfterFailures,
      forceTwoFactor: e.forceTwoFactor,
    };
  }, [data]);

  // Rule mutations refetch the whole policy. Keep unsaved edits as a separate
  // overlay so refetches update untouched fields without replacing what the user
  // is still editing (especially ipMode before its first rule is added).
  const draft = useMemo(
    () => ({ ...serverDraft, ...edits }),
    [serverDraft, edits],
  );

  if (isLoading || !data) return <LoadingPanel />;

  const set = <K extends keyof LoginPolicyWrite>(
    k: K,
    v: LoginPolicyWrite[K],
  ) => {
    setEdits((d) => ({ ...d, [k]: v }));
    setTouched((s) => new Set(s).add(k as string));
    setResetFields((fields) => {
      const next = new Set(fields);
      next.delete(k as string);
      return next;
    });
  };

  const dirty = touched.size > 0;

  // GT-12316：取消——把 draft 恢复到服务端最新值（与挂载时的 seed 一致），
  // 清空 touched。放弃全部未保存修改。
  const onCancel = () => {
    if (!data) return;
    setEdits({});
    setTouched(new Set());
    setResetFields(new Set());
  };

  // 重置展示 System Default，但保存时发送 null，让服务端删除当前作用域
  // 的显式值；以后 System Default 变化时仍会自然跟随。
  const onResetToDefault = () => {
    if (!data) return;
    const d = data.defaults;
    const target: LoginPolicyWrite = {
      minLength: d.minLength,
      minCharClasses: d.minCharClasses,
      historyLimit: d.historyLimit,
      passwordMaxAgeDays: d.passwordMaxAgeDays,
      sessionTimeoutSecs: d.sessionTimeoutSecs,
      maxOnline: d.maxOnline,
      overflowPolicy: d.overflowPolicy,
      ipMode: d.ipMode,
      maxLoginAttempts: d.maxLoginAttempts,
      lockoutMinutes: d.lockoutMinutes,
      captchaAfterFailures: d.captchaAfterFailures,
      forceTwoFactor: d.forceTwoFactor,
    };
    setEdits((d) => ({ ...d, ...target }));
    setTouched((prev) => {
      const next = new Set(prev);
      Object.keys(target).forEach((k) => next.add(k));
      return next;
    });
    setResetFields(new Set(Object.keys(target)));
    setResetConfirmOpen(false);
    toast.info(t("resetApplied"));
  };

  const onSave = () => {
    const body: LoginPolicyWrite = {};
    for (const k of touched) {
      (body as Record<string, unknown>)[k] = resetFields.has(k)
        ? null
        : (draft as Record<string, unknown>)[k];
    }
    update.mutate(body, {
      onSuccess: () => {
        setEdits({});
        setTouched(new Set());
        setResetFields(new Set());
        toast.success(t("saved"));
      },
      onError: (e) => toast.error(apiErrorMessage(e, t("saveFailed"))),
    });
  };

  const numSelect = (
    field: NumericPolicyField,
    tiers: number[],
    value: number | undefined,
    onChange: (v: number) => void,
    fmt: (n: number) => string = String,
  ) => (
    <Select
      value={String(value ?? "")}
      onValueChange={(v) => onChange(Number(v))}
    >
      <SelectTrigger
        className="h-9 w-40"
        id={`lp-${field}`}
        aria-label={t(`fields.${field}`)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tiers.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {fmt(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const rules = data.ipRules ?? [];

  return (
    <div className="space-y-4" data-testid="login-security-tab">
      <SectionCard title={t("sections.password")}>
        <Row label={t("fields.minLength")}>
          {numSelect(
            "minLength",
            data.tiers.minLength ?? [],
            draft.minLength ?? undefined,
            (v) => set("minLength", v),
          )}
        </Row>
        <div data-testid="login-security-min-char-classes-row">
          <Row
            label={t("fields.minCharClasses")}
            hint={t("hints.minCharClasses")}
          >
            {numSelect(
              "minCharClasses",
              data.tiers.minCharClasses ?? [1, 2, 3, 4],
              draft.minCharClasses ?? undefined,
              (v) => set("minCharClasses", v),
              (n) => t("classCount", { n }),
            )}
          </Row>
        </div>
        <Row label={t("fields.historyLimit")} hint={t("hints.historyLimit")}>
          {numSelect(
            "historyLimit",
            HISTORY_TIERS,
            draft.historyLimit ?? undefined,
            (v) => set("historyLimit", v),
            (n) => (n === 0 ? t("unlimited") : t("times", { n })),
          )}
        </Row>
        <Row
          label={t("fields.passwordMaxAgeDays")}
          hint={t("hints.passwordMaxAgeDays")}
        >
          {numSelect(
            "passwordMaxAgeDays",
            VALIDITY_TIERS,
            draft.passwordMaxAgeDays ?? undefined,
            (v) => set("passwordMaxAgeDays", v),
            (n) => (n === 0 ? t("neverExpires") : t("days", { n })),
          )}
        </Row>
      </SectionCard>

      <SectionCard title={t("sections.loginControl")}>
        <Row label={t("fields.maxLoginAttempts")}>
          <Select
            value={String(draft.maxLoginAttempts)}
            onValueChange={(v) => set("maxLoginAttempts", Number(v))}
          >
            <SelectTrigger
              className="h-9 w-40"
              aria-label={t("fields.maxLoginAttempts")}
              data-testid="login-security-max-login-attempts"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAX_ATTEMPTS_TIERS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("times", { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row
          label={t("fields.lockoutMinutes")}
          hint={t("hints.lockoutMinutes")}
        >
          <Select
            value={String(draft.lockoutMinutes)}
            onValueChange={(v) => set("lockoutMinutes", Number(v))}
          >
            <SelectTrigger
              className="h-9 w-40"
              aria-label={t("fields.lockoutMinutes")}
              data-testid="login-security-lockout-minutes"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCKOUT_TIERS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === -1 ? t("permanentLock") : t("minutes", { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row
          label={t("fields.captchaAfterFailures")}
          hint={t("hints.captchaAfterFailures")}
        >
          <Select
            value={String(draft.captchaAfterFailures)}
            onValueChange={(v) => set("captchaAfterFailures", Number(v))}
          >
            <SelectTrigger
              className="h-9 w-40"
              aria-label={t("fields.captchaAfterFailures")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAPTCHA_TIERS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t("times", { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label={t("fields.sessionTimeoutSecs")}>
          {numSelect(
            "sessionTimeoutSecs",
            SESSION_TIMEOUT_TIERS,
            draft.sessionTimeoutSecs ?? undefined,
            (v) => set("sessionTimeoutSecs", v),
            (n) => t("seconds", { n }),
          )}
        </Row>
      </SectionCard>

      <SectionCard title={t("sections.ipControl")}>
        <Row label={t("fields.ipMode")}>
          <Select
            value={draft.ipMode ?? "none"}
            onValueChange={(v) => set("ipMode", v as LoginPolicy["ipMode"])}
          >
            <SelectTrigger
              className="h-9 w-40"
              aria-label={t("fields.ipMode")}
              data-testid="login-security-ip-mode"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["none", "whitelist", "blacklist"] as const).map((m) => (
                <SelectItem
                  key={m}
                  value={m}
                  data-testid={`login-security-ip-mode-option-${m}`}
                >
                  {t(`ipModes.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        {draft.ipMode && draft.ipMode !== "none" && (
          <div className="space-y-2 pt-2">
            {/* Each view shows only the rule set for the login population it
                configures. Platform rules apply to platform administrators;
                Tenant rules apply to that tenant's users. */}
            <ul
              className="divide-y divide-border rounded-md border border-border"
              data-testid="ip-rules"
            >
              {rules.length === 0 && (
                <li className="px-3 py-3 text-center text-sm text-muted-foreground">
                  {t("noRules")}
                </li>
              )}
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2"
                  data-testid={`login-security-ip-rule-${r.id}`}
                >
                  <span className="font-mono text-sm">{r.cidr}</span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {r.remark || "—"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger"
                    data-testid={`login-security-ip-rule-delete-${r.id}`}
                    onClick={() =>
                      delRule.mutate(r.id, {
                        onError: (e) =>
                          toast.error(apiErrorMessage(e, t("saveFailed"))),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("delete")}
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
                aria-label={t("fields.cidr")}
                data-testid="login-security-ip-cidr"
              />
              <Input
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
                placeholder={t("fields.remark")}
                className="h-9 w-40"
                aria-label={t("fields.remark")}
                data-testid="login-security-ip-remark"
              />
              <Button
                variant="outline"
                className="h-9"
                data-testid="login-security-ip-add"
                onClick={() =>
                  addRule.mutate(
                    { cidr: newCidr.trim(), remark: newRemark.trim() },
                    {
                      onSuccess: () => {
                        setNewCidr("");
                        setNewRemark("");
                      },
                      // The lock-out guard lives on the server: saving a whitelist
                      // that omits your own address shuts you out of the console
                      // with no way back in. Surface its message verbatim.
                      onError: (e) =>
                        toast.error(apiErrorMessage(e, t("saveFailed"))),
                    },
                  )
                }
              >
                <Plus className="h-4 w-4" />
                {t("addRule")}
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("sections.sso")}>
        <Row label={t("fields.maxOnline")} hint={t("hints.maxOnline")}>
          {numSelect(
            "maxOnline",
            MAX_ONLINE_TIERS,
            draft.maxOnline ?? undefined,
            (v) => set("maxOnline", v),
            (n) => (n === 0 ? t("unlimited") : String(n)),
          )}
        </Row>
        <Row
          label={t("fields.overflowPolicy")}
          hint={t("hints.overflowPolicy")}
        >
          <Select
            value={draft.overflowPolicy ?? "kick_earliest"}
            onValueChange={(v) =>
              set("overflowPolicy", v as LoginPolicy["overflowPolicy"])
            }
          >
            <SelectTrigger
              className="h-9 w-48"
              aria-label={t("fields.overflowPolicy")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["kick_earliest", "reject_new"] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {t(`overflowPolicies.${m}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </SectionCard>

      <SectionCard title={t("sections.twoFactor")} testId="login-security-2fa">
        <Row
          label={t("fields.forceTwoFactor")}
          hint={t("hints.forceTwoFactor")}
        >
          <Switch
            data-testid="twofactor-force-toggle"
            checked={draft.forceTwoFactor ?? false}
            onCheckedChange={(v) => set("forceTwoFactor", v)}
          />
        </Row>
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
            {t("unsavedChanges")}
          </span>
        )}
        <Button
          variant="outline"
          onClick={() => setResetConfirmOpen(true)}
          data-testid="login-security-reset"
        >
          {t("resetToDefault")}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={!dirty}
          data-testid="login-security-cancel"
        >
          {t("cancel")}
        </Button>
        <Button
          onClick={onSave}
          disabled={update.isPending || !dirty}
          data-testid="login-security-save"
        >
          {update.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {t("save")}
        </Button>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={t("resetToDefault")}
        description={t("resetConfirmDescription")}
        onConfirm={onResetToDefault}
      />
    </div>
  );
}
