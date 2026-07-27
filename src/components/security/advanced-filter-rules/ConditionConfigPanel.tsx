'use client';

import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapKeySelect } from '@/components/rules/MapKeySelect';
import { cn } from '@/lib/utils';
import { CONDITIONS, type ConditionDef } from './catalogue';
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
// select-panel 字段（如 cac_tag/image_qr_code_result 这类无固定清单的
// string 字段）回退为「等于/不等于 + 单值输入」，不臆造错误的枚举值。
const ENUM_VALUES: Record<string, string[]> = {
  spf_result: ['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror'],
  dkim_result: ['pass', 'fail', 'neutral', 'none', 'temperror', 'permerror'],
  dmarc_result: ['pass', 'fail', 'quarantine', 'reject', 'none'],
  ptr_result: ['pass', 'fail', 'none'],
  virus_scan_result: ['clean', 'infected', 'suspicious', 'error'],
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
  const t = useTranslations('advancedRulesFeature') as unknown as T;

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

      {def && (
        <div className="rounded-md border border-green-200 bg-green-50 p-2.5 text-xs text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300" data-testid="condition-desc-card">
          <b className="mb-1 block">{t('v3Conditions.descCardTitle')}</b>
          <div>{t('v3Conditions.descSourceLabel')}: {t(`v3Conditions.desc_${def.key}.source`)}</div>
          <div>{t('v3Conditions.descUsageLabel')}: {t(`v3Conditions.desc_${def.key}.usage`)}</div>
          <div>{t('v3Conditions.descNoteLabel')}: {t(`v3Conditions.desc_${def.key}.note`)}</div>
        </div>
      )}

      <PanelBody leaf={leaf} def={def} fd={fd} onChange={patch} t={t} />

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

function PanelBody({
  leaf,
  def,
  fd,
  onChange,
  t,
}: {
  leaf: ConditionLeaf;
  def: ConditionDef | undefined;
  fd: FieldDef | undefined;
  onChange: (patch: Partial<ConditionLeaf>) => void;
  t: T;
}) {
  if (fd?.type?.startsWith('map_')) {
    return <MapValueSection leaf={leaf} fd={fd} onChange={onChange} t={t} />;
  }

  switch (def?.panel) {
    case 'text':
      return <TextSection leaf={leaf} onChange={onChange} t={t} />;
    case 'mime':
      return <TextSection leaf={leaf} onChange={onChange} t={t} mime />;
    case 'number':
      return <NumberSection leaf={leaf} onChange={onChange} t={t} />;
    case 'cidr':
      return <CidrSection leaf={leaf} onChange={onChange} t={t} />;
    case 'time':
      return <TimeSection leaf={leaf} onChange={onChange} t={t} />;
    case 'weekday':
      return <WeekdaySection leaf={leaf} onChange={onChange} t={t} />;
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
      if (enumOpts) return <EnumSection leaf={leaf} enumOpts={enumOpts} onChange={onChange} t={t} />;
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

function NumberSection({ leaf, onChange, t }: { leaf: ConditionLeaf; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const mode = OPERATOR_TO_MATCH_MODE[leaf.operator] ?? 'gt';
  const isBetween = mode === 'between';
  const [lo, hi] = leaf.value.split(',');
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
            <Label>{t('v3Conditions.betweenLoLabel')}</Label>
            <Input data-testid="config-number-lo" type="number" value={lo ?? ''} onChange={(e) => onChange({ value: `${e.target.value},${hi ?? ''}` })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('v3Conditions.betweenHiLabel')}</Label>
            <Input data-testid="config-number-hi" type="number" value={hi ?? ''} onChange={(e) => onChange({ value: `${lo ?? ''},${e.target.value}` })} />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>{t('v3Conditions.thresholdLabel')}</Label>
          <Input data-testid="config-number-threshold" type="number" value={leaf.value} onChange={(e) => onChange({ value: e.target.value })} />
        </div>
      )}
    </div>
  );
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

function EnumSection({ leaf, enumOpts, onChange, t }: { leaf: ConditionLeaf; enumOpts: string[]; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const mode = OPERATOR_TO_MATCH_MODE[leaf.operator] ?? 'equals';
  const multi = mode === 'matchAny';
  const values = splitDisplayValues(leaf.value);
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
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <Select value={leaf.value || ''} onValueChange={(v) => { if (v) onChange({ value: v }); }}>
            <SelectTrigger data-testid="config-enum-single" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {enumOpts.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
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

function MapValueSection({ leaf, fd, onChange, t }: { leaf: ConditionLeaf; fd: FieldDef; onChange: (p: Partial<ConditionLeaf>) => void; t: T }) {
  const mapKey = leaf.mapKey ?? '*';
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('v3Conditions.groupSelectLabel')}</Label>
        <MapKeySelect mapSource={fd.map_keys_source ?? ''} value={mapKey} onChange={(v) => onChange({ mapKey: v || '*' })} className="w-full" />
      </div>
      {fd.type === 'map_boolean' && (
        <div className="space-y-1.5">
          <Label>{t('v3Conditions.valueLabel')}</Label>
          <BooleanValueSelect value={leaf.value} onChange={(v) => onChange({ operator: 'eq', value: v })} t={t} />
        </div>
      )}
      {fd.type === 'map_number' && (
        <NumberSection leaf={leaf} onChange={onChange} t={t} />
      )}
      {fd.type === 'map_string' && (
        <StringEqualsSection leaf={leaf} onChange={onChange} t={t} />
      )}
    </div>
  );
}
