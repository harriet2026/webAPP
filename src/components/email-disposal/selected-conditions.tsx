"use client";

import { useTranslations, useLocale } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DisposalQuickFilter, AICondition } from "@/types/email-disposal";
import type { AdvancedFilter } from "@/types/log";
import { getModuleName, type DisposalLang } from "./lib/disposal-basis-config";
import { intentLabelI18nKey } from "./intent-label-options";
import { isCompleteFilterCondition } from "./lib/filter-state";

interface SelectedConditionsProps {
  quick: DisposalQuickFilter;
  advanced: AdvancedFilter;
  aiConditions: AICondition[];
  extraConditions?: { key: string; label: string }[];
  onClearAll: () => void;
  onRemoveChip?: (key: string) => void;
  compact?: boolean;
  pending?: boolean;
}

// GT-11579 A3: map raw advanced-filter field/op/value to localized labels so
// chips render "执行动作 = 隔离" instead of "action eq quarantine".
// Keys mirror advanced-filters.tsx FIELD_GROUPS so every field has a label.
const FIELD_LABEL_KEYS: Record<string, string> = {
  action: "executionAction",
  direction: "sendReceiveType",
  status: "emailStatus",
  sender: "envelopeSender",
  header_sender: "headerSender",
  header_recipient: "headerRecipient",
  envelope_recipient: "envelopeRecipient",
  sender_name: "displayName",
  send_hour: "sendHour",
  client_ip: "senderIp",
  recipient_domain: "recipientDomain",
  subject: "subject",
  storage_size: "emailSize",
  tid: "tid",
  similar_cluster: "cluster",
  attachment_count: "attachmentCount",
  attachment_total_size: "attachmentTotalSize",
  attachment_type: "attachmentType",
  attachment_name: "attachmentName",
  attachment_md5: "attachmentMd5",
  spf_valid: "spfResult",
  spf_result: "spfResult",
  dkim_valid: "dkimResult",
  dkim_result: "dkimResult",
  dmarc_valid: "dmarcResult",
  dmarc_result: "dmarcResult",
  ptr_valid: "ptrResult",
  similar_domain: "similarDomain",
  display_name: "displayNameDetect",
  display_name_detect: "displayNameDetect",
  mail_from_empty: "mailFromEmpty",
  virus_scan_result: "virusScanResult",
  threat_level: "threatLevel",
  qr_code_result: "qrCodeResult",
  url_result: "urlResult",
  keyword_hit: "keywordHit",
  rbl_result: "rblResult",
  intent_label: "intentEngineResult",
  is_zip_bomb: "isZipBomb",
  is_encrypted_attachment: "isEncryptedAttachment",
  recipient: "recipient",
  // AI 智能搜索专属字段（parse-query 可产出的高级 filter 字段，advanced chips
  // 目前不暴露编辑入口，但 AI chips 需要与其它字段一致的本地化标签）。
  received_at: "sendReceiveTime",
  display_status: "emailStatus",
  email_type: "mailType",
  geo_region_name: "ipLocation",
  disposal_policy_key: "disposalPolicyKeys",
};

// GT-11610: fields whose value carries a unit. Maps field key -> i18n key
// (relative to emailDisposal.filters) for the unit suffix appended to the chip
// value, so a size chip reads "邮件大小 > 111 KB" instead of "邮件大小 > 111".
const FIELD_UNIT_KEYS: Record<string, string> = {
  storage_size: "sizeUnit",
  attachment_total_size: "sizeUnit",
};

const OP_LABELS: Record<string, string> = {
  eq: "=",
  ne: "≠",
  neq: "≠",
  contains: "∼",
  not_contains: "≁",
  gt: ">",
  lt: "<",
  gte: "≥",
  ge: "≥",
  lte: "≤",
  le: "≤",
  between: "~",
  in: "∈",
  not_in: "∉",
};

// Values that should be passed through the enum i18n map (actions.*,
// enumValue.*) instead of being shown verbatim.
const ENUM_VALUE_MAP: Record<string, (v: string) => string | undefined> = {
  action: (v) => `actions.${v}`,
  spf_valid: (v) => `enumValue.${v}`,
  spf_result: (v) => `enumValue.${v}`,
  dkim_valid: (v) => `enumValue.${v}`,
  dkim_result: (v) => `enumValue.${v}`,
  dmarc_valid: (v) => `enumValue.${v}`,
  dmarc_result: (v) => `enumValue.${v}`,
  similar_domain: (v) => `enumValue.${v}`,
  display_name: (v) => `enumValue.${v}`,
  display_name_detect: (v) => `enumValue.${v}`,
  virus_scan_result: (v) => `enumValue.${v}`,
  threat_level: (v) => `enumValue.${v}`,
  qr_code_result: (v) => `enumValue.${v}`,
  url_result: (v) => `enumValue.${v}`,
  rbl_result: (v) => `enumValue.${v}`,
  intent_label: intentLabelI18nKey,
  // GT-12368 AI 搜索 filter 全覆盖：display_status 复用 quick-filter 的
  // statuses.* 字典（GT-12955 13 值枚举，与 emailStatus 多选一致）。
  // disposal_policy_key 不走此表——模块名走 getModuleName（见 formatCondLabel）。
  display_status: (v) => `statuses.${v}`,
};

// Quick-filter fields whose values are enum codes that need i18n resolution.
// Maps quick-filter key -> i18n namespace function.
const QUICK_ENUM_VALUE_KEYS: Record<string, (v: string) => string | undefined> =
  {
    sendReceiveType: (v) => v, // flat key under filters (incoming/outgoing/internal)
    emailStatus: (v) => `statuses.${v}`,
  };

export function SelectedConditions({
  quick,
  advanced,
  aiConditions,
  extraConditions = [],
  onClearAll,
  onRemoveChip,
  compact = false,
  pending = false,
}: SelectedConditionsProps) {
  const t = useTranslations("emailDisposal.search");
  const ft = useTranslations("emailDisposal.filters");
  const rawLocale = useLocale();
  const disposalLang: DisposalLang = (
    ["zh", "en", "th", "ru"] as const
  ).includes(rawLocale as DisposalLang)
    ? (rawLocale as DisposalLang)
    : "zh";

  // GT-12955: active status selectors expose only the approved 13-value
  // contract, but a saved filter may still contain one of the retired values.
  // Keep those labels in a separate namespace so loading a historical template
  // never renders next-intl's dot-joined missing-key path, while the retired
  // values stay out of the active selector enum.
  const displayStatusFilterLabel = (value: string): string => {
    const legacyPath = `legacyStatuses.${value}`;
    if (ft.has(legacyPath)) return ft(legacyPath);
    const currentPath = `statuses.${value}`;
    if (ft.has(currentPath)) return ft(currentPath);
    return value;
  };

  const chips: { key: string; label: string; isAi: boolean }[] = [];

  // GT-12368: AI chips 与 advanced chips 共用的"字段 操作符 值"本地化格式。
  // 新增的 AI 专用字段（received_at/display_status/disposal_policy_key）也在
  // FIELD_LABEL_KEYS/ENUM_VALUE_MAP 注册，两类 chips 展示一致。
  const formatCondLabel = (cond: {
    field: string;
    op: string;
    value?: unknown;
  }): string => {
    const fieldKey = FIELD_LABEL_KEYS[cond.field];
    const fieldLabel = fieldKey ? ft(fieldKey) : cond.field;
    const opLabel =
      OP_LABELS[cond.op] ??
      (ft.has(`operators.${cond.op}`) ? ft(`operators.${cond.op}`) : cond.op);
    const valueMapper = ENUM_VALUE_MAP[cond.field];
    // GT-12368 fix round 1: AI 条件的多值结果（如 display_status in
    // [delivered, rejected]）在 search-bar.tsx 里已被 String() 展平成逗号拼接
    // 的单一字符串（AICondition.value 的声明类型就是 string），不会走
    // Array.isArray 分支。仅对枚举类字段（valueMapper 命中，或
    // disposal_policy_key）按逗号拆成多个原子值——非枚举字段（如 subject）不
    // 拆，避免把合法值里出现的逗号误拆开。
    const isEnumMapped = cond.field === "disposal_policy_key" || !!valueMapper;
    const rawValues = Array.isArray(cond.value)
      ? (cond.value as (string | number)[]).map(String)
      : isEnumMapped
        ? String(cond.value ?? "").split(",")
        : [String(cond.value ?? "")];
    // GT-11579 A3 + GT-12368: valueMapper 返回相对 emailDisposal.filters 的
    // i18n 路径（如 "actions.quarantine"）；逐元素 map 后再 join，使 `in` 多值
    // enum 条件的每个值都本地化（而不是先 join 成裸字符串再整体查表——那样多值
    // 永远查不中，只会落回原始逗号拼接串）。
    const mapOne = (v: string): string => {
      if (cond.field === "disposal_policy_key") {
        return getModuleName(v, disposalLang) || v;
      }
      if (cond.field === "display_status") {
        return displayStatusFilterLabel(v);
      }
      if (valueMapper && v) {
        const i18nPath = valueMapper(v);
        // GT-12368 fix round 1: next-intl 默认 fallback 对缺失 key 不抛异常，
        // 而是原样返回 dot-joined 路径（如
        // "emailDisposal.filters.statuses.xxx"），try/catch 拦不住这种"假成功"
        // ——所以改用 ft.has() 显式判断 key 是否真实存在（同
        // investigations/page.tsx 的 formatTargetType 用法），不存在则回退到
        // 原始枚举值，而不是把 i18n 路径原样展示给用户。
        if (i18nPath && ft.has(i18nPath)) {
          return ft(i18nPath);
        }
        return v;
      }
      return v;
    };
    let valueLabel = rawValues.map(mapOne).join(",");
    // GT-11610: append unit suffix for unit-bearing fields (e.g. email size in
    // KB). Skip for null operators, which have no value.
    const unitKey = FIELD_UNIT_KEYS[cond.field];
    if (
      unitKey &&
      valueLabel &&
      cond.op !== "is_null" &&
      cond.op !== "is_not_null"
    ) {
      valueLabel = `${valueLabel} ${ft(unitKey)}`;
    }
    return `${fieldLabel} ${opLabel} ${valueLabel}`;
  };

  if (aiConditions.length > 0) {
    aiConditions.forEach((ac, i) => {
      chips.push({
        key: `ai-${i}`,
        label: formatCondLabel(ac),
        isAi: true,
      });
    });
  }

  // Only string-valued quick-filter keys; sendReceiveTime (object) is handled separately below.
  type StringQuickKey = Exclude<keyof DisposalQuickFilter, "sendReceiveTime">;
  const quickFields: [StringQuickKey, string][] = [
    ["senderIp", ft("senderIp")],
    ["sender", ft("sender")],
    ["recipient", ft("recipient")],
    ["subject", ft("subject")],
    ["sendReceiveType", ft("sendReceiveType")],
    ["emailStatus", ft("emailStatus")],
    ["ipLocation", ft("ipLocation")],
  ];
  for (const [k, label] of quickFields) {
    const v = quick[k];
    if (!v) continue;
    // All quickFields listed above are string-valued; sendReceiveTime (the only
    // object-valued field) and the array-valued fields (emailTypes,
    // disposalPolicyKeys) are rendered separately below. Narrow to string so
    // the enum mapper / display logic operates on a concrete string.
    if (typeof v !== "string") continue;
    // Resolve enum values (sendReceiveType/executionAction/emailStatus) via i18n
    const enumMapper = QUICK_ENUM_VALUE_KEYS[k];
    let displayValue: string | { start: string; end: string } = v;
    if (k === "emailStatus") {
      displayValue = displayStatusFilterLabel(v);
    } else if (enumMapper && typeof v === "string") {
      const i18nPath = enumMapper(v);
      if (i18nPath && ft.has(i18nPath)) {
        displayValue = ft(i18nPath);
      }
    }
    chips.push({
      key: `q-${k}`,
      label: `${label}: ${displayValue}`,
      isAi: false,
    });
  }

  // Multi-value quick filters (spec §3.3.1 / §4.3): one removable chip per
  // selected value, so clearing a single mail type / policy module doesn't
  // wipe the whole selection.
  if (quick.executionActions && quick.executionActions.length > 0) {
    for (const action of quick.executionActions) {
      chips.push({
        key: `q-executionActions:${action}`,
        label: `${ft("executionAction")}: ${ft(`actions.${action}`)}`,
        isAi: false,
      });
    }
  } else if (quick.executionAction) {
    chips.push({
      key: "q-executionAction",
      label: `${ft("executionAction")}: ${ft(`actions.${quick.executionAction}`)}`,
      isAi: false,
    });
  }
  for (const mt of quick.emailTypes ?? []) {
    let label = mt;
    try {
      label = ft(`mailTypes.${mt}`);
    } catch {
      // fall back to raw value
    }
    chips.push({
      key: `q-emailTypes:${mt}`,
      label: `${ft("mailType")}: ${label}`,
      isAi: false,
    });
  }
  for (const status of quick.emailStatuses ?? []) {
    chips.push({
      key: `q-emailStatuses:${status}`,
      label: `${ft("emailStatus")}: ${displayStatusFilterLabel(status)}`,
      isAi: false,
    });
  }
  for (const pk of quick.disposalPolicyKeys ?? []) {
    chips.push({
      key: `q-disposalPolicyKeys:${pk}`,
      label: `${ft("disposalPolicyKeys")}: ${getModuleName(pk, disposalLang)}`,
      isAi: false,
    });
  }
  for (const ruleId of quick.disposalRuleIds ?? []) {
    chips.push({
      key: `q-disposalRuleIds:${ruleId}`,
      label: `${ft("policyRuleMode")}: ${ruleId}`,
      isAi: false,
    });
  }

  if (quick.sendReceiveTime?.start || quick.sendReceiveTime?.end) {
    chips.push({
      key: "q-time",
      label: `${ft("sendReceiveTime")}: ${quick.sendReceiveTime?.start || "..."} ~ ${quick.sendReceiveTime?.end || "..."}`,
      isAi: false,
    });
  }

  for (const [gi, group] of advanced.groups.entries()) {
    for (const [ci, cond] of group.conditions.entries()) {
      if (!isCompleteFilterCondition(cond)) continue;
      // GT-11579 A3: render localized "field op value" instead of raw SQL-like form.
      chips.push({
        key: `a-${gi}-${ci}`,
        label: formatCondLabel(cond),
        isAi: false,
      });
    }
  }

  for (const condition of extraConditions) {
    chips.push({ ...condition, isAi: false });
  }

  if (chips.length === 0) return null;

  return (
    <div
      className={
        compact
          ? "mt-3 border-t pt-3"
          : "rounded-lg border border-border bg-card p-4"
      }
    >
      {/* 标题行：左侧标题 + 右侧清空全部按钮 */}
      <div
        className={`${compact ? "mb-2" : "mb-3"} flex items-center justify-between`}
      >
        <h3 className="text-sm font-medium text-foreground">
          {t(pending ? "pendingConditions" : "selectedConditions")} (
          {chips.length} {t("items")})
        </h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onClearAll}
          className="h-auto p-0 text-sm text-danger data-[hovered=true]:text-danger/80"
        >
          {t("clearAll")}
        </Button>
      </div>
      {/* 标签容器：独立一行，统一包裹所有筛选标签 */}
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.key}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-[background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              chip.isAi
                ? "bg-primary/10 text-primary has-[[data-hovered=true]]:bg-primary/15"
                : "bg-muted text-muted-foreground has-[[data-hovered=true]]:bg-muted/80"
            }`}
          >
            {chip.isAi && <span className="text-[10px] opacity-70">AI</span>}
            {chip.label}
            {onRemoveChip && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-mr-2 size-5 rounded-full text-current"
                onClick={() => onRemoveChip(chip.key)}
                aria-label={`${t("clearAll")}: ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
