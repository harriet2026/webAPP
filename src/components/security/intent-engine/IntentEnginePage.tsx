'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type {
  IntentDirection,
  IntentType,
  IntentSingleConfig,
  IntentEngineConfig,
  IntentRiskLevel,
} from '@/types/intent-engine';
import {
  INTENT_TYPES,
  segmentCoverageIssue,
  RISK_LEVEL_OF,
  HIGH_RISK_INTENTS,
  MEDIUM_RISK_INTENTS,
  LOW_RISK_INTENTS,
  DEFAULT_MARK_TEXT,
} from '@/types/intent-engine';
import { getIntentEngineConfig, putIntentEngineConfig } from '@/lib/api/intent-engine';
import { useApiRequest } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Info, CheckCircle2, Copy, RotateCcw, AlertTriangle } from 'lucide-react';
import { PipelinePanelHeader } from '../PipelinePanelHeader';
import { useModuleMaster } from '../useModuleMaster';
import { RiskLevelPanel } from './RiskLevelPanel';
import { CopyDirectionDialog } from './CopyDirectionDialog';
import { ResetDialog } from './ResetDialog';
import {
  createDefaultIntentEngineConfig,
  createDefaultDirectionConfig,
} from './defaults';
import {
  applyCopyToDirections,
  markDirty,
  anyDirty,
  NO_DIRTY,
  type DirtyDirections,
} from './copy-dirty';

const DIRECTION_KEY_MAP: Record<IntentDirection, string> = {
  receive: 'tabReceive',
  send: 'tabSend',
  internal: 'tabInternal',
};

function intentsOfRisk(level: IntentRiskLevel): IntentType[] {
  if (level === 'high') return HIGH_RISK_INTENTS;
  if (level === 'medium') return MEDIUM_RISK_INTENTS;
  return LOW_RISK_INTENTS;
}


export function IntentEnginePage({
  embedded,
  onDirtyChange,
  onEnabledChange,
}: {
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onEnabledChange?: (enabled: boolean) => void;
} = {}) {
  const t = useTranslations('intentEngine');
  const { apiRequest } = useApiRequest();
  const { enabled: moduleEnabled, loaded: moduleLoaded, saving: moduleSaving, toggle: toggleModule, editable: moduleEditable } = useModuleMaster('intent_engine');

  const [direction, setDirection] = useState<IntentDirection>('receive');
  const [config, setConfig] = useState<IntentEngineConfig>(createDefaultIntentEngineConfig);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 按方向追踪未保存（html_spec 层级5 v2 / 差异 D-07）：模块级单布尔会把
  // 「复制到其他方向」的提示挂到当前方向上，令人误以为当前方向被改（GT-11753）。
  const [dirtyDirections, setDirtyDirections] = useState<DirtyDirections>(NO_DIRTY);
  const dirty = anyDirty(dirtyDirections);
  // 当前方向的编辑只标脏当前方向。
  const setDirty = useCallback((v: boolean) => {
    setDirtyDirections((prev) => (v ? markDirty(prev, [direction]) : NO_DIRTY));
  }, [direction]);
  // 「已复制到 X / Y 方向，请保存后生效」的点名反馈；保存后清除（层级5 v2）。
  const [copyFeedback, setCopyFeedback] = useState<IntentDirection[]>([]);
  const [expandedIntent, setExpandedIntent] = useState<IntentType | null>(null);
  const [showCopy, setShowCopy] = useState(false);
  const [showReset, setShowReset] = useState(false);

  // 加载（D-12：抽成可复用函数供“重试”按钮再次调用）
  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    getIntentEngineConfig(apiRequest)
      .then((cfg) => {
        setConfig(cfg);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiRequest]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // 总开关已迁移到注册表（config_overrides system/intent_engine/enabled，见 useModuleMaster）。
  // config.engine_enabled 的三方向保留为后端 AND 层（默认全开、决策C 三值相等），本页不再直接切换它。
  // 仅在持久化状态加载完成后上报，避免把 useModuleMaster 的乐观默认值 true 先推给
  // 左导航、导致「未启用」模块先亮起再闪回的问题（GT-12731）。
  useEffect(() => {
    if (moduleLoaded) onEnabledChange?.(moduleEnabled);
  }, [moduleLoaded, moduleEnabled, onEnabledChange]);

  const dirConfig = config.directions[direction];

  const updateIntent = useCallback((it: IntentType, next: IntentSingleConfig) => {
    setConfig((prev) => ({
      ...prev,
      directions: {
        ...prev.directions,
        [direction]: {
          ...prev.directions[direction],
          [it]: next,
        },
      },
    }));
    setDirty(true);
  }, [direction, setDirty]);

  const handleApplySameRisk = useCallback(() => {
    if (!expandedIntent) return;
    const risk = RISK_LEVEL_OF[expandedIntent];
    const siblings = intentsOfRisk(risk);
    const srcCfg = dirConfig[expandedIntent];
    setConfig((prev) => ({
      ...prev,
      directions: {
        ...prev.directions,
        [direction]: {
          ...prev.directions[direction],
          // 深拷贝（而非浅拷贝 { ...srcCfg }）：避免同风险等级的多个意图共享同一份
          // threshold_segments/mark_config 引用，导致其中一个意图的后续编辑串改到其他意图。
          ...Object.fromEntries(siblings.map((s) => [s, structuredClone(srcCfg)])),
        },
      },
    }));
    setDirty(true);
    toast.success(t('applySameRiskDone'));
  }, [expandedIntent, direction, dirConfig, t, setDirty]);

  const handleCopyToDirections = useCallback((targets: IntentDirection[]) => {
    // html_spec 层级5（v2 / 2026-07-17，差异 D-07）：
    //   - 只对配置**实际发生变化**的目标方向标脏（深比较），
    //   - 目标本就与源一致时给「无需修改」提示且不标脏（GT-11753 的误报），
    //   - 有变化时点名反馈「已复制到 X / Y 方向，请保存后生效」并使保存可用（GT-12208）。
    // 复制/比较/降级的纯逻辑在 ./copy-dirty，便于单测覆盖。
    let changed: IntentDirection[] = [];
    setConfig((prev) => {
      const res = applyCopyToDirections(prev.directions, direction, targets);
      changed = res.changed;
      if (res.changed.length === 0) return prev;
      return { ...prev, directions: res.directions };
    });

    if (changed.length === 0) {
      toast.info(t('copyNoChange'));
      return;
    }
    setDirtyDirections((prev) => markDirty(prev, changed));
    setCopyFeedback(changed);
    toast.success(t('copyDone', { directions: changed.map((d) => t(DIRECTION_KEY_MAP[d])).join(' / ') }));
  }, [direction, t]);

  const handleReset = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      directions: {
        ...prev.directions,
        [direction]: createDefaultDirectionConfig(direction),
      },
    }));
    setDirty(true);
  }, [direction, setDirty]);

  const handleSave = useCallback(async () => {
    // 保存校验（Q6/D-05，重叠语义为 D-06 裁决）：与后端 validateThresholdCoverage
    // 保持同一范围——后端对所有配置无条件校验分段阈值区间覆盖（不受总开关/单意图
    // enabled 门控），前端也恒校验三方向所有 detection_mode==='threshold' 的意图，
    // 避免「禁用意图带间隙时前端放行、后端 400（用户看到英文原始错误）」的不一致。
    // 报错按问题种类区分：重叠时提示"未覆盖"会把排查方向引反。
    for (const d of ['receive', 'send', 'internal'] as IntentDirection[]) {
      for (const it of INTENT_TYPES) {
        const c = config.directions[d][it];
        if (c.detection_mode !== 'threshold') continue;
        const issue = segmentCoverageIssue(c.threshold_segments || []);
        if (issue === 'overlap') {
          toast.error(t('saveOverlapBlocked'));
          return;
        }
        if (issue === 'gap') {
          toast.error(t('saveGapBlocked'));
          return;
        }
      }
    }
    // D-11：启用的标��但文案为空时回填默认文案，避免落空标记。
    const payload = structuredClone(config);
    for (const d of ['receive', 'send', 'internal'] as IntentDirection[]) {
      for (const it of INTENT_TYPES) {
        const mc = payload.directions[d][it].mark_config;
        for (const m of [mc?.subject_mark, mc?.body_mark]) {
          if (m?.enabled && !m.text.trim()) m.text = DEFAULT_MARK_TEXT[it];
        }
      }
    }
    setSaving(true);
    try {
      await putIntentEngineConfig(payload, apiRequest);
      setConfig(payload);
      // 保存成功后清空所有方向的脏标记与复制反馈（层级5 v2：保存是唯一的清除入口）。
      setDirtyDirections(NO_DIRTY);
      setCopyFeedback([]);
      toast.success(t('saveSuccess'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('saveFail', { error: msg }));
    } finally {
      setSaving(false);
    }
  }, [config, apiRequest, t]);

  const handleDirectionChange = useCallback((val: string) => {
    setDirection(val as IntentDirection);
    setExpandedIntent(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 加载失败（D-12）：显示错误 + 重试按钮，而不是静默落回缺省配置。
  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <span>{t('loadFail', { error: loadError })}</span>
        <Button variant="outline" size="sm" onClick={load} data-testid="ie-load-retry">
          {t('loadRetry')}
        </Button>
      </div>
    );
  }

  const content = (
    <div data-testid="intent-engine-page">
      <PipelinePanelHeader
        title={t('title')}
        enabled={moduleEnabled}
        onToggle={toggleModule}
        disabled={!moduleEditable || moduleSaving}
        enabledLabel={t('statusEnabled')}
        disabledLabel={t('statusDisabled')}
        switchTestId="intent-engine-master-switch"
        titleTestId="intent-engine"
      >
        <div className="space-y-4">
          {/* 总开关关闭 → 整体半透明禁点（保存栏在容器外，html_spec L4-6） */}
          <div
            className={cn('flex-1 space-y-4', !moduleEnabled && 'opacity-50 pointer-events-none')}
            data-testid="intent-engine-body"
          >
            <Tabs value={direction} onValueChange={handleDirectionChange}>
              <TabsList className="grid w-full grid-cols-3">
                {(['receive', 'send', 'internal'] as IntentDirection[]).map((d) => (
                  <TabsTrigger key={d} value={d} className="gap-1.5" data-testid={`intent-engine-tab-${d}`}>
                    {t(DIRECTION_KEY_MAP[d] as 'tabReceive')}
                    {/* 层级5 v2：只有真正被改动的方向打琥珀点，而不是整个模块一个提示。 */}
                    {dirtyDirections[d] && (
                      <span
                        className="size-1.5 rounded-full bg-amber-500"
                        data-testid={`intent-engine-tab-dirty-${d}`}
                        aria-label={t('dirty')}
                      />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* 全局操作栏（html_spec §2.2-5..8：图标 + 重置红字 + 右侧 dirty ⚠） */}
            <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/50 rounded-lg" data-testid="ie-ops-bar">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={!expandedIntent}
                onClick={handleApplySameRisk}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                {t('applySameRisk')}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowCopy(true)}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                {t('copyToDirections')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                onClick={() => setShowReset(true)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {t('reset')}
              </Button>
              {/* 层级5 v2：复制后的点名反馈，优先于泛化的 dirty 提示显示。 */}
              {copyFeedback.length > 0 && (
                <span
                  className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 ml-auto"
                  data-testid="ie-copy-feedback"
                >
                  <Info className="h-3.5 w-3.5" />
                  {t('copyDone', {
                    directions: copyFeedback.map((d) => t(DIRECTION_KEY_MAP[d] as 'tabReceive')).join(' / '),
                  })}
                </span>
              )}
              {dirty && copyFeedback.length === 0 && (
                <span
                  className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 ml-auto"
                  data-testid="ie-dirty-hint"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t('dirty')}
                </span>
              )}
            </div>

            {/* GT-11752: 非接收方向显示对应方向的标记降级提示（demo 为蓝色信息条，用 info token 对齐） */}
            {direction !== 'receive' && (
              <Alert className="border-info/30 bg-info/5 text-info [&>svg]:text-info">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {direction === 'send' ? t('sendMarkUnsupported') : t('internalMarkUnsupported')}
                </AlertDescription>
              </Alert>
            )}

            {/* 三个风险面板（engineEnabled 恒传 true——整体禁用已由容器 pointer-events 处理） */}
            <RiskLevelPanel
              level="high"
              intents={HIGH_RISK_INTENTS}
              direction={direction}
              config={dirConfig}
              engineEnabled={true}
              expandedIntent={expandedIntent}
              onExpand={setExpandedIntent}
              onChange={updateIntent}
              defaultOpen={false}
            />
            <RiskLevelPanel
              level="medium"
              intents={MEDIUM_RISK_INTENTS}
              direction={direction}
              config={dirConfig}
              engineEnabled={true}
              expandedIntent={expandedIntent}
              onExpand={setExpandedIntent}
              onChange={updateIntent}
              defaultOpen
            />
            {LOW_RISK_INTENTS.length > 0 && (
              <RiskLevelPanel
                level="low"
                intents={LOW_RISK_INTENTS}
                direction={direction}
                config={dirConfig}
                engineEnabled={true}
                expandedIntent={expandedIntent}
                onExpand={setExpandedIntent}
                onChange={updateIntent}
                defaultOpen
              />
            )}
          </div>

          {/* sticky 保存栏（html_spec §2.2-11；dim 容器外，总开关关闭时仍可点） */}
          <div
            className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t bg-background/95 backdrop-blur-sm flex items-center justify-between z-10"
            data-testid="intent-engine-save-bar"
          >
            <span
              className={cn('flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400', !dirty && 'invisible')}
              data-testid="intent-engine-unsaved"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {t('unsavedChanges')}
            </span>
            <Button onClick={handleSave} disabled={saving || !dirty} data-testid="intent-engine-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t('saveConfig')}
            </Button>
          </div>

          <CopyDirectionDialog
            open={showCopy}
            onOpenChange={setShowCopy}
            source={direction}
            onConfirm={handleCopyToDirections}
          />
          <ResetDialog
            open={showReset}
            onOpenChange={setShowReset}
            direction={direction}
            onConfirm={handleReset}
          />
        </div>
      </PipelinePanelHeader>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <div className="p-6">{content}</div>;
}
