'use client';

import { useState } from 'react';
import { ConditionTree, createDefaultLeaf } from './ConditionTree';
import { ConditionConfigPanel } from './ConditionConfigPanel';
import { ExpressionPreview } from './ExpressionPreview';
import type { ConditionDef } from './catalogue';
import type { ConditionLeaf } from './serde';
import type { RuleForm } from './rule-form';
import type { FieldDef } from '@/types/unified-rules';

// ConditionsTab.tsx — layer-3-conditions.html 顶层容器：三栏 grid
// [280px_400px_1fr]，高度 calc(100vh-280px)（在抽屉内已有 header/footer 占位
// 的前提下贴近可视区），中栏两侧分隔线。左栏(ConditionTree)维护 OR/AND 组
// 切换与 54 条件目录，中栏(ConditionConfigPanel)编辑选中条件，右栏
// (ExpressionPreview)只读展示。三者共享同一份 form.conditions（提升到
// RuleForm，而不是本地 state），这样切 Tab 再切回来配置不丢。

interface Props {
  form: RuleForm;
  setForm: (updater: (f: RuleForm) => RuleForm) => void;
  fieldDefs: Record<string, FieldDef>;
}

export function ConditionsTab({ form, setForm, fieldDefs }: Props) {
  const [activeGroup, setActiveGroup] = useState<'any' | 'all'>('any');
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);

  const groups = form.conditions;
  const selectedLeaf: ConditionLeaf | null =
    groups.any.find((l) => l.id === selectedLeafId) ?? groups.all.find((l) => l.id === selectedLeafId) ?? null;

  const handleAddCondition = (def: ConditionDef) => {
    const leaf = createDefaultLeaf(def, fieldDefs);
    setForm((f) => ({
      ...f,
      conditions: {
        ...f.conditions,
        [activeGroup]: [...f.conditions[activeGroup], leaf],
      },
    }));
    setSelectedLeafId(leaf.id);
  };

  const handleSelectLeaf = (id: string) => setSelectedLeafId(id);

  const handleRemoveLeaf = (id: string, group: 'any' | 'all') => {
    setForm((f) => ({
      ...f,
      conditions: {
        ...f.conditions,
        [group]: f.conditions[group].filter((l) => l.id !== id),
      },
    }));
    setSelectedLeafId((cur) => (cur === id ? null : cur));
  };

  const handleChangeLeaf = (id: string, patch: Partial<ConditionLeaf>) => {
    setForm((f) => ({
      ...f,
      conditions: {
        any: f.conditions.any.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        all: f.conditions.all.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      },
    }));
  };

  return (
    <div
      className="grid gap-3 overflow-hidden"
      style={{ gridTemplateColumns: '280px 400px 1fr', height: 'calc(100vh - 280px)' }}
      data-testid="conditions-tab"
    >
      <div className="overflow-hidden">
        <ConditionTree
          groups={groups}
          fieldDefs={fieldDefs}
          activeGroup={activeGroup}
          onActiveGroupChange={setActiveGroup}
          selectedLeafId={selectedLeafId}
          onSelectLeaf={handleSelectLeaf}
          onRemoveLeaf={handleRemoveLeaf}
          onAddCondition={handleAddCondition}
        />
      </div>
      <div className="overflow-hidden border-x px-4">
        <ConditionConfigPanel leaf={selectedLeaf} fieldDefs={fieldDefs} onChange={handleChangeLeaf} />
      </div>
      <div className="overflow-hidden">
        <ExpressionPreview groups={groups} />
      </div>
    </div>
  );
}
