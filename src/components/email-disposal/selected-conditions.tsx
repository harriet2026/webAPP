"use client";

import { useTranslations, useLocale } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DisposalQuickFilter, AICondition } from "@/types/email-disposal";
import type { AdvancedFilter } from "@/types/log";
import { getModuleName, type DisposalLang } from "./lib/disposal-basis-config";
import { intentLabelI18nKey } from "./intent-label-options";

interface SelectedConditionsProps {
  quick: DisposalQuickFilter;
  advanced: AdvancedFilter;
  aiConditions: AICondition[];
  onClearAll: () => void;
  onRemoveChip?: (key: string) => void;
  compact?: boolean;
}

// GT-11579 A3: map raw advanced-filter field/op/value to localized labels so
// chips render "执行动作 = 隔离" instead of "action eq quarantine".
// Keys mirror advanced-filters.tsx FIELD_GROUPS so every field has a label.
const FIELD_LABEL_KEYS: Record<string, string> = {
  action: "executionAction",
  direction: "sendReceiveType",
  status: "emailStatus",
  sender: "headerSender",
  sender_name: "displayName",
  client_ip: "senderIp",
  subject: "subject",
  storage_size: "emailSize",
  tid: "tid",
  spf_valid: "spfResult",
  spf_result: "spfResult",
  dkim_valid: "dkimResult",
  dkim_result: "dkimResult",
  dmarc_valid: "dmarcResult",
  dmarc_result: "dmarcResult",
  ptr_valid: "ptrResult",
  similar_domain: "similarDomain",
  display_name: "displayNameDetect",
  mail_from_empty: "mailFromEmpty",
  virus_scan_result: "virusScanResult",
  threat_level: "threatLevel",
  qr_code_result: "qrCodeResult",
  intent_label: "intentLabel",
  is_zip_bomb: "isZipBomb",
  is_encrypted_attachment: "isEncryptedAttachment",
  recipient: "recipient",
};

// GT-11610: fields whose value carries a unit. Maps field key -> i18n key
// (relative to emailDisposal.filters) for the unit suffix appended to the chip
// value, so a size chip reads "邮件大小 > 111 KB" instead of "邮件大小 > 111".
const FIELD_UNIT_KEYS: Record<string, string> = {
  storage_size: "sizeUnit",
};

const OP_LABELS: Record<string, string> = {
  eq: "=",
  ne: "≠",
  neq: "≠",
  contains: "∼",
  not_contains: "≁",
  is_null: "is null",
  is_not_null: "is not null",
  gt: ">",
  lt: "<",
  gte: "≥",
  ge: "≥",
  lte: "≤",
  le: "≤",
  between: "~",
  in: "∈",
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
  virus_scan_result: (v) => `enumValue.${v}`,
  threat_level: (v) => `enumValue.${v}`,
  qr_code_result: (v) => `enumValue.${v}`,
  intent_label: intentLabelI18nKey,
};

// Quick-filter fields whose values are enum codes that need i18n resolution.
// Maps quick-filter key -> i18n namespace function.
const QUICK_ENUM_VALUE_KEYS: Record<string, (v: string) => string | undefined> =
  {
    sendReceiveType: (v) => v, // flat key under filters (incoming/outgoing/internal)
    executionAction: (v) => `actions.${v}`,
    emailStatus: (v) => `statuses.${v}`,
  };

export function SelectedConditions({
  quick,
  advanced,
  aiConditions,
  onClearAll,
  onRemoveChip,
  compact = false,
}: SelectedConditionsProps) {
  const t = useTranslations("emailDisposal.search");
  const ft = useTranslations("emailDisposal.filters");
  const rawLocale = useLocale();
  const disposalLang: DisposalLang = (
    ["zh", "en", "th", "ru"] as const
  ).includes(rawLocale as DisposalLang)
    ? (rawLocale as DisposalLang)
    : "zh";

  const chips: { key: string; label: string; isAi: boolean }[] = [];

  if (aiConditions.length > 0) {
    aiConditions.forEach((ac, i) => {
      chips.push({
        key: `ai-${i}`,
        label: `${ac.field}: ${ac.value}`,
        isAi: true,
      });
    });
  }

  // Only string-valued quick-filter keys; sendReceiveTime (object) is handled separately below.
  type StringQuickKey = Exclude<keyof DisposalQuickFilter, "sendReceiveTime">;
  const quickFields: [StringQuickKey, string][] = [
    ["sender", ft("sender")],
    ["recipient", ft("recipient")],
    ["subject", ft("subject")],
    ["sendReceiveType", ft("sendReceiveType")],
    ["executionAction", ft("executionAction")],
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
    if (enumMapper && typeof v === "string") {
      const i18nPath = enumMapper(v);
      if (i18nPath) {
        try {
          displayValue = ft(i18nPath);
        } catch {
          displayValue = v;
        }
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
      label: `${ft("emailStatus")}: ${ft(`statuses.${status}`)}`,
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
      // GT-11579 A3: render localized "field op value" instead of raw SQL-like form.
      const fieldKey = FIELD_LABEL_KEYS[cond.field];
      const fieldLabel = fieldKey ? ft(fieldKey) : cond.field;
      const opLabel = OP_LABELS[cond.op] ?? cond.op;
      const valueMapper = ENUM_VALUE_MAP[cond.field];
      const rawValue = Array.isArray(cond.value)
        ? (cond.value as (string | number)[]).join(",")
        : String(cond.value ?? "");
      // GT-11579 A3: valueMapper returns a dotted i18n path relative to
      // emailDisposal.filters (e.g. "actions.quarantine"); resolve via ft.
      let valueLabel = rawValue;
      if (valueMapper && rawValue) {
        const i18nPath = valueMapper(rawValue);
        if (i18nPath) {
          try {
            valueLabel = ft(i18nPath);
          } catch {
            valueLabel = rawValue;
          }
        }
      }
      // GT-11610: append unit suffix for unit-bearing fields (e.g. email size
      // in KB). Skip for null operators, which have no value.
      const unitKey = FIELD_UNIT_KEYS[cond.field];
      if (
        unitKey &&
        rawValue &&
        cond.op !== "is_null" &&
        cond.op !== "is_not_null"
      ) {
        valueLabel = `${valueLabel} ${ft(unitKey)}`;
      }
      chips.push({
        key: `a-${gi}-${ci}`,
        label: `${fieldLabel} ${opLabel} ${valueLabel}`,
        isAi: false,
      });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className={compact ? "mt-3 border-t pt-3" : "rounded-lg border border-border bg-card p-4"}>
      {/* 标题行：左侧标题 + 右侧清空全部按钮 */}
      <div className={`${compact ? "mb-2" : "mb-3"} flex items-center justify-between`}>
        <h3 className="text-sm font-medium text-foreground">
          {t("selectedConditions")} ({chips.length} {t("items")})
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
