'use client';

// ToolObservationView -- 研判报告「来源详情」里工具观察内容的结构化呈现。
// 来源 content 是一段 JSON 字符串：{tool, query, observation}。原始 JSON 对
// 管理员不可读（ analyze_url 一个工具就有 20+ 个字段），这里把已知字段翻译
// 成分区结构：评分 → 命中特征 → 结构检查 → 受信域名 → URL 结构。
//
// 原则：
// - 只重组展示，不改语义；未知字段在通用 KV 区按原 key 展示，绝不丢信息。
// - 非 JSON / 形状不符 / 未登记的工具一律由调用方回退到原文渲染。
// - 原始 JSON 仍保留在下方（调用方负责），审计与排查可用。

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ToolObservation {
  tool: string;
  observation: Record<string, unknown>;
}

export function parseToolObservation(content: string): ToolObservation | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const tool = parsed.tool;
    const observation = parsed.observation;
    if (typeof tool !== 'string' || !tool.trim()) return null;
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return null;
    return { tool, observation: observation as Record<string, unknown> };
  } catch {
    return null;
  }
}

const isEmptyValue = (value: unknown): boolean =>
  value == null || value === ''
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);

function ValueText({ value }: { value: unknown }) {
  const t = useTranslations('assessment.toolObs');
  if (typeof value === 'boolean') return <span>{value ? t('yes') : t('no')}</span>;
  if (typeof value === 'number') return <span>{String(value)}</span>;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {(value as string[]).map((item, index) => (
          <Badge key={`${item}-${index}`} variant="outline" className="h-auto whitespace-normal break-all text-xs">{item}</Badge>
        ))}
      </span>
    );
  }
  if (typeof value === 'object') return <span className="break-all font-mono text-xs">{JSON.stringify(value)}</span>;
  return <span className="break-all">{String(value)}</span>;
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  const t = useTranslations('assessment.toolObs');
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{isEmptyValue(value) ? <span className="text-muted-foreground">{t('none')}</span> : <ValueText value={value} />}</span>
    </div>
  );
}

function Section({ title, testid, children }: { title: string; testid: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5" data-testid={testid}>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// analyze_url 的布尔结构检查项：为 true 表示 URL 结构上存在可疑特征。
const CHECK_KEYS = ['has_base64_like_segment', 'has_hex_like_segment', 'has_long_subdomain_label'] as const;
// analyze_url 的命中特征字段。
const FEATURE_KEYS = [
  'suspicious_indicators', 'indicator_weights', 'url_risk_summary',
  'matched_suspicious_host_keywords', 'matched_suspicious_path_keywords',
  'matched_suspicious_path_signals', 'matched_suspicious_suffixes',
  'matched_redirect_params', 'matched_sensitive_query_params',
] as const;
const STRUCTURE_KEYS = ['normalized_url', 'scheme', 'host', 'host_depth', 'port', 'path', 'query', 'fragment', 'input_url'] as const;
const TRUSTED_KEYS = ['trusted_domain_allowlist_loaded', 'trusted_domain_match', 'matched_trusted_domain', 'trusted_domain_match_type', 'trusted_domain_source', 'trusted_domain_allowlist_error'] as const;

function AnalyzeUrlView({ observation, outcome }: { observation: Record<string, unknown>; outcome?: string }) {
  const t = useTranslations('assessment.toolObs');
  const fieldLabel = (key: string) => (t.has(`fields.${key}`) ? t(`fields.${key}`) : key);

  const score = typeof observation.url_risk_score === 'number' ? observation.url_risk_score : null;
  const level = typeof observation.url_risk_level === 'string' && observation.url_risk_level ? observation.url_risk_level : null;
  const featureEntries = FEATURE_KEYS.map((key) => [key, observation[key]] as const).filter(([, value]) => !isEmptyValue(value));
  const checks = CHECK_KEYS.map((key) => [key, (outcome === 'observed' || outcome === 'partial') && typeof observation[key] === 'boolean' ? observation[key] : null] as const);
  const trustedEntries = TRUSTED_KEYS.map((key) => [key, observation[key]] as const).filter(([, value]) => !isEmptyValue(value));

  return (
    <div className="space-y-3" data-testid="assessment-source-structured">
      {(score != null || level) && (
        <div className="flex items-baseline gap-2" data-testid="assessment-obs-score">
          {score != null ? <span className="text-lg font-semibold">{t('scoreValue', { score })}</span> : null}
          {level ? <Badge variant="outline">{level}</Badge> : null}
        </div>
      )}
      <Section title={t('features')} testid="assessment-obs-features">
        {featureEntries.length ? featureEntries.map(([key, value]) => <FieldRow key={key} label={fieldLabel(key)} value={value} />) : (
          <p className="text-xs text-muted-foreground" data-testid="assessment-obs-no-features">{Array.isArray(observation.suspicious_indicators) && outcome === 'observed' ? t('noFeatures') : t('unknown')}</p>
        )}
      </Section>
      <Section title={t('checks')} testid="assessment-obs-checks">
        <div className="flex flex-wrap gap-1.5">
          {checks.map(([key, hit]) => (
            <Badge key={key} variant="outline" className={cn('h-auto gap-1 whitespace-normal text-xs', hit ? 'border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning' : 'text-muted-foreground')}>
              <span className={cn('size-1.5 rounded-full', hit ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600')} />
              {fieldLabel(key)}：{hit == null ? t('unknown') : hit ? t('yes') : t('no')}
            </Badge>
          ))}
        </div>
      </Section>
      {trustedEntries.length ? (
        <Section title={t('trusted')} testid="assessment-obs-trusted">
          {trustedEntries.map(([key, value]) => <FieldRow key={key} label={fieldLabel(key)} value={value} />)}
        </Section>
      ) : null}
      <Section title={t('structure')} testid="assessment-obs-structure">
        {STRUCTURE_KEYS.map((key) => <FieldRow key={key} label={fieldLabel(key)} value={observation[key]} />)}
      </Section>
    </div>
  );
}

function GenericObservationView({ observation }: { observation: Record<string, unknown> }) {
  const t = useTranslations('assessment.toolObs');
  const entries = Object.entries(observation);
  if (!entries.length) return null;
  return (
    <div className="space-y-1.5" data-testid="assessment-source-structured">
      <p className="text-xs font-medium text-muted-foreground">{t('observation')}</p>
      <div className="space-y-1">
        {entries.map(([key, value]) => <FieldRow key={key} label={key} value={value} />)}
      </div>
    </div>
  );
}

export function ToolObservationView({ observation, outcome }: { observation: ToolObservation; outcome?: string }) {
  if (observation.tool === 'analyze_url') return <AnalyzeUrlView observation={observation.observation} outcome={outcome} />;
  return <GenericObservationView observation={observation.observation} />;
}
