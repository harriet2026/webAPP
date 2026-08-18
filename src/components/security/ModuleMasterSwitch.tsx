'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useApiRequest } from '@/lib/api/client';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import { cn } from '@/lib/utils';
import {
  getSecurityModules,
  setSecurityModuleEnabled,
  canEditSecurityModule,
  securityModuleScope,
  WHITELIST_BEARING_MODULES,
  type SecurityModulePage,
} from '@/lib/api/security-modules';
import { PipelinePanelHeader } from './PipelinePanelHeader';

// page → 顶层 pipeline.* i18n 子键（各面板标题的既有单一真源，与抽屉面包屑/侧栏一致）。
const MODULE_TITLE_KEY: Record<SecurityModulePage, string> = {
  ip_filter: 'ipFilter',
  ip_frequency: 'ipFrequency',
  rbl_filter: 'rbl',
  sender_filter: 'senderFilter',
  user_list: 'userBlackWhiteList',
  auth_spoofing: 'authSpoofing',
  content_rules: 'content',
  behavior_control: 'behaviorControl',
  mail_marking: 'mailMarking',
  overseas_mail: 'overseas',
  similar_detection: 'similarDetection',
  attachment_security: 'attachment',
  advanced_rules: 'advancedRules',
  recipient_check: 'recipientCheck',
  url_protection: 'url',
  intent_engine: 'intentEngine',
  comprehensive_strategy: 'phase5Comprehensive',
};

interface Props {
  page: SecurityModulePage;
  /** 模块配置区。关闭时整体灰显且不可交互。 */
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  /** Keep the toggle as a draft until the user explicitly saves it. */
  deferred?: boolean;
  /** 向父级（策略流水线左导航）回传当前启用态，用于圆点/摘要联动。 */
  onEnabledChange?: (enabled: boolean) => void;
}

export function ModuleMasterSwitch({ page, children, title, actions, deferred = false, onEnabledChange }: Props) {
  const t = useTranslations('securityModules');
  const pipelineT = useTranslations('pipeline');
  const common = useTranslations('common');
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin, selectedTenantId, user } = useAuth();
  const { capabilities, viewer } = useProductForm();

  const editable = canEditSecurityModule({
    page,
    role: user?.role,
    viewer,
    multiTenant: capabilities?.multiTenant ?? true,
    selectedTenantId,
  });
  const switchTitle = editable
    ? undefined
    : securityModuleScope(page) === 'global'
      ? t('platformManaged')
      : isSystemAdmin && (capabilities?.multiTenant ?? true) && selectedTenantId === null
        ? t('selectTenantFirst')
        : t('adminOnly');

  const [enabled, setEnabled] = useState(true);
  const [persistedEnabled, setPersistedEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 用户是否手动操作过开关。加载失败时不上报乐观默认值（避免误覆盖父级兜底真值），
  // 但用户一旦手动切换，值即为用户驱动，应当上报。
  const [userInteracted, setUserInteracted] = useState(false);

  useEffect(() => {
    getSecurityModules(apiRequest)
      .then((m) => {
        const next = m[page] ?? true;
        setEnabled(next);
        setPersistedEnabled(next);
        setLoaded(true);
      })
      // 加载失败：保持 loaded=false，不上报乐观默认值 true，
      // 让父级继续以 securityModulesMap 兜底真值为准。
      .catch(() => {});
  }, [apiRequest, page]);

  // 启用态回传给父级，使策略流水线左导航圆点/摘要与本面板总开关联动。
  // 仅在「加载成功」或「用户手动操作过」后回传，避免首帧乐观默认值 true
  // 覆盖父级兜底真值（GT-12731 闪回）。
  useEffect(() => {
    if (loaded || userInteracted) onEnabledChange?.(enabled);
  }, [loaded, userInteracted, enabled, onEnabledChange]);

  const handleToggle = async (next: boolean) => {
    setUserInteracted(true);
    if (deferred) {
      setEnabled(next);
      return;
    }
    setSaving(true);
    const prev = enabled;
    setEnabled(next);
    try {
      await setSecurityModuleEnabled(page, next, apiRequest);
      setPersistedEnabled(next);
    } catch {
      setEnabled(prev);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSecurityModuleEnabled(page, enabled, apiRequest);
      setPersistedEnabled(enabled);
    } catch {
      setEnabled(persistedEnabled);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const dirty = deferred && enabled !== persistedEnabled;

  return (
    <div data-testid={`module-master-switch-${page}`}>
      <PipelinePanelHeader
        title={title ?? pipelineT(MODULE_TITLE_KEY[page])}
        enabled={enabled}
        onToggle={handleToggle}
        disabled={!editable || saving}
        enabledLabel={t('enabled')}
        disabledLabel={t('disabled')}
        actions={actions}
        switchTitle={switchTitle}
      >
        <div className="space-y-4">
          {!enabled && (
            <div
              className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400"
              data-testid="module-disabled-overlay"
            >
              {t('disableWarning')}
              {WHITELIST_BEARING_MODULES.includes(page) && ` ${t('whitelistWarning')}`}
            </div>
          )}

          <div
            className={cn(!enabled && 'opacity-50 pointer-events-none')}
            data-enabled={enabled}
            data-testid={`module-content-${page}`}
          >
            {children}
          </div>

          {deferred && editable && (
            <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
              {dirty && <span className="text-xs text-amber-600">{t('unsavedChanges')}</span>}
              <Button onClick={handleSave} disabled={!dirty || saving} data-testid="master-switch-save">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {common('save')}
              </Button>
            </div>
          )}
        </div>
      </PipelinePanelHeader>
    </div>
  );
}
