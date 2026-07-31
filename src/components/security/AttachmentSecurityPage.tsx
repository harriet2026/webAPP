'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { BasicLimitTab, DEFAULT_BASIC_LIMIT_CONFIG } from './attachment-security/BasicLimitTab';
import {
  AntivirusTab,
  DEFAULT_ANTIVIRUS_ACTIONS,
  DEFAULT_ANTIVIRUS_CONFIG,
} from './attachment-security/AntivirusTab';
import {
  DEFAULT_IMAGE_DETECT_ACTIONS,
  DEFAULT_IMAGE_DETECT_CONFIG,
  DEFAULT_QR_DEEP_ROUTES,
  ImageDetectTab,
} from './attachment-security/ImageDetectTab';
import {
  DEFAULT_ENCRYPTED_ACTIONS,
  DEFAULT_ENCRYPTED_CONFIG,
  EncryptedAttachmentTab,
} from './attachment-security/EncryptedAttachmentTab';
import { Button } from '@/components/ui/button';
import { SegmentedButton } from '@/components/ui/segmented-button';
import { useAuth } from '@/contexts/auth-context';
import { useProductForm } from '@/contexts/product-form-context';
import {
  getAntivirusActionConfig,
  getAntivirusConfig,
  getBasicLimitConfig,
  getEncryptedActionConfig,
  getEncryptedConfig,
  getImageDetectActionConfig,
  getImageDetectConfig,
  getQrDeepRoutesConfig,
  getTenantAttachmentSecuritySettings,
  saveTenantAttachmentSecuritySettings,
  saveAntivirusActionConfig,
  saveAntivirusConfig,
  saveBasicLimitConfig,
  saveEncryptedActionConfig,
  saveEncryptedConfig,
  saveImageDetectActionConfig,
  saveImageDetectConfig,
  saveQrDeepRoutesConfig,
} from '@/lib/api/attachment-security';
import { useApiRequest } from '@/lib/api/client';
import {
  canEditSecurityModule,
  getSecurityModules,
  setSecurityModuleEnabled,
} from '@/lib/api/security-modules';
import { cn } from '@/lib/utils';
import { PipelinePanelHeader } from './PipelinePanelHeader';
import type {
  AntivirusActionConfig,
  AntivirusConfig,
  BasicLimitConfig,
  Direction,
  EncryptedActionConfig,
  EncryptedConfig,
  ImageDetectActionConfig,
  ImageDetectConfig,
  QrDeepRoutesConfig,
} from '@/types/attachment-security';

const TABS = [
  { key: 'basicLimit' },
  { key: 'antivirus' },
  { key: 'image' },
  { key: 'encrypted' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface AttachmentDraft {
  enabled: boolean;
  basic: BasicLimitConfig;
  antivirus: AntivirusConfig;
  antivirusActions: AntivirusActionConfig;
  image: ImageDetectConfig;
  imageRoutes: QrDeepRoutesConfig;
  imageActions: ImageDetectActionConfig;
  encrypted: EncryptedConfig;
  encryptedActions: EncryptedActionConfig;
}

interface Props {
  embedded?: boolean;
  hideBasicLimit?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onEnabledChange?: (enabled: boolean) => void;
}

const direction: Direction = 'receive';

function defaultDraft(): AttachmentDraft {
  return {
    enabled: true,
    basic: { ...DEFAULT_BASIC_LIMIT_CONFIG },
    antivirus: { ...DEFAULT_ANTIVIRUS_CONFIG },
    antivirusActions: { ...DEFAULT_ANTIVIRUS_ACTIONS },
    image: { ...DEFAULT_IMAGE_DETECT_CONFIG },
    imageRoutes: { ...DEFAULT_QR_DEEP_ROUTES },
    imageActions: { ...DEFAULT_IMAGE_DETECT_ACTIONS },
    encrypted: { ...DEFAULT_ENCRYPTED_CONFIG },
    encryptedActions: { ...DEFAULT_ENCRYPTED_ACTIONS },
  };
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function AttachmentSecurityPage({
  embedded,
  hideBasicLimit = false,
  onDirtyChange,
  onEnabledChange,
}: Props) {
  const t = useTranslations('attachmentSecurity');
  const moduleT = useTranslations('securityModules');
  const { apiRequest } = useApiRequest();
  const { isSystemAdmin, selectedTenantId, user } = useAuth();
  const { capabilities, viewer } = useProductForm();
  const firstTab: TabKey = hideBasicLimit ? 'antivirus' : 'basicLimit';
  const [activeTab, setActiveTab] = useState<TabKey>(firstTab);
  const [draft, setDraft] = useState<AttachmentDraft>(defaultDraft);
  const [baseline, setBaseline] = useState<AttachmentDraft>(defaultDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  // GT-12196: attachment_security 是租户级安全模块。不能只按
  // isSystemAdmin 判断，否则 tenant_admin 虽能调用后端租户级开关接口，
  // 页面上的开关仍会被错误禁用。
  const moduleEditable = canEditSecurityModule({
    page: 'attachment_security',
    role: user?.role,
    viewer,
    multiTenant: capabilities?.multiTenant ?? true,
    selectedTenantId,
  });
  const moduleSwitchTitle = moduleEditable
    ? undefined
    : isSystemAdmin && (capabilities?.multiTenant ?? true) && selectedTenantId === null
      ? moduleT('selectTenantFirst')
      : moduleT('systemAdminOnly');

  const visibleTabs = useMemo(
    () => TABS.filter((tab) => !hideBasicLimit || tab.key !== 'basicLimit'),
    [hideBasicLimit],
  );
  const dirty = !same(draft, baseline);

  useEffect(() => {
    if (hideBasicLimit && activeTab === 'basicLimit') setActiveTab('antivirus');
  }, [activeTab, hideBasicLimit]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    onEnabledChange?.(draft.enabled);
  }, [draft.enabled, onEnabledChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getBasicLimitConfig(direction, apiRequest),
      getAntivirusConfig(apiRequest),
      getAntivirusActionConfig(direction, apiRequest),
      getImageDetectConfig(direction, apiRequest),
      getQrDeepRoutesConfig(apiRequest),
      getImageDetectActionConfig(direction, apiRequest),
      getEncryptedConfig(direction, apiRequest),
      getEncryptedActionConfig(direction, apiRequest),
      getSecurityModules(apiRequest).catch(() => null),
      // GT-12196：租户级三节走专用端点。失败(例如平台视角没有租户上下文)时返回
      // null，下面沿用原来的 config-overrides 结果 —— 保证平台管理员的既有行为不变。
      getTenantAttachmentSecuritySettings(apiRequest).catch(() => null),
    ])
      .then(([basic, antivirus, antivirusActions, image, imageRoutes, imageActions, encrypted, encryptedActions, modules, tenantCfg]) => {
        if (!active) return;
        // 拿到租户配置时，用它覆盖归租户的三节；平台级的 basic/antivirus(host/port)
        // 始终来自原路径。
        const tAv = tenantCfg?.antivirus;
        const tImg = tenantCfg?.image_detect;
        const tEnc = tenantCfg?.encrypted;
        const loaded: AttachmentDraft = {
          enabled: modules?.attachment_security ?? true,
          basic: { ...DEFAULT_BASIC_LIMIT_CONFIG, ...(basic ?? {}) },
          antivirus: { ...DEFAULT_ANTIVIRUS_CONFIG, ...(antivirus ?? {}) },
          antivirusActions: {
            ...DEFAULT_ANTIVIRUS_ACTIONS,
            ...(antivirusActions ?? {}),
            ...(tAv ? { virus_action: tAv.virus_action, timeout_action: tAv.timeout_action } : {}),
          } as AttachmentDraft['antivirusActions'],
          image: {
            ...DEFAULT_IMAGE_DETECT_CONFIG,
            ...(image ?? {}),
            ...(tImg ? {
              ocr_mode: tImg.ocr_mode, ocr_max_count: tImg.ocr_max_count,
              qr_mode: tImg.qr_mode, qr_barcode_exempt: tImg.qr_barcode_exempt,
              qr_max_count: tImg.qr_max_count,
            } : {}),
          } as AttachmentDraft['image'],
          imageRoutes: {
            ...DEFAULT_QR_DEEP_ROUTES,
            ...(imageRoutes ?? {}),
            ...(tImg?.qr_deep_routes ?? {}),
          } as AttachmentDraft['imageRoutes'],
          imageActions: {
            ...DEFAULT_IMAGE_DETECT_ACTIONS,
            ...(imageActions ?? {}),
            ...(tImg ? {
              qr_light_action: tImg.qr_light_action,
              qr_deep_exceed_action: tImg.qr_deep_exceed_action,
              qr_deep_exceed_warn: tImg.qr_deep_exceed_warn,
            } : {}),
          } as AttachmentDraft['imageActions'],
          encrypted: {
            ...DEFAULT_ENCRYPTED_CONFIG,
            ...(encrypted ?? {}),
            ...(tEnc ? {
              detect_mode: tEnc.detect_mode,
              extract_password_from_body: tEnc.extract_password_from_body,
              extract_password_from_filename: tEnc.extract_password_from_filename,
              use_password_book: tEnc.use_password_book,
              recursive_detect: tEnc.recursive_detect,
              max_password_attempts: tEnc.max_password_attempts,
              mark_suspicious: tEnc.mark_suspicious,
            } : {}),
          } as AttachmentDraft['encrypted'],
          encryptedActions: {
            ...DEFAULT_ENCRYPTED_ACTIONS,
            ...(encryptedActions ?? {}),
            ...(tEnc ? { decrypt_fail_action: tEnc.decrypt_fail_action } : {}),
          } as AttachmentDraft['encryptedActions'],
        };
        setDraft(loaded);
        setBaseline(loaded);
      })
      .catch(() => {
        if (active) toast.error(t('toast.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      onDirtyChange?.(false);
    };
  }, [apiRequest, onDirtyChange, t]);

  const updateDraft = useCallback(<Key extends keyof AttachmentDraft>(key: Key, value: AttachmentDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  // 总开关立即持久化，与其他模块保持一致，不走 draft/save 流程。
  const handleToggleEnabled = useCallback(async (next: boolean) => {
    const prev = draft.enabled;
    setDraft((current) => ({ ...current, enabled: next }));
    setTogglingEnabled(true);
    try {
      await setSecurityModuleEnabled('attachment_security', next, apiRequest);
      setBaseline((current) => ({ ...current, enabled: next }));
    } catch {
      setDraft((current) => ({ ...current, enabled: prev }));
      toast.error(moduleT('saveFailed'));
    } finally {
      setTogglingEnabled(false);
    }
  }, [draft.enabled, apiRequest, moduleT]);

  const save = async () => {
    setSaving(true);
    try {
      const tasks: Promise<void>[] = [];
      if (!same(draft.basic, baseline.basic)) tasks.push(saveBasicLimitConfig(direction, draft.basic, apiRequest));
      if (!same(draft.antivirus, baseline.antivirus)) tasks.push(saveAntivirusConfig(draft.antivirus, apiRequest));
      // GT-12196：归租户的三节（反病毒处置 / 图片识别 / 加密附件）改走租户级端点，
      // 一次提交整份配置。任一节有改动就整体保存 —— 服务端存的是一整个 JSON，
      // 分节 PUT 会互相覆盖。
      const tenantSectionsDirty =
        !same(draft.antivirusActions, baseline.antivirusActions) ||
        !same(draft.image, baseline.image) ||
        !same(draft.imageRoutes, baseline.imageRoutes) ||
        !same(draft.imageActions, baseline.imageActions) ||
        !same(draft.encrypted, baseline.encrypted) ||
        !same(draft.encryptedActions, baseline.encryptedActions);
      if (tenantSectionsDirty) {
        tasks.push(
          saveTenantAttachmentSecuritySettings({
            antivirus: {
              virus_action: draft.antivirusActions.virus_action,
              timeout_action: draft.antivirusActions.timeout_action,
            },
            image_detect: {
              ocr_mode: draft.image.ocr_mode,
              ocr_max_count: draft.image.ocr_max_count,
              qr_mode: draft.image.qr_mode,
              qr_barcode_exempt: draft.image.qr_barcode_exempt,
              qr_max_count: draft.image.qr_max_count,
              qr_light_action: draft.imageActions.qr_light_action,
              qr_deep_exceed_action: draft.imageActions.qr_deep_exceed_action,
              qr_deep_exceed_warn: draft.imageActions.qr_deep_exceed_warn,
              qr_deep_routes: draft.imageRoutes as unknown as Record<string, boolean>,
            },
            encrypted: {
              detect_mode: draft.encrypted.detect_mode,
              extract_password_from_body: draft.encrypted.extract_password_from_body,
              extract_password_from_filename: draft.encrypted.extract_password_from_filename,
              use_password_book: draft.encrypted.use_password_book,
              recursive_detect: draft.encrypted.recursive_detect,
              max_password_attempts: draft.encrypted.max_password_attempts,
              mark_suspicious: draft.encrypted.mark_suspicious,
              decrypt_fail_action: draft.encryptedActions.decrypt_fail_action,
            },
          }, apiRequest).then(() => undefined),
        );
      }
      await Promise.all(tasks);
      setBaseline(draft);
      toast.success(t('toast.saveSuccess'));
    } catch {
      toast.error(t('toast.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const tabLabels: Record<TabKey, string> = {
    basicLimit: t('tabs.basicLimit'),
    antivirus: t('tabs.antivirus'),
    image: t('tabs.image'),
    encrypted: t('tabs.encrypted'),
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center" data-testid="attachment-security-loading">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="attachment-security-page">
      {!embedded && <h1 className="text-2xl font-semibold">{t('title')}</h1>}
      <PipelinePanelHeader
        title={t('title')}
        enabled={draft.enabled}
        onToggle={handleToggleEnabled}
        disabled={!moduleEditable || saving || togglingEnabled}
        enabledLabel={moduleT('enabled')}
        disabledLabel={moduleT('disabled')}
        rootTestId="module-master-switch-attachment_security"
        titleTestId="attachment-security-title"
        ariaLabel={t('masterSwitchLabel')}
        switchTitle={moduleSwitchTitle}
      >
        <div className="space-y-4">
          {!draft.enabled && (
            <div
              className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
              data-testid="module-disabled-overlay"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {moduleT('disableWarning')}
            </div>
          )}

          <div
            className={cn(!draft.enabled && 'pointer-events-none opacity-50')}
            data-enabled={draft.enabled}
            data-testid="module-content-attachment_security"
          >
            <div data-testid="attachment-security-content">
              <div
                className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1"
                role="tablist"
                aria-label={t('title')}
                data-testid="attachment-security-tabs"
              >
                {visibleTabs.map((tab) => (
                  <SegmentedButton
                    key={tab.key}
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    selected={activeTab === tab.key}
                    data-testid={`tab-${tab.key}`}
                    className="whitespace-nowrap rounded-md px-3 py-1.5"
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tabLabels[tab.key]}
                  </SegmentedButton>
                ))}
              </div>

              <div className="pt-6" role="tabpanel" data-testid={`attachment-panel-${activeTab}`}>
                {activeTab === 'basicLimit' && !hideBasicLimit ? (
                  <BasicLimitTab config={draft.basic} onChange={(config) => updateDraft('basic', config)} />
                ) : activeTab === 'antivirus' ? (
                  <AntivirusTab
                    config={draft.antivirus}
                    actions={draft.antivirusActions}
                    onChange={(config) => updateDraft('antivirus', config)}
                    onActionsChange={(actions) => updateDraft('antivirusActions', actions)}
                  />
                ) : activeTab === 'image' ? (
                  <ImageDetectTab
                    config={draft.image}
                    routes={draft.imageRoutes}
                    actions={draft.imageActions}
                    onChange={(config) => updateDraft('image', config)}
                    onRoutesChange={(routes) => updateDraft('imageRoutes', routes)}
                    onActionsChange={(actions) => updateDraft('imageActions', actions)}
                  />
                ) : activeTab === 'encrypted' ? (
                  <EncryptedAttachmentTab
                    config={draft.encrypted}
                    actions={draft.encryptedActions}
                    onChange={(config) => updateDraft('encrypted', config)}
                    onActionsChange={(actions) => updateDraft('encryptedActions', actions)}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 bg-card/95 py-3 backdrop-blur">
            {dirty && (
              <span className="flex items-center gap-2 text-xs text-warning" data-testid="attachment-security-dirty-indicator">
                <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
                {moduleT('unsavedChanges')}
              </span>
            )}
            <Button onClick={save} disabled={!dirty || saving} data-testid="basic-limit-save">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              <span data-testid="attachment-security-save">{t('basicLimit.save')}</span>
            </Button>
          </div>
        </div>
      </PipelinePanelHeader>
    </div>
  );
}
