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
  getAttachmentSecurityScopedConfig,
  patchAttachmentSecurityScopedConfig,
} from '@/lib/api/attachment-security';
import { useApiRequest } from '@/lib/api/client';
import { canEditSecurityModule } from '@/lib/api/security-modules';
import type { ConfigPatchOperation, ScopedConfigView } from '@/lib/api/scoped-configs';
import { cn } from '@/lib/utils';
import { PipelinePanelHeader } from './PipelinePanelHeader';
import type {
  AntivirusActionConfig,
  AntivirusConfig,
  BasicLimitConfig,
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

function objectAt(document: Record<string, unknown>, path: string): Record<string, unknown> {
  let current: unknown = document;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(`attachd effective document is missing ${path}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(`attachd effective document is missing ${path}`);
  }
  return current as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function draftFromEffectiveDocument(document: Record<string, unknown>): AttachmentDraft {
  if (typeof document.module_enabled !== 'boolean') {
    throw new Error('attachd effective document is missing module_enabled');
  }
  const basic = objectAt(document, 'basic_limit.receive');
  const antivirus = objectAt(document, 'antivirus');
  const image = objectAt(document, 'image_detection');
  const imageRoutes = objectAt(document, 'image_detection.qr_deep_routes');
  const encrypted = objectAt(document, 'encrypted');
  const keywordScope = stringList(imageRoutes.keyword_scope);
  const intentCategories = stringList(imageRoutes.intent_categories);
  return {
    enabled: document.module_enabled,
    basic: {
      ...DEFAULT_BASIC_LIMIT_CONFIG,
      ...basic,
      danger_ext_list: stringList(basic.danger_ext_list).join(','),
    } as BasicLimitConfig,
    antivirus: {
      ...DEFAULT_ANTIVIRUS_CONFIG,
      host: String(antivirus.host ?? ''),
      port: String(antivirus.port ?? ''),
    },
    antivirusActions: {
      ...DEFAULT_ANTIVIRUS_ACTIONS,
      virus_action: antivirus.virus_action,
      timeout_action: antivirus.timeout_action,
    } as AntivirusActionConfig,
    image: {
      ...DEFAULT_IMAGE_DETECT_CONFIG,
      ocr_mode: image.ocr_mode === 'deep' ? 'light' : image.ocr_mode,
      ocr_max_count: image.ocr_max_count,
      qr_mode: image.qr_mode,
      qr_max_count: image.qr_max_count,
    } as ImageDetectConfig,
    imageRoutes: {
      ...DEFAULT_QR_DEEP_ROUTES,
      url_check: imageRoutes.url_check === true,
      url_unshorten: imageRoutes.url_unshorten === true,
      keyword_filter: imageRoutes.keyword_filter === true,
      keyword_scope_url: keywordScope.includes('url_path'),
      keyword_scope_text: keywordScope.includes('plain_text'),
      intent_engine: imageRoutes.intent_engine === true,
      intent_high: intentCategories.includes('high'),
      intent_medium: intentCategories.includes('medium'),
      intent_low: intentCategories.includes('low'),
      advanced_rules: imageRoutes.advanced_rules === true,
    },
    imageActions: {
      ...DEFAULT_IMAGE_DETECT_ACTIONS,
      qr_light_action: image.qr_light_action,
      qr_deep_exceed_action: image.qr_deep_exceed_action,
      qr_deep_exceed_warn: image.qr_deep_exceed_warn,
    } as ImageDetectActionConfig,
    encrypted: {
      ...DEFAULT_ENCRYPTED_CONFIG,
      detect_mode: encrypted.detect_mode,
      extract_password_from_body: encrypted.extract_password_from_body,
      extract_password_from_filename: encrypted.extract_password_from_filename,
      use_password_book: encrypted.use_password_book,
      recursive_detect: encrypted.recursive_detect,
      max_password_attempts: encrypted.max_password_attempts,
      mark_suspicious: encrypted.mark_suspicious,
    } as EncryptedConfig,
    encryptedActions: {
      ...DEFAULT_ENCRYPTED_ACTIONS,
      decrypt_fail_action: encrypted.decrypt_fail_action,
    } as EncryptedActionConfig,
  };
}

function csvList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function configurationValues(draft: AttachmentDraft, includeAntivirusEndpoint: boolean): Record<string, unknown> {
  const values: Record<string, unknown> = {
    'basic_limit.receive.attachment_count_max': draft.basic.attachment_count_max,
    'basic_limit.receive.attachment_size_max_kb': draft.basic.attachment_size_max_kb,
    'basic_limit.receive.nested_zip_count_max': draft.basic.nested_zip_count_max,
    'basic_limit.receive.nested_file_count_max': draft.basic.nested_file_count_max,
    'basic_limit.receive.nested_level_max': draft.basic.nested_level_max,
    'basic_limit.receive.scan_timeout_sec': draft.basic.scan_timeout_sec,
    'basic_limit.receive.exceed_action': draft.basic.exceed_action,
    'basic_limit.receive.partial_skip': draft.basic.partial_skip,
    'basic_limit.receive.danger_ext_enabled': draft.basic.danger_ext_enabled,
    'basic_limit.receive.danger_ext_list': csvList(draft.basic.danger_ext_list),
    'basic_limit.receive.mime_mismatch_check': draft.basic.mime_mismatch_check,
    'basic_limit.receive.mime_mismatch_action': draft.basic.mime_mismatch_action,
    'antivirus.virus_action': draft.antivirusActions.virus_action,
    'antivirus.timeout_action': draft.antivirusActions.timeout_action,
    'image_detection.ocr_mode': draft.image.ocr_mode,
    'image_detection.ocr_max_count': draft.image.ocr_max_count,
    'image_detection.qr_mode': draft.image.qr_mode,
    'image_detection.qr_max_count': draft.image.qr_max_count,
    'image_detection.qr_light_action': draft.imageActions.qr_light_action,
    'image_detection.qr_deep_exceed_action': draft.imageActions.qr_deep_exceed_action,
    'image_detection.qr_deep_exceed_warn': draft.imageActions.qr_deep_exceed_warn,
    'image_detection.qr_deep_routes.url_check': draft.imageRoutes.url_check,
    'image_detection.qr_deep_routes.url_unshorten': draft.imageRoutes.url_unshorten,
    'image_detection.qr_deep_routes.keyword_filter': draft.imageRoutes.keyword_filter,
    'image_detection.qr_deep_routes.keyword_scope': [
      draft.imageRoutes.keyword_scope_url ? 'url_path' : null,
      draft.imageRoutes.keyword_scope_text ? 'plain_text' : null,
    ].filter(Boolean),
    'image_detection.qr_deep_routes.intent_engine': draft.imageRoutes.intent_engine,
    'image_detection.qr_deep_routes.intent_categories': [
      draft.imageRoutes.intent_high ? 'high' : null,
      draft.imageRoutes.intent_medium ? 'medium' : null,
      draft.imageRoutes.intent_low ? 'low' : null,
    ].filter(Boolean),
    'image_detection.qr_deep_routes.advanced_rules': draft.imageRoutes.advanced_rules,
    'encrypted.detect_mode': draft.encrypted.detect_mode,
    'encrypted.extract_password_from_body': draft.encrypted.extract_password_from_body,
    'encrypted.extract_password_from_filename': draft.encrypted.extract_password_from_filename,
    'encrypted.use_password_book': draft.encrypted.use_password_book,
    'encrypted.recursive_detect': draft.encrypted.recursive_detect,
    'encrypted.max_password_attempts': draft.encrypted.max_password_attempts,
    'encrypted.mark_suspicious': draft.encrypted.mark_suspicious,
    'encrypted.decrypt_fail_action': draft.encryptedActions.decrypt_fail_action,
  };
  if (includeAntivirusEndpoint) {
    values['antivirus.host'] = draft.antivirus.host;
    values['antivirus.port'] = draft.antivirus.port;
  }
  return values;
}

function draftOperations(
  draft: AttachmentDraft,
  baseline: AttachmentDraft,
  includeAntivirusEndpoint: boolean,
): ConfigPatchOperation[] {
  const current = configurationValues(draft, includeAntivirusEndpoint);
  const previous = configurationValues(baseline, includeAntivirusEndpoint);
  return Object.entries(current)
    .filter(([path, value]) => !same(value, previous[path]))
    .map(([path, value]) => ({ op: 'set', path, value }));
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
  const [configView, setConfigView] = useState<ScopedConfigView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRevision, setLoadRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const configScope = viewer === 'tenant' ? 'tenant' : 'platform';

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

  // 多租户形态（云网关 / AI版多租户 / 传统版多租户）下，反病毒服务器与病毒库属
  // 平台级能力，唯一入口为「平台安全策略 → 反病毒引擎」。此处隐藏反病毒页签的平台
  // 两段并跳过其保存；单租户形态维持现状。
  const antivirusPlatformManaged = capabilities?.multiTenant ?? false;

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

  // 仅在配置加载完成后上报启用态，避免把 defaultDraft 的乐观默认值先推给流水线
  // 左导航、导致「未启用」模块先亮起再闪回的问题（GT-12731）。
  useEffect(() => {
    if (!loading && !loadFailed) onEnabledChange?.(draft.enabled);
  }, [loading, loadFailed, draft.enabled, onEnabledChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    getAttachmentSecurityScopedConfig(configScope, apiRequest)
      .then((view) => {
        if (!active) return;
        const loaded = draftFromEffectiveDocument(view.effective.document);
        setConfigView(view);
        setDraft(loaded);
        setBaseline(loaded);
      })
      .catch(() => {
        if (!active) return;
        setConfigView(null);
        setLoadFailed(true);
        toast.error(t('toast.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      onDirtyChange?.(false);
    };
  }, [apiRequest, configScope, loadRevision, onDirtyChange, t]);

  const updateDraft = useCallback(<Key extends keyof AttachmentDraft>(key: Key, value: AttachmentDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  // 总开关立即持久化，与其他模块保持一致，不走 draft/save 流程。
  const handleToggleEnabled = useCallback(async (next: boolean) => {
    if (!configView || saving || togglingEnabled) return;
    const prev = draft.enabled;
    setDraft((current) => ({ ...current, enabled: next }));
    setTogglingEnabled(true);
    try {
      const nextView = await patchAttachmentSecurityScopedConfig(
        configScope,
        configView,
        [{ op: 'set', path: 'module_enabled', value: next }],
        apiRequest,
      );
      setConfigView(nextView);
      setBaseline((current) => ({ ...current, enabled: next }));
    } catch {
      setDraft((current) => ({ ...current, enabled: prev }));
      toast.error(moduleT('saveFailed'));
    } finally {
      setTogglingEnabled(false);
    }
  }, [configScope, configView, draft.enabled, apiRequest, moduleT, saving, togglingEnabled]);

  const save = async () => {
    if (!configView || saving || togglingEnabled) return;
    setSaving(true);
    try {
      // One page save is one attachd document CAS. Explicitly whitelisted leaf
      // paths prevent a tenant draft from ever sending platform-only endpoint
      // fields, and avoid the former three-write partial-success state.
      const operations = draftOperations(
        draft,
        baseline,
        configScope === 'platform' && !antivirusPlatformManaged,
      );
      const nextView = await patchAttachmentSecurityScopedConfig(
        configScope,
        configView,
        operations,
        apiRequest,
      );
      setConfigView(nextView);
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

  if (loadFailed || !configView) {
    return (
      <div
        className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"
        data-testid="attachment-security-load-error"
      >
        <AlertTriangle className="h-7 w-7 text-destructive" />
        <p className="text-sm text-destructive">{t('toast.loadFailed')}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setLoadRevision((current) => current + 1)}
          data-testid="attachment-security-retry"
        >
          {t('common.retry')}
        </Button>
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
                    hidePlatformConfig={antivirusPlatformManaged}
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
            <Button onClick={save} disabled={!dirty || saving || togglingEnabled} data-testid="basic-limit-save">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              <span data-testid="attachment-security-save">{t('basicLimit.save')}</span>
            </Button>
          </div>
        </div>
      </PipelinePanelHeader>
    </div>
  );
}
