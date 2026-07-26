"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useApiRequest, ApiError } from "@/lib/api/client";
import {
  createAdvancedRule,
  updateAdvancedRule,
} from "@/lib/api/advanced-rules";
import { canSaveActions, validateBasics, hasNoConditions } from "./validation";
import {
  emptyRuleForm,
  ruleToForm,
  formToCreateRequest,
  formToUpdateRequest,
  type RuleForm,
} from "./rule-form";
import { getAdvancedRulesPriorityRange } from "./priority-range";
import { BasicSettingsTab, type BasicSettingsErrors } from "./BasicSettingsTab";
import { ConditionsTab } from "./ConditionsTab";
import { ActionsTab } from "./ActionsTab";
import { TestAnalysisTab } from "./TestAnalysisTab";
import type { Rule, FieldDef } from "@/types/unified-rules";

type TabKey = "basic" | "conditions" | "disposition" | "test";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rule: Rule | null;
  fieldDefs: Record<string, FieldDef>;
  onSaved: () => void;
}

// Maps a subset of the backend's raw English validation-error strings
// (internal/api/advanced_rules_helper.go's ValidateAdvancedRulesMetadata /
// EnforceAdvancedRulesRequest) to advancedRulesFeature.* i18n keys. Anything
// not recognized falls through to the raw ApiError message (see caller).
function mapApiErrorMessage(
  t: (key: string, values?: Record<string, string | number>) => string,
  message: string,
  priorityRange: { min: number; max: number },
): string | null {
  if (!message) return null;
  if (message.includes("name must not be empty"))
    return t("errors.nameRequired");
  if (message.includes("condition_tree must not be empty"))
    return t("errors.conditionRequired");
  if (message.includes("primary_action none requires at least one addon"))
    return t("cannotSave.actionOrAddon");
  if (message.includes("tagDeliver primary action requires emailTag addon"))
    return t("cannotSave.tagDeliverEmailTag");
  // GT-12181: surface the role-aware range rather than the old fixed 1–100 text.
  if (message.includes("priority must be between")) {
    return t("errors.priorityRange", {
      min: priorityRange.min,
      max: priorityRange.max,
    });
  }
  if (message.includes("invalid scope value")) return t("errors.scopeRequired");
  return null;
}

export function RuleEditorDrawer({
  open,
  onOpenChange,
  rule,
  fieldDefs,
  onSaved,
}: Props) {
  const t = useTranslations("advancedRulesFeature");
  const tc = useTranslations("common");
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin } = useAuth();
  // GT-12181: priority range/default follow the logged-in role and match the
  // API (tenant admin 100-1000, system admin 0-9999).
  const priorityRange = useMemo(
    () => getAdvancedRulesPriorityRange(isSystemAdmin),
    [isSystemAdmin],
  );

  const [form, setForm] = useState<RuleForm>(() =>
    emptyRuleForm(priorityRange.defaultValue),
  );
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [errors, setErrors] = useState<BasicSettingsErrors | undefined>(
    undefined,
  );
  const [conditionError, setConditionError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit回填: rebuild the form whenever the drawer is (re)opened or the target
  // rule changes. Fixes demo D-3 (see layer-2 spec) where a useState
  // initializer only ran on first mount and never re-populated on subsequent
  // edits of a different rule.
  useEffect(() => {
    setForm(
      rule ? ruleToForm(rule) : emptyRuleForm(priorityRange.defaultValue),
    );
    setActiveTab("basic");
    setErrors(undefined);
    setConditionError(false);
  }, [rule, open, priorityRange.defaultValue]);

  // Clear the inline validation error as soon as the offending field is
  // edited (layer-2 spec: "输入时清除错误" for the name field, and the scope
  // checkboxes clear their error on any change) — mirrors the demo's
  // 'input'/'change' listeners rather than waiting for the next confirm click.
  useEffect(() => {
    setErrors((prev) => (prev?.name ? { ...prev, name: false } : prev));
  }, [form.name]);
  useEffect(() => {
    setErrors((prev) => (prev?.scope ? { ...prev, scope: false } : prev));
  }, [form.scope]);
  useEffect(() => {
    setErrors((prev) => (prev?.priority ? { ...prev, priority: false } : prev));
  }, [form.priority]);
  useEffect(() => {
    setConditionError(false);
  }, [form.conditions]);

  const setFormUpdater = (updater: (f: RuleForm) => RuleForm) =>
    setForm(updater);

  const saveActionsOk = canSaveActions(form.primaryAction, form.addons);

  const handleConfirm = async () => {
    const basicsCheck = validateBasics(
      form.name,
      form.scope,
      form.priority,
      priorityRange,
    );
    if (
      basicsCheck.nameError ||
      basicsCheck.scopeError ||
      basicsCheck.priorityError
    ) {
      setErrors({
        name: basicsCheck.nameError,
        scope: basicsCheck.scopeError,
        priority: basicsCheck.priorityError,
      });
      setActiveTab("basic");
      return;
    }
    // GT-12182: 条件为空时给出内联反馈并切到「条件」页签，而不是发请求等后端
    // 返回 condition_tree must not be empty。
    if (hasNoConditions(form.conditions)) {
      setErrors(undefined);
      setConditionError(true);
      setActiveTab("conditions");
      return;
    }
    setErrors(undefined);
    setConditionError(false);

    if (!saveActionsOk) {
      // Guard for defense-in-depth; the confirm button is already disabled
      // in this state so this path should not normally be reachable.
      return;
    }

    setSubmitting(true);
    try {
      if (rule) {
        await updateAdvancedRule(
          rule.id,
          formToUpdateRequest(form, fieldDefs),
          apiRequest,
        );
      } else {
        await createAdvancedRule(
          formToCreateRequest(form, fieldDefs),
          apiRequest,
        );
      }
      toast.success(t("saveSuccess"));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const mapped = mapApiErrorMessage(t, e.message, priorityRange);
        toast.error(mapped ?? e.message ?? tc("saveFailed"));
      } else {
        toast.error(tc("saveFailed"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const footerHint = errors?.name
    ? t("errors.nameRequired")
    : errors?.scope
      ? t("errors.scopeRequired")
      : errors?.priority
        ? t("errors.priorityRange", {
            min: priorityRange.min,
            max: priorityRange.max,
          })
        : conditionError
          ? t("errors.conditionRequired")
          : !saveActionsOk
            ? t("cannotSave.actionOrAddon")
            : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="data-[side=right]:w-[75vw] data-[side=right]:sm:max-w-[75vw] p-0 flex flex-col"
        data-testid="rule-editor-drawer"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle data-testid="rule-editor-title">
            {rule ? t("editRuleTitle", { name: rule.name }) : t("newRule")}
          </SheetTitle>
          <SheetDescription>{t("editorSubtitle")}</SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabKey)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-6 mt-4 w-fit">
            <TabsTrigger value="basic" data-testid="tab-basic">
              {t("tabs.basic")}
            </TabsTrigger>
            <TabsTrigger value="conditions" data-testid="tab-conditions">
              {t("tabs.conditions")}
            </TabsTrigger>
            <TabsTrigger value="disposition" data-testid="tab-disposition">
              {t("tabs.disposition")}
            </TabsTrigger>
            <TabsTrigger value="test" data-testid="tab-test">
              {t("tabs.testAnalysis")}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 px-6 py-4">
            <TabsContent value="basic" className="mt-0">
              <BasicSettingsTab
                form={form}
                setForm={setFormUpdater}
                errors={errors}
                priorityRange={priorityRange}
              />
            </TabsContent>
            <TabsContent value="conditions" className="mt-0">
              <ConditionsTab
                form={form}
                setForm={setFormUpdater}
                fieldDefs={fieldDefs}
              />
            </TabsContent>
            <TabsContent value="disposition" className="mt-0">
              <ActionsTab
                form={form}
                setForm={setFormUpdater}
                fieldDefs={fieldDefs}
              />
            </TabsContent>
            <TabsContent value="test" className="mt-0">
              <TestAnalysisTab form={form} rule={rule} />
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <SheetFooter className="flex flex-row items-center justify-between gap-4 border-t px-6 py-4">
          <div
            className="text-xs text-destructive"
            data-testid="editor-error-hint"
          >
            {footerHint}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="editor-cancel"
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!saveActionsOk || submitting}
              data-testid="editor-confirm"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirm")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
