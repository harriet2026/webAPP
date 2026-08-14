"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useHydrated } from "@/hooks/use-hydrated";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { InteractiveSurface } from "@/components/ui/interactive-surface";
import {
  CalendarIcon,
  Check,
  ChevronDown,
  RotateCcw,
  Search,
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EXECUTION_ACTIONS } from "@/types/email-disposal";
import type { DisposalQuickFilter } from "@/types/email-disposal";
import { MultiSelectFilter } from "./lib/multi-select-filter";
import {
  groupDisposalModulesByStage,
  type DisposalLang,
} from "./lib/disposal-basis-config";
import { useLocale } from "next-intl";
import { useProductForm } from "@/contexts/product-form-context";

interface QuickFiltersProps {
  value: DisposalQuickFilter;
  onChange: (value: DisposalQuickFilter) => void;
  disposalRuleOptions?: { id: string; name: string }[];
  tenantSelector?: ReactNode;
}

export function QuickFilters({
  value,
  onChange,
  disposalRuleOptions = [],
  tenantSelector,
}: QuickFiltersProps) {
  const t = useTranslations("emailDisposal.filters");
  const tErrors = useTranslations("emailDisposal.errors");
  const tCommon = useTranslations("common");
  const rawLocale = useLocale();
  // Map next-intl locale to one of the disposal-basis dictionary's supported
  // langs; unknown locales fall back to zh (the dictionary's primary language).
  const disposalLang: DisposalLang = (
    ["zh", "en", "th", "ru"] as const
  ).includes(rawLocale as DisposalLang)
    ? (rawLocale as DisposalLang)
    : "zh";
  const [policyMode, setPolicyMode] = useState<"module" | "rule">("module");
  const [ruleSearch, setRuleSearch] = useState("");
  const { viewer, capabilities } = useProductForm();
  // 多租户产品形态 + 租户管理员视角下，阶段1（连接层）为平台级策略，
  // 租户无权配置，处置依据筛选中将整个阶段1折叠为"平台管控策略"只读标签展示。
  const hidePlatformStage = viewer === "tenant" && capabilities?.multiTenant === true;

  // SSR/hydration 安全：tenantSelector 依赖客户端 capabilities（异步加载），
  // SSR 时始终为 null，客户端水合后才显示，避免 DOM 结构不一致。
  const mounted = useHydrated();
  // GT-12236: 原型要求处置依据按模块语义展示（附件安全检测为单一模块），
  // 而后端 policy_key 把它拆成 ATT-BASIC/ATT-QR/ATT-ENC 三个 key。
  // groupDisposalModulesByStage 按模块名分组合并：同名 key 只出现一次，
  // 勾选时展开为全部 key（后端 disposal_policy_keys 是多 key OR 语义，
  // 查询语义不变）。
  const modulesByStage = useMemo(() => {
    const groups = groupDisposalModulesByStage(disposalLang);
    return [1, 2, 3, 4, 5].map((stage) => ({
      stage,
      modules: groups
        .filter((g) => g.stage === stage)
        .map((g) => ({ moduleName: g.moduleName, keys: g.keys })),
    }));
  }, [disposalLang]);
  const visibleRuleOptions = useMemo(() => {
    const needle = ruleSearch.trim().toLowerCase();
    return disposalRuleOptions
      .filter(
        (rule) =>
          !needle ||
          rule.id.toLowerCase().includes(needle) ||
          rule.name.toLowerCase().includes(needle),
      )
      .slice(0, 12);
  }, [disposalRuleOptions, ruleSearch]);

  // Single source of truth — defined in src/types/email-disposal.ts,
  // shared with the 安全总览 › 安全态势分析 action series.
  // GT-12659：mark_deliver 已从枚举里整条移除（其邮件并入 deliver），
  // 这里不再需要额外过滤。
  const actions = EXECUTION_ACTIONS;
  const directions = ["incoming", "outgoing", "internal"] as const;
  const mailTypes = [
    "normal",
    "subscription",
    "advertising",
    "spam",
    "harmful",
    "suspicious",
    "sensitive",
    "spoofing",
    "phishing",
    "virus",
    "account_compromised",
  ] as const;

  const warnIfLargeDateRange = useCallback(
    (start?: string, end?: string) => {
      if (!start || !end) return;
      try {
        const days = differenceInDays(parseISO(end), parseISO(start));
        if (days > 90) {
          toast.warning(tErrors("dateRangeOver90"));
        }
      } catch {
        // ignore invalid dates
      }
    },
    [tErrors],
  );
  // 邮件状态枚举按"邮件当前所在位置"维度组织（而非风险/结果性质），
  // 与 DisplayStatus（@/types/email-disposal）保持一致：
  //   仍在我方系统内 → 已停在网关 → 已离开网关(去向已确定) →
  //   针对已送达邮件的位置变更 → 已归档/清理
  const statuses = [
    "delivering",
    "quarantine_pending",
    "sideline_pending",
    "audit_pending",
    "rejected",
    "discarded",
    "delivery_cancelled",
    "delivered",
    "delivery_failed",
    "recall_pending",
    "recall_success",
    "recall_failed",
    "expired",
  ] as const;

  const startTime = value.sendReceiveTime?.start;
  const endTime = value.sendReceiveTime?.end;

  // GT-12423: 原型筛选区为 4 列网格；lg(1024) 即四列，保证 1024px 下
  // 收发时间/收发类型/发信人/收信人同一行（QC UI04）。
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="disposal-quick-filters">
          {mounted && tenantSelector ? (
            <div className="order-1 space-y-1">
              <label className="text-xs text-muted-foreground">
                {t("tenantScope")}
              </label>
              {tenantSelector}
            </div>
          ) : null}
          <div className="order-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sendReceiveTime")}
            </label>
            <div className="flex min-w-0 gap-1">
              <Popover>
                <PopoverTrigger
                  data-testid="disposal-date-range"
                  render={
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 min-w-0 flex-1 justify-start px-3 text-left text-xs font-normal",
                        !startTime && !endTime && "text-muted-foreground",
                      )}
                    />
                  }
                >
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {startTime && endTime
                    ? `${startTime} ~ ${endTime}`
                    : startTime || endTime || t("selectDate")}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    selected={
                      startTime || endTime
                        ? {
                            from: startTime ? parseISO(startTime) : undefined,
                            to: endTime ? parseISO(endTime) : undefined,
                          }
                        : undefined
                    }
                    onSelect={(range) => {
                      const newStart = range?.from
                        ? format(range.from, "yyyy-MM-dd")
                        : "";
                      const newEnd = range?.to
                        ? format(range.to, "yyyy-MM-dd")
                        : "";
                      onChange({
                        ...value,
                        sendReceiveTime:
                          newStart || newEnd
                            ? { start: newStart, end: newEnd }
                            : undefined,
                      });
                      warnIfLargeDateRange(newStart, newEnd);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="order-3 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sendReceiveType")}
            </label>
            <Select
              value={value.sendReceiveType || ""}
              onValueChange={(v) =>
                onChange({ ...value, sendReceiveType: v || undefined })
              }
            >
              <SelectTrigger
                data-testid="disposal-direction-filter"
                className="h-9 w-full text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("all")}</SelectItem>
                {directions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {t(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="order-4 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("senderIp")}
            </label>
            <Input
              data-testid="disposal-sender-ip-filter"
              className="h-9 text-xs"
              value={value.senderIp || ""}
              onChange={(e) =>
                onChange({ ...value, senderIp: e.target.value || undefined })
              }
            />
          </div>

          <div className="order-5 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("sender")}
            </label>
            <Input
              data-testid="disposal-sender-filter"
              className="h-9 text-xs"
              value={value.sender || ""}
              onChange={(e) =>
                onChange({ ...value, sender: e.target.value || undefined })
              }
            />
          </div>

          <div className="order-6 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("recipient")}
            </label>
            <Input
              data-testid="disposal-recipient-filter"
              className="h-9 text-xs"
              value={value.recipient || ""}
              onChange={(e) =>
                onChange({ ...value, recipient: e.target.value || undefined })
              }
            />
          </div>

          <div className="order-7 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("subject")}
            </label>
            <Input
              data-testid="disposal-subject-filter"
              className="h-9 text-xs"
              value={value.subject || ""}
              onChange={(e) =>
                onChange({ ...value, subject: e.target.value || undefined })
              }
            />
          </div>

          <div className="order-11 space-y-1" data-testid="disposal-action-filter">
            <label className="text-xs font-medium text-muted-foreground">
              {t("executionAction")}
            </label>
            <MultiSelectFilter
              options={actions.map((a) => ({
                value: a,
                label: t(`actions.${a}`),
              }))}
              value={
                value.executionActions ||
                (value.executionAction ? [value.executionAction] : [])
              }
              onChange={(next) =>
                onChange({
                  ...value,
                  executionAction: undefined,
                  executionActions: next.length > 0 ? next : undefined,
                })
              }
              placeholder={t("all")}
              selectedCountLabel={(count) => `${count} ${tCommon("selected")}`}
              clearLabel={t("clearAll")}
              className="h-9"
            />
          </div>

          <div className="order-9 space-y-1" data-testid="disposal-status-filter">
            <label className="text-xs font-medium text-muted-foreground">
              {t("emailStatus")}
            </label>
            <MultiSelectFilter
              options={statuses.map((status) => ({
                value: status,
                label: t(`statuses.${status}`),
              }))}
              value={value.emailStatuses || (value.emailStatus ? [value.emailStatus] : [])}
              onChange={(next) => onChange({
                ...value,
                emailStatus: undefined,
                emailStatuses: next.length > 0 ? next : undefined,
              })}
              placeholder={t("all")}
              selectedCountLabel={(count) => `${count} ${tCommon("selected")}`}
              clearLabel={t("clearAll")}
              className="h-9"
            />
          </div>

          <div className="order-10 space-y-1" data-testid="disposal-mail-type-filter">
            <label className="text-xs font-medium text-muted-foreground">
              {t("mailType")}
            </label>
            <MultiSelectFilter
              options={mailTypes.map((mt) => ({
                value: mt,
                label: t(`mailTypes.${mt}`),
              }))}
              value={value.emailTypes || []}
              onChange={(next) =>
                onChange({
                  ...value,
                  emailTypes: next.length > 0 ? next : undefined,
                })
              }
              placeholder={t("all")}
              selectedCountLabel={(count) => `${count} ${tCommon("selected")}`}
              clearLabel={t("clearAll")}
              className="h-9"
            />
          </div>

          <div className="order-8 space-y-1" data-testid="disposal-policy-filter">
            <label className="text-xs font-medium text-muted-foreground">
              {t("disposalPolicyKeys")}
            </label>
            <Popover>
              <PopoverTrigger
                data-testid="disposal-policy-filter-trigger"
                render={
                  <Button
                    variant="outline"
                    className="h-9 w-full justify-between text-xs font-normal"
                  />
                }
              >
                <span className="truncate">
                  {(value.disposalPolicyKeys?.length ?? 0) +
                    (value.disposalRuleIds?.length ?? 0) ===
                  0
                    ? t("all")
                    : `${(value.disposalPolicyKeys?.length ?? 0) + (value.disposalRuleIds?.length ?? 0)} ${tCommon("selected")}`}
                </span>
                <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-80 p-2"
                data-testid="disposal-policy-filter-popover"
              >
                <div className="mb-2 grid grid-cols-2 rounded-md bg-muted p-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={policyMode === "module" ? "secondary" : "ghost"}
                    className="h-7 text-xs"
                    data-testid="disposal-policy-module-mode"
                    onClick={() => setPolicyMode("module")}
                  >
                    {t("policyModuleMode")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={policyMode === "rule" ? "secondary" : "ghost"}
                    className="h-7 text-xs"
                    data-testid="disposal-policy-rule-mode"
                    onClick={() => setPolicyMode("rule")}
                  >
                    {t("policyRuleMode")}
                  </Button>
                </div>
                {policyMode === "module" ? (
                  <div
                    className="max-h-72 overflow-y-auto"
                    data-testid="disposal-policy-module-list"
                  >
                    {modulesByStage.map(({ stage, modules }) => (
                      <div
                        key={stage}
                        data-testid={`disposal-policy-stage-${stage}`}
                      >
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                          {t(`policyStages.${stage}`)}
                        </div>
                        {/* 阶段1 + 多租户租户视角：合并为单条"平台管控策略"可勾选条目，
                            勾选时将阶段1全部 policy_key 作为筛选条件传入 */}
                        {hidePlatformStage && stage === 1 ? (() => {
                          const allStage1Keys = modules.flatMap((m) => m.keys);
                          const selected = value.disposalPolicyKeys ?? [];
                          const checked = allStage1Keys.length > 0 && allStage1Keys.every((k) => selected.includes(k));
                          return (
                            <InteractiveSurface
                              asChild
                              variant="control"
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs data-[hovered=true]:bg-accent/70 focus-within:ring-2 focus-within:ring-ring/60"
                            >
                              <label>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => {
                                    const next = checked
                                      ? selected.filter((item) => !allStage1Keys.includes(item))
                                      : Array.from(new Set([...selected, ...allStage1Keys]));
                                    onChange({
                                      ...value,
                                      disposalPolicyKeys: next.length > 0 ? next : undefined,
                                    });
                                  }}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {t("platformManagedPolicy")}
                                </span>
                                {checked ? <Check className="h-3 w-3 opacity-50" /> : null}
                              </label>
                            </InteractiveSurface>
                          );
                        })() : modules.map(({ moduleName, keys }) => {
                          const selected = value.disposalPolicyKeys ?? [];
                          const checked = keys.every((key) =>
                            selected.includes(key),
                          );
                          return (
                            <InteractiveSurface
                              key={moduleName}
                              asChild
                              variant="control"
                              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs data-[hovered=true]:bg-accent/70 focus-within:ring-2 focus-within:ring-ring/60"
                            >
                              <label>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => {
                                    const next = checked
                                      ? selected.filter(
                                          (item) => !keys.includes(item),
                                        )
                                      : Array.from(new Set([...selected, ...keys]));
                                    onChange({
                                      ...value,
                                      disposalPolicyKeys:
                                        next.length > 0 ? next : undefined,
                                    });
                                  }}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {keys.length > 1 ? (
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                      {keys.join("+")}
                                    </span>
                                  ) : (
                                    <span className="font-mono text-[10px] text-muted-foreground">
                                      {keys[0]}
                                    </span>
                                  )}{" "}
                                  · {moduleName}
                                </span>
                                {checked ? (
                                  <Check className="h-3 w-3 opacity-50" />
                                ) : null}
                              </label>
                            </InteractiveSurface>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="space-y-2"
                    data-testid="disposal-policy-rule-list"
                  >
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        data-testid="disposal-policy-rule-search"
                        className="h-8 pl-8 text-xs"
                        value={ruleSearch}
                        onChange={(event) => setRuleSearch(event.target.value)}
                        placeholder={t("policyRulePlaceholder")}
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {visibleRuleOptions.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                          {t("policyRuleEmpty")}
                        </p>
                      ) : (
                        visibleRuleOptions.map((rule) => {
                          const checked =
                            value.disposalRuleIds?.includes(rule.id) ?? false;
                          return (
                            <InteractiveSurface
                              key={rule.id}
                              asChild
                              variant="control"
                              className="flex items-start gap-2 rounded px-2 py-1.5 text-xs data-[hovered=true]:bg-accent/70 focus-within:ring-2 focus-within:ring-ring/60"
                            >
                              <label>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => {
                                    const current = value.disposalRuleIds ?? [];
                                    const next = checked
                                      ? current.filter((item) => item !== rule.id)
                                      : [...current, rule.id];
                                    onChange({
                                      ...value,
                                      disposalRuleIds:
                                        next.length > 0 ? next : undefined,
                                    });
                                  }}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">
                                    {rule.name}
                                  </span>
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {rule.id}
                                  </span>
                                </span>
                              </label>
                            </InteractiveSurface>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-2 border-t pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full text-xs"
                    data-testid="disposal-policy-clear"
                    onClick={() =>
                      onChange({
                        ...value,
                        disposalPolicyKeys: undefined,
                        disposalRuleIds: undefined,
                      })
                    }
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    {t("policyClear")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="order-11 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {t("ipLocation")}
            </label>
            <Input
              data-testid="disposal-ip-location-filter"
              className="h-9 text-xs"
              value={value.ipLocation || ""}
              onChange={(e) =>
                onChange({ ...value, ipLocation: e.target.value || undefined })
              }
            />
          </div>
    </div>
  );
}
