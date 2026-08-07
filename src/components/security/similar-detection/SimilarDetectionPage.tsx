'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type {
  SimilarDetectionDirection,
  SimilarDetectionMode,
  SimilarDetectionType,
  SimilarDetectionConfig,
  SimilarDetectionDirectionConfig,
  SubjectNormalization,
} from './types';
import {
  DIRECTIONS,
  defaultConfig,
  WINDOW_MIN,
  WINDOW_MAX,
  SIMILARITY_MIN,
  SIMILARITY_MAX,
  SIMILARITY_STEP,
  MIN_COUNT_MIN,
  MIN_COUNT_MAX,
} from './defaults';
import { getSimilarDetection, putSimilarDetection } from '@/lib/api/similar-detection';
import { useApiRequest, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertTriangle, Info, Mail, Send, Building2 } from 'lucide-react';
import { DirectionCard } from './DirectionCard';
import { AggregateCard } from './AggregateCard';
import { ModuleMasterSwitch } from '@/components/security/ModuleMasterSwitch';
import { useApiErrorMessage } from '@/lib/api/use-api-error-message';

// 方向短名 i18n key（复选行用）
const DIR_LABEL_KEY: Record<SimilarDetectionDirection, string> = {
  receive: 'directionReceive',
  send: 'directionSend',
  internal: 'directionInternal',
};

// 方向全名 i18n key（卡片头部/观察提示条用）
const DIR_FULL_LABEL_KEY: Record<SimilarDetectionDirection, string> = {
  receive: 'directionReceiveFull',
  send: 'directionSendFull',
  internal: 'directionInternalFull',
};

// 方向小图标（复选行用，逐一对应 demo getDirectionIcon 的 h-3 w-3 版本）
const DIR_ICON: Record<SimilarDetectionDirection, ReactNode> = {
  receive: <Mail className="h-3 w-3" />,
  send: <Send className="h-3 w-3" />,
  internal: <Building2 className="h-3 w-3" />,
};

// 标准化开关的 i18n key ↔ data-testid 后缀（保持与 label key 一致，data-testid similar-detection-norm-<key>）
const NORMALIZATION_FIELDS: ReadonlyArray<{ field: keyof SubjectNormalization; labelKey: string }> = [
  { field: 'ignore_case', labelKey: 'ignoreCase' },
  { field: 'ignore_re_prefix', labelKey: 'ignoreRePrefix' },
  { field: 'ignore_numbers', labelKey: 'ignoreNumbers' },
  { field: 'similar_subject', labelKey: 'similarSubject' },
];

export function SimilarDetectionPage({ embedded, onDirtyChange }: { embedded?: boolean; onDirtyChange?: (dirty: boolean) => void } = {}) {
  const t = useTranslations('similarDetection');
  const apiErrorMessage = useApiErrorMessage();
  const tc = useTranslations('common');
  const { apiRequest } = useApiRequest();

  const [config, setConfig] = useState<SimilarDetectionConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState<SimilarDetectionType>('similar_email');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSimilarDetection(apiRequest)
      .then((cfg) => {
        if (!cancelled) setConfig(cfg);
      })
      .catch((err) => {
        if (!cancelled) toast.error(apiErrorMessage(err, String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiRequest]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const handleModeChange = useCallback((mode: SimilarDetectionMode) => {
    setConfig((prev) => ({ ...prev, mode }));
    setDirty(true);
  }, []);

  const toggleDirection = useCallback((dir: SimilarDetectionDirection, checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      enabled_directions: checked
        ? [...prev.enabled_directions, dir]
        : prev.enabled_directions.filter((d) => d !== dir),
    }));
    setDirty(true);
  }, []);

  const updateAggregate = useCallback((patch: Partial<SimilarDetectionDirectionConfig>) => {
    setConfig((prev) => ({ ...prev, aggregate: { ...prev.aggregate, ...patch } }));
    setDirty(true);
  }, []);

  const updateDirection = useCallback((type: SimilarDetectionType, dir: SimilarDetectionDirection, patch: Partial<SimilarDetectionDirectionConfig>) => {
    setConfig((prev) => ({
      ...prev,
      [type]: { ...prev[type], [dir]: { ...prev[type][dir], ...patch } },
    }));
    setDirty(true);
  }, []);

  const updateNormalization = useCallback((patch: Partial<SubjectNormalization>) => {
    setConfig((prev) => ({ ...prev, subject_normalization: { ...prev.subject_normalization, ...patch } }));
    setDirty(true);
  }, []);

  // 同步：把当前 Tab 组内 source 方向的整份配置（含 observe_mode 与 tag_*）复制到其他已启用方向，无弹窗
  const handleSync = useCallback((type: SimilarDetectionType, sourceDir: SimilarDetectionDirection) => {
    setConfig((prev) => {
      const group = prev[type];
      const source = group[sourceDir];
      const nextGroup = { ...group };
      prev.enabled_directions.forEach((dir) => {
        if (dir !== sourceDir) nextGroup[dir] = { ...source };
      });
      return { ...prev, [type]: nextGroup };
    });
    setDirty(true);
  }, []);

  // 单卡校验：window/similarity(可选)/min_count/标记投递内容
  const validateCard = useCallback((c: SimilarDetectionDirectionConfig, checkSimilarity: boolean): string | null => {
    if (c.window_minutes < WINDOW_MIN || c.window_minutes > WINDOW_MAX) return t('errorWindowRange');
    if (checkSimilarity && (c.similarity_pct < SIMILARITY_MIN || c.similarity_pct > SIMILARITY_MAX || c.similarity_pct % SIMILARITY_STEP !== 0)) {
      return t('tooltipThreshold');
    }
    if (c.min_count < MIN_COUNT_MIN || c.min_count > MIN_COUNT_MAX) return t('errorMinCountRange');
    if (c.action === 'mark-delivery' && !c.observe_mode) {
      if (!c.tag_subject_enabled && !c.tag_header_enabled && !c.tag_body_enabled) return t('errorTagRequired');
      if (c.tag_subject_enabled && !c.tag_subject_content?.trim()) return t('errorTagFieldRequired');
      if (c.tag_header_enabled && (!c.tag_header_name?.trim() || !c.tag_header_value?.trim())) return t('errorTagFieldRequired');
      if (c.tag_body_enabled && !c.tag_body_content?.trim()) return t('errorTagFieldRequired');
    }
    return null;
  }, [t]);

  const validate = useCallback((): string | null => {
    if (config.enabled_directions.length === 0) {
      return t('atLeastOneDirection');
    }
    // aggregate 恒校验（两个检测类型 Tab 共享同一份聚合配置）
    let err = validateCard(config.aggregate, true);
    if (err) return err;
    for (const dir of config.enabled_directions) {
      err = validateCard(config.similar_email[dir], true);
      if (err) return err;
      // same_subject 卡片不展示相似度滑块，不校验其 similarity_pct
      err = validateCard(config.same_subject[dir], false);
      if (err) return err;
    }
    return null;
  }, [config, validateCard, t]);

  const handleSave = useCallback(async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const req = {
        mode: config.mode,
        enabled_directions: config.enabled_directions,
        aggregate: config.aggregate,
        similar_email: config.similar_email,
        same_subject: config.same_subject,
        subject_normalization: config.subject_normalization,
        expected_version: config.version,
      };
      const updated = await putSimilarDetection(req, apiRequest);
      setConfig(updated);
      setDirty(false);
      toast.success(t('title') + ' ✓');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        toast.error(t('errorVersionConflict'));
        try {
          const refreshed = await getSimilarDetection(apiRequest);
          setConfig(refreshed);
          setDirty(false);
        } catch { /* ignore */ }
      } else {
        toast.error(apiErrorMessage(e, String(e)));
      }
    } finally {
      setSaving(false);
    }
  }, [config, apiRequest, t, validate]);

  const handleCancel = useCallback(() => {
    setLoading(true);
    getSimilarDetection(apiRequest)
      .then((cfg) => {
        setConfig(cfg);
        setDirty(false);
      })
      .catch((err) => toast.error(apiErrorMessage(err, String(err))))
      .finally(() => setLoading(false));
  }, [apiRequest]);

  // 观察集合：aggregate 模式下只看 aggregate.observe_mode；separate 模式下看当前 Tab 组内各已启用方向
  const currentGroup = config[activeTab];
  const observingDirections = useMemo(() => {
    if (config.mode === 'aggregate') {
      return config.aggregate.observe_mode ? [t('modeAggregate')] : [];
    }
    return config.enabled_directions
      .filter((dir) => currentGroup[dir].observe_mode)
      .map((dir) => t(DIR_FULL_LABEL_KEY[dir]));
  }, [config.mode, config.aggregate.observe_mode, config.enabled_directions, currentGroup, t]);

  // 方向配置块 + 卡片区（similar_email/same_subject 两个 Tab 共用）
  const renderDirectionSection = (type: SimilarDetectionType) => {
    const group = config[type];
    return (
      <>
        <div className="p-4 bg-muted/50 rounded-lg border">
          <h3 className="font-medium mb-3">{t('directionConfig')}</h3>
          <RadioGroup value={config.mode} onValueChange={(v) => handleModeChange(v as SimilarDetectionMode)}>
            <div className="flex items-center space-x-2 mb-2">
              <RadioGroupItem value="aggregate" id={`sd-aggregate-${type}`} data-testid="similar-detection-mode-aggregate" />
              <Label htmlFor={`sd-aggregate-${type}`}>{t('modeAggregate')}</Label>
            </div>
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="separate" id={`sd-separate-${type}`} className="mt-1" data-testid="similar-detection-mode-separate" />
              <div className="space-y-2">
                <Label htmlFor={`sd-separate-${type}`}>{t('modeSeparate')}</Label>
                {config.mode === 'separate' && (
                  <div className="flex flex-wrap gap-4 ml-2">
                    {DIRECTIONS.map((dir) => (
                      <div key={dir} className="flex items-center space-x-2">
                        <Checkbox
                          id={`sd-dir-${dir}-${type}`}
                          data-testid={`similar-detection-dir-${dir}`}
                          checked={config.enabled_directions.includes(dir)}
                          onCheckedChange={() => toggleDirection(dir, !config.enabled_directions.includes(dir))}
                        />
                        <Label htmlFor={`sd-dir-${dir}-${type}`} className="text-sm flex items-center gap-1">
                          {DIR_ICON[dir]} {t(DIR_LABEL_KEY[dir])}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>
        </div>

        {config.mode === 'separate' ? (
          config.enabled_directions.length === 0 ? (
            <div
              data-testid="similar-detection-empty-hint"
              className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
            >
              {t('atLeastOneDirection')}
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[1366px]:grid-cols-2 gap-4">
              {DIRECTIONS.filter((dir) => config.enabled_directions.includes(dir)).map((dir) => (
                <DirectionCard
                  key={dir}
                  direction={dir}
                  detectionType={type}
                  value={group[dir]}
                  onChange={(patch) => updateDirection(type, dir, patch)}
                  onSync={() => handleSync(type, dir)}
                />
              ))}
            </div>
          )
        ) : (
          <AggregateCard detectionType={type} value={config.aggregate} onChange={updateAggregate} />
        )}
      </>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const content = (
    <div className="space-y-4">
      {/* 观察模式全局提示 */}
      {observingDirections.length > 0 && (
        <div
          data-testid="similar-detection-observe-banner"
          className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-amber-700 dark:text-amber-400">{t('observeWarningTitle')}:</span>
                {observingDirections.map((dir, idx) => (
                  <Badge key={idx} variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
                    {dir}
                  </Badge>
                ))}
                <span className="text-amber-600 dark:text-amber-400">{t('observingDirections')}</span>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{t('observeWarningDesc')}</p>
            </div>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SimilarDetectionType)}>
        <TabsList className="mb-4">
          <TabsTrigger value="similar_email" data-testid="similar-detection-tab-similar-email">{t('similarEmailTab')}</TabsTrigger>
          <TabsTrigger value="same_subject" data-testid="similar-detection-tab-same-subject">{t('sameSubjectTab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="similar_email" className="space-y-6">
          {renderDirectionSection('similar_email')}
        </TabsContent>

        <TabsContent value="same_subject" className="space-y-6">
          {renderDirectionSection('same_subject')}

          {/* 主题标准化配置 */}
          <div className="p-4 bg-muted/50 rounded-lg border">
            <h3 className="font-medium mb-4">{t('subjectNormalization')}</h3>
            <div className="flex flex-wrap gap-4">
              {NORMALIZATION_FIELDS.map(({ field, labelKey }) => (
                <div key={field} className="flex items-center space-x-2">
                  <Checkbox
                    id={`sd-norm-${field}`}
                    data-testid={`similar-detection-norm-${labelKey}`}
                    checked={config.subject_normalization[field]}
                    onCheckedChange={(checked) => updateNormalization({ [field]: !!checked })}
                  />
                  <Label htmlFor={`sd-norm-${field}`} className="text-sm">{t(labelKey)}</Label>
                </div>
              ))}
            </div>
          </div>

          {/* 提示信息 */}
          <div className="space-y-2">
            <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
              <p className="text-sm text-cyan-700 dark:text-cyan-300">
                <Info className="h-4 w-4 inline mr-1" />
                {t('realtimeNote')}
              </p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                <Info className="h-4 w-4 inline mr-1" />
                {t('observeNote')}
              </p>
            </div>
          </div>

        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving} data-testid="similar-detection-cancel">
          {tc('cancel')}
        </Button>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            </span>
          )}
          <Button size="sm" disabled={saving || !dirty} onClick={handleSave} data-testid="similar-detection-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            {tc('save')}
          </Button>
        </div>
      </div>
    </div>
  );

  if (embedded) return <ModuleMasterSwitch page="similar_detection">{content}</ModuleMasterSwitch>;
  return (
    <div className="p-6">
      <ModuleMasterSwitch page="similar_detection">{content}</ModuleMasterSwitch>
    </div>
  );
}
