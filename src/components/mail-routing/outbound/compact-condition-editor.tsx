'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useScopedApiRequest } from '@/lib/api/client';
import { getFieldDefinitions } from '@/lib/api/unified-rules';
import type { FieldDef, RuleNode } from '@/types/unified-rules';

const NO_VALUE_OPERATORS = new Set(['isNull', 'isNotNull']);
const EMPTY_FIELD_DEFS: Record<string, FieldDef> = {};

const OPERATOR_LABEL_KEYS: Record<string, string> = {
  eq: 'equal',
  ne: 'notEqual',
  contain: 'contain',
  not_contain: 'notContain',
  match: 'match',
  suffix: 'suffix',
  prefix: 'prefix',
  cidr: 'cidr',
  within: 'within',
  isNull: 'isNull',
  isNotNull: 'isNotNull',
  gt: 'greaterThan',
  lt: 'lessThan',
  ge: 'greaterEqual',
  le: 'lessEqual',
  hasTag: 'hasTag',
  hasAnyTag: 'hasAnyTag',
  hasAllTags: 'hasAllTags',
  between: 'between',
  wildcard: 'wildcard',
};

const CATEGORY_ORDER = ['connection', 'mail_basic', 'attachment', 'security', 'behavior', 'other'];

interface CompactConditionEditorProps {
  tenantId: number;
  value: RuleNode[];
  onChange: (conditions: RuleNode[]) => void;
  /** 这些字段已经由上方固定表单负责，新建更多条件时不重复列出。历史节点仍可回显。 */
  excludedFields?: string[];
  onValidityChange?: (valid: boolean) => void;
}

interface FieldOption {
  key: string;
  def: FieldDef;
}

function isMapField(def: FieldDef | undefined): boolean {
  return !!def?.type?.startsWith('map_');
}

function operatorNeedsValue(operator: string | undefined): boolean {
  return !!operator && !NO_VALUE_OPERATORS.has(operator);
}

function defaultOperator(def: FieldDef): string {
  if (def.operators.includes('eq')) return 'eq';
  return def.operators[0] ?? 'eq';
}

function conditionIsValid(node: RuleNode, fieldDefs: Record<string, FieldDef>): boolean {
  // 顶层历史 AND/OR/NOT 子树不由紧凑编辑器改写；保持原样并交给后端沿用既有校验。
  if (node.type !== 'condition') return true;
  if (!node.field || !node.operator) return false;

  const def = fieldDefs[node.field];
  // 页面升级前留下的字段可能不在当前目录中。组件仍原样展示/保留，不能仅因目录变化
  // 阻断管理员保存规则；真正不合法时由统一规则 API 给出权威错误。
  if (!def) return true;
  if (!def.operators.includes(node.operator)) return false;
  if (isMapField(def) && !node.map_key?.trim()) return false;
  if (operatorNeedsValue(node.operator) && !node.value?.trim()) return false;
  return true;
}

function nextConditionForField(field: string, def: FieldDef): RuleNode {
  const operator = defaultOperator(def);
  return {
    type: 'condition',
    field,
    operator,
    value: operatorNeedsValue(operator) ? (def.type === 'boolean' ? 'true' : '') : undefined,
    map_key: isMapField(def) ? '*' : undefined,
  };
}

function opaqueNodeSummary(node: RuleNode): string {
  const fields: string[] = [];
  const walk = (current: RuleNode) => {
    if (current.type === 'condition' && current.field) fields.push(current.field);
    for (const child of current.children ?? []) walk(child);
  };
  walk(node);
  return fields.length > 0 ? `${node.type}: ${fields.join(', ')}` : node.type;
}

export function CompactConditionEditor({
  tenantId,
  value,
  onChange,
  excludedFields = [],
  onValidityChange,
}: CompactConditionEditorProps) {
  const t = useTranslations('mailRouting.outbound.rule.moreConditions');
  const ta = useTranslations('advancedRules');
  const { apiRequest } = useScopedApiRequest(tenantId);

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['unified-rule-field-definitions', 'data', 'mail_routing_outbound', tenantId],
    queryFn: () => getFieldDefinitions('data', 'mail_routing_outbound', apiRequest),
  });

  const fieldDefs = data?.fields ?? EMPTY_FIELD_DEFS;
  const excluded = useMemo(() => new Set(excludedFields), [excludedFields]);

  const selectableGroups = useMemo(() => {
    const groups = new Map<string, FieldOption[]>();
    for (const [key, def] of Object.entries(fieldDefs)) {
      if (def.supported === false || excluded.has(key)) continue;
      const category = CATEGORY_ORDER.includes(def.category ?? '') ? (def.category as string) : 'other';
      const options = groups.get(category) ?? [];
      options.push({ key, def });
      groups.set(category, options);
    }
    for (const options of groups.values()) {
      options.sort((a, b) => a.def.label.localeCompare(b.def.label) || a.key.localeCompare(b.key));
    }
    return CATEGORY_ORDER
      .map((category) => [category, groups.get(category) ?? []] as const)
      .filter(([, options]) => options.length > 0);
  }, [excluded, fieldDefs]);

  const valid = useMemo(
    () => value.every((node) => conditionIsValid(node, fieldDefs)),
    [fieldDefs, value],
  );

  useEffect(() => {
    onValidityChange?.(valid);
  }, [onValidityChange, valid]);

  const emitChange = (conditions: RuleNode[]) => {
    onValidityChange?.(conditions.every((node) => conditionIsValid(node, fieldDefs)));
    onChange(conditions);
  };

  const updateAt = (index: number, next: RuleNode) => {
    const conditions = [...value];
    conditions[index] = next;
    emitChange(conditions);
  };

  const removeAt = (index: number) => {
    emitChange(value.filter((_, current) => current !== index));
  };

  const addCondition = () => {
    emitChange([...value, { type: 'condition', field: '', operator: '', value: '' }]);
  };

  return (
    <div
      className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3"
      data-testid="mr-ob-rule-more-conditions"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{t('title')}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          onClick={addCondition}
          disabled={isLoading || isError}
          data-testid="mr-ob-rule-more-condition-add"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('add')}
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('loading')}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {t('loadError')}
        </div>
      )}

      {!isLoading && !isError && value.length === 0 && (
        <div className="py-1 text-xs text-muted-foreground">{t('empty')}</div>
      )}

      {value.map((node, index) => {
        if (node.type !== 'condition') {
          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
              data-testid={`mr-ob-rule-more-condition-opaque-${index}`}
            >
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t('preservedGroup')}
              </span>
              <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={JSON.stringify(node)}>
                {opaqueNodeSummary(node)}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-destructive"
                aria-label={t('remove')}
                onClick={() => removeAt(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        }

        const def = node.field ? fieldDefs[node.field] : undefined;
        const operators = def?.operators ?? (node.operator ? [node.operator] : []);
        const needsValue = operatorNeedsValue(node.operator);
        const rowValid = conditionIsValid(node, fieldDefs);

        return (
          <div
            key={index}
            className={`flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-1.5 ${
              rowValid ? 'border-border' : 'border-destructive/60'
            }`}
            data-testid={`mr-ob-rule-more-condition-row-${index}`}
          >
            <Select
              // Keep Base UI controlled for the row's whole lifetime. Using
              // undefined here made a newly-added empty row uncontrolled and
              // selecting its first field switched it to controlled.
              value={node.field || null}
              onValueChange={(field) => {
                if (!field || !fieldDefs[field]) return;
                updateAt(index, nextConditionForField(field, fieldDefs[field]));
              }}
            >
              <SelectTrigger
                className="h-7 w-[190px] text-xs"
                aria-invalid={!node.field}
                data-testid={`mr-ob-rule-more-condition-field-${index}`}
              >
                <SelectValue placeholder={t('field')} />
              </SelectTrigger>
              <SelectContent>
                {node.field && excluded.has(node.field) && def && (
                  <SelectGroup>
                    <SelectLabel>{t('currentField')}</SelectLabel>
                    <SelectItem value={node.field}>
                      {def.label} <span className="ml-1 text-[10px] text-muted-foreground">({node.field})</span>
                    </SelectItem>
                  </SelectGroup>
                )}
                {selectableGroups.map(([category, options]) => (
                  <SelectGroup key={category}>
                    <SelectLabel>{t(`categories.${category}`)}</SelectLabel>
                    {options.map(({ key, def: optionDef }) => (
                      <SelectItem key={key} value={key}>
                        {optionDef.label} <span className="ml-1 text-[10px] text-muted-foreground">({key})</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {isMapField(def) && (
              <Input
                className="h-7 w-[105px] px-2 text-xs"
                value={node.map_key ?? ''}
                onChange={(event) => updateAt(index, { ...node, map_key: event.target.value })}
                placeholder={t('mapKey')}
                aria-invalid={!node.map_key?.trim()}
                data-testid={`mr-ob-rule-more-condition-map-key-${index}`}
              />
            )}

            <Select
              value={node.operator || null}
              onValueChange={(operator) => {
                if (!operator) return;
                updateAt(index, {
                  ...node,
                  operator,
                  value: operatorNeedsValue(operator)
                    ? (def?.type === 'boolean' ? node.value || 'true' : node.value ?? '')
                    : undefined,
                });
              }}
              disabled={!def}
            >
              <SelectTrigger
                className="h-7 w-[125px] text-xs"
                aria-invalid={!node.operator}
                data-testid={`mr-ob-rule-more-condition-operator-${index}`}
              >
                <SelectValue placeholder={t('operator')} />
              </SelectTrigger>
              <SelectContent>
                {operators.map((operator) => (
                  <SelectItem key={operator} value={operator}>
                    {ta(`operators.${OPERATOR_LABEL_KEYS[operator] ?? operator}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {needsValue && def?.type === 'boolean' && (
              <Select
                value={node.value || 'true'}
                onValueChange={(nextValue) => {
                  if (nextValue) updateAt(index, { ...node, value: nextValue });
                }}
              >
                <SelectTrigger
                  className="h-7 w-[78px] text-xs"
                  data-testid={`mr-ob-rule-more-condition-value-${index}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t('booleanTrue')}</SelectItem>
                  <SelectItem value="false">{t('booleanFalse')}</SelectItem>
                </SelectContent>
              </Select>
            )}

            {needsValue && def?.type !== 'boolean' && (
              <Input
                className="h-7 min-w-[130px] flex-1 px-2 text-xs"
                value={node.value ?? ''}
                onChange={(event) => updateAt(index, { ...node, value: event.target.value })}
                placeholder={
                  node.operator === 'within'
                    ? t('withinPlaceholder')
                    : node.operator === 'between'
                      ? t('betweenPlaceholder')
                      : t('value')
                }
                aria-invalid={!node.value?.trim()}
                data-testid={`mr-ob-rule-more-condition-value-${index}`}
              />
            )}

            {!def && node.field && (
              <code className="min-w-[130px] flex-1 truncate px-1 text-xs text-muted-foreground">
                {node.operator} {node.value}
              </code>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive"
              aria-label={t('remove')}
              onClick={() => removeAt(index)}
              data-testid={`mr-ob-rule-more-condition-remove-${index}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}

      {!valid && (
        <p className="text-xs text-destructive" data-testid="mr-ob-rule-more-condition-error">
          {t('invalid')}
        </p>
      )}
    </div>
  );
}
