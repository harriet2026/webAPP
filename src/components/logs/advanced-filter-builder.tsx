"use client";

import { useState, useCallback } from "react";
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
import { X, Plus, ChevronDown, ChevronRight } from "lucide-react";
import type {
  SearchFieldDef,
  SearchOperator,
  FilterCondition,
  FilterConditionGroup,
  AdvancedFilter,
} from "@/types/log";

interface AdvancedFilterBuilderProps {
  fields: SearchFieldDef[];
  value: AdvancedFilter;
  onChange: (filter: AdvancedFilter) => void;
}

const operatorLabelKeys: Record<SearchOperator, string> = {
  eq: "advancedFilter.op.eq",
  neq: "advancedFilter.op.neq",
  contains: "advancedFilter.op.contains",
  not_contains: "advancedFilter.op.notContains",
  starts_with: "advancedFilter.op.startsWith",
  ends_with: "advancedFilter.op.endsWith",
  regex: "advancedFilter.op.regex",
  gt: "advancedFilter.op.gt",
  lt: "advancedFilter.op.lt",
  gte: "advancedFilter.op.gte",
  lte: "advancedFilter.op.lte",
  is_null: "advancedFilter.op.isNull",
  is_not_null: "advancedFilter.op.isNotNull",
  between: "advancedFilter.op.between",
  in: "advancedFilter.op.in",
  not_in: "advancedFilter.op.notIn",
};

const noValueOps: Set<SearchOperator> = new Set(["is_null", "is_not_null"]);

function ConditionRow({
  fields,
  condition,
  onChange,
  onRemove,
}: {
  fields: SearchFieldDef[];
  condition: FilterCondition;
  onChange: (c: FilterCondition) => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const fieldDef = fields.find((f) => f.key === condition.field);

  const handleFieldChange = (key: string | null) => {
    if (!key) return;
    const newFieldDef = fields.find((f) => f.key === key);
    const firstOp = newFieldDef?.operators[0] || "eq";
    onChange({ field: key, op: firstOp, value: undefined });
  };

  const handleOpChange = (op: string | null) => {
    if (!op) return;
    const needsValue = !noValueOps.has(op as SearchOperator);
    onChange({
      ...condition,
      op: op as SearchOperator,
      value: needsValue ? condition.value : undefined,
    });
  };

  const handleValueChange = (val: string | null) => {
    if (val === null) return;
    if (fieldDef?.type === "number") {
      const num = Number(val);
      onChange({ ...condition, value: isNaN(num) ? val : num });
    } else if (fieldDef?.type === "boolean") {
      onChange({ ...condition, value: val === "true" });
    } else {
      onChange({ ...condition, value: val });
    }
  };

  const needsValue = !noValueOps.has(condition.op as SearchOperator);

  return (
    <div className="flex items-center gap-2">
      <Select value={condition.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder={t("advancedFilter.selectField")} />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.key} value={f.key}>
              {t(`advancedFilter.fields.${f.key}` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={condition.op} onValueChange={handleOpChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue>
            {t(operatorLabelKeys[condition.op as SearchOperator] as never)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(fieldDef?.operators || []).map((op) => (
            <SelectItem key={op} value={op}>
              {t(operatorLabelKeys[op] as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue && (
        <>
          {fieldDef?.type === "boolean" ? (
            <Select
              value={String(condition.value ?? "true")}
              onValueChange={handleValueChange}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue>
                  {String(condition.value ?? "true") === "true"
                    ? t("common.yes")
                    : t("common.no")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">{t("common.yes")}</SelectItem>
                <SelectItem value="false">{t("common.no")}</SelectItem>
              </SelectContent>
            </Select>
          ) : fieldDef?.type === "enum" && fieldDef.enum_values ? (
            <Select
              value={String(condition.value ?? "")}
              onValueChange={handleValueChange}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={t("advancedFilter.selectValue")} />
              </SelectTrigger>
              <SelectContent>
                {fieldDef.enum_values.map((ev) => (
                  <SelectItem key={ev.value} value={ev.value}>
                    {ev.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="w-[180px]"
              value={String(condition.value ?? "")}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder={t("advancedFilter.enterValue")}
              type={fieldDef?.type === "number" ? "number" : "text"}
            />
          )}
        </>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ConditionGroup({
  fields,
  group,
  index,
  onChange,
  onRemove,
}: {
  fields: SearchFieldDef[];
  group: FilterConditionGroup;
  index: number;
  onChange: (g: FilterConditionGroup) => void;
  onRemove: () => void;
}) {
  const t = useTranslations();
  const [collapsed, setCollapsed] = useState(false);

  const addCondition = () => {
    const firstField = fields[0];
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        {
          field: firstField.key,
          op: firstField.operators[0],
          value: undefined,
        },
      ],
    });
  };

  const updateCondition = (ci: number, c: FilterCondition) => {
    const newConditions = [...group.conditions];
    newConditions[ci] = c;
    onChange({ ...group, conditions: newConditions });
  };

  const removeCondition = (ci: number) => {
    onChange({
      ...group,
      conditions: group.conditions.filter((_, i) => i !== ci),
    });
  };

  const handleGroupOpChange = (v: string | null) => {
    if (v) onChange({ ...group, operator: v as "AND" | "OR" });
  };

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <span className="text-sm font-medium">
          {t("advancedFilter.conditionGroup")} {index + 1}
        </span>
        <span className="text-sm text-muted-foreground">
          ({t("advancedFilter.match")})
        </span>
        <Select value={group.operator} onValueChange={handleGroupOpChange}>
          <SelectTrigger className="w-[90px] h-7 text-xs">
            <SelectValue>
              {group.operator === "AND"
                ? t("advancedFilter.all")
                : t("advancedFilter.any")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">{t("advancedFilter.all")}</SelectItem>
            <SelectItem value="OR">{t("advancedFilter.any")}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={group.not || false}
            onChange={(e) => onChange({ ...group, not: e.target.checked })}
            className="rounded"
          />
          {t("advancedFilter.exclude")}
        </label>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      {!collapsed && (
        <>
          {group.conditions.map((c, ci) => (
            <ConditionRow
              key={ci}
              fields={fields}
              condition={c}
              onChange={(nc) => updateCondition(ci, nc)}
              onRemove={() => removeCondition(ci)}
            />
          ))}
          <Button variant="outline" size="sm" onClick={addCondition}>
            <Plus className="h-3 w-3 mr-1" /> {t("advancedFilter.addCondition")}
          </Button>
        </>
      )}
    </div>
  );
}

export function AdvancedFilterBuilder({
  fields,
  value,
  onChange,
}: AdvancedFilterBuilderProps) {
  const t = useTranslations();

  const addGroup = useCallback(() => {
    const firstField = fields[0];
    onChange({
      ...value,
      groups: [
        ...value.groups,
        {
          operator: "AND",
          conditions: [
            {
              field: firstField.key,
              op: firstField.operators[0],
              value: undefined,
            },
          ],
        },
      ],
    });
  }, [fields, value, onChange]);

  const updateGroup = useCallback(
    (gi: number, g: FilterConditionGroup) => {
      const newGroups = [...value.groups];
      newGroups[gi] = g;
      onChange({ ...value, groups: newGroups });
    },
    [value, onChange],
  );

  const removeGroup = useCallback(
    (gi: number) => {
      onChange({ ...value, groups: value.groups.filter((_, i) => i !== gi) });
    },
    [value, onChange],
  );

  const clearAll = useCallback(() => {
    onChange({ operator: "AND", groups: [] });
  }, [onChange]);

  const handleTopOpChange = (v: string | null) => {
    if (v) onChange({ ...value, operator: v as "AND" | "OR" });
  };

  return (
    <div className="space-y-3">
      {value.groups.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("advancedFilter.groupOperator")}
          </span>
          <Select value={value.operator} onValueChange={handleTopOpChange}>
            <SelectTrigger className="w-[90px] h-7 text-xs">
              <SelectValue>
                {value.operator === "AND"
                  ? t("advancedFilter.all")
                  : t("advancedFilter.any")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">{t("advancedFilter.all")}</SelectItem>
              <SelectItem value="OR">{t("advancedFilter.any")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {value.groups.map((g, gi) => (
        <ConditionGroup
          key={gi}
          fields={fields}
          group={g}
          index={gi}
          onChange={(ng) => updateGroup(gi, ng)}
          onRemove={() => removeGroup(gi)}
        />
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addGroup}>
          <Plus className="h-3 w-3 mr-1" /> {t("advancedFilter.addGroup")}
        </Button>
        {value.groups.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {t("advancedFilter.clearAll")}
          </Button>
        )}
      </div>
    </div>
  );
}
