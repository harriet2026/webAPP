'use client';

import { useEffect, useState } from 'react';
import { Info, Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  AntivirusServerFields,
  AntivirusStatusSection,
} from '@/components/security/attachment-security/antivirus-engine-fields';
import { DEFAULT_ANTIVIRUS_CONFIG } from '@/components/security/attachment-security/AntivirusTab';
import { useApiRequest } from '@/lib/api/client';
import { getAntivirusConfig, saveAntivirusConfig } from '@/lib/api/attachment-security';
import type { AntivirusConfig } from '@/types/attachment-security';

/**
 * 反病毒引擎面板（平台安全策略 → 反病毒引擎 tab）
 *
 * 平台级配置：反病毒服务器 host/port + 病毒库状态/立即更新，统一作用于全部租户。
 * 仅在多租户平台管理员可见的平台安全策略页内渲染（整页已由 manage_tenants 权限门控）。
 * 自加载 / 自保存，走与原附件页相同的全局 `antivirus` 配置段（契约不变）。
 */
function merge(config: AntivirusConfig | null): AntivirusConfig {
  return { ...DEFAULT_ANTIVIRUS_CONFIG, ...(config ?? {}) };
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function AntivirusEnginePanel() {
  const t = useTranslations('attachmentSecurity');
  const pt = useTranslations('platformSecurity');
  const { apiRequest } = useApiRequest();
  const [config, setConfig] = useState<AntivirusConfig>(DEFAULT_ANTIVIRUS_CONFIG);
  const [baseline, setBaseline] = useState<AntivirusConfig>(DEFAULT_ANTIVIRUS_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAntivirusConfig(apiRequest)
      .then((loaded) => {
        if (!active) return;
        const merged = merge(loaded);
        setConfig(merged);
        setBaseline(merged);
      })
      .catch(() => {
        if (active) setConfig(DEFAULT_ANTIVIRUS_CONFIG);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiRequest]);

  const dirty = !same(config, baseline);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAntivirusConfig(config, apiRequest);
      setBaseline(config);
      toast.success(t('toast.saveSuccess'));
    } catch {
      toast.error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12" data-testid="antivirus-engine-loading">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="antivirus-engine-panel">
      <div className="flex items-start gap-2 rounded-md border border-info/20 bg-info/10 px-4 py-3 text-sm text-info">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="text-pretty">{pt('antivirusHint')}</span>
      </div>

      <AntivirusServerFields config={config} onChange={setConfig} />
      <AntivirusStatusSection />

      <div className="flex justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={!dirty || saving} data-testid="antivirus-engine-save">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
