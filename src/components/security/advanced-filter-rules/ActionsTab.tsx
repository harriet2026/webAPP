'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { canSaveActions } from './validation';
import type { PrimaryAction, AddonKey } from './conflict-matrix';
import type { RuleForm } from './rule-form';
import type { FieldDef } from '@/types/unified-rules';
import {
  AddonsRowList,
  AddonParamsForm,
  defaultAddonParams,
  useAutoFocusFirstField,
  useContainerRef,
} from './AddonsPanel';
import { ActionSummary } from './ActionSummary';

// ActionsTab.tsx — layer-4-actions.html 顶层容器: 三栏 grid
// [280px_1fr_320px]. 左栏(执行动作 Select + 提示 + 「配置参数」按钮 +
// 附加策略勾选列表) / 中栏(选中项——动作或某个 addon——的参数表单，共享同
// 一个 selection state) / 右栏(ActionSummary，只读三区). fieldDefs 未被
// 本 Tab 使用，保留仅为与 F6 ConditionsTab 一致的容器签名(RuleEditorDrawer
// 对所有 Tab 统一传参).

const PRIMARY_ACTIONS: PrimaryAction[] = ['none', 'deliver', 'tagDeliver', 'quarantine', 'review', 'discard'];

type Selection = { type: 'action' } | { type: 'addon'; key: AddonKey };

interface Props {
  form: RuleForm;
  setForm: (updater: (f: RuleForm) => RuleForm) => void;
  fieldDefs: Record<string, FieldDef>;
}

export function ActionsTab({ form, setForm }: Props) {
  const t = useTranslations('advancedRulesFeature');
  const [selection, setSelection] = useState<Selection>({ type: 'action' });
  const midRef = useContainerRef();

  const primaryAction = form.primaryAction;
  const canSave = canSaveActions(primaryAction, form.addons);

  useAutoFocusFirstField(midRef, selection);

  function handleActionChange(v: string | null) {
    if (!v) return;
    const action = v as PrimaryAction;
    setForm((f) => ({ ...f, primaryAction: action }));
    setSelection({ type: 'action' });
  }

  function handleSelectAddon(key: AddonKey) {
    setSelection({ type: 'addon', key });
  }

  function patchAddonParams(key: AddonKey, patch: Record<string, unknown>) {
    setForm((f) => {
      const entry = f.addons[key];
      return {
        ...f,
        addons: {
          ...f.addons,
          [key]: { enabled: !!entry?.enabled, params: { ...(entry?.params ?? defaultAddonParams(key)), ...patch } },
        },
      };
    });
  }

  const selectedAddonKey = selection.type === 'addon' ? selection.key : null;
  const selectedAddonEntry = selectedAddonKey ? form.addons[selectedAddonKey] : undefined;

  return (
    <div
      className="grid gap-3 overflow-hidden"
      style={{ gridTemplateColumns: '280px 1fr 320px', minHeight: 'calc(100vh - 280px)' }}
      data-testid="actions-tab"
    >
      {/* ── 左栏 ── */}
      <div className="space-y-3 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">{t('disposition.primaryActionLabel')}</Label>
          <Select value={primaryAction} onValueChange={handleActionChange}>
            <SelectTrigger data-testid="primary-action-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIMARY_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`primaryActions.${a}` as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {primaryAction === 'none' && (
            <p className="text-xs text-muted-foreground" data-testid="none-action-hint">
              {t('disposition.noneHint')}
            </p>
          )}
          {!canSave && (
            <p className="text-xs text-destructive" data-testid="actions-left-required-hint">
              {t('cannotSave.actionOrAddon')}
            </p>
          )}
          {primaryAction !== 'none' && (
            <button
              type="button"
              data-testid="configure-action-button"
              onClick={() => setSelection({ type: 'action' })}
              className={cn(
                'w-full rounded-md border-0 border-l-[3px] border-l-primary bg-primary/10 px-3 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/15',
              )}
            >
              {t('disposition.configureActionButton', { action: t(`primaryActions.${primaryAction}` as never) })}
            </button>
          )}
        </div>

        <div className="border-t pt-3">
          <div className="mb-2 text-sm font-semibold">{t('disposition.addonsHeading')}</div>
          <AddonsRowList
            value={form.addons}
            onChange={(addons) => setForm((f) => ({ ...f, addons }))}
            primaryAction={primaryAction}
            selectedKey={selectedAddonKey}
            onSelectKey={handleSelectAddon}
          />
        </div>
      </div>

      {/* ── 中栏 ── */}
      <div ref={midRef} className="overflow-y-auto border-x px-4" data-testid="actions-mid-panel">
        {selection.type === 'action' ? (
          <ActionParamsPanel form={form} setForm={setForm} />
        ) : (
          <AddonSelectedPanel
            addonKey={selection.key}
            enabled={!!selectedAddonEntry?.enabled}
            params={selectedAddonEntry?.params ?? defaultAddonParams(selection.key)}
            onPatch={(patch) => patchAddonParams(selection.key, patch)}
          />
        )}
      </div>

      {/* ── 右栏 ── */}
      <div className="overflow-y-auto" data-testid="actions-right-panel">
        <ActionSummary form={form} />
      </div>
    </div>
  );
}

// ─── 中栏: 动作参数表单 ─────────────────────────────────────────────────

function DescCard({ actionKey }: { actionKey: PrimaryAction }) {
  const t = useTranslations('advancedRulesFeature');
  return (
    <div className="mb-3 rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
      <p className="mb-1 font-semibold">{t('disposition.descCardTitle')}</p>
      <p>
        {t('disposition.descSourceLabel')}: {t(`disposition.actionDesc.${actionKey}.source` as never)}
      </p>
      <p>
        {t('disposition.descUsageLabel')}: {t(`disposition.actionDesc.${actionKey}.usage` as never)}
      </p>
      <p>
        {t('disposition.descNoteLabel')}: {t(`disposition.actionDesc.${actionKey}.note` as never)}
      </p>
    </div>
  );
}

function ActionParamsPanel({ form, setForm }: { form: RuleForm; setForm: Props['setForm'] }) {
  const t = useTranslations('advancedRulesFeature');
  const action = form.primaryAction;

  function patchDeliver(patch: Partial<NonNullable<RuleForm['actionParams']['deliver']>>) {
    setForm((f) => ({
      ...f,
      actionParams: { ...f.actionParams, deliver: { ...(f.actionParams.deliver ?? { skipSubsequentRules: false }), ...patch } },
    }));
  }
  function patchTagDeliver(patch: Partial<NonNullable<RuleForm['actionParams']['tagDeliver']>>) {
    setForm((f) => ({
      ...f,
      actionParams: {
        ...f.actionParams,
        tagDeliver: {
          ...(f.actionParams.tagDeliver ?? { content: '', position: 'subject_prefix', style: 'plain_text' }),
          ...patch,
        },
      },
    }));
  }
  function patchReview(patch: Partial<NonNullable<RuleForm['actionParams']['review']>>) {
    setForm((f) => ({
      ...f,
      actionParams: { ...f.actionParams, review: { ...(f.actionParams.review ?? { reviewers: '', timeoutHours: 24 }), ...patch } },
    }));
  }
  function patchDiscard(patch: Partial<NonNullable<RuleForm['actionParams']['discard']>>) {
    setForm((f) => ({
      ...f,
      actionParams: {
        ...f.actionParams,
        discard: { ...(f.actionParams.discard ?? { logEnabled: true, silent: true, notifyAdmin: false }), ...patch },
      },
    }));
  }
  function patchBlock(patch: Partial<NonNullable<RuleForm['actionParams']['block']>>) {
    setForm((f) => ({
      ...f,
      actionParams: {
        ...f.actionParams,
        block: {
          ...(f.actionParams.block ?? { smtpCode: '550', responseText: '', tarpit: false, tarpitSeconds: 5 }),
          ...patch,
        },
      },
    }));
  }

  return (
    <div data-testid="action-params-panel">
      <div className="mb-2 flex items-center gap-2 text-base font-semibold">
        {t(`primaryActions.${action}` as never)}
        <span className="rounded border px-1.5 py-0 font-mono text-[11px] font-normal text-muted-foreground">action</span>
      </div>
      <DescCard actionKey={action} />

      {action === 'deliver' && (
        <label className="flex items-center gap-2 text-sm cursor-pointer" data-testid="deliver-skip-subsequent">
          <Checkbox
            checked={!!form.actionParams.deliver?.skipSubsequentRules}
            onCheckedChange={(v) => patchDeliver({ skipSubsequentRules: !!v })}
          />
          {t('deliver.skipSubsequent')}
        </label>
      )}

      {action === 'tagDeliver' && (
        <TagDeliverForm value={form.actionParams.tagDeliver} onPatch={patchTagDeliver} />
      )}

      {action === 'quarantine' && (
        <p className="text-xs text-muted-foreground" data-testid="quarantine-hint">
          {t('disposition.quarantineHint')}
        </p>
      )}

      {action === 'review' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">{t('review.reviewers')}</Label>
            <Input
              autoFocus
              value={form.actionParams.review?.reviewers ?? ''}
              onChange={(e) => patchReview({ reviewers: e.target.value })}
              placeholder="admin@example.com, security@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">{t('review.timeoutHours')}</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={form.actionParams.review?.timeoutHours ?? 24}
              onChange={(e) => {
                const n = Number(e.target.value);
                patchReview({ timeoutHours: Number.isFinite(n) ? n : 24 });
              }}
            />
          </div>
        </div>
      )}

      {action === 'discard' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={!!form.actionParams.discard?.silent} onCheckedChange={(v) => patchDiscard({ silent: !!v })} />
            {t('discard.silentDiscard')}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={!!form.actionParams.discard?.notifyAdmin} onCheckedChange={(v) => patchDiscard({ notifyAdmin: !!v })} />
            {t('discard.notifyAdmin')}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={!!form.actionParams.discard?.logEnabled} onCheckedChange={(v) => patchDiscard({ logEnabled: !!v })} />
            {t('discard.logEnabled')}
          </label>
        </div>
      )}

      {action === 'block' && <BlockForm value={form.actionParams.block} onPatch={patchBlock} />}
    </div>
  );
}

function TagDeliverForm({
  value,
  onPatch,
}: {
  value: RuleForm['actionParams']['tagDeliver'];
  onPatch: (p: Partial<NonNullable<RuleForm['actionParams']['tagDeliver']>>) => void;
}) {
  const t = useTranslations('advancedRulesFeature');
  const position = value?.position ?? 'subject_prefix';
  const isHeader = position === 'header';
  return (
    <div className="space-y-3" data-testid="tagdeliver-params">
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">
          {t('addons.tagContent')} <span className="text-destructive">*</span>
        </Label>
        <Input autoFocus value={value?.content ?? ''} onChange={(e) => onPatch({ content: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">{t('addons.tagPosition')}</Label>
        <Select value={position} onValueChange={(v) => v && onPatch({ position: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="subject_prefix">{t('addons.tagPositionPrefix')}</SelectItem>
            <SelectItem value="subject_suffix">{t('addons.tagPositionSuffix')}</SelectItem>
            <SelectItem value="body_start">{t('addons.tagPositionBodyStart')}</SelectItem>
            <SelectItem value="body_end">{t('addons.tagPositionBodyEnd')}</SelectItem>
            <SelectItem value="header">{t('addons.tagPositionHeader')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">{t('disposition.tagStyleLabel')}</Label>
        <Select value={value?.style ?? 'plain_text'} onValueChange={(v) => v && onPatch({ style: v })} disabled={isHeader}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plain_text">{t('addons.tagStylePlainText')}</SelectItem>
            <SelectItem value="html_red">{t('addons.tagStyleHtmlRed')}</SelectItem>
            <SelectItem value="html_orange">{t('addons.tagStyleHtmlOrange')}</SelectItem>
            <SelectItem value="html_yellow">{t('addons.tagStyleHtmlYellow')}</SelectItem>
          </SelectContent>
        </Select>
        {isHeader && <p className="text-xs text-muted-foreground">{t('disposition.tagDeliverStyleDisabledHint')}</p>}
      </div>
      {isHeader && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">{t('addons.headerName')}</Label>
            <Input value={value?.headerName ?? ''} onChange={(e) => onPatch({ headerName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">{t('addons.headerValue')}</Label>
            <Input value={value?.headerValue ?? ''} onChange={(e) => onPatch({ headerValue: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

function BlockForm({
  value,
  onPatch,
}: {
  value: RuleForm['actionParams']['block'];
  onPatch: (p: Partial<NonNullable<RuleForm['actionParams']['block']>>) => void;
}) {
  const t = useTranslations('advancedRulesFeature');
  const tarpit = !!value?.tarpit;
  return (
    <div className="space-y-3" data-testid="block-params">
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">
          {t('block.smtpCode')} <span className="text-destructive">*</span>
        </Label>
        <Input autoFocus value={value?.smtpCode ?? '550'} onChange={(e) => onPatch({ smtpCode: e.target.value })} />
        <p className="text-xs text-muted-foreground">{t('disposition.blockSmtpCodeHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-normal text-muted-foreground">
          {t('block.responseText')} <span className="text-destructive">*</span>
        </Label>
        <Input value={value?.responseText ?? ''} onChange={(e) => onPatch({ responseText: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={tarpit} onCheckedChange={(v) => onPatch({ tarpit: !!v })} />
        {t('block.tarpitEnabled')}
      </label>
      {tarpit && (
        <div className="space-y-1.5 pl-1">
          <Label className="text-xs font-normal text-muted-foreground">{t('block.tarpitSeconds')}</Label>
          <Input
            type="number"
            min={1}
            max={60}
            value={value?.tarpitSeconds ?? 5}
            onChange={(e) => {
              const n = Number(e.target.value);
              onPatch({ tarpitSeconds: Number.isFinite(n) ? n : 5 });
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── 中栏: 附加策略参数表单(选中某 addon 时) ─────────────────────────────

function AddonSelectedPanel({
  addonKey,
  enabled,
  params,
  onPatch,
}: {
  addonKey: AddonKey;
  enabled: boolean;
  params: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations('advancedRulesFeature');
  return (
    <div data-testid="addon-selected-panel">
      <div className="mb-2 flex items-center gap-2 text-base font-semibold">
        {t(`addons.${addonKey}` as never)}
        <span className="rounded border px-1.5 py-0 font-mono text-[11px] font-normal text-muted-foreground">addon_policy</span>
      </div>
      <div className="mb-3 rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
        <p className="mb-1 font-semibold">{t('disposition.descCardTitle')}</p>
        <p>{t('disposition.addonDescUsage', { name: t(`addons.${addonKey}` as never) })}</p>
      </div>
      <fieldset disabled={!enabled} className={cn(!enabled && 'opacity-60')}>
        <AddonParamsForm addonKey={addonKey} params={params} onPatch={onPatch} autoFocus={enabled} />
      </fieldset>
      {!enabled && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="addon-disabled-hint">
          {t('disposition.addonDisabledHint')}
        </p>
      )}
    </div>
  );
}
