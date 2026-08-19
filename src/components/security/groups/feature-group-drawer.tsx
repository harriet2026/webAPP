'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApiRequest } from '@/lib/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { getFieldDefinitions } from '@/lib/api/unified-rules';
import { ConditionsEditor } from '@/components/security/advanced-filter-rules/ConditionsEditor';
import {
  deserializeGroups,
  remapLeavesToCatalogueKey,
  type ConditionGroups,
} from '@/components/security/advanced-filter-rules/serde';
import type { FieldDef, Rule, RuleNode } from '@/types/unified-rules';
import type { Group } from '@/types/groups';
import {
  buildFeatureGroupPayload,
  findDisallowedFields,
  type FeatureGroupConditions,
} from '@/lib/api/feature-groups';

const NAME_RE = /^[A-Za-z0-9._\-一-龥]{1,64}$/;

export interface FeatureGroupDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGroup: Group | null;
  initialRule: Rule | null;
  existingNames: string[];
  onSaved?: () => void;
}

export function FeatureGroupDrawer({
  open,
  onOpenChange,
  initialGroup,
  initialRule,
  existingNames,
  onSaved,
}: FeatureGroupDrawerProps) {
  const t = useTranslations('groups');
  const tCommon = useTranslations('common');
  const tFeat = useTranslations('advancedRulesFeature');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [groups, setGroups] = useState<ConditionGroups>({ any: [], all: [] });
  const [fieldDefs, setFieldDefs] = useState<Record<string, FieldDef>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEdit = initialGroup != null;

  useEffect(() => {
    if (!open) return;
    getFieldDefinitions('data', 'groups', apiRequest)
      .then((resp) => setFieldDefs(resp.fields || {}))
      .catch(() => setFieldDefs({}));
  }, [open, apiRequest]);

  useEffect(() => {
    if (!open) return;
    setName(initialGroup?.name ?? '');
    setErrorMsg(null);
    let parsed: ConditionGroups = { any: [], all: [] };
    if (initialRule) {
      try {
        const tree: RuleNode =
          typeof initialRule.condition_tree === 'string'
            ? JSON.parse(initialRule.condition_tree)
            : initialRule.condition_tree;
        const { any, all } = deserializeGroups(tree);
        parsed = { any: remapLeavesToCatalogueKey(any), all: remapLeavesToCatalogueKey(all) };
      } catch {
        parsed = { any: [], all: [] };
      }
    }
    setGroups(parsed);
  }, [open, initialGroup, initialRule]);

  const conditions: FeatureGroupConditions = groups;

  const hasConditions = groups.any.length > 0 || groups.all.length > 0;

  const disallowedFields = useMemo(
    () => findDisallowedFields(conditions, fieldDefs),
    [conditions, fieldDefs],
  );

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!NAME_RE.test(name)) {
      setErrorMsg(t('namePattern'));
      return;
    }
    if (!isEdit && existingNames.includes(name)) {
      setErrorMsg(t('duplicateName'));
      return;
    }
    if (!hasConditions) {
      setErrorMsg(t('noMembers'));
      return;
    }
    if (disallowedFields.length > 0) {
      setErrorMsg(t('featureFieldDisallowed', { fields: disallowedFields.join(', ') }));
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildFeatureGroupPayload(name, conditions, !isEdit);
      const id = initialGroup?.ruleId;
      if (id != null) {
        await apiRequest<Rule>(`/unified-rules/${id}`, { method: 'PUT', body: payload });
      } else {
        await apiRequest<Rule>(`/unified-rules`, { method: 'POST', body: payload });
      }
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success(tCommon('saveSuccess'));
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error).message ?? 'error';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v && (hasConditions || name)) {
          if (!window.confirm(tCommon('unsavedChanges') as string)) return;
        }
        onOpenChange(v);
      }}
    >
      <SheetContent side="right" className="sm:max-w-[1152px] w-[96vw] flex flex-col p-0" showCloseButton={false}>
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>
            {isEdit ? t('editGroup') : t('newGroup')} — {tFeat('v3Conditions.category_mailBasic')}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-2">
            <Label>{t('groupName')} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              disabled={isEdit}
              data-testid="feature-group-name"
            />
          </div>
          <ConditionsEditor groups={groups} onChange={setGroups} fieldDefs={fieldDefs} />
          {disallowedFields.length > 0 && (
            <p className="text-sm text-destructive" data-testid="feature-group-field-error">
              {t('featureFieldDisallowed', { fields: disallowedFields.join(', ') })}
            </p>
          )}
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </div>
        <SheetFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !hasConditions || disallowedFields.length > 0}
            data-testid="feature-group-save"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {tCommon('save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
