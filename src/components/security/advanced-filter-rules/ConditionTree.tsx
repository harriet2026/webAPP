'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CONDITIONS, computeCatalogueItem, type ConditionCategory, type ConditionDef } from './catalogue';
import { MATCH_MODE_TO_OPERATOR, defaultModeForField, type ConditionGroups, type ConditionLeaf } from './serde';
import type { FieldDef } from '@/types/unified-rules';

// ConditionTree.tsx — layer-3-conditions.html 左栏：OR/AND 组切换 + 搜索 +
// 3 分类 Collapsible + 54 条件按钮 + 已选条件列表（修 D-13：demo 里
// onRemoveCondition/onSelectCondition 是死 props，条件只能加不能选中/删除；
// 这里把两者接回真实的 select/remove 行为）。

const CATEGORY_ORDER: ConditionCategory[] = ['mailBasic', 'attachment', 'security'];

// operator 按 panel 给出的基础默认值（无 fieldDef 时的兜底）；有 fieldDef 时优先
// 用 defaultModeForField（F3 既有、已核对 operators 白名单）算出的更准确默认值。
const PANEL_FALLBACK_OPERATOR: Record<ConditionDef['panel'], string> = {
  text: 'contain',
  number: 'gt',
  select: 'eq',
  group: 'eq',
  featureGroup: 'eq',
  cidr: 'cidr',
  time: 'between',
  weekday: 'within',
  mime: 'contain',
};

// createDefaultLeaf — 点击左栏条件按钮时构造的新叶子。fieldDefs 可选：传入时
// 复用 defaultModeForField 从后端 FieldDef.operators 白名单里挑一个更贴切的
// 默认 operator，并在字段是 map_* 类型时把 mapKey 预置为 '*'（评估时走
// evaluateMapCondition 的通配分支，而不是因为 map_key 为空被当成 isNull）。
export function createDefaultLeaf(def: ConditionDef, fieldDefs: Record<string, FieldDef> = {}): ConditionLeaf {
  const field = def.field ?? '';
  const fd = field ? fieldDefs[field] : undefined;

  let operator = PANEL_FALLBACK_OPERATOR[def.panel];
  let mapKey: string | undefined;

  if (fd) {
    const mode = defaultModeForField(fd, field);
    const mapped = MATCH_MODE_TO_OPERATOR[mode];
    if (mapped) operator = mapped;
    if (fd.type?.startsWith('map_')) mapKey = '*';
  }

  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `leaf-${Date.now()}-${Math.random()}`,
    conditionKey: def.key,
    field,
    ...(mapKey ? { mapKey } : {}),
    operator,
    value: '',
    exclude: false,
  };
}

interface LeafRef {
  leaf: ConditionLeaf;
  group: 'any' | 'all';
}

interface Props {
  groups: ConditionGroups;
  fieldDefs: Record<string, FieldDef>;
  activeGroup: 'any' | 'all';
  onActiveGroupChange: (g: 'any' | 'all') => void;
  selectedLeafId: string | null;
  onSelectLeaf: (id: string) => void;
  onRemoveLeaf: (id: string, group: 'any' | 'all') => void;
  onAddCondition: (def: ConditionDef) => void;
}

export function ConditionTree({
  groups,
  fieldDefs,
  activeGroup,
  onActiveGroupChange,
  selectedLeafId,
  onSelectLeaf,
  onRemoveLeaf,
  onAddCondition,
}: Props) {
  const t = useTranslations('advancedRulesFeature');
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState<Set<ConditionCategory>>(() => new Set(['mailBasic']));

  const byCategory = useMemo(() => {
    const map = new Map<ConditionCategory, ConditionDef[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const def of CONDITIONS) map.get(def.category)!.push(def);
    return map;
  }, []);

  const trimmedSearch = search.trim().toLowerCase();
  const isFiltering = trimmedSearch !== '';

  const matchesSearch = (def: ConditionDef): boolean => {
    if (!isFiltering) return true;
    const label = t(`v3Conditions.conditions.${def.key}` as never).toLowerCase();
    const category = t(`v3Conditions.category_${def.category}` as never).toLowerCase();
    // Operators commonly remember either the visible condition/category name
    // or the backend field name from a rule/API. Search all of them so the
    // result is not dependent on which representation they happen to use.
    return [label, category, def.key, def.field ?? '']
      .some((text) => text.toLowerCase().includes(trimmedSearch));
  };

  const toggleCategory = (cat: ConditionCategory) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const leavesForGroup = (group: 'any' | 'all'): LeafRef[] =>
    groups[group].map((leaf) => ({ leaf, group }));

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden" data-testid="conditions-tree">
      <GroupButton
        kind="any"
        active={activeGroup === 'any'}
        count={groups.any.length}
        onClick={() => onActiveGroupChange('any')}
        badgeLabel={t('v3Conditions.orGroupBadge')}
        nameLabel={t('v3Conditions.orGroupName')}
        countLabel={t('v3Conditions.groupConditionCount', { count: groups.any.length })}
      />
      <SelectedLeavesList
        leaves={leavesForGroup('any')}
        selectedLeafId={selectedLeafId}
        onSelectLeaf={onSelectLeaf}
        onRemoveLeaf={onRemoveLeaf}
      />

      <GroupButton
        kind="all"
        active={activeGroup === 'all'}
        count={groups.all.length}
        onClick={() => onActiveGroupChange('all')}
        badgeLabel={t('v3Conditions.andGroupBadge')}
        nameLabel={t('v3Conditions.andGroupName')}
        countLabel={t('v3Conditions.groupConditionCount', { count: groups.all.length })}
      />
      <SelectedLeavesList
        leaves={leavesForGroup('all')}
        selectedLeafId={selectedLeafId}
        onSelectLeaf={onSelectLeaf}
        onRemoveLeaf={onRemoveLeaf}
      />

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('v3Conditions.conditionSearchPlaceholder')}
        className="h-8 text-xs"
        data-testid="condition-search"
      />

      <div className="flex-1 overflow-y-auto space-y-1" data-testid="condition-categories">
        {CATEGORY_ORDER.map((cat) => {
          const defs = byCategory.get(cat) ?? [];
          const filtered = defs.filter(matchesSearch);
          if (isFiltering && filtered.length === 0) return null;
          // mailBasic starts expanded, but it must still behave like the other
          // categories after the user clicks it. While searching, matching
          // categories stay expanded so the results are immediately visible.
          const open = isFiltering || openCategories.has(cat);
          return (
            <Collapsible key={cat} open={open} onOpenChange={() => toggleCategory(cat)}>
              <CollapsibleTrigger
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold hover:bg-muted"
                data-testid={`condition-category-${cat}`}
              >
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
                <span>{t(`v3Conditions.category_${cat}` as never)}</span>
                <Badge variant="outline" className="ml-auto text-[10px]" data-testid={`condition-category-badge-${cat}`}>
                  {defs.length}
                </Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4">
                {filtered.map((def) => (
                  <ConditionButton key={def.key} def={def} fieldDefs={fieldDefs} onAdd={onAddCondition} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
        {isFiltering && CATEGORY_ORDER.every((cat) => (byCategory.get(cat) ?? []).every((def) => !matchesSearch(def))) && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground" data-testid="condition-search-empty">
            {t('v3Conditions.noMatchingConditions')}
          </p>
        )}
      </div>
    </div>
  );
}

function GroupButton({
  kind,
  active,
  count,
  onClick,
  badgeLabel,
  nameLabel,
  countLabel,
}: {
  kind: 'any' | 'all';
  active: boolean;
  count: number;
  onClick: () => void;
  badgeLabel: string;
  nameLabel: string;
  countLabel: string;
}) {
  const isOr = kind === 'any';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`group-button-${kind}`}
      className={cn(
        'w-full rounded-lg border p-2.5 text-left transition-colors',
        active
          ? isOr
            ? 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30'
            : 'border-2 border-green-500 bg-green-50 dark:bg-green-950/30'
          : 'border-border hover:bg-muted',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'rounded px-2 py-0.5 text-[11px] font-bold text-white',
            isOr ? 'bg-blue-500' : 'bg-green-500',
          )}
        >
          {badgeLabel}
        </span>
        <span className="text-[13.5px] font-semibold">{nameLabel}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground" data-testid={`group-count-${kind}`}>
        {countLabel}
        <span className="sr-only">{count}</span>
      </div>
    </button>
  );
}

function SelectedLeavesList({
  leaves,
  selectedLeafId,
  onSelectLeaf,
  onRemoveLeaf,
}: {
  leaves: LeafRef[];
  selectedLeafId: string | null;
  onSelectLeaf: (id: string) => void;
  onRemoveLeaf: (id: string, group: 'any' | 'all') => void;
}) {
  const t = useTranslations('advancedRulesFeature');
  if (leaves.length === 0) return null;
  return (
    <div className="mb-1 space-y-0.5 pl-1" data-testid="selected-leaves-list">
      {leaves.map(({ leaf, group }) => {
        const def = CONDITIONS.find((d) => d.key === leaf.conditionKey);
        const label = def ? t(`v3Conditions.conditions.${def.key}` as never) : leaf.conditionKey;
        return (
          <div
            key={leaf.id}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-1 text-xs cursor-pointer',
              selectedLeafId === leaf.id ? 'bg-accent font-medium' : 'hover:bg-muted',
            )}
            onClick={() => onSelectLeaf(leaf.id)}
            data-testid={`selected-leaf-${leaf.id}`}
          >
            <span className="truncate">{label}</span>
            <span className="truncate text-muted-foreground">
              {leaf.value ? leaf.value.split('\n')[0] : ''}
            </span>
            <button
              type="button"
              className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveLeaf(leaf.id, group);
              }}
              aria-label={t('removeCondition')}
              data-testid={`remove-leaf-${leaf.id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConditionButton({
  def,
  fieldDefs,
  onAdd,
}: {
  def: ConditionDef;
  fieldDefs: Record<string, FieldDef>;
  onAdd: (def: ConditionDef) => void;
}) {
  const t = useTranslations('advancedRulesFeature');
  const label = t(`v3Conditions.conditions.${def.key}` as never);
  const item = computeCatalogueItem(def, fieldDefs);
  const disabled = !item.selectable;

  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      onClick={() => onAdd(def)}
      data-testid={`condition-button-${def.key}`}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12.5px]',
        def.envelope ? 'bg-muted font-semibold' : '',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted cursor-pointer',
      )}
    >
      <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
      {item.reasonKey && (
        <Badge variant="outline" className="ml-auto shrink-0 text-[9px]" data-testid={`condition-badge-${def.key}`}>
          {t(`v3Conditions.${item.reasonKey}` as never)}
        </Badge>
      )}
    </button>
  );
}
