'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ChevronRight, Search, X, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapKeySelect } from '@/components/rules/MapKeySelect';
import { cn } from '@/lib/utils';
import { useApiRequest } from '@/lib/api/client';
import { listContactDepartments } from '@/lib/api/contacts';
import { buildDepartmentTree, flattenDepartmentTree, getSelfAndDescendantPaths, type DepartmentNode } from '@/lib/org-departments';
import { CONDITIONS, type ConditionDef, type ConditionMeta, type PanelKind } from './catalogue';
import { MATCH_MODE_TO_OPERATOR, OPERATOR_TO_MATCH_MODE, type ConditionLeaf, type MatchMode } from './serde';
import { splitDisplayValues } from './expression';
import type { FieldDef } from '@/types/unified-rules';

// ConditionConfigPanel.tsx — layer-3-conditions.html 中栏：按 def.panel 动态
// 渲染的条件配置表单。除 panel 之外，凡是后端 FieldDef.type 为 map_* 的字段
// （sender_group / sender_ip_group / feature_group / rbl / exec_imp /
// domain_imp）一律先走 MapValueSection（复用 MapKeySelect，源自
// fieldDef.map_keys_source = /unified-rules/_meta/groups|feature-groups|
// detection-profiles），因为这类字段离开 map_key 就没法被后端正确求值——
// 这是本文件在 catalogue.ts 既定 panel 分组之上做的必要正确性修正，不改
// catalogue.ts 本身的 panel 归类。

// 已知结果枚举的字段（demo/spec 明确给出的固定取值集合）；未收录的
// select-panel 字段（如 cac_tag 这类无固定清单的 string 字段）回退为
// 「等于/不等于 + 单值输入」，不臆造错误的枚举值。
const ENUM_VALUES: Record<string, string[]> = {
  spf_result: ['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror'],
  dkim_result: ['pass', 'fail', 'neutral', 'none', 'temperror', 'permerror'],
  dmarc_result: ['pass', 'fail', 'quarantine', 'reject', 'none'],
  ptr_result: ['pass', 'fail', 'none'],
  virus_scan_result: ['clean', 'infected', 'suspicious', 'error'],
  // 二维码 OCR 结果：固定枚举下拉，取值为「成功 / 失败」两态（OCR 识别是否成功），
  // 标签经 i18n 本地化（v3Conditions.qrResultValues.*），杜绝自由输入产生的脏值。
  image_qr_code_result: ['success', 'fail'],
};

// 枚举值需本地化显示的字段 → i18n 子命名空间（相对 advancedRulesFeature）。
// 仅这些字段的选项走 v3Conditions.<ns>.<value> 文案；其余 enum 字段（spf/dkim/
// virus_scan 等协议结果码）仍逐字显示原始 token，不受影响。字段级作用域可避免
// 误改共享 token（如 virus_scan_result 也含 'suspicious'）的其它字段渲染。
const ENUM_VALUE_I18N_NS: Record<string, string> = {
  image_qr_code_result: 'qrResultValues',
};

// 20 个常用 MIME 快捷徽标（技术常量，非文案，不走 i18n —— 同 ENUM_VALUES 的
// pass/fail 结果码一样，是协议层原始 token）。
const MIME_PRESETS: Array<[string, string]> = [
  ['exe', 'application/x-msdownload'],
  ['zip', 'application/zip'],
  ['rar', 'application/x-rar-compressed'],
  ['7z', 'application/x-7z-compressed'],
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xls', 'application/vnd.ms-excel'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['ppt', 'application/vnd.ms-powerpoint'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['txt', 'text/plain'],
  ['csv', 'text/csv'],
  ['html', 'text/html'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['gif', 'image/gif'],
  ['js', 'application/javascript'],
  ['bat', 'application/x-bat'],
  ['msi', 'application/x-msi'],
];

const TEXT_MODES: MatchMode[] = ['contains', 'notContains', 'equals', 'notEquals', 'regex', 'wildcard'];
const NUMBER_MODES: MatchMode[] = ['gt', 'ge', 'lt', 'le', 'between'];
const WEEKDAY_DISPLAY_ORDER = ['1', '2', '3', '4', '5', '6', '0']; // Mon..Sun; values stay 0(Sun)-6(Sat) to match send_dow

type T = (key: string, values?: Record<string, string | number>) => string;

interface Props {
  leaf: ConditionLeaf | null;
  fieldDefs: Record<string, FieldDef>;
  onChange: (id: string, patch: Partial<ConditionLeaf>) => void;
}

export function ConditionConfigPanel({ leaf, fieldDefs, onChange }: Props) {
  const tt = useTranslations('advancedRulesFeature');
  const t = tt as unknown as T;
  // 说明卡的对象含义 / 运算符影响 / 有效示例 / 推荐配置为「可选」子键：仅当
  // desc_<key> 里声明了该子键才渲染，未声明的条件自动退化为原三段式，避免对
  // 全部 54 条条件强制补齐。用 next-intl 的 has() 做存在性判断，不臆造缺省文案。
  const hasKey = (key: string) => tt.has(key);
  // tList — 读取 i18n 里的字符串数组（如分步引导 stepGuideMapNumber）。next-intl
  // 的 t() 只返回字符串，数组要走 raw()；非数组时回退空数组以免渲染出错。
  const tList = (key: string): string[] => {
    const raw = (tt as unknown as { raw: (k: string) => unknown }).raw(key);
    return Array.isArray(raw) ? (raw as string[]) : [];
  };

  if (!leaf) {
    return (
      <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground" data-testid="condition-panel-empty">
        {t('v3Conditions.emptyConfigPanel')}
      </div>
    );
  }

  const def = CONDITIONS.find((d) => d.key === leaf.conditionKey);
  const fd = leaf.field ? fieldDefs[leaf.field] : undefined;
  const label = def ? t(`v3Conditions.conditions.${def.key}`) : leaf.conditionKey;
  const patch = (p: Partial<ConditionLeaf>) => onChange(leaf.id, p);

  return (
    <div className="space-y-3 overflow-y-auto" data-testid="condition-config-panel">
      <div className="flex items-center gap-2 text-[15px] font-semibold">
        {def?.envelope && (
          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-normal text-white">
            {t('v3Conditions.smtpEnvelopeTag')}
          </span>
        )}
        <span data-testid="config-panel-title">{label}</span>
        <span className="ml-auto rounded border px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
          {def?.field ?? leaf.field}
        </span>
      </div>

      {def && <DescriptionCard def={def} fd={fd} t={t} hasKey={hasKey} tList={tList} />}

      <PanelBody leaf={leaf} def={def} fd={fd} onChange={patch} t={t} hasKey={hasKey} />

      {def?.panel !== 'number' && (
        <div className="flex items-center gap-2 border-t pt-2">
          <Checkbox
            id={`exclude-${leaf.id}`}
            checked={!!leaf.exclude}
            onCheckedChange={(v) => patch({ exclude: v === true })}
            data-testid="config-exclude"
          />
          <Label htmlFor={`exclude-${leaf.id}`} className="cursor-pointer text-xs">
            {t('v3Conditions.excludeMatch')}
          </Label>
        </div>
      )}
    </div>
  );
}

// inputTypePanel — 说明卡「输入类型」的取值：map_* 字段统一归为「群组」（走
// MapKeySelect），否则用 def.panel。与 PanelBody 的实际渲染分支保持一致。
function inputTypePanel(def: ConditionDef, fd: FieldDef | undefined): PanelKind {
  return fd?.type?.startsWith('map_') ? 'group' : def.panel;
}

// rangeText — 由 meta.min/max 拼出「有效范围」可读文本。仅一端有界时给出
// 「≥min」/「≤max」，两端都有界给出「min ~ max」。
function rangeText(meta: ConditionMeta, t: T): string {
  const { min, max } = meta;
  if (min !== undefined && max !== undefined) return t('v3Conditions.rangeBoth', { min, max });
  if (min !== undefined) return t('v3Conditions.rangeMin', { min });
  if (max !== undefined) return t('v3Conditions.rangeMax', { max });
  return '';
}

// recommendDisplay — 把语言无关的 meta.recommend 拼成可读的「比较方式 + 阈值
// (+ 单位)」，供说明卡自动生成「有效示例 / 推荐配置」两行以及数值输入占位使用。
// between 写作「lo ~ hi」；无 recommend 时返回 null。
function recommendDisplay(meta: ConditionMeta | undefined, t: T): { modeLabel: string; valueText: string; unit: string } | null {
  const rec = meta?.recommend;
  if (!rec) return null;
  const modeLabel = t(`v3Conditions.matchModes.${rec.mode}`);
  const unit = meta?.unitKey ? t(`v3Conditions.units.${meta.unitKey}`) : '';
  const valueText = rec.mode === 'between'
    ? rec.value.split(',').map((s) => s.trim()).join(' ~ ')
    : rec.value;
  return { modeLabel, valueText, unit };
}

// DescriptionCard — 条件配置说明卡。在原「数据来源 / 用途 / 注意」三段之上，
// 追加贴合当前控件的结构化说明：输入类型、格式与示例（按面板类型统一给出）、
// 单位、有效范围，以及对象含义、支持运算符、有效示例、推荐配置。后四项优先取
// desc_<key> 里手写的子键；数值/阈值类条件（含 map_number 的相似域名）在未手写
// 时，由 meta 自动生成通用的运算符说明与「示例 / 推荐」两行，无需逐条件补文案。
// map_number 这类需要「先选对象、再比大小」的复杂条件额外给出分步引导。
function DescriptionCard({
  def,
  fd,
  t,
  hasKey,
  tList,
}: {
  def: ConditionDef;
  fd: FieldDef | undefined;
  t: T;
  hasKey: (key: string) => boolean;
  tList: (key: string) => string[];
}) {
  const base = `v3Conditions.desc_${def.key}`;
  const meta = def.meta;
  const range = meta ? rangeText(meta, t) : '';
  const isMapNumber = fd?.type === 'map_number';
  const isNumeric = def.panel === 'number' || isMapNumber;
  // 格式与示例按面板类型统一给出：数值/阈值统一走 number；其余用 map_* 归一后的
  // 实际输入面板，从而覆盖 text/cidr/time/weekday/select/group/featureGroup。
  const formatPanel = isNumeric ? 'number' : inputTypePanel(def, fd);
  const rec = recommendDisplay(meta, t);
  const stepGuide = isMapNumber ? tList('v3Conditions.stepGuideMapNumber') : [];

  // 可选行：先手写子键，数值条件在缺省时回退到 meta 自动生成的通用文案。
  const objectRow = hasKey(`${base}.object`) ? t(`${base}.object`) : '';
  const operatorsRow = hasKey(`${base}.operators`)
    ? t(`${base}.operators`)
    : isNumeric ? t('v3Conditions.numericOperatorsHint') : '';
  const exampleRow = hasKey(`${base}.example`)
    ? t(`${base}.example`)
    : rec ? t('v3Conditions.exampleTemplate', { mode: rec.modeLabel, value: rec.valueText, unit: rec.unit }) : '';
  const recommendedRow = hasKey(`${base}.recommended`)
    ? t(`${base}.recommended`)
    : rec ? t('v3Conditions.recommendTemplate', { mode: rec.modeLabel, value: rec.valueText, unit: rec.unit }) : '';

  return (
    <div
      className="space-y-0.5 rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"
      data-testid="condition-desc-card"
    >
      <b className="mb-1 block">{t('v3Conditions.descCardTitle')}</b>
      <div>{t('v3Conditions.descSourceLabel')}: {t(`${base}.source`)}</div>
      <div>{t('v3Conditions.descUsageLabel')}: {t(`${base}.usage`)}</div>
      <div>
        {t('v3Conditions.descInputTypeLabel')}: {t(`v3Conditions.inputType.${inputTypePanel(def, fd)}`)}
      </div>
      {hasKey(`v3Conditions.formats.${formatPanel}`) && (
        <div data-testid="desc-format-row">{t('v3Conditions.descFormatLabel')}: {t(`v3Conditions.formats.${formatPanel}`)}</div>
      )}
      {meta?.unitKey && (
        <div>{t('v3Conditions.descUnitLabel')}: {t(`v3Conditions.units.${meta.unitKey}`)}</div>
      )}
      {range && <div>{t('v3Conditions.descRangeLabel')}: {range}</div>}
      {objectRow && <div>{t('v3Conditions.descObjectLabel')}: {objectRow}</div>}
      {operatorsRow && <div data-testid="desc-operators-row">{t('v3Conditions.descOperatorsLabel')}: {operatorsRow}</div>}
      {exampleRow && <div data-testid="desc-example-row">{t('v3Conditions.descExampleLabel')}: {exampleRow}</div>}
      {recommendedRow && <div data-testid="desc-recommended-row">{t('v3Conditions.descRecommendedLabel')}: {recommendedRow}</div>}
      {stepGuide.length > 0 && (
        <div className="pt-0.5" data-testid="desc-step-guide">
          <div>{t('v3Conditions.descStepGuideLabel')}:</div>
          <ol className="ml-4 list-decimal">
            {stepGuide.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      <div>{t('v3Conditions.descNoteLabel')}: {t(`${base}.note`)}</div>
    </div>
  );
}

function PanelBody({
  leaf,
  def,
  fd,
  onChange,
  t,
  hasKey,
}: {
  leaf: ConditionLeaf;
  def: ConditionDef | undefined;
  fd: FieldDef | undefined;
  onChange: (patch: Partial<ConditionLeaf>) => void;
  t: T;
  hasKey: (key: string) => boolean;
}) {
  if (fd?.type?.startsWith('map_')) {
    return <MapValueSection leaf={leaf} def={def} fd={fd} onChange={onChange} t={t} />;
  }

  switch (def?.panel) {
    case 'text':
      return <TextSection leaf={leaf} onChange={onChange} t={t} />;
    case 'mime':
      return <TextSection leaf={leaf} onChange={onChange} t={t} mime />;
    case 'number':
      return <NumberSection leaf={leaf} meta={def?.meta} onChange={onChange} t={t} />;
    case 'cidr':
      return <CidrSection leaf={leaf} onChange={onChange} t={t} />;
    case 'time':
      return <TimeSection leaf={leaf} onChange={onChange} t={t} />;
    case 'weekday':
      return <WeekdaySection leaf={leaf} onChange={onChange} t={t} />;
    case 'orgDept':
      return <OrgDepartmentSection leaf={leaf} onChange={onChange} t={t} />;
    default: {
      if (fd?.type === 'boolean') {
        return (
          <div className="space-y-2">
            <Label>{t('v3Conditions.valueLabel')}</Label>
            <BooleanValueSelect value={leaf.value} onChange={(v) => onChange({ operator: 'eq', value: v })} t={t} />
          </div>
        );
      }
    const enumOpts = leaf.field ? ENUM_VALUES[leaf.field] : undefined;
    if (enumOpts) return <EnumSection leaf={leaf} enumOpts={enumOpts} onChange={onChange} t={t} hasKey={hasKey} />;
      return <StringEqualsSection leaf={leaf} onChange={onChange} t={t} />;
    }
  }
}

function TextSection({ leaf, onChange, t, mime }: { leaf: ConditionLeaf; onChange: (p: Partial<ConditionLeaf>) => void; t: T; mime?: boolean }) {
  const mode = OPERATOR_TO_MATCH_MODE[leaf.operator] ?? 'contains';
  const lines = splitDisplayValues(leaf.value);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.matchModeLabel')}</Label>
        <Select value={mode} onValueChange={(v) => { if (v) onChange({ operator: MATCH_MODE_TO_OPERATOR[v as MatchMode] }); }}>
          <SelectTrigger data-testid="config-text-mode" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TEXT_MODES.map((m) => (
              <SelectItem key={m} value={m}>{t(`v3Conditions.matchModes.${m}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.valuesLabel')}</Label>
        <Textarea
          data-testid="config-text-values"
          value={leaf.value}
          onChange={(e) => onChange({ value: e.target.value })}
          rows={4}
          className="font-mono text-xs"
          placeholder={t('v3Conditions.valuesHint')}
        />
      </div>
      {mode === 'regex' && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled data-testid="ai-generate-regex" title={t('v3Conditions.aiRegexComingSoon')}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {t('v3Conditions.aiGenerateRegex')}
          </Button>
          <Badge variant="outline" className="text-[10px]">{t('v3Conditions.upcoming')}</Badge>
        </div>
      )}
      {mime && (
        <div className="space-y-1.5">
          <Label>{t('v3Conditions.mimeCommonLabel')}</Label>
          <div className="flex flex-wrap gap-1.5" data-testid="mime-presets">
            {MIME_PRESETS.map(([short, full]) => {
              const on = lines.includes(full);
              return (
                <button
                  key={full}
                  type="button"
                  data-testid={`mime-preset-${short}`}
                  onClick={() => {
                    const next = on ? lines.filter((l) => l !== full) : [...lines, full];
                    onChange({ value: next.join('\n') });
                  }}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[11px]',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {short}
                </button>
              );
            })}
          </div>
          <Label className="pt-1">{t('v3Conditions.mimeCustomLabel')}</Label>
        </div>
      )}
    </div>
  );
}

function NumberSection({ leaf, meta, onChange, t }: { leaf: ConditionLeaf; meta?: ConditionMeta; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const mode = OPERATOR_TO_MATCH_MODE[leaf.operator] ?? 'gt';
  const isBetween = mode === 'between';
  const [lo, hi] = leaf.value.split(',');
  // 单位与原生约束来自 catalogue meta：给 <input> 加 min/max/step，并在标签旁标注
  // 单位、在输入框下给出有效范围提示，帮助管理员判断可接受区间。
  const unit = meta?.unitKey ? t(`v3Conditions.units.${meta.unitKey}`) : '';
  const unitSuffix = unit ? ` (${unit})` : '';
  const rangeHint = meta ? rangeText(meta, t) : '';
  const num = { min: meta?.min, max: meta?.max, step: meta?.step ?? 1 };
  // recommend：语言无关的默认有效模板。既作为输入框占位示例，又提供「应用推荐
  // 配置」按钮，一键把比较方式与阈值填入，降低复杂阈值条件的上手成本。
  const rec = meta?.recommend;
  const [recLo, recHi] = (rec?.value ?? '').split(',');
  const singlePlaceholder = rec && rec.mode !== 'between' ? rec.value : undefined;
  const applyRecommended = rec
    ? () => onChange({ operator: MATCH_MODE_TO_OPERATOR[rec.mode], value: rec.value })
    : undefined;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.comparisonLabel')}</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            if (!v) return;
            const operator = MATCH_MODE_TO_OPERATOR[v as MatchMode];
            if (v === 'between') onChange({ operator, value: leaf.value.includes(',') ? leaf.value : ',' });
            else onChange({ operator, value: leaf.value.split(',')[0] ?? '' });
          }}
        >
          <SelectTrigger data-testid="config-number-mode" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {NUMBER_MODES.map((m) => (
              <SelectItem key={m} value={m}>{t(`v3Conditions.matchModes.${m}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isBetween ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t('v3Conditions.betweenLoLabel')}{unitSuffix}</Label>
            <Input data-testid="config-number-lo" type="number" min={num.min} max={num.max} step={num.step} placeholder={recLo} value={lo ?? ''} onChange={(e) => onChange({ value: `${e.target.value},${hi ?? ''}` })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('v3Conditions.betweenHiLabel')}{unitSuffix}</Label>
            <Input data-testid="config-number-hi" type="number" min={num.min} max={num.max} step={num.step} placeholder={recHi} value={hi ?? ''} onChange={(e) => onChange({ value: `${lo ?? ''},${e.target.value}` })} />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>{t('v3Conditions.thresholdLabel')}{unitSuffix}</Label>
          <Input data-testid="config-number-threshold" type="number" min={num.min} max={num.max} step={num.step} placeholder={singlePlaceholder} value={leaf.value} onChange={(e) => onChange({ value: e.target.value })} />
        </div>
      )}
      {rangeHint && (
        <p className="text-[11px] text-muted-foreground" data-testid="config-number-range-hint">
          {t('v3Conditions.descRangeLabel')}: {rangeHint}
        </p>
      )}
      {rec && applyRecommended && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="config-number-apply-recommended"
          onClick={applyRecommended}
          title={`${t(`v3Conditions.matchModes.${rec.mode}`)} ${recommendValueText(rec)}`}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {t('v3Conditions.applyRecommended')}
        </Button>
      )}
    </div>
  );
}

// recommendValueText — between 显示为「lo ~ hi」，其余原样返回（供按钮 title 提示）。
function recommendValueText(rec: NonNullable<ConditionMeta['recommend']>): string {
  return rec.mode === 'between'
    ? rec.value.split(',').map((s) => s.trim()).join(' ~ ')
    : rec.value;
}

function CidrSection({ leaf, onChange, t }: { leaf: ConditionLeaf; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  return (
    <div className="space-y-1.5">
      <Label>{t('v3Conditions.cidrHint')}</Label>
      <Textarea
        data-testid="config-cidr-values"
        value={leaf.value}
        onChange={(e) => onChange({ value: e.target.value })}
        rows={4}
        className="font-mono text-xs"
        placeholder={t('v3Conditions.cidrPlaceholder')}
      />
    </div>
  );
}

function TimeSection({ leaf, onChange, t }: { leaf: ConditionLeaf; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const [start, end] = leaf.value.split(',');
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>{t('v3Conditions.timeStartLabel')}</Label>
          <Input data-testid="config-time-start" type="time" value={start ?? ''} onChange={(e) => onChange({ operator: 'between', value: `${e.target.value},${end ?? ''}` })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('v3Conditions.timeEndLabel')}</Label>
          <Input data-testid="config-time-end" type="time" value={end ?? ''} onChange={(e) => onChange({ operator: 'between', value: `${start ?? ''},${e.target.value}` })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('v3Conditions.timeRangeHint')}</p>
    </div>
  );
}

function WeekdaySection({ leaf, onChange, t }: { leaf: ConditionLeaf; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const selected = new Set(leaf.value.split(',').map((v) => v.trim()).filter(Boolean));
  return (
    <div className="space-y-1.5">
      <Label>{t('v3Conditions.weekdayLabel')}</Label>
      <div className="flex flex-wrap gap-1.5" data-testid="config-weekday">
        {WEEKDAY_DISPLAY_ORDER.map((d) => {
          const on = selected.has(d);
          return (
            <button
              key={d}
              type="button"
              data-testid={`config-weekday-${d}`}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(d);
                else next.add(d);
                onChange({ operator: 'within', value: Array.from(next).join(',') });
              }}
              className={cn(
                'rounded-md border px-2.5 py-0.5 text-xs select-none',
                on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {t(`v3Conditions.weekday_${d}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BooleanValueSelect({ value, onChange, t }: { value: string; onChange: (v: string) => void; t: T }) {
  return (
    <Select value={value || 'true'} onValueChange={(v) => { if (v) onChange(v); }}>
      <SelectTrigger data-testid="config-boolean-value" className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="true">{t('v3Conditions.booleanTrue')}</SelectItem>
        <SelectItem value="false">{t('v3Conditions.booleanFalse')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function EnumSection({ leaf, enumOpts, onChange, t, hasKey }: { leaf: ConditionLeaf; enumOpts: string[]; onChange: (p: Partial<ConditionLeaf>) => void; t: T; hasKey: (key: string) => boolean }) {
  const mode = OPERATOR_TO_MATCH_MODE[leaf.operator] ?? 'equals';
  const multi = mode === 'matchAny';
  const values = splitDisplayValues(leaf.value);
  // 字段级本地化：仅 ENUM_VALUE_I18N_NS 收录的字段（如二维码 OCR 结果）走
  // v3Conditions.<ns>.<value> 文案，其余 enum 字段（协议结果码）逐字显示原始
  // token。用 hasKey 存在性判断做兜底，缺文案时回退原值，绝不臆造。
  const ns = leaf.field ? ENUM_VALUE_I18N_NS[leaf.field] : undefined;
  const optLabel = (opt: string) => {
    if (ns && hasKey(`v3Conditions.${ns}.${opt}`)) return t(`v3Conditions.${ns}.${opt}`);
    return opt;
  };
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.matchModeLabel')}</Label>
        <Select value={mode} onValueChange={(v) => { if (v) onChange({ operator: MATCH_MODE_TO_OPERATOR[v as MatchMode] }); }}>
          <SelectTrigger data-testid="config-enum-mode" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">{t('v3Conditions.matchModes.equals')}</SelectItem>
            <SelectItem value="notEquals">{t('v3Conditions.matchModes.notEquals')}</SelectItem>
            <SelectItem value="matchAny">{t('v3Conditions.matchModes.matchAny')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.valueLabel')}</Label>
        {multi ? (
          <div className="space-y-1" data-testid="config-enum-multi">
            {enumOpts.map((opt) => {
              const checked = values.includes(opt);
              return (
                <label key={opt} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = new Set(values);
                      if (v) next.add(opt); else next.delete(opt);
                      onChange({ value: Array.from(next).join('\n') });
                    }}
                  />
                  <span>{optLabel(opt)}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <Select value={leaf.value || ''} onValueChange={(v) => { if (v) onChange({ value: v }); }}>
            <SelectTrigger data-testid="config-enum-single" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {enumOpts.map((opt) => <SelectItem key={opt} value={opt}>{optLabel(opt)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

function StringEqualsSection({ leaf, onChange, t }: { leaf: ConditionLeaf; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const mode = leaf.operator === 'ne' ? 'notEquals' : 'equals';
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.matchModeLabel')}</Label>
        <Select value={mode} onValueChange={(v) => { if (v) onChange({ operator: MATCH_MODE_TO_OPERATOR[v as MatchMode] }); }}>
          <SelectTrigger data-testid="config-string-eq-mode" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">{t('v3Conditions.matchModes.equals')}</SelectItem>
            <SelectItem value="notEquals">{t('v3Conditions.matchModes.notEquals')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.valueLabel')}</Label>
        <Input data-testid="config-string-eq-value" value={leaf.value} onChange={(e) => onChange({ value: e.target.value })} />
      </div>
    </div>
  );
}

function MapValueSection({ leaf, def, fd, onChange, t }: { leaf: ConditionLeaf; def: ConditionDef | undefined; fd: FieldDef; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const mapKey = leaf.mapKey ?? '*';
  const isWildcard = mapKey === '*';
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.groupSelectLabel')}</Label>
        <MapKeySelect mapSource={fd.map_keys_source ?? ''} value={mapKey} onChange={(v) => onChange({ mapKey: v || '*' })} placeholder={t('v3Conditions.groupSelectPlaceholder')} className="w-full" />
        {/* 说明「选择对象」的含义，尤其是默认值 * 代表「任意对象/全部键」，
            避免管理员误以为 * 是无效或占位值。 */}
        <p className="text-[11px] text-muted-foreground" data-testid="config-map-object-hint">
          {isWildcard ? t('v3Conditions.mapWildcardHint') : t('v3Conditions.mapObjectHint')}
        </p>
      </div>
      {fd.type === 'map_boolean' && (
        <div className="space-y-1.5">
          <Label>{t('v3Conditions.valueLabel')}</Label>
          <BooleanValueSelect value={leaf.value} onChange={(v) => onChange({ operator: 'eq', value: v })} t={t} />
        </div>
      )}
      {fd.type === 'map_number' && (
        <NumberSection leaf={leaf} meta={def?.meta} onChange={onChange} t={t} />
      )}
      {fd.type === 'map_string' && (
        <StringEqualsSection leaf={leaf} onChange={onChange} t={t} />
      )}
    </div>
  );
}

// OrgDepartmentSection — 「发件组织」取值控件。复用组织通讯录部门数据
// （GET /contacts/_departments → buildDepartmentTree）以树形多选方式选择部门，
// 与「隔离区通知范围」的部门选择器同源同交互，从而与组织通讯录实时联动。
// 选中父部门自动含其所有子孙（getSelfAndDescendantPaths），兑现 catalogue
// 「支持多级组织架构匹配」的语义。取值以部门 path 的换行连接串写入 leaf.value，
// operator 固定为 within（命中所选部门集合）。源头被删的 path 在 chip 里保留展示，
// 便于管理员察觉失效项，而非静默丢弃。
// testid 里的部门 slug 是稳定业务 key（path 本身不随 UI 语言变化），不违反
// testid 禁 locale 依赖的约定。
function orgDeptSlug(path: string): string {
  return path.replaceAll(' / ', '__');
}

function OrgDepartmentSection({ leaf, onChange, t }: { leaf: ConditionLeaf; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const { apiRequest } = useApiRequest();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const selectedPaths = splitDisplayValues(leaf.value);
  const setPaths = (paths: string[]) => onChange({ operator: 'within', value: paths.join('\n') });

  const { data: deptRows = [] } = useQuery({
    queryKey: ['contacts', 'departments'],
    queryFn: async () => (await listContactDepartments(apiRequest)).items,
  });

  const deptTree = useMemo(() => buildDepartmentTree(deptRows), [deptRows]);
  const deptList = useMemo(() => flattenDepartmentTree(deptTree), [deptTree]);

  // 选中/取消部门：含自身及所有子孙
  const toggleDept = (node: DepartmentNode) => {
    const paths = getSelfAndDescendantPaths(node);
    const allSelected = paths.every((p) => selectedPaths.includes(p));
    if (allSelected) {
      setPaths(selectedPaths.filter((p) => !paths.includes(p)));
    } else {
      setPaths(Array.from(new Set([...selectedPaths, ...paths])));
    }
  };

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // 搜索时命中路径及其祖先默认展开
  const matchedPaths = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    deptList.forEach((d) => {
      if (d.path.toLowerCase().includes(q)) {
        d.path.split(' / ').forEach((_, i, arr) => set.add(arr.slice(0, i + 1).join(' / ')));
      }
    });
    return set;
  }, [query, deptList]);

  const renderNode = (node: DepartmentNode, depth = 0) => {
    if (matchedPaths && !matchedPaths.has(node.path)) return null;
    const descendants = getSelfAndDescendantPaths(node);
    const selectedCount = descendants.filter((p) => selectedPaths.includes(p)).length;
    const checked = selectedCount === descendants.length;
    const indeterminate = selectedCount > 0 && !checked;
    const isOpen = matchedPaths ? true : expanded.has(node.path);
    const hasChildren = node.children.length > 0;
    const nodeSlug = orgDeptSlug(node.path);

    return (
      <div key={node.path} data-testid={`config-orgdept-node-${nodeSlug}`}>
        <div className="flex items-center gap-1.5 rounded py-1.5 hover:bg-muted/50" style={{ paddingLeft: depth * 20 }}>
          {hasChildren ? (
            <button
              type="button"
              data-testid={`config-orgdept-expand-${nodeSlug}`}
              onClick={() => toggleExpand(node.path)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <Checkbox
            data-testid={`config-orgdept-toggle-${nodeSlug}`}
            checked={checked}
            indeterminate={indeterminate}
            onCheckedChange={() => toggleDept(node)}
          />
          <span className="text-sm text-foreground">{node.name}</span>
          <span className="text-xs text-muted-foreground">({node.memberCount})</span>
        </div>
        {isOpen && hasChildren && <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>}
      </div>
    );
  };

  const hasDepts = deptTree.length > 0;

  return (
    <div className="space-y-2" data-testid="config-orgdept">
      <div className="flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <Label>{t('v3Conditions.orgDeptSelectLabel')}</Label>
        <span className="text-xs text-muted-foreground">
          {t('v3Conditions.orgDeptSelectedCount', { n: selectedPaths.length })}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground" data-testid="config-orgdept-hint">
        {t('v3Conditions.orgDeptHint')}
      </p>
      {!hasDepts ? (
        <div
          data-testid="config-orgdept-empty"
          className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
        >
          {t('v3Conditions.orgDeptEmpty')}
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <div className="relative border-b border-border p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="config-orgdept-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('v3Conditions.orgDeptSearchPlaceholder')}
              className="h-8 pl-8"
            />
          </div>
          <ScrollArea className="h-52">
            <div className="p-2">
              {matchedPaths && matchedPaths.size === 0 ? (
                <p data-testid="config-orgdept-no-match" className="py-6 text-center text-sm text-muted-foreground">
                  {t('v3Conditions.orgDeptNoMatch')}
                </p>
              ) : (
                deptTree.map((n) => renderNode(n))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      {selectedPaths.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedPaths.map((path) => (
            <Badge key={path} variant="secondary" className="gap-1" data-testid={`config-orgdept-chip-${orgDeptSlug(path)}`}>
              {path}
              <button type="button" onClick={() => setPaths(selectedPaths.filter((p) => p !== path))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            data-testid="config-orgdept-clear"
            onClick={() => setPaths([])}
          >
            {t('v3Conditions.orgDeptClearAll')}
          </Button>
        </div>
      )}
    </div>
  );
}
