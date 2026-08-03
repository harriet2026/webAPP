'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePointerHover } from '@/hooks/use-pointer-hover';
import { cn } from '@/lib/utils';
import { UI_ADDON_KEYS, disabledAddons, type AddonKey, type PrimaryAction } from './conflict-matrix';
import type { AddonsState } from './validation';

// AddonsPanel.tsx — layer-4-actions.html 左栏「附加策略」勾选列表 + 每个
// addon 的参数表单。Two export surfaces:
//   1. `AddonsPanel({ value, onChange, primaryAction })` — a self-contained
//      drop-in widget (rows + inline stacked forms below each enabled row),
//      protocol-compatible with the pre-rewrite addons editor so a future
//      task can swap it into rules/tag/page.tsx verbatim. `primaryAction`
//      undefined => no conflict gating (tag-rules usage, per that editor's
//      existing contract).
//   2. `AddonsRowList` / `AddonParamsForm` — the same two pieces split apart,
//      used by ActionsTab.tsx to place the rows in the left column and a
//      single selected addon's form in the shared middle column (layer-4's
//      three-column split, which needs "one form visible at a time" instead
//      of the pre-rewrite editor's "every enabled addon's form stacked inline").
// Both call sites share one field-rendering implementation (AddonParamsForm)
// so the two addon param key naming conventions never fork.

// ─── Canonical serialize/parse/empty (rule-form.ts delegates to these) ────
// AddonsState.params is stored ALREADY in the exact snake_case shape written
// to metadata.addons[].params (see per-addon default/field keys below) — so
// serialize/parse here are pure structural moves with zero per-type
// transformation, matching rule-form.ts's original (now-removed) private
// serializeAddonsState + the addons-parsing block inside ruleToForm. This is
// deliberate: F4's rule-form.ts already documented "per-addon key shape is
// owned by the (future) addon-editor component, not F4" — this file is that
// component, and it keeps serialize/parse trivial by writing backend-ready
// keys directly instead of adding a second camelCase UI layer that would
// need translating.
export interface AdvancedRulesAddon {
  type: AddonKey;
  params: Record<string, unknown>;
}

export function emptyAddonsState(): AddonsState {
  return {};
}

export function serializeAddons(v: AddonsState): AdvancedRulesAddon[] {
  const out: AdvancedRulesAddon[] = [];
  for (const key of Object.keys(v) as AddonKey[]) {
    const entry = v[key];
    if (entry?.enabled) out.push({ type: key, params: entry.params ?? {} });
  }
  return out;
}

export function parseAddons(meta: unknown): AddonsState {
  const state: AddonsState = {};
  const metaObj = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  const raw = Array.isArray(metaObj.addons) ? metaObj.addons : Array.isArray(meta) ? (meta as unknown[]) : [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const a = item as { type?: unknown; params?: unknown };
    if (typeof a.type !== 'string') continue;
    const params = a.params && typeof a.params === 'object' ? (a.params as Record<string, unknown>) : {};
    state[a.type as AddonKey] = { enabled: true, params };
  }
  return state;
}

// ─── Per-addon default params (materialized the first time an addon is
// enabled, or used as a fallback when rendering a disabled/never-touched
// addon's form) ─────────────────────────────────────────────────────────
export function defaultAddonParams(key: AddonKey): Record<string, unknown> {
  switch (key) {
    case 'disclaimer':
      return { template: 'standard', position: 'body_bottom' };
    case 'externalReminder':
      return { position: 'body_top' };
    case 'adminNotify':
      return { recipient_type: 'adminList', recipients: '', merge_window_minutes: 5, template: 'default' };
    case 'deleteAttachment':
      return {
        scope: 'all',
        replacement_text: '',
        insert_notice: true,
        notice_position: 'body_top',
        insert_text_file: false,
        insert_header_mark: false,
        exception_enabled: false,
        exception_regex: '',
        exception_domain_group: '',
        exception_md5_whitelist: '',
      };
    case 'emailTag':
      return { tag_content: '', tag_position: 'subject_prefix', tag_style: 'plain_text' };
    case 'forwardServer':
      return {
        target_address: '',
        target_port: 25,
        forward_mode: 'copy',
        auth_type: 'none',
        auth_username: '',
        auth_password: '',
        preserve_envelope: false,
      };
    case 'modifyHeader':
      return { target_field: 'Subject', custom_field_name: '', operation: 'replace', new_value: '' };
    case 'detailedLog':
    default:
      return {};
  }
}

// Addons whose runtime backend is not yet wired — schema preserved, engine doesn't
// execute them, surfaced as disabled + "upcoming" so admins don't configure a no-op.
//
// GT-12185: deleteAttachment 与 externalReminder 已从本集合移除 —— 它们的执行链路
// 早已补齐，这里的门禁是从改版前的编辑器继承下来的过时判断。两者都做过真实邮件验证：
//   - deleteAttachment：规则命中后 apply_addon_plan_raw.go 调 RemoveAttachments()
//     重写正文，投递到下游的邮件里附件内容与文件名均已消失。
//   - externalReminder：外部发件人投内部收件人时，投递正文开头出现
//     「⚠️ 外部邮件提醒：此邮件来自组织外部…」横幅（纯文本邮件插纯文本版）。
//
// 三个曾被标为“仅可存储”的附加策略均已接通：deleteAttachment /
// externalReminder 在 milter 即时执行；forwardServer 由 sideline release
// 消费并创建转发任务（tests/integration/test_tag_rule_addon_actions_e2e.py
// TC-TAOA-002 覆盖）。保留该导出作为防回归的显式空集合，后续若新增未接通
// 的配置项必须先放入这里，不能让 UI 展示一条不会执行的策略。
export const STORED_NOT_WIRED_ADDONS: Set<AddonKey> = new Set();

// ─── small field helpers (shared across all 7 addon forms) ────────────────

function tv<T = string>(params: Record<string, unknown>, key: string, fallback: T): T {
  const v = params[key];
  return v === undefined || v === null ? fallback : (v as T);
}

interface FieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
}

function Field({ label, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-normal text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function TextField({
  label,
  required,
  value,
  onChange,
  autoFocus,
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label} required={required}>
      <Input
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </Field>
  );
}

function SelectField({
  label,
  required,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <Select value={value} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {label}
    </label>
  );
}

// ─── AddonParamsForm: the single-addon field set, shared by AddonsPanel
// (inline mode) and ActionsTab (split-column mode) ─────────────────────────

interface AddonParamsFormProps {
  addonKey: AddonKey;
  params: Record<string, unknown>;
  onPatch: (patch: Record<string, unknown>) => void;
  autoFocus?: boolean;
}

export function AddonParamsForm({ addonKey, params, onPatch, autoFocus }: AddonParamsFormProps) {
  const t = useTranslations('advancedRulesFeature');
  const tagPositionOptions = [
    { value: 'subject_prefix', label: t('addons.tagPositionPrefix') },
    { value: 'subject_suffix', label: t('addons.tagPositionSuffix') },
    { value: 'body_start', label: t('addons.tagPositionBodyStart') },
    { value: 'body_end', label: t('addons.tagPositionBodyEnd') },
    { value: 'header', label: t('addons.tagPositionHeader') },
  ];
  const tagStyleOptions = [
    { value: 'plain_text', label: t('addons.tagStylePlainText') },
    { value: 'html_red', label: t('addons.tagStyleHtmlRed') },
    { value: 'html_orange', label: t('addons.tagStyleHtmlOrange') },
    { value: 'html_yellow', label: t('addons.tagStyleHtmlYellow') },
    { value: 'html_blue', label: t('addons.tagStyleHtmlBlue') },
  ];

  switch (addonKey) {
    case 'disclaimer':
      return (
        <div className="space-y-3" data-testid="addon-params-disclaimer">
          <SelectField
            label={t('addons.disclaimerTemplate')}
            required
            value={tv(params, 'template', 'standard')}
            onChange={(v) => onPatch({ template: v })}
            options={[
              { value: 'standard', label: t('addons.disclaimerTemplateStandard') },
              { value: 'legal', label: t('addons.disclaimerTemplateLegal') },
              { value: 'custom', label: t('addons.disclaimerTemplateCustom') },
            ]}
          />
          <SelectField
            label={t('addons.disclaimerPosition')}
            required
            value={tv(params, 'position', 'body_bottom')}
            onChange={(v) => onPatch({ position: v })}
            options={[
              { value: 'body_top', label: t('addons.deleteAttachmentNoticePositionTop') },
              { value: 'body_bottom', label: t('addons.deleteAttachmentNoticePositionBottom') },
              { value: 'header', label: t('addons.disclaimerPositionHeader') },
            ]}
          />
        </div>
      );

    case 'externalReminder':
      return (
        <div className="space-y-3" data-testid="addon-params-externalReminder">
          <SelectField
            label={t('addons.externalReminderPosition')}
            required
            value={tv(params, 'position', 'body_top')}
            onChange={(v) => onPatch({ position: v })}
            options={[
              { value: 'body_top', label: t('addons.externalReminderPositionTop') },
              { value: 'body_bottom', label: t('addons.externalReminderPositionBottom') },
            ]}
          />
          <p className="text-xs text-amber-600" data-testid="addon-externalReminder-amber-hint">
            {t('addons.externalReminderAmberHint')}
          </p>
        </div>
      );

    case 'adminNotify': {
      const recipientType = tv<string>(params, 'recipient_type', 'adminList');
      return (
        <div className="space-y-3" data-testid="addon-params-adminNotify">
          <SelectField
            label={t('addons.adminNotifyRecipientType')}
            required
            value={recipientType}
            onChange={(v) => onPatch({ recipient_type: v })}
            options={[
              { value: 'manual', label: t('addons.adminNotifyRecipientTypeManual') },
              { value: 'adminList', label: t('addons.adminNotifyRecipientTypeAdminList') },
              { value: 'group', label: t('addons.adminNotifyRecipientTypeGroup') },
              { value: 'org', label: t('addons.adminNotifyRecipientTypeOrg') },
            ]}
          />
          {recipientType === 'manual' && (
            <TextField
              label={t('addons.recipients')}
              required
              value={tv(params, 'recipients', '')}
              onChange={(v) => onPatch({ recipients: v })}
              placeholder="admin@example.com, ops@example.com"
              autoFocus={autoFocus}
            />
          )}
          <NumberField
            label={t('addons.mergeWindow')}
            min={1}
            max={60}
            value={tv(params, 'merge_window_minutes', 5)}
            onChange={(v) => onPatch({ merge_window_minutes: v })}
          />
          <SelectField
            label={t('addons.adminNotifyTemplate')}
            value={tv(params, 'template', 'default')}
            onChange={(v) => onPatch({ template: v })}
            options={[{ value: 'default', label: t('addons.adminNotifyTemplateDefault') }]}
          />
        </div>
      );
    }

    case 'deleteAttachment': {
      const scope = tv(params, 'scope', 'all');
      const insertNotice = tv(params, 'insert_notice', true);
      const exceptionEnabled = tv(params, 'exception_enabled', false);
      return (
        <div className="space-y-3" data-testid="addon-params-deleteAttachment">
          <SelectField
            label={t('addons.deleteAttachmentScope')}
            required
            value={scope}
            onChange={(v) => onPatch({ scope: v })}
            options={[
              { value: 'all', label: t('addons.deleteAttachmentScopeAll') },
              { value: 'virusDetected', label: t('addons.deleteAttachmentScopeVirus') },
              { value: 'specificType', label: t('addons.deleteAttachmentScopeType') },
              { value: 'overSize', label: t('addons.deleteAttachmentScopeOverSize') },
              { value: 'encrypted', label: t('addons.deleteAttachmentScopeEncrypted') },
              { value: 'nestedZip', label: t('addons.deleteAttachmentScopeNestedZip') },
              { value: 'hasQrCode', label: t('addons.deleteAttachmentScopeQrCode') },
            ]}
          />
          <TextField
            label={t('addons.deleteAttachmentReplacementText')}
            value={tv(params, 'replacement_text', '')}
            onChange={(v) => onPatch({ replacement_text: v })}
          />
          <CheckboxField
            label={t('addons.deleteAttachmentInsertNotice')}
            checked={insertNotice}
            onChange={(v) => onPatch({ insert_notice: v })}
          />
          {insertNotice && (
            <SelectField
              label={t('addons.deleteAttachmentNoticePositionTop')}
              value={tv(params, 'notice_position', 'body_top')}
              onChange={(v) => onPatch({ notice_position: v })}
              options={[
                { value: 'body_top', label: t('addons.deleteAttachmentNoticePositionTop') },
                { value: 'body_bottom', label: t('addons.deleteAttachmentNoticePositionBottom') },
              ]}
            />
          )}
          <CheckboxField
            label={t('addons.deleteAttachmentInsertTextFile')}
            checked={tv(params, 'insert_text_file', false)}
            onChange={(v) => onPatch({ insert_text_file: v })}
          />
          <CheckboxField
            label={t('addons.deleteAttachmentInsertHeaderMark')}
            checked={tv(params, 'insert_header_mark', false)}
            onChange={(v) => onPatch({ insert_header_mark: v })}
          />
          <div className="border-t pt-3 space-y-3">
            <CheckboxField
              label={t('addons.deleteAttachmentException')}
              checked={exceptionEnabled}
              onChange={(v) => onPatch({ exception_enabled: v })}
            />
            {exceptionEnabled && (
              <div className="space-y-3 pl-1">
                <TextField
                  label={t('addons.deleteAttachmentExceptionRegex')}
                  value={tv(params, 'exception_regex', '')}
                  onChange={(v) => onPatch({ exception_regex: v })}
                  placeholder="\.exe$"
                />
                <TextField
                  label={t('addons.deleteAttachmentExceptionDomainGroup')}
                  value={tv(params, 'exception_domain_group', '')}
                  onChange={(v) => onPatch({ exception_domain_group: v })}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal text-muted-foreground">{t('addons.deleteAttachmentExceptionMd5')}</Label>
                  <Textarea
                    rows={3}
                    value={tv(params, 'exception_md5_whitelist', '')}
                    onChange={(e) => onPatch({ exception_md5_whitelist: e.target.value })}
                    placeholder="d41d8cd98f00b204e9800998ecf8427e"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    case 'emailTag': {
      const position = tv<string>(params, 'tag_position', 'subject_prefix');
      return (
        <div className="space-y-3" data-testid="addon-params-emailTag">
          <TextField
            label={t('addons.tagContent')}
            required
            value={tv(params, 'tag_content', '')}
            onChange={(v) => onPatch({ tag_content: v })}
            autoFocus={autoFocus}
          />
          <SelectField label={t('addons.tagPosition')} value={position} onChange={(v) => onPatch({ tag_position: v })} options={tagPositionOptions} />
          <SelectField
            label={t('addons.emailTagStyle')}
            value={tv(params, 'tag_style', 'plain_text')}
            onChange={(v) => onPatch({ tag_style: v })}
            options={tagStyleOptions}
            disabled={position === 'header'}
          />
        </div>
      );
    }

    case 'forwardServer': {
      const authType = tv<string>(params, 'auth_type', 'none');
      const address = tv(params, 'target_address', '');
      return (
        <div className="space-y-3" data-testid="addon-params-forwardServer">
          <TextField
            label={t('addons.forwardServerAddress')}
            required
            value={address}
            onChange={(v) => onPatch({ target_address: v })}
            placeholder="mail.example.com"
            autoFocus={autoFocus}
          />
          <NumberField
            label={t('addons.forwardServerPort')}
            min={1}
            max={65535}
            value={tv(params, 'target_port', 25)}
            onChange={(v) => onPatch({ target_port: v })}
          />
          <SelectField
            label={t('addons.forwardServerMode')}
            required
            value={tv(params, 'forward_mode', 'copy')}
            onChange={(v) => onPatch({ forward_mode: v })}
            options={[
              { value: 'copy', label: t('addons.forwardServerModeCopy') },
              { value: 'redirect', label: t('addons.forwardServerModeRedirect') },
            ]}
          />
          <SelectField
            label={t('addons.forwardServerAuthType')}
            value={authType}
            onChange={(v) => onPatch({ auth_type: v })}
            options={[
              { value: 'none', label: t('addons.forwardServerAuthNone') },
              { value: 'smtp', label: t('addons.forwardServerAuthSmtp') },
            ]}
          />
          {authType === 'smtp' && (
            <>
              <TextField
                label={t('addons.forwardServerUsername')}
                value={tv(params, 'auth_username', '')}
                onChange={(v) => onPatch({ auth_username: v })}
              />
              <TextField
                label={t('addons.forwardServerPassword')}
                value={tv(params, 'auth_password', '')}
                onChange={(v) => onPatch({ auth_password: v })}
              />
            </>
          )}
          <CheckboxField
            label={t('addons.forwardServerPreserveEnvelope')}
            checked={tv(params, 'preserve_envelope', false)}
            onChange={(v) => onPatch({ preserve_envelope: v })}
          />
        </div>
      );
    }

    case 'modifyHeader': {
      const targetField = tv<string>(params, 'target_field', 'Subject');
      return (
        <div className="space-y-3" data-testid="addon-params-modifyHeader">
          <SelectField
            label={t('addons.modifyHeaderTargetField')}
            required
            value={targetField}
            onChange={(v) => onPatch({ target_field: v })}
            options={[
              { value: 'From', label: t('addons.modifyHeaderTargetFieldFrom') },
              { value: 'To', label: t('addons.modifyHeaderTargetFieldTo') },
              { value: 'Subject', label: t('addons.modifyHeaderTargetFieldSubject') },
              { value: 'Reply-To', label: t('addons.modifyHeaderTargetFieldReplyTo') },
              { value: 'custom', label: t('addons.modifyHeaderTargetFieldCustom') },
            ]}
          />
          {targetField === 'custom' && (
            <TextField
              label={t('addons.modifyHeaderCustomFieldName')}
              required
              value={tv(params, 'custom_field_name', '')}
              onChange={(v) => onPatch({ custom_field_name: v })}
            />
          )}
          <SelectField
            label={t('addons.modifyHeaderOperation')}
            required
            value={tv(params, 'operation', 'replace')}
            onChange={(v) => onPatch({ operation: v })}
            options={[
              { value: 'replace', label: t('addons.modifyHeaderOperationReplace') },
              { value: 'prefix', label: t('addons.modifyHeaderOperationPrefix') },
              { value: 'suffix', label: t('addons.modifyHeaderOperationSuffix') },
              { value: 'regex_replace', label: t('addons.modifyHeaderOperationRegexReplace') },
              { value: 'delete', label: t('addons.modifyHeaderOperationDelete') },
            ]}
          />
          <TextField
            label={t('addons.modifyHeaderNewValue')}
            required
            value={tv(params, 'new_value', '')}
            onChange={(v) => onPatch({ new_value: v })}
          />
          <p className="text-xs text-muted-foreground">{t('addons.modifyHeaderVariableHint')}</p>
          <p className="text-xs text-amber-600">{t('addons.modifyHeaderDkimWarning')}</p>
        </div>
      );
    }

    case 'detailedLog':
    default:
      return null;
  }
}

// ─── AddonsRowList: the left-column checklist (checkbox + name + conflict
// gating + row-click selects, per layer-4's interaction rules) ─────────────

interface AddonsRowListProps {
  value: AddonsState;
  onChange: (v: AddonsState) => void;
  primaryAction?: PrimaryAction;
  selectedKey?: AddonKey | null;
  onSelectKey?: (k: AddonKey) => void;
  // Render the 'detailedLog' toggle at the top of the list. Off by default:
  // the advanced-filter-rules disposition Tab (ActionsTab) deliberately has
  // NO detailedLog UI entry (D-7, it is a data-model-only addon). The
  // rules/tag page opts IN (showDetailedLog) because the pre-rewrite
  // addons editor rendered a "详细日志/Detailed Log" checkbox there, and
  // dropping it would be a behavior change for that consumer.
  showDetailedLog?: boolean;
}

export function AddonsRowList({
  value,
  onChange,
  primaryAction,
  selectedKey,
  onSelectKey,
  showDetailedLog,
}: AddonsRowListProps) {
  const t = useTranslations('advancedRulesFeature');
  const disabledSet = new Set(primaryAction ? disabledAddons(primaryAction) : []);
  const keys: AddonKey[] = showDetailedLog ? ['detailedLog', ...UI_ADDON_KEYS] : UI_ADDON_KEYS;
  // When no selection handler is wired (self-contained AddonsPanel usage, e.g.
  // rules/tag), a click anywhere on the row toggles the addon — restoring the
  // pre-rewrite addons editor's whole-row click target via a real <label>. When
  // a selection handler IS wired (ActionsTab's three-column split), the row
  // instead selects and only the checkbox toggles (unchanged behavior).
  const rowTogglesOnClick = !onSelectKey;

  function toggle(key: AddonKey) {
    const entry = value[key];
    const nextEnabled = !entry?.enabled;
    onChange({
      ...value,
      [key]: { enabled: nextEnabled, params: entry?.params ?? defaultAddonParams(key) },
    });
    onSelectKey?.(key);
  }

  return (
    <div className="space-y-1.5" data-testid="addons-row-list">
      {keys.map((key) => {
        const conflicted = disabledSet.has(key);
        const notWired = STORED_NOT_WIRED_ADDONS.has(key);
        const isDisabled = conflicted || notWired;
        const entry = value[key];
        const checked = !!entry?.enabled;
        const isSelected = selectedKey === key;

        const title = conflicted
          ? t('addons.incompatibleWithAction')
          : notWired
            ? t('addons.storedNotWiredHint')
            : undefined;

        return (
          <AddonRow
            key={key}
            addonKey={key}
            togglesOnClick={rowTogglesOnClick}
            isDisabled={isDisabled}
            isSelected={isSelected}
            checked={checked}
            title={title}
            onSelect={() => onSelectKey?.(key)}
          >
            <Checkbox
              checked={checked}
              disabled={isDisabled}
              onCheckedChange={() => {
                if (isDisabled) return;
                toggle(key);
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="flex-1">{t(`addons.${key}` as never)}</span>
            {notWired && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('addons.upcoming')}
              </span>
            )}
          </AddonRow>
        );
      })}
    </div>
  );
}

// 附加动作可点行（柔和交互反馈规格 §6.5/§7.2/§8）：hover 由 pointer 驱动（disabled 不响应），
// 选中/勾选态不被 hover 覆盖；role=button 形态补 Enter/Space 键盘激活与 focus-visible ring。
function AddonRow({
  addonKey,
  togglesOnClick,
  isDisabled,
  isSelected,
  checked,
  title,
  onSelect,
  children,
}: {
  addonKey: AddonKey | 'detailedLog';
  togglesOnClick: boolean;
  isDisabled: boolean;
  isSelected: boolean;
  checked: boolean;
  title?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const { pointerHoverProps } = usePointerHover<HTMLElement>({ disabled: isDisabled });
  const rowClass = cn(
    'flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm outline-none',
    'transition-[background-color,border-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
    'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset',
    isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer data-[hovered=true]:bg-accent/50',
    isSelected && !isDisabled && 'border-primary ring-1 ring-primary',
    checked && !isDisabled && !isSelected && 'bg-primary/5 border-primary/40',
  );

  if (togglesOnClick) {
    // <label> wrapping the Radix checkbox: a click on the row text/space
    // is forwarded to the checkbox button natively, toggling it once (a
    // direct checkbox click stops propagation and toggles via
    // onCheckedChange — no double toggle). Disabled rows can't toggle
    // (checkbox disabled).
    return (
      <label data-testid={`addon-row-${addonKey}`} title={title} className={rowClass} {...pointerHoverProps}>
        {children}
      </label>
    );
  }

  return (
    <div
      data-testid={`addon-row-${addonKey}`}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      title={title}
      className={rowClass}
      onClick={() => {
        if (isDisabled) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (isDisabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      {...pointerHoverProps}
    >
      {children}
    </div>
  );
}

// ─── AddonsPanel: self-contained inline widget (rows + stacked forms) ─────
// Produces contract: { value, onChange, primaryAction } — see file header.

interface AddonsPanelProps {
  value: AddonsState;
  onChange: (v: AddonsState) => void;
  primaryAction?: PrimaryAction;
  // See AddonsRowList.showDetailedLog. Default off (advanced-filter-rules
  // disposition Tab keeps its D-7 no-detailedLog-UI behavior); rules/tag opts
  // in to preserve the pre-rewrite addons editor's detailed-log checkbox.
  showDetailedLog?: boolean;
}

export function AddonsPanel({ value, onChange, primaryAction, showDetailedLog }: AddonsPanelProps) {
  const t = useTranslations('advancedRulesFeature');
  const disabledSet = new Set(primaryAction ? disabledAddons(primaryAction) : []);

  function patchParams(key: AddonKey, patch: Record<string, unknown>) {
    const entry = value[key];
    onChange({
      ...value,
      [key]: { enabled: !!entry?.enabled, params: { ...(entry?.params ?? defaultAddonParams(key)), ...patch } },
    });
  }

  return (
    <div className="space-y-3" data-testid="addons-panel">
      <Label className="text-base font-semibold">{t('addons.title')}</Label>
      <AddonsRowList value={value} onChange={onChange} primaryAction={primaryAction} showDetailedLog={showDetailedLog} />
      {UI_ADDON_KEYS.filter((k) => value[k]?.enabled && !disabledSet.has(k)).map((key) => (
        <div key={key} className="space-y-3 rounded-md border p-4" data-testid={`addon-inline-form-${key}`}>
          <Label className="font-medium">{t(`addons.${key}` as never)}</Label>
          <AddonParamsForm addonKey={key} params={value[key]?.params ?? defaultAddonParams(key)} onPatch={(p) => patchParams(key, p)} />
        </div>
      ))}
    </div>
  );
}

// ─── useAutoFocusFirstField: focuses the first input inside `containerRef`
// ~100ms after `trigger` changes (layer-4 interaction rule: "勾选自动展开
// 参数并 focus 首个输入（100ms）"). Exported so ActionsTab.tsx (which owns
// the "which panel is showing" selection state) can drive the same behavior
// for its split middle column. ─────────────────────────────────────────────
export function useAutoFocusFirstField(containerRef: React.RefObject<HTMLElement | null>, trigger: unknown) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      const el = containerRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]), [role="combobox"]:not([data-disabled]), textarea:not([disabled]), button:not([disabled])',
      );
      el?.focus();
    }, 100);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

export function useContainerRef() {
  return useRef<HTMLDivElement>(null);
}
