'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { LinkProtectionTab } from './url-protection/LinkProtectionTab';
import { SandboxTab } from './url-protection/SandboxTab';
import { getURLProtectionSettings, putURLProtectionSettings } from '@/lib/api/url-protection';
import { useApiRequest } from '@/lib/api/client';
import { useProductForm } from '@/contexts/product-form-context';
import { cn } from '@/lib/utils';
import type { Direction, URLProtectionSettings } from '@/types/url-protection';
import { PipelinePanelHeader } from './PipelinePanelHeader';
import { useModuleMaster } from './useModuleMaster';

interface Props {
  direction?: Direction;
  embedded?: boolean;
  /** 草稿是否偏离已保存态（供抽屉关闭确认，html_spec §2.2-5） */
  onDirtyChange?: (dirty: boolean) => void;
  /** 模块启用态（供流水线左导航圆点/摘要联动，html_spec §2.2-2/§2.2-3） */
  onEnabledChange?: (enabled: boolean) => void;
}

// html_spec §2.2/§2.3：显式保存模型 —— 页面持有草稿，所有子组件改草稿，
// 底栏「保存配置」单次 PUT（GT 决策#4）。URL沙箱检测 Tab 仅传统版形态渲染（GT 决策#1）。
export function UrlProtectionPage({ direction = 'receive', embedded, onDirtyChange, onEnabledChange }: Props) {
  const t = useTranslations('urlProtection');
  const { apiRequest } = useApiRequest();
  const { enabled: moduleEnabled, saving: moduleSaving, toggle: toggleModule, editable: moduleEditable } = useModuleMaster('url_protection');
  const { capabilities } = useProductForm();
  const showSandbox = !capabilities?.ai;

  const [saved, setSaved] = useState<URLProtectionSettings | null>(null);
  const [draft, setDraft] = useState<URLProtectionSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'sandbox' | 'linkProtection'>(showSandbox ? 'sandbox' : 'linkProtection');
  // 沙箱隐藏时兜底选中链接保护（demo effectiveTab 行为）
  const effectiveTab = !showSandbox && activeTab === 'sandbox' ? 'linkProtection' : activeTab;

  const dirty = saved !== null && draft !== null && JSON.stringify(saved) !== JSON.stringify(draft);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  // 左导航圆点/摘要即时联动（demo 行为：总开关一切即变，不等保存）
  useEffect(() => {
    onEnabledChange?.(moduleEnabled);
  }, [moduleEnabled, onEnabledChange]);

  useEffect(() => {
    getURLProtectionSettings(apiRequest)
      .then((s) => {
        setSaved(s);
        setDraft(s);
      })
      .catch(() => { toast.error(t('failedToLoad')); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRequest]);

  const patchDraft = useCallback((patch: Partial<URLProtectionSettings>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }, []);

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await putURLProtectionSettings(draft, apiRequest);
      setSaved(updated);
      setDraft(updated);
      toast.success(t('saveSuccess'));
    } catch (e) {
      toast.error(t('saveFail', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TooltipProvider>
    <div className="flex flex-col" data-testid="url-protection-page">
      <PipelinePanelHeader
        title={t('title')}
        enabled={moduleEnabled}
        onToggle={toggleModule}
        disabled={!moduleEditable || moduleSaving}
        enabledLabel={t('statusEnabled')}
        disabledLabel={t('statusDisabled')}
        switchTestId="url-protection-master-switch"
        titleTestId="url-protection"
      >
        <div className="space-y-4">
          <div className={cn('flex-1', !moduleEnabled && 'opacity-50 pointer-events-none')}>
            <Tabs value={effectiveTab} onValueChange={(v) => setActiveTab(v as 'sandbox' | 'linkProtection')}>
              {/* AI 形态只有链接保护一个内容区，不展示无切换价值的单 Tab。 */}
              {showSandbox && (
                <TabsList className="mb-4" data-testid="url-protection-tabs">
                  <TabsTrigger value="sandbox" data-testid="tab-sandbox">{t('tabs.sandbox')}</TabsTrigger>
                  <TabsTrigger value="linkProtection" data-testid="tab-link-protection">
                    {t('tabs.linkProtection')}
                    {direction !== 'receive' && (
                      <Badge variant="outline" className="ml-1 text-xs">{t('tabs.receiveOnlyBadge')}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              )}
              {showSandbox && (
                <TabsContent value="sandbox" className="mt-0">
                  <SandboxTab direction={direction} settings={draft} onPatch={patchDraft} />
                </TabsContent>
              )}
              <TabsContent value="linkProtection" className="mt-0">
                <LinkProtectionTab direction={direction} settings={draft} onPatch={patchDraft} />
              </TabsContent>
            </Tabs>
          </div>

          {/* 底部保存栏：未保存提示 + 保存配置（html_spec §2.2-5，GT 决策#4） */}
          <div
            className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t bg-background/95 backdrop-blur-sm flex items-center justify-between z-10"
            data-testid="url-protection-save-bar"
          >
            <span
              className={cn('flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400', !dirty && 'invisible')}
              data-testid="url-protection-unsaved"
            >
              {/* 干净态不渲染文本：invisible 只是视觉隐藏，textContent 仍会被
                  文本断言/读屏命中，误报"仍有未保存更改"（GT-12221）。外层 span
                  保留以维持保存栏布局与 visibility 语义。 */}
              {dirty && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  {t('unsavedChanges')}
                </>
              )}
            </span>
            <Button onClick={handleSave} disabled={saving || !dirty} data-testid="url-protection-save">
              {t('saveConfig')}
            </Button>
          </div>
        </div>
      </PipelinePanelHeader>
    </div>
    </TooltipProvider>
  );
}
