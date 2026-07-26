'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useApiRequest } from '@/lib/api/client';
import { getActiveContentConfig, saveActiveContentConfig } from '@/lib/api/attachment-security';
import type { ActiveContentConfig, Direction } from '@/types/attachment-security';
import { DirectionSwitcher } from './DirectionSwitcher';

const DEFAULT_CONFIG: ActiveContentConfig = {
  vba_enabled: true,
  vba_to_keyword: true,
  pdf_js_enabled: true,
  lnk_enabled: true,
  lnk_to_url: true,
  tnef_unwrap: true,
};

interface ActiveContentTabProps {
  direction?: Direction;
  onDirectionChange?: (dir: Direction) => void;
}

// 活动内容页只配置扫描能力。宏、PDF JavaScript 与 LNK 的最终动作由
// Sideline 统一规则依据 attachd 输出的标签和事实决定。
export function ActiveContentTab({ direction: externalDirection, onDirectionChange }: ActiveContentTabProps) {
  const t = useTranslations('attachmentSecurity');
  const ta = useTranslations('attachmentSecurity.activeContent');
  const { apiRequest } = useApiRequest();
  const [internalDirection, setInternalDirection] = useState<Direction>('receive');
  const direction = externalDirection ?? internalDirection;
  const [config, setConfig] = useState<ActiveContentConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      setConfig((await getActiveContentConfig(direction, apiRequest)) ?? { ...DEFAULT_CONFIG });
    } finally {
      setLoading(false);
    }
  }, [apiRequest, direction]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateConfig = (updates: Partial<ActiveContentConfig>) => {
    setConfig((previous) => ({ ...previous, ...updates }));
  };

  const onSubmit = async () => {
    setSaving(true);
    try {
      await saveActiveContentConfig(direction, config, apiRequest);
      toast.success(t('toast.saveSuccess'));
    } catch {
      toast.error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="active-content-tab">
      <DirectionSwitcher value={direction} onChange={onDirectionChange ?? setInternalDirection} />
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{ta('vbaSection')}</h4>
        <div className="space-y-3 pl-3">
          <div className="flex items-center gap-3"><Switch checked={config.vba_enabled} onCheckedChange={(v) => updateConfig({ vba_enabled: v })} /><Label>{ta('vbaEnabled')}</Label></div>
          {config.vba_enabled && <div className="flex items-center gap-3"><Switch checked={config.vba_to_keyword} onCheckedChange={(v) => updateConfig({ vba_to_keyword: v })} /><Label>{ta('vbaToKeyword')}</Label></div>}
        </div>
      </div>
      <Separator />
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{ta('pdfJsSection')}</h4>
        <div className="flex items-center gap-3 pl-3"><Switch checked={config.pdf_js_enabled} onCheckedChange={(v) => updateConfig({ pdf_js_enabled: v })} /><Label>{ta('pdfJsEnabled')}</Label></div>
      </div>
      <Separator />
      <div className="space-y-4">
        <h4 className="text-sm font-medium">{ta('lnkSection')}</h4>
        <div className="space-y-3 pl-3">
          <div className="flex items-center gap-3"><Switch checked={config.lnk_enabled} onCheckedChange={(v) => updateConfig({ lnk_enabled: v })} /><Label>{ta('lnkEnabled')}</Label></div>
          {config.lnk_enabled && <div className="flex items-center gap-3"><Switch checked={config.lnk_to_url} onCheckedChange={(v) => updateConfig({ lnk_to_url: v })} /><Label>{ta('lnkToUrl')}</Label></div>}
        </div>
      </div>
      <Separator />
      <div className="flex items-center gap-3"><Switch checked disabled /><Label>{ta('tnefUnwrap')}</Label></div>
      <div className="flex justify-end pt-4 border-t"><Button type="button" disabled={saving} onClick={onSubmit}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Save className="mr-2 h-4 w-4" />{t('basicLimit.save')}</Button></div>
    </div>
  );
}
