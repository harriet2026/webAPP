'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, FolderPlus, MinusCircle } from 'lucide-react';
import type { RuleNode, FieldDef, SidelineCheckMeta } from '@/types/unified-rules';
import { useState, useEffect, useMemo } from 'react';
import { useApiRequest } from '@/lib/api/client';
import { getFieldDefinitions, getSidelineChecksMetadata } from '@/lib/api/unified-rules';
import { Textarea } from '@/components/ui/textarea';

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
};

function needsValue(operator: string | undefined) {
  return operator !== 'isNull' && operator !== 'isNotNull';
}

interface ConditionTreeBuilderProps {
  value: RuleNode;
  onChange: (node: RuleNode) => void;
  stage: string;
  allowedFields?: string[];
  lockedStructure?: boolean;
  originalNode?: RuleNode;
}

export function ConditionTreeBuilder({ value, onChange, stage, allowedFields, lockedStructure, originalNode }: ConditionTreeBuilderProps) {
  const t = useTranslations('advancedRules');
  const { apiRequest } = useApiRequest();
  const [fieldDefs, setFieldDefs] = useState<Record<string, FieldDef>>({});
  const [sidelineChecks, setSidelineChecks] = useState<Record<string, SidelineCheckMeta>>({});

  useEffect(() => {
    if (!stage) return;
    getFieldDefinitions(stage, undefined, apiRequest)
      .then(resp => setFieldDefs(resp.fields || {}))
      .catch(() => setFieldDefs({}));
  }, [stage, apiRequest]);

  useEffect(() => {
    if (stage !== 'sideline') return;
    getSidelineChecksMetadata(apiRequest)
      .then(checks => {
        const map: Record<string, SidelineCheckMeta> = {};
        for (const c of checks) map[c.type] = c;
        setSidelineChecks(map);
      })
      .catch(() => setSidelineChecks({}));
  }, [stage, apiRequest]);

  const fieldGroups = useMemo(() => {
    const groups: Record<string, { label: string; fields: { value: string; label: string }[] }> = {
      connection: { label: t('fieldGroups.email'), fields: [] },
      sender: { label: t('fieldGroups.email'), fields: [] },
      recipient: { label: t('fieldGroups.email'), fields: [] },
      header: { label: t('fieldGroups.email'), fields: [] },
      body: { label: t('fieldGroups.email'), fields: [] },
      verification: { label: t('fieldGroups.verification'), fields: [] },
      detection: { label: t('fieldGroups.ruleResults'), fields: [] },
    };

    const stageOrder = ['onconnect', 'mail', 'rcpt', 'header', 'data', 'sideline'];
    const stageIdx = stageOrder.indexOf(stage);

    for (const [name, def] of Object.entries(fieldDefs)) {
      if (allowedFields && !allowedFields.includes(name)) continue;
      const fieldStageIdx = stageOrder.indexOf(def.min_stage);
      if (fieldStageIdx > stageIdx) continue;

      let group = 'detection';
      if (['client_ip', 'hostname', 'helo', 'ptr_valid', 'ptr_domain', 'ip_concurrent', 'ip_conn_count', 'ip_email_count', 'ptr_result'].includes(name)) {
        group = 'connection';
      } else if (['sender', 'senderdomain', 'sender_domain', 'auth_user', 'is_outbound', 'mailfrom_empty', 'mailfrom_invalid'].includes(name)) {
        group = 'sender';
      } else if (['recipient', 'recipient_domain', 'rcpt_count', 'rcpt_auto_whitelisted', 'autowhitelist_rcpt_count', 'onercpt', 'onercpttag', 'rcpttags', 'onercpt_is_internal'].includes(name)) {
        group = 'recipient';
      } else if (['from_name', 'from_address', 'subject', 'email_size', 'header', 'envelope_header_mismatch'].includes(name)) {
        group = 'header';
      } else if (['text_body', 'html_body', 'content', 'message_id', 'attachment_count', 'attachment_names', 'attachment_types', 'attachment_size_total', 'has_attachment', 'urls', 'doccontent'].includes(name)) {
        group = 'body';
      } else if (['spf_result', 'dkim_result', 'dmarc_result'].includes(name)) {
        group = 'verification';
      } else if (['rbl', 'exec_imp', 'domain_imp', 'cac_result_code', 'cac_tag', 'cac_int_tag', 'cac_tid', 'cac_description', 'cac_prob', 'cac_suspicious_urls', 'cac_repeat_count', 'cac_rules'].includes(name)) {
        group = 'detection';
      } else if (['geo_region', 'geo_region_name', 'geo_city', 'geo_continent', 'geo_asn', 'geo_isp', 'geo_is_anonymous_proxy', 'geo_is_satellite'].includes(name)) {
        group = 'connection';
      } else if (['similar_detection_matched', 'similar_detection_direction', 'similar_detection_namespace', 'similar_detection_cluster_id', 'similar_detection_counter', 'similar_detection_similarity_pct', 'similar_detection_skip_reason'].includes(name)) {
        group = 'detection';
      } else if (['sideline_phish_checked', 'sideline_phish_status', 'sideline_phish_verdict', 'sideline_phish_risk', 'sideline_phish_confidence', 'sideline_phish_confidence_available', 'sideline_phish_policy_score', 'sideline_phish_error'].includes(name)) {
        group = 'detection';
      } else if (['is_internal', 'headers'].includes(name)) {
        group = 'body';
      }

      if (groups[group]) {
        groups[group].fields.push({ value: name, label: def.label });
      }
    }

    return Object.entries(groups).filter(([, g]) => g.fields.length > 0);
  }, [fieldDefs, stage, allowedFields, t]);

  return (
    <div className="space-y-2">
      <NodeEditor node={value} onChange={onChange} depth={0} t={t} fieldDefs={fieldDefs} fieldGroups={fieldGroups} sidelineChecks={sidelineChecks} lockedStructure={lockedStructure} originalNode={originalNode} />
    </div>
  );
}

interface NodeEditorProps {
  node: RuleNode;
  onChange: (node: RuleNode) => void;
  onDelete?: () => void;
  depth: number;
  t: ReturnType<typeof useTranslations>;
  fieldDefs: Record<string, FieldDef>;
  fieldGroups: [string, { label: string; fields: { value: string; label: string }[] }][];
  sidelineChecks: Record<string, SidelineCheckMeta>;
  lockedStructure?: boolean;
  originalNode?: RuleNode;
}

function NodeEditor({ node, onChange, onDelete, depth, t, fieldDefs, fieldGroups, sidelineChecks, lockedStructure, originalNode }: NodeEditorProps) {
  if (node.type === 'condition') {
    const originalValue = originalNode?.type === 'condition' ? originalNode.value : undefined;
    return (
      <ConditionEditor
        node={node}
        onChange={onChange}
        onDelete={lockedStructure ? undefined : onDelete}
        t={t}
        fieldDefs={fieldDefs}
        fieldGroups={fieldGroups}
        sidelineChecks={sidelineChecks}
        lockedStructure={lockedStructure}
        originalValue={originalValue}
      />
    );
  }

  const isNot = node.type === 'NOT';
  const label = isNot ? t('negate') : node.type === 'AND' ? t('allMustMatch') : t('anyMustMatch');

  return (
    <div
      className={`border rounded-md p-3 space-y-2 ${
        depth === 0
          ? 'border-primary/30 bg-primary/5'
          : depth === 1
            ? 'border-muted-foreground/20 bg-muted/30'
            : 'border-border bg-background'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {isNot || lockedStructure ? (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
            {label}
          </span>
        ) : (
          <Select
            value={node.type}
            onValueChange={(v) => { if (v) onChange({ ...node, type: v as 'AND' | 'OR' }); }}
          >
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">{t('allMustMatch')}</SelectItem>
              <SelectItem value="OR">{t('anyMustMatch')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        {!lockedStructure && (
          <div className="flex gap-1 ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const newChild: RuleNode = { type: 'condition', field: 'client_ip', operator: 'eq', value: '' };
                onChange({ ...node, children: [...(node.children || []), newChild] });
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('addCondition')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const newGroup: RuleNode = { type: 'AND', children: [{ type: 'condition', field: 'client_ip', operator: 'eq', value: '' }] };
                onChange({ ...node, children: [...(node.children || []), newGroup] });
              }}
            >
              <FolderPlus className="h-3 w-3 mr-1" />
              {t('addGroup')}
            </Button>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive"
                onClick={onDelete}
              >
                <MinusCircle className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2 pl-2 border-l-2 border-border/50">
        {(node.children || []).map((child, i) => (
          <NodeEditor
            key={i}
            node={child}
            onChange={(newChild) => {
              const newChildren = [...(node.children || [])];
              newChildren[i] = newChild;
              onChange({ ...node, children: newChildren });
            }}
            onDelete={() => {
              const newChildren = (node.children || []).filter((_, ci) => ci !== i);
              onChange({ ...node, children: newChildren });
            }}
            depth={depth + 1}
            t={t}
            fieldDefs={fieldDefs}
            fieldGroups={fieldGroups}
            sidelineChecks={sidelineChecks}
            lockedStructure={lockedStructure}
            originalNode={originalNode?.children?.[i]}
          />
        ))}
        {(node.children || []).length === 0 && (
          <div className="text-xs text-muted-foreground py-2">{t('addCondition')}</div>
        )}
      </div>
    </div>
  );
}

interface ConditionEditorProps {
  node: RuleNode;
  onChange: (node: RuleNode) => void;
  onDelete?: () => void;
  t: ReturnType<typeof useTranslations>;
  fieldDefs: Record<string, FieldDef>;
  fieldGroups: [string, { label: string; fields: { value: string; label: string }[] }][];
  sidelineChecks: Record<string, SidelineCheckMeta>;
  lockedStructure?: boolean;
  originalValue?: string;
}

function ConditionEditor({ node, onChange, onDelete, t, fieldDefs, fieldGroups, sidelineChecks, lockedStructure, originalValue }: ConditionEditorProps) {
  const field = node.field || '';
  const operator = node.operator || 'eq';
  const value = node.value || '';
  const def = fieldDefs[field];
  const isMap = def?.type?.startsWith('map_');

  const sidelineAsyncCheck = useMemo(() => {
    if (def?.availability !== 'sideline_async' || !def?.produced_by) return null;
    return sidelineChecks[def.produced_by] ?? null;
  }, [def, sidelineChecks]);

  const isBool = def?.type === 'boolean';
  const isTagList = def?.type === 'tag_list';
  const operators = def?.operators || [];
  const isWithin = operator === 'within';
  const showValue = !isBool && needsValue(operator);

  if (isWithin) {
    const showOriginalHint = lockedStructure && originalValue !== undefined && originalValue !== '' && value !== originalValue;
    return (
      <div className="flex flex-col gap-2 p-2 border rounded bg-background">
        <div className="flex flex-wrap items-center gap-2">
          {lockedStructure ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground w-[180px]">
              {fieldDefs[field]?.label || field}
            </span>
          ) : (
            <Select value={field} onValueChange={(v) => {
              if (!v) return;
              const newDef = fieldDefs[v];
              const newOps = newDef?.operators || [];
              const opStillValid = newOps.includes(operator);
              const newIsMap = newDef?.type?.startsWith('map_');
              onChange({
                ...node,
                field: v,
                operator: opStillValid ? operator : (newOps[0] || 'eq'),
                value: newDef?.type === 'boolean' ? (node.value || 'true') : '',
                map_key: newIsMap ? '*' : undefined,
              });
            }}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder={t('selectField')} />
              </SelectTrigger>
              <SelectContent>
                {fieldGroups.map(([groupKey, group]) => (
                  <SelectGroup key={groupKey}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.fields.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label} <span className="text-muted-foreground ml-1 text-[10px]">({f.value})</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}

          {isMap && (
            <Input
              className="w-[120px] h-8 text-xs"
              value={node.map_key || ''}
              onChange={(e) => onChange({ ...node, map_key: e.target.value || undefined })}
              placeholder="* (any)"
            />
          )}

          {lockedStructure ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground w-[130px]">
              {t(`operators.${OPERATOR_LABEL_KEYS[operator] || operator}`)}
            </span>
          ) : (
            <Select value={operator} onValueChange={(v) => { if (v) onChange({ ...node, operator: v }); }}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder={t('selectOperator')} />
              </SelectTrigger>
              <SelectContent>
                {operators.map((op) => (
                  <SelectItem key={op} value={op}>{t(`operators.${OPERATOR_LABEL_KEYS[op] || op}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {!lockedStructure && onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Textarea
            className="w-full min-w-[300px] min-h-[100px] text-xs font-mono"
            value={value}
            onChange={(e) => onChange({ ...node, value: e.target.value })}
            placeholder={t('withinPlaceholder')}
            rows={5}
          />
          {showOriginalHint && (
            <span className="text-xs text-muted-foreground">(初始值: {originalValue})</span>
          )}
        </div>
        {sidelineAsyncCheck && (
          <SidelineAsyncWarning check={sidelineAsyncCheck} t={t} />
        )}
      </div>
    );
  }

  const showOriginalHint = lockedStructure && originalValue !== undefined && originalValue !== '' && value !== originalValue;

  return (
    <div className="flex flex-col gap-1 p-2 border rounded bg-background">
      <div className="flex flex-wrap items-center gap-2">
      {lockedStructure ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground w-[180px]">
          {fieldDefs[field]?.label || field}
        </span>
      ) : (
        <Select value={field} onValueChange={(v) => {
          if (!v) return;
          const newDef = fieldDefs[v];
          const newOps = newDef?.operators || [];
          const opStillValid = newOps.includes(operator);
          const newIsMap = newDef?.type?.startsWith('map_');
          onChange({
            ...node,
            field: v,
            operator: opStillValid ? operator : (newOps[0] || 'eq'),
            value: newDef?.type === 'boolean' ? (node.value || 'true') : '',
            map_key: newIsMap ? '*' : undefined,
          });
        }}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder={t('selectField')} />
          </SelectTrigger>
          <SelectContent>
            {fieldGroups.map(([groupKey, group]) => (
              <SelectGroup key={groupKey}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.fields.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label} <span className="text-muted-foreground ml-1 text-[10px]">({f.value})</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      )}

      {isMap && (
        <Input
          className="w-[120px] h-8 text-xs"
          value={node.map_key || ''}
          onChange={(e) => onChange({ ...node, map_key: e.target.value || undefined })}
          placeholder="* (any)"
        />
      )}

      {lockedStructure ? (
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground w-[130px]">
          {t(`operators.${OPERATOR_LABEL_KEYS[operator] || operator}`)}
        </span>
      ) : (
        <Select value={operator} onValueChange={(v) => { if (v) onChange({ ...node, operator: v }); }}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder={t('selectOperator')} />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op} value={op}>{t(`operators.${OPERATOR_LABEL_KEYS[op] || op}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isBool && (
        <Select value={value || 'true'} onValueChange={(v) => { if (v) onChange({ ...node, value: v }); }}>
          <SelectTrigger className="w-[80px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{t('booleanTrue')}</SelectItem>
            <SelectItem value="false">{t('booleanFalse')}</SelectItem>
          </SelectContent>
        </Select>
      )}

      {showValue && !isBool && (
        <div className="flex flex-col gap-1 flex-1 min-w-[100px]">
          <Input
            className="h-8 text-xs"
            value={value}
            onChange={(e) => onChange({ ...node, value: e.target.value })}
            placeholder={t('valuePlaceholder')}
          />
          {showOriginalHint && (
            <span className="text-xs text-muted-foreground">(初始值: {originalValue})</span>
          )}
        </div>
      )}

      {!lockedStructure && onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
      </div>
      {sidelineAsyncCheck && (
        <SidelineAsyncWarning check={sidelineAsyncCheck} t={t} />
      )}
    </div>
  );
}

interface SidelineAsyncWarningProps {
  check: SidelineCheckMeta;
  t: ReturnType<typeof useTranslations>;
}

function SidelineAsyncWarning({ check, t }: SidelineAsyncWarningProps) {
  const isOptIn = check.control_mode === 'opt_in_any';
  const msgKey = isOptIn ? 'sidelineAsyncWarningOptIn' : 'sidelineAsyncWarningOptOut';
  return (
    <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 mt-1">
      {t(msgKey, { label: check.label, tag: check.control_tag })}
    </div>
  );
}
