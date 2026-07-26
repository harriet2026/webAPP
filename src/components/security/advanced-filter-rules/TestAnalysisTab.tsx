'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Download,
  History,
  Info,
  Loader2,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useApiRequest, ApiError } from '@/lib/api/client';
import {
  testRuleWithEml,
  getEffectStats,
  getHitTrend,
  listRuleVersions,
  rollbackRule,
  type EmlTestResult,
  type RuleRange,
} from '@/lib/api/advanced-rules';
import { serializeGroups } from './serde';
import type { RuleForm } from './rule-form';
import { CONDITIONS } from './catalogue';
import { computeEffectiveness } from './effectiveness';
import { buildHistoryCsv, downloadCsv, openPrintView, type HistoryRow } from './export-history';
import { HitTrendChart } from './HitTrendChart';
import type { Rule } from '@/types/unified-rules';

// TestAnalysisTab.tsx — layer-5-test-analysis.html: 规则测试 (EML 上传 +
// 逐条件评估) / 效果分析 (4 指标卡 + 有效性评分 + 命中趋势图) / 历史版本
// (回滚 + CSV/PDF 导出). rule===null (新建态) gates the analysis/history
// sections to a "保存后可用" placeholder — they need a persisted rule.id
// for GetUnifiedRuleEffectStats/HitTrend/Versions (spec: "新建时整区占位").
//
// health 分简化说明（见 effectiveness.ts 顶部注释 + 任务报告）：本 Tab 的
// props 里没有 fieldDefs（接口固定为 { form, rule }），所以"无置灰字段"这
// 一支无法通过 computeCatalogueItem 判断，固定传 hasGreyedField=false —
// 只会让 health 更宽松，不会误判本该健康的规则为不健康；"无空值条件"这一
// 支仍完整计算。

const MAX_EML_BYTES = 10 * 1024 * 1024;

type FileErrorKey = 'invalidType' | 'tooLarge';

function validateEmlFile(file: File): FileErrorKey | null {
  if (!file.name.toLowerCase().endsWith('.eml')) return 'invalidType';
  if (file.size > MAX_EML_BYTES) return 'tooLarge';
  return null;
}

interface Props {
  form: RuleForm;
  rule: Rule | null;
}

export function TestAnalysisTab({ form, rule }: Props) {
  const t = useTranslations('advancedRulesFeature');
  const { apiRequest } = useApiRequest();
  const queryClient = useQueryClient();

  // ── 规则测试 ──────────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<FileErrorKey | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [testResult, setTestResult] = useState<EmlTestResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const conditionTree = useMemo(() => serializeGroups(form.conditions), [form.conditions]);

  function fieldLabel(field: string): string {
    const def = CONDITIONS.find((d) => d.field === field);
    return def ? t(`v3Conditions.conditions.${def.key}` as never) : field;
  }

  function handleFiles(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    const err = validateEmlFile(f);
    if (err) {
      setFile(null);
      setFileError(err);
      return;
    }
    setFileError(null);
    setFile(f);
    setTestResult(null);
  }

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!file || !conditionTree) throw new Error('precondition not met');
      return testRuleWithEml(file, conditionTree);
    },
    onSuccess: (result) => setTestResult(result),
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : t('testAnalysis.testError'));
    },
  });

  // ── 效果分析 ──────────────────────────────────────────────────────────
  const [range, setRange] = useState<RuleRange>('7d');
  const ruleId = rule?.id;

  const effectStatsQuery = useQuery({
    queryKey: ['advanced-rules', ruleId, 'effect-stats', range],
    queryFn: () => getEffectStats(ruleId!, range, apiRequest),
    enabled: !!ruleId,
  });

  const hitTrendQuery = useQuery({
    queryKey: ['advanced-rules', ruleId, 'hit-trend', range],
    queryFn: () => getHitTrend(ruleId!, range, apiRequest),
    enabled: !!ruleId,
  });

  const leaves = [...form.conditions.any, ...form.conditions.all];
  const hasEmptyValueCondition = leaves.some((leaf) => {
    const def = CONDITIONS.find((d) => d.key === leaf.conditionKey);
    if (def?.panel === 'number') return false;
    return !leaf.value || leaf.value.trim() === '';
  });

  const effectStats = effectStatsQuery.data;
  const effectiveness = computeEffectiveness({
    hits: effectStats?.hits ?? 0,
    fpRate: effectStats?.fp_rate ?? null,
    enabled: form.enabled,
    hasEmptyValueCondition,
    hasGreyedField: false,
  });

  function handleRefresh() {
    effectStatsQuery.refetch();
    hitTrendQuery.refetch();
  }

  // ── 历史版本 ──────────────────────────────────────────────────────────
  const versionsQuery = useQuery({
    queryKey: ['advanced-rules', ruleId, 'versions'],
    queryFn: () => listRuleVersions(ruleId!, apiRequest),
    enabled: !!ruleId,
  });
  const versions = versionsQuery.data?.items ?? [];

  const rollbackMutation = useMutation({
    mutationFn: (versionNo: number) => rollbackRule(ruleId!, versionNo, apiRequest),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advanced-rules', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['unified-rules', 'advanced_rules'] });
      toast.success(t('testAnalysis.rollbackSuccess'));
    },
    onError: () => toast.error(t('testAnalysis.rollbackError')),
  });

  function mapChangeSummary(raw: string): string {
    const rollbackMatch = /^rollback:v(\d+)$/.exec(raw);
    if (rollbackMatch) return t('testAnalysis.changeSummary.rollback', { version: rollbackMatch[1] });
    if (!raw) return t('testAnalysis.changeSummary.created');
    const segMap: Record<string, string> = {
      created: t('testAnalysis.changeSummary.created'),
      basic: t('testAnalysis.changeSummary.basic'),
      conditions: t('testAnalysis.changeSummary.conditions'),
      disposition: t('testAnalysis.changeSummary.disposition'),
    };
    return raw
      .split(',')
      .map((seg) => segMap[seg] ?? seg)
      .join(t('testAnalysis.changeSummary.separator'));
  }

  function historyRows(): HistoryRow[] {
    return versions.map((v) => ({
      versionNo: v.version_no,
      changedAt: new Date(v.created_at).toLocaleString(),
      changedBy: v.changed_by,
      changeSummary: mapChangeSummary(v.change_summary),
    }));
  }

  const csvLabels = {
    version: t('testAnalysis.colVersion'),
    changedAt: t('testAnalysis.colChangedAt'),
    changedBy: t('testAnalysis.colChangedBy'),
    changeSummary: t('testAnalysis.colChangeSummary'),
  };

  function handleExportCsv() {
    const rows = historyRows();
    if (rows.length === 0) return;
    downloadCsv(buildHistoryCsv(rows, csvLabels), `${rule?.name ?? 'rule'}-history.csv`);
  }

  function handleExportPdf() {
    const rows = historyRows();
    if (rows.length === 0) return;
    openPrintView(rows, { ...csvLabels, title: t('testAnalysis.printTitle', { name: rule?.name ?? '' }) });
  }

  const fpRateDisplay = effectStats?.fp_rate == null ? '—' : `${(effectStats.fp_rate * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6" data-testid="test-analysis-tab">
      {/* ── 规则测试 ── */}
      <section className="space-y-3" data-testid="test-eml-section">
        <h3 className="text-sm font-semibold">{t('testAnalysis.testSectionTitle')}</h3>

        <div
          className={cn(
            'rounded-lg border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors',
            dragOver && 'border-primary bg-primary/5',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          data-testid="eml-dropzone"
        >
          <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p>{t('testAnalysis.dropHint')}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => fileInputRef.current?.click()}
            data-testid="pick-eml-file-button"
          >
            {t('testAnalysis.pickFileButton')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".eml"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            data-testid="eml-file-input"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('testAnalysis.emlHint')}</p>
          {file && (
            <p className="mt-2 text-xs font-medium text-foreground" data-testid="eml-selected-file">
              {file.name}
            </p>
          )}
          {fileError && (
            <p className="mt-1 text-xs text-destructive" data-testid="eml-file-error">
              {t(`testAnalysis.fileError.${fileError}`)}
            </p>
          )}
        </div>

        <Button
          type="button"
          onClick={() => testMutation.mutate()}
          disabled={!file || !conditionTree || testMutation.isPending}
          data-testid="run-eml-test-button"
        >
          {testMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {t('testAnalysis.runTestButton')}
        </Button>
        {!conditionTree && (
          <p className="text-xs text-muted-foreground" data-testid="no-conditions-hint">
            {t('testAnalysis.noConditionsHint')}
          </p>
        )}

        {testResult && (
          <div className="space-y-3 rounded-lg border p-4" data-testid="eml-test-result">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('testAnalysis.verdictLabel')}</span>
              <Badge
                variant={testResult.matched ? 'default' : 'secondary'}
                className={testResult.matched ? 'bg-success text-white' : undefined}
                data-testid="verdict-badge"
              >
                {testResult.matched ? t('testAnalysis.verdictMatched') : t('testAnalysis.verdictNotMatched')}
              </Badge>
            </div>

            {testResult.evaluated_conditions.length > 0 && (
              <Table data-testid="evaluated-conditions-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('testAnalysis.colField')}</TableHead>
                    <TableHead>{t('testAnalysis.colOperator')}</TableHead>
                    <TableHead>{t('testAnalysis.colValue')}</TableHead>
                    <TableHead>{t('testAnalysis.colResult')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testResult.evaluated_conditions.map((c, i) => (
                    <TableRow key={`${c.field}-${i}`}>
                      <TableCell>{fieldLabel(c.field)}</TableCell>
                      <TableCell>{c.operator}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={c.value}>
                        {c.value}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={c.result ? 'default' : 'secondary'}
                          className={c.result ? 'bg-success text-white' : undefined}
                        >
                          {c.result ? t('testAnalysis.resultTrue') : t('testAnalysis.resultFalse')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {testResult.unavailable_fields.length > 0 && (
              <div
                className="rounded-md border border-warning/40 bg-warning-soft p-3 text-xs text-amber-800 dark:text-warning"
                data-testid="unavailable-fields-banner"
              >
                <div className="mb-1 flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t('testAnalysis.unavailableFieldsTitle')}
                </div>
                <p>{testResult.unavailable_fields.map((f) => fieldLabel(f)).join(t('testAnalysis.listSeparator'))}</p>
                <p className="mt-1">{t('testAnalysis.unavailableFieldsNote')}</p>
              </div>
            )}

            {Object.keys(testResult.derived).length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs" data-testid="derived-summary">
                <div className="mb-1 font-medium text-muted-foreground">{t('testAnalysis.derivedTitle')}</div>
                <dl className="space-y-1">
                  {Object.entries(testResult.derived).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="shrink-0 font-mono text-[11px] text-muted-foreground">{fieldLabel(k)}</dt>
                      <dd className="text-muted-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}
      </section>

      <Separator />

      {/* ── 效果分析 ── */}
      <section className="space-y-3" data-testid="effect-analysis-section">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('testAnalysis.analysisSectionTitle')}</h3>
          {rule && (
            <div className="flex items-center gap-2">
              <Select value={range} onValueChange={(v) => v && setRange(v as RuleRange)}>
                <SelectTrigger className="h-8 w-36" data-testid="range-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">{t('testAnalysis.range24h')}</SelectItem>
                  <SelectItem value="7d">{t('testAnalysis.range7d')}</SelectItem>
                  <SelectItem value="30d">{t('testAnalysis.range30d')}</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={handleRefresh} data-testid="refresh-analysis-button">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t('testAnalysis.refreshButton')}
              </Button>
            </div>
          )}
        </div>

        {!rule ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="analysis-placeholder">
            {t('testAnalysis.savedAfterHint')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <MetricCard tone="primary" value={effectStats?.hits ?? '—'} label={t('testAnalysis.hitsLabel')} />
              <MetricCard tone="success" value={effectStats?.processed ?? '—'} label={t('testAnalysis.processedLabel')} />
              <MetricCard
                tone="warning"
                value={fpRateDisplay}
                label={t('testAnalysis.fpRateLabel')}
                tooltip={effectStats?.fp_rate == null ? t('testAnalysis.fpRateNoSignalTooltip') : undefined}
              />
              <MetricCard
                tone="review"
                value={`${effectiveness.score}${t('testAnalysis.scoreUnit')}`}
                label={t('testAnalysis.scoreLabel')}
                tooltip={
                  <div className="space-y-0.5">
                    <p>{t('testAnalysis.scoreTooltip.activity', { value: Math.round(effectiveness.activity) })}</p>
                    <p>{t('testAnalysis.scoreTooltip.accuracy', { value: Math.round(effectiveness.accuracy) })}</p>
                    <p>{t('testAnalysis.scoreTooltip.health', { value: effectiveness.health })}</p>
                  </div>
                }
              />
            </div>
            <HitTrendChart points={hitTrendQuery.data?.points ?? []} range={range} />
          </>
        )}
      </section>

      <Separator />

      {/* ── 历史版本 ── */}
      <section className="space-y-3" data-testid="version-history-section">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('testAnalysis.historySectionTitle')}</h3>
          {rule && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                disabled={versions.length === 0}
                title={t('testAnalysis.exportPdfTooltip')}
                data-testid="export-pdf-button"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t('testAnalysis.exportPdfButton')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={versions.length === 0}
                data-testid="export-csv-button"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t('testAnalysis.exportCsvButton')}
              </Button>
            </div>
          )}
        </div>

        {!rule ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="history-placeholder">
            {t('testAnalysis.savedAfterHint')}
          </div>
        ) : (
          <Table data-testid="version-history-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('testAnalysis.colVersion')}</TableHead>
                <TableHead>{t('testAnalysis.colChangedAt')}</TableHead>
                <TableHead>{t('testAnalysis.colChangedBy')}</TableHead>
                <TableHead>{t('testAnalysis.colChangeSummary')}</TableHead>
                <TableHead className="text-right">{t('testAnalysis.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>v{v.version_no}</TableCell>
                  <TableCell>{new Date(v.created_at).toLocaleString()}</TableCell>
                  <TableCell>{v.changed_by}</TableCell>
                  <TableCell>{mapChangeSummary(v.change_summary)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => rollbackMutation.mutate(v.version_no)}
                      disabled={rollbackMutation.isPending}
                      data-testid={`rollback-button-v${v.version_no}`}
                    >
                      <History className="mr-1.5 h-3.5 w-3.5" />
                      {t('testAnalysis.rollbackButton')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {versions.length === 0 && !versionsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('testAnalysis.noVersionsHint')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

// ─── 指标卡 ──────────────────────────────────────────────────────────────

const METRIC_TONE_CLASSES: Record<'primary' | 'success' | 'warning' | 'review', string> = {
  primary: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  review: 'border-action-review/30 bg-action-review/10 text-action-review',
};

function MetricCard({
  tone,
  value,
  label,
  tooltip,
}: {
  tone: 'primary' | 'success' | 'warning' | 'review';
  value: React.ReactNode;
  label: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-lg border p-3 text-center', METRIC_TONE_CLASSES[tone])} data-testid={`metric-card-${tone}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <span>{label}</span>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<Info className="h-3 w-3 cursor-help" />} />
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
