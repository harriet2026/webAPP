"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Trash2, ChevronDown, Info } from "lucide-react";
import type { AdvancedFilter, FilterCondition } from "@/types/log";
import { INTENT_LABEL_OPTIONS } from "./intent-label-options";

type FieldType = "text" | "number" | "boolean" | "enum";

export const MAX_ADVANCED_GROUPS = 5;

type FieldEntry = {
  key: string;
  i18nKey: string;
  type: FieldType;
  enumValues?: { value: string; labelKey: string }[];
  // Optional override for the operator list. Used to suppress operators that
  // are meaningless for a specific field even though its type would otherwise
  // allow them (e.g. email size is never null → no is_null/is_not_null).
  operators?: string[];
  // Optional i18n key (relative to emailDisposal.filters) for a unit suffix
  // rendered after the value input(s). GT-11610: email size was a unit-less
  // number; the user now enters KB (converted to the backend's byte column at
  // the send boundary in useFilterMerger), so the input shows a "KB" suffix.
  unit?: string;
};

// GT-12422: 为空/不为空 排在 属于/不属于 前，对齐原型（layer-2）操作符顺序
// 「… 正则匹配 → 为空 → (数值类:大于/小于/范围内) → 属于 → 不属于」。
// 大于/小于/范围内 仅数值/日期字段提供——与后端 field_registry.go 的
// searchOperatorsByType 一致（文本字段选数值操作符后端会 400），原型 demo
// 的下拉是未按字段类型区分的静态列表，不照抄。
const OPERATORS_BY_TYPE: Record<FieldType, string[]> = {
  text: [
    "eq",
    "neq",
    "contains",
    "not_contains",
    "starts_with",
    "ends_with",
    "regex",
    "is_null",
    "is_not_null",
    "in",
    "not_in",
  ],
  number: [
    "eq",
    "neq",
    "is_null",
    "is_not_null",
    "gt",
    "lt",
    "gte",
    "lte",
    "between",
    "in",
    "not_in",
  ],
  boolean: ["eq", "neq", "is_null", "is_not_null"],
  enum: ["eq", "neq", "is_null", "is_not_null", "in", "not_in"],
};

// Operators allowed for a given field definition. Falls back to the type's
// full list when no per-field override is supplied.
function operatorsForField(def: FieldEntry | undefined): string[] {
  if (def?.operators) return def.operators;
  return OPERATORS_BY_TYPE[def?.type ?? "text"];
}

const FIELD_GROUPS: Record<string, FieldEntry[]> = {
  basicInfo: [
    { key: "header_sender", i18nKey: "headerSender", type: "text" },
    { key: "sender", i18nKey: "envelopeSender", type: "text" },
    { key: "header_recipient", i18nKey: "headerRecipient", type: "text" },
    { key: "envelope_recipient", i18nKey: "envelopeRecipient", type: "text" },
    { key: "sender_name", i18nKey: "displayName", type: "text" },
    {
      key: "send_hour",
      i18nKey: "sendHour",
      type: "number",
      operators: [
        "eq",
        "neq",
        "gt",
        "lt",
        "gte",
        "lte",
        "between",
        "in",
        "not_in",
      ],
    },
    {
      key: "storage_size",
      i18nKey: "emailSize",
      type: "number",
      operators: [
        "eq",
        "neq",
        "gt",
        "lt",
        "gte",
        "lte",
        "between",
        "in",
        "not_in",
      ],
      unit: "sizeUnit",
    },
    { key: "client_ip", i18nKey: "senderIp", type: "text" },
    { key: "recipient_domain", i18nKey: "recipientDomain", type: "text" },
    { key: "tid", i18nKey: "tid", type: "text" },
    { key: "similar_cluster", i18nKey: "cluster", type: "text" },
  ],
  attachment: [
    { key: "attachment_count", i18nKey: "attachmentCount", type: "number" },
    {
      key: "attachment_total_size",
      i18nKey: "attachmentTotalSize",
      type: "number",
      unit: "sizeUnit",
    },
    { key: "attachment_type", i18nKey: "attachmentType", type: "text" },
    { key: "attachment_name", i18nKey: "attachmentName", type: "text" },
    {
      key: "attachment_md5",
      i18nKey: "attachmentMd5",
      type: "text",
      operators: [
        "eq",
        "neq",
        "contains",
        "not_contains",
        "starts_with",
        "ends_with",
        "regex",
        "in",
        "not_in",
      ],
    },
  ],
  securityCheck: [
    {
      key: "spf_valid",
      i18nKey: "spfResult",
      type: "enum",
      enumValues: [
        { value: "pass", labelKey: "enumValue.pass" },
        { value: "fail", labelKey: "enumValue.fail" },
        { value: "none", labelKey: "enumValue.none" },
        { value: "softfail", labelKey: "enumValue.softfail" },
        { value: "neutral", labelKey: "enumValue.neutral" },
        { value: "temperror", labelKey: "enumValue.temperror" },
        { value: "permerror", labelKey: "enumValue.permerror" },
      ],
    },
    {
      key: "dkim_valid",
      i18nKey: "dkimResult",
      type: "enum",
      enumValues: [
        { value: "pass", labelKey: "enumValue.pass" },
        { value: "fail", labelKey: "enumValue.fail" },
        { value: "no_signature", labelKey: "enumValue.noSignature" },
        { value: "temperror", labelKey: "enumValue.temperror" },
        { value: "permerror", labelKey: "enumValue.permerror" },
      ],
    },
    {
      key: "dmarc_valid",
      i18nKey: "dmarcResult",
      type: "enum",
      enumValues: [
        { value: "pass", labelKey: "enumValue.pass" },
        { value: "fail", labelKey: "enumValue.fail" },
        { value: "none", labelKey: "enumValue.none" },
        { value: "temperror", labelKey: "enumValue.temperror" },
        { value: "permerror", labelKey: "enumValue.permerror" },
      ],
    },
    { key: "ptr_valid", i18nKey: "ptrResult", type: "boolean" },
    {
      key: "similar_domain",
      i18nKey: "similarDomain",
      type: "enum",
      enumValues: [
        { value: "triggered", labelKey: "enumValue.triggered" },
        { value: "notTriggered", labelKey: "enumValue.notTriggered" },
      ],
    },
    {
      key: "display_name_detect",
      i18nKey: "displayNameDetect",
      type: "enum",
      enumValues: [
        { value: "abnormal", labelKey: "enumValue.abnormal" },
        { value: "normal", labelKey: "enumValue.normal" },
      ],
    },
    { key: "mail_from_empty", i18nKey: "mailFromEmpty", type: "boolean" },
    {
      key: "virus_scan_result",
      i18nKey: "virusScanResult",
      type: "enum",
      enumValues: [
        { value: "detected", labelKey: "enumValue.detected" },
        { value: "clean", labelKey: "enumValue.clean" },
        { value: "error", labelKey: "enumValue.error" },
      ],
    },
    {
      key: "intent_label",
      i18nKey: "intentEngineResult",
      type: "enum",
      enumValues: INTENT_LABEL_OPTIONS,
    },
    {
      key: "qr_code_result",
      i18nKey: "qrCodeResult",
      type: "enum",
      enumValues: [
        { value: "maliciousUrl", labelKey: "enumValue.maliciousUrl" },
        { value: "suspicious", labelKey: "enumValue.suspicious" },
        { value: "normal", labelKey: "enumValue.normal" },
      ],
    },
    {
      key: "url_result",
      i18nKey: "urlResult",
      type: "enum",
      enumValues: [
        { value: "maliciousUrl", labelKey: "enumValue.maliciousUrl" },
        { value: "suspicious", labelKey: "enumValue.suspicious" },
        { value: "normal", labelKey: "enumValue.normal" },
      ],
    },
    { key: "keyword_hit", i18nKey: "keywordHit", type: "text" },
    {
      key: "rbl_result",
      i18nKey: "rblResult",
      type: "enum",
      enumValues: [
        { value: "triggered", labelKey: "enumValue.triggered" },
        { value: "notTriggered", labelKey: "enumValue.notTriggered" },
      ],
    },
    {
      key: "threat_level",
      i18nKey: "threatLevel",
      type: "enum",
      enumValues: [
        { value: "critical", labelKey: "enumValue.critical" },
        { value: "medium", labelKey: "enumValue.medium" },
        { value: "none", labelKey: "enumValue.none" },
      ],
    },
  ],
};

function getFieldDef(fieldKey: string): FieldEntry | undefined {
  for (const entries of Object.values(FIELD_GROUPS)) {
    const found = entries.find((e) => e.key === fieldKey);
    if (found) return found;
  }
  return undefined;
}

// 供 ai-backfill.ts 判定「AI 解析结果的某个字段是否为高级筛选构建器可承载的字段」
// 复用，避免另起一份字段清单造成漂移（构建器新增/下线字段时这里自动同步）。
export const ADVANCED_FILTER_FIELD_KEYS: ReadonlySet<string> = new Set(
  Object.values(FIELD_GROUPS).flatMap((entries) => entries.map((e) => e.key)),
);

interface ConditionValueInputProps {
  cond: FilterCondition;
  fieldDef: FieldEntry | undefined;
  onChange: (patch: Partial<FilterCondition>) => void;
}

function ConditionValueInput({
  cond,
  fieldDef,
  onChange,
}: ConditionValueInputProps) {
  const t = useTranslations("emailDisposal.filters");
  const op = cond.op as string;
  if (!fieldDef) {
    return (
      <Input
        className="h-8 min-w-[12rem] flex-1 text-xs"
        placeholder={t("placeholder.selectFieldFirst")}
        aria-label={t("placeholder.selectFieldFirst")}
        disabled
      />
    );
  }
  if (op === "is_null" || op === "is_not_null") return null;

  const type = fieldDef?.type ?? "text";
  // GT-11610: unit suffix (e.g. KB) so a numeric value input is not unit-less.
  // The stored value carries this unit verbatim; useFilterMerger converts it to
  // the backend's byte column at the send boundary.
  const unitLabel = fieldDef?.unit ? t(fieldDef.unit) : "";
  const unitSuffix = unitLabel ? (
    <span className="shrink-0 text-xs text-muted-foreground">{unitLabel}</span>
  ) : null;

  if (op === "between") {
    const arr = Array.isArray(cond.value) ? cond.value : ["", ""];
    const [from, to] = arr as (string | number)[];
    return (
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 flex-1 text-xs"
          type="number"
          placeholder={t("placeholder.from")}
          aria-label={t("placeholder.from")}
          value={String(from ?? "")}
          onChange={(e) =>
            onChange({ value: [e.target.value, String(to ?? "")] })
          }
        />
        <Input
          className="h-8 flex-1 text-xs"
          type="number"
          placeholder={t("placeholder.to")}
          aria-label={t("placeholder.to")}
          value={String(to ?? "")}
          onChange={(e) =>
            onChange({ value: [String(from ?? ""), e.target.value] })
          }
        />
        {unitSuffix}
      </div>
    );
  }

  if (op === "in" || op === "not_in") {
    const arrVal = Array.isArray(cond.value)
      ? (cond.value as (string | number)[]).join(",")
      : String(cond.value ?? "");
    return (
      <div className="flex flex-1 items-center gap-1">
        <Input
          className="h-8 flex-1 text-xs"
          placeholder={t("placeholder.inList")}
          aria-label={t("placeholder.inList")}
          value={arrVal}
          onChange={(e) => {
            const parts = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ value: parts.length > 0 ? parts : e.target.value });
          }}
        />
        {unitSuffix}
      </div>
    );
  }

  if (type === "boolean") {
    const boolVal = String(cond.value ?? "");
    const boolLabel =
      boolVal === "true"
        ? t("enumValue.booleanTrue")
        : boolVal === "false"
          ? t("enumValue.booleanFalse")
          : "";
    return (
      <Select
        value={boolVal}
        onValueChange={(v) => onChange({ value: v ?? "" })}
      >
        <SelectTrigger
          className="h-8 flex-1 text-xs"
          aria-label={t("placeholder.select")}
        >
          <SelectValue>{boolLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t("enumValue.booleanTrue")}</SelectItem>
          <SelectItem value="false">{t("enumValue.booleanFalse")}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (type === "enum" && fieldDef?.enumValues) {
    const strVal = String(cond.value ?? "");
    const matched = fieldDef.enumValues.find((ev) => ev.value === strVal);
    return (
      <Select
        value={strVal}
        onValueChange={(v) => onChange({ value: v ?? "" })}
      >
        <SelectTrigger
          className="h-8 flex-1 text-xs"
          aria-label={t("placeholder.select")}
        >
          <SelectValue>
            {matched ? t(matched.labelKey) : t("placeholder.select")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {fieldDef.enumValues.map((ev) => (
            <SelectItem key={ev.value} value={ev.value}>
              {t(ev.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-1">
      <Input
        className="h-8 flex-1 text-xs"
        type={type === "number" ? "number" : "text"}
        aria-label={t("placeholder.value")}
        placeholder={t("placeholder.value")}
        value={String(cond.value ?? "")}
        onChange={(e) => onChange({ value: e.target.value })}
      />
      {unitSuffix}
    </div>
  );
}

interface AdvancedFiltersProps {
  value: AdvancedFilter;
  onChange: (value: AdvancedFilter) => void;
}

export function AdvancedFilters({ value, onChange }: AdvancedFiltersProps) {
  const t = useTranslations("emailDisposal.filters");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);

  const createEmptyGroup = () => ({
    operator: "AND" as const,
    conditions: [{ field: "", op: "eq" as const }],
  });

  const addGroup = () => {
    if (value.groups.length >= MAX_ADVANCED_GROUPS) return;
    onChange({ ...value, groups: [...value.groups, createEmptyGroup()] });
  };

  const removeGroup = (gi: number) => {
    onChange({ ...value, groups: value.groups.filter((_, i) => i !== gi) });
  };

  const setGroupOperator = (gi: number, op: "AND" | "OR") => {
    const groups = value.groups.map((g, i) =>
      i === gi ? { ...g, operator: op } : g,
    );
    onChange({ ...value, groups });
  };

  const addCondition = (gi: number) => {
    const groups = value.groups.map((g, i) =>
      i === gi
        ? {
            ...g,
            conditions: [...g.conditions, { field: "", op: "eq" as const }],
          }
        : g,
    );
    onChange({ ...value, groups });
  };

  const removeCondition = (gi: number, ci: number) => {
    if (value.groups[gi]?.conditions.length === 1) {
      removeGroup(gi);
      return;
    }
    const groups = value.groups.map((g, i) =>
      i === gi
        ? { ...g, conditions: g.conditions.filter((_, j) => j !== ci) }
        : g,
    );
    onChange({ ...value, groups });
  };

  const updateCondition = (
    gi: number,
    ci: number,
    patch: Partial<FilterCondition>,
  ) => {
    const groups = value.groups.map((g, i) =>
      i === gi
        ? {
            ...g,
            conditions: g.conditions.map((c, j) =>
              j === ci ? { ...c, ...patch } : c,
            ),
          }
        : g,
    );
    onChange({ ...value, groups });
  };

  const handleFieldChange = (gi: number, ci: number, fieldKey: string) => {
    const def = getFieldDef(fieldKey);
    const validOps = operatorsForField(def);
    const currentOp = value.groups[gi]?.conditions[ci]?.op as string;
    const newOp = validOps.includes(currentOp) ? currentOp : validOps[0];
    updateCondition(gi, ci, {
      field: fieldKey,
      op: newOp as FilterCondition["op"],
      value: undefined,
    });
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && value.groups.length === 0) {
          onChange({ ...value, groups: [createEmptyGroup()] });
        }
      }}
      data-testid="disposal-advanced-filter"
    >
      <CollapsibleTrigger
        data-testid="disposal-advanced-filter-trigger"
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 px-2 text-sm text-foreground"
          />
        }
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "" : "-rotate-90"}`}
        />
        {t("advanced")}
        <span className="text-muted-foreground">({t("preciseFields")})</span>
        <Info
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        {value.groups.some((g) =>
          g.conditions.some((condition) => condition.field),
        ) && (
          <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
            {value.groups.reduce(
              (sum, group) =>
                sum +
                group.conditions.filter((condition) => condition.field).length,
              0,
            )}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {value.groups.length > 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("groupRelation")}</span>
            <Select
              value={value.operator}
              onValueChange={(operator) =>
                onChange({ ...value, operator: operator as "AND" | "OR" })
              }
            >
              <SelectTrigger
                data-testid="disposal-advanced-top-operator"
                className="h-7 w-24 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {value.groups.map((group, gi) => (
          <div
            key={gi}
            data-testid={`disposal-advanced-group-${gi}`}
            className="rounded-lg border p-3 space-y-2"
          >
            <div className="flex min-h-7 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {t("groupLabel", { n: gi + 1 })}
                </span>
                {group.conditions.length > 1 ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {t("conditionRelation")}
                    </span>
                    <Select
                      value={group.operator}
                      onValueChange={(v) =>
                        setGroupOperator(gi, v as "AND" | "OR")
                      }
                    >
                      <SelectTrigger
                        className="h-7 w-24 text-xs"
                        aria-label={t("conditionRelation")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">AND</SelectItem>
                        <SelectItem value="OR">OR</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={t("deleteGroup", { n: gi + 1 })}
                title={t("deleteGroup", { n: gi + 1 })}
                onClick={() => removeGroup(gi)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {group.conditions.map((cond, ci) => {
              const fieldDef = getFieldDef(cond.field ?? "");
              const allowedOps = operatorsForField(fieldDef);
              return (
                <div
                  key={ci}
                  data-testid={`disposal-advanced-condition-${gi}-${ci}`}
                  className="flex items-center gap-2"
                >
                  <Select
                    value={cond.field ?? ""}
                    onValueChange={(v) => handleFieldChange(gi, ci, v ?? "")}
                  >
                    <SelectTrigger
                      className="h-8 min-w-[12rem] shrink-0 text-xs"
                      aria-label={t("placeholder.field")}
                    >
                      <SelectValue placeholder={t("placeholder.field")} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FIELD_GROUPS).map(
                        ([groupKey, fields]) => (
                          <div key={groupKey}>
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                              {t(`advancedGroups.${groupKey}`)}
                            </div>
                            {fields.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {t(f.i18nKey)}
                              </SelectItem>
                            ))}
                          </div>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Select
                    value={cond.op}
                    onValueChange={(v) =>
                      updateCondition(gi, ci, {
                        op: v as FilterCondition["op"],
                        value: undefined,
                      })
                    }
                    disabled={!fieldDef}
                  >
                    <SelectTrigger
                      className="h-8 min-w-[9rem] shrink-0 text-xs"
                      aria-label={t("operator")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedOps.map((op) => (
                        <SelectItem key={op} value={op}>
                          {t(`operators.${op}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ConditionValueInput
                    cond={cond}
                    fieldDef={fieldDef}
                    onChange={(patch) => updateCondition(gi, ci, patch)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label={tc("delete")}
                    title={tc("delete")}
                    onClick={() => removeCondition(gi, ci)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => addCondition(gi)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {t("addCondition")}
            </Button>
          </div>
        ))}
        <Button
          data-testid="disposal-advanced-add-group"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={addGroup}
          disabled={value.groups.length >= MAX_ADVANCED_GROUPS}
          title={
            value.groups.length >= MAX_ADVANCED_GROUPS
              ? t("groupLimit", { n: MAX_ADVANCED_GROUPS })
              : undefined
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          {t("addGroup")}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
