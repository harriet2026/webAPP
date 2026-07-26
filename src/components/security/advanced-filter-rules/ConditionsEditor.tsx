'use client';

import { useState } from 'react';
import { ConditionTree, createDefaultLeaf } from './ConditionTree';
import { ConditionConfigPanel } from './ConditionConfigPanel';
import { ExpressionPreview } from './ExpressionPreview';
import type { ConditionDef } from './catalogue';
import type { ConditionGroups, ConditionLeaf } from './serde';
import type { FieldDef } from '@/types/unified-rules';

// ConditionsEditor.tsx — standalone convenience wrapper around the F6
// three-column condition editor (ConditionTree / ConditionConfigPanel /
// ExpressionPreview) for callers that only own a bare ConditionGroups value
// with no surrounding RuleForm/primaryAction concept — e.g.
// feature-group-drawer.tsx (F11), which edits a single {any, all} condition
// set for a feature group (no primary action, no stage restriction).
//
// ConditionsTab.tsx is the RuleForm-flavored sibling (form/setForm props,
// used by RuleEditorDrawer). This component intentionally duplicates its
// thin selection/handlers wiring rather than sharing it with ConditionsTab,
// because RuleForm's `conditions` field and this component's bare `groups`
// prop are different shapes to lift state out of — ConditionsTab could not
// wrap this component without still threading form/setForm through, so
// keeping the two separate avoids a forced abstraction for a few lines of
// glue code.
//
// Deliberately drops the pre-rewrite conditions editor's `primaryAction`-driven
// sidelineConditionsDisabled gating: every call site of that old editor
// that migrated to this component (feature-group-drawer.tsx) always
// passed primaryAction="none", and sidelineConditionsDisabled('none') is
// always false (its DATA_ONLY_ACTIONS list did not include 'none') — so the
// gate never actually fired at that call site. Dropping the unused concept
// here is behavior-neutral.

export interface ConditionsEditorProps {
  groups: ConditionGroups;
  onChange: (groups: ConditionGroups) => void;
  fieldDefs: Record<string, FieldDef>;
}

export function ConditionsEditor({ groups, onChange, fieldDefs }: ConditionsEditorProps) {
  const [activeGroup, setActiveGroup] = useState<'any' | 'all'>('any');
  const [selectedLeafId, setSelectedLeafId] = useState<string | null>(null);

  const selectedLeaf: ConditionLeaf | null =
    groups.any.find((l) => l.id === selectedLeafId) ?? groups.all.find((l) => l.id === selectedLeafId) ?? null;

  const handleAddCondition = (def: ConditionDef) => {
    const leaf = createDefaultLeaf(def, fieldDefs);
    onChange({ ...groups, [activeGroup]: [...groups[activeGroup], leaf] });
    setSelectedLeafId(leaf.id);
  };

  const handleSelectLeaf = (id: string) => setSelectedLeafId(id);

  const handleRemoveLeaf = (id: string, group: 'any' | 'all') => {
    onChange({ ...groups, [group]: groups[group].filter((l) => l.id !== id) });
    setSelectedLeafId((cur) => (cur === id ? null : cur));
  };

  const handleChangeLeaf = (id: string, patch: Partial<ConditionLeaf>) => {
    onChange({
      any: groups.any.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      all: groups.all.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  };

  return (
    <div
      className="grid gap-3 overflow-hidden h-[560px]"
      style={{ gridTemplateColumns: '280px 400px 1fr' }}
      data-testid="conditions-editor"
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
