import type {
  ActiveContentConfig,
  AntivirusActionConfig,
  AntivirusConfig,
  AVStatusResponse,
  BasicLimitConfig,
  EncryptedActionConfig,
  EncryptedConfig,
  ImageDetectActionConfig,
  ImageDetectConfig,
  PasswordBookEntry,
  QrDeepRoutesConfig,
} from '@/types/attachment-security';
import type { ApiRequestFn, ConfigMutationResult } from './client';
import { apiRequest, isPublicationPendingResponse } from './client';
import type { ConfigPatchOperation, ScopedConfigView } from './scoped-configs';
import {
  committedScopedConfigView,
  getPlatformConfig,
  getTenantConfig,
  patchPlatformConfig,
  patchTenantConfig,
} from './scoped-configs';

export type AttachmentSecurityConfigScope = 'platform' | 'tenant';

/**
 * AttachmentSecurityPage edits one attachd scoped document. Loading that one
 * versioned view prevents the old per-section GETs from producing a draft
 * assembled from different runtime snapshots.
 */
export function getAttachmentSecurityScopedConfig(
  scope: AttachmentSecurityConfigScope,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ScopedConfigView> {
  return scope === 'tenant'
    ? getTenantConfig('attachd', requestFn)
    : getPlatformConfig('attachd', requestFn);
}

function withSyntheticTenantRow(view: ScopedConfigView): ScopedConfigView {
  if (view.stored) return view;
  return {
    ...view,
    stored: {
      namespace: 'attachd',
      scope_kind: 'tenant',
      scope_id: view.effective.tenant_id,
      schema_version: view.effective.schema_version,
      version: 0,
      document: {},
      checksum: '',
      updated_at: '',
    },
  };
}

/**
 * Commit every field changed by the page in one scoped-config CAS. A tenant
 * without an override legitimately starts at expected_version=0. When the DB
 * commit succeeds but publication returns 202, retain the submitted document
 * and inferred next version locally instead of immediately reading the still
 * old runtime snapshot back over the editor.
 */
export async function patchAttachmentSecurityScopedConfig(
  scope: AttachmentSecurityConfigScope,
  current: ScopedConfigView,
  operations: ConfigPatchOperation[],
  requestFn: ApiRequestFn = apiRequest,
): Promise<ScopedConfigView> {
  if (operations.length === 0) return current;
  if (scope === 'platform' && !current.stored) {
    throw new Error('attachd platform configuration is missing');
  }
  const currentWithRow = scope === 'tenant' ? withSyntheticTenantRow(current) : current;
  const expectedVersion = currentWithRow.stored?.version ?? 0;
  const result = scope === 'tenant'
    ? await patchTenantConfig('attachd', expectedVersion, operations, requestFn)
    : await patchPlatformConfig('attachd', expectedVersion, operations, requestFn);

  if (isPublicationPendingResponse(result)) {
    return committedScopedConfigView(currentWithRow, operations);
  }
  if (!result.published) {
    const committed = committedScopedConfigView(currentWithRow, operations);
    return { ...committed, stored: result.stored ?? committed.stored };
  }
  return result;
}

const sectionPaths: Record<string, string> = {
  basic_limit_receive: 'basic_limit.receive',
  basic_limit_send: 'basic_limit.send',
  basic_limit_internal: 'basic_limit.internal',
  antivirus: 'antivirus',
  antivirus_actions_receive: 'antivirus',
  antivirus_actions_send: 'antivirus',
  antivirus_actions_internal: 'antivirus',
  image_detect: 'image_detection',
  image_detect_qr_deep_routes: 'image_detection.qr_deep_routes',
  image_detect_actions_receive: 'image_detection',
  image_detect_actions_send: 'image_detection',
  image_detect_actions_internal: 'image_detection',
  encrypted: 'encrypted',
  encrypted_actions_receive: 'encrypted',
  encrypted_actions_send: 'encrypted',
  encrypted_actions_internal: 'encrypted',
  active_content: 'active_content',
};

function valueAtPath(document: Record<string, unknown>, path: string): unknown {
  let current: unknown = document;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

async function fetchConfigSection(
  section: string,
  requestFn: ApiRequestFn,
): Promise<Record<string, unknown> | null> {
  const path = sectionPaths[section];
  if (!path) return null;
  // A control-plane failure must reach the page's error state. Returning null
  // here made a failed central read look like an empty/default form; a later
  // Save could then overwrite the last good database document with defaults.
  const response = await getPlatformConfig('attachd', requestFn);
  const value = valueAtPath(response.effective.document, path);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = { ...(value as Record<string, unknown>) };
  if (path.startsWith('basic_limit.') && Array.isArray(result.danger_ext_list)) {
    result.danger_ext_list = result.danger_ext_list.join(',');
  }
  return result;
}

async function saveConfigSection(
  section: string,
  config: Record<string, unknown>,
  requestFn: ApiRequestFn,
): Promise<void> {
  const prefix = sectionPaths[section];
  if (!prefix) throw new Error(`unknown attachd configuration section: ${section}`);
  const response = await getPlatformConfig('attachd', requestFn);
  if (!response.stored) throw new Error('attachd platform configuration is missing');
  const operations = Object.entries(config)
    .map(([key, rawValue]) => {
      let value = rawValue;
      if (key === 'danger_ext_list' && typeof rawValue === 'string') {
        value = rawValue.split(',').map((item) => item.trim()).filter(Boolean);
      }
      if ((key === 'keyword_scope' || key === 'intent_categories') && typeof rawValue === 'string') {
        value = rawValue.split(',').map((item) => item.trim()).filter(Boolean);
      }
      return { op: 'set' as const, path: `${prefix}.${key}`, value };
    });
  await patchPlatformConfig('attachd', response.stored.version, operations, requestFn);
}

export async function getBasicLimitConfig(
  direction: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<BasicLimitConfig | null> {
  const obj = await fetchConfigSection(`basic_limit_${direction}`, requestFn);
  return obj as BasicLimitConfig | null;
}

export async function saveBasicLimitConfig(
  direction: string,
  config: BasicLimitConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection(`basic_limit_${direction}`, config as unknown as Record<string, unknown>, requestFn);
}

export async function getAntivirusConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<AntivirusConfig | null> {
  const obj = await fetchConfigSection('antivirus', requestFn);
  return obj as AntivirusConfig | null;
}

export async function saveAntivirusConfig(
  config: AntivirusConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection('antivirus', config as unknown as Record<string, unknown>, requestFn);
}

export async function getAntivirusStatus(
  requestFn: ApiRequestFn = apiRequest,
): Promise<AVStatusResponse | null> {
  try {
    return await requestFn<AVStatusResponse>('/attachment-security/antivirus/status');
  } catch {
    return null;
  }
}

export async function getAntivirusActionConfig(
  direction: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<AntivirusActionConfig | null> {
  const obj = await fetchConfigSection(`antivirus_actions_${direction}`, requestFn);
  return obj as AntivirusActionConfig | null;
}

export async function saveAntivirusActionConfig(
  direction: string,
  config: AntivirusActionConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection(
    `antivirus_actions_${direction}`,
    config as unknown as Record<string, unknown>,
    requestFn,
  );
}

export async function triggerAntivirusUpdate(
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn('/attachment-security/antivirus/update', { method: 'POST' });
}

export async function getImageDetectConfig(
  _direction: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ImageDetectConfig | null> {
  const obj = await fetchConfigSection('image_detect', requestFn);
  if (!obj) return null;
  const cfg = obj as unknown as ImageDetectConfig;
  // GT-12xxx：OCR 深度模式已下线；历史租户可能存有 ocr_mode='deep'，归一为 'light'。
  if ((cfg.ocr_mode as string) === 'deep') cfg.ocr_mode = 'light';
  return cfg;
}

export async function saveImageDetectConfig(
  _direction: string,
  config: ImageDetectConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection('image_detect', config as unknown as Record<string, unknown>, requestFn);
}

export async function getQrDeepRoutesConfig(
  requestFn: ApiRequestFn = apiRequest,
): Promise<QrDeepRoutesConfig | null> {
  const obj = await fetchConfigSection('image_detect_qr_deep_routes', requestFn);
  if (!obj) return null;
  const keywordScope = String(obj.keyword_scope ?? '');
  const intentCategories = String(obj.intent_categories ?? '');
  return {
    url_check: obj.url_check === true,
    url_unshorten: obj.url_unshorten === true,
    keyword_filter: obj.keyword_filter === true,
    keyword_scope_url: keywordScope.split(',').includes('url_path'),
    keyword_scope_text: keywordScope.split(',').includes('plain_text'),
    intent_engine: obj.intent_engine === true,
    intent_high: intentCategories.split(',').includes('high'),
    intent_medium: intentCategories.split(',').includes('medium'),
    intent_low: intentCategories.split(',').includes('low'),
    advanced_rules: obj.advanced_rules === true,
  };
}

export async function saveQrDeepRoutesConfig(
  config: QrDeepRoutesConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection(
    'image_detect_qr_deep_routes',
    {
      url_check: config.url_check,
      url_unshorten: config.url_unshorten,
      keyword_filter: config.keyword_filter,
      keyword_scope: [
        config.keyword_scope_url ? 'url_path' : null,
        config.keyword_scope_text ? 'plain_text' : null,
      ].filter(Boolean).join(','),
      intent_engine: config.intent_engine,
      intent_categories: [
        config.intent_high ? 'high' : null,
        config.intent_medium ? 'medium' : null,
        config.intent_low ? 'low' : null,
      ].filter(Boolean).join(','),
      advanced_rules: config.advanced_rules,
    },
    requestFn,
  );
}

export async function getImageDetectActionConfig(
  direction: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ImageDetectActionConfig | null> {
  const obj = await fetchConfigSection(`image_detect_actions_${direction}`, requestFn);
  return obj as ImageDetectActionConfig | null;
}

export async function saveImageDetectActionConfig(
  direction: string,
  config: ImageDetectActionConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection(
    `image_detect_actions_${direction}`,
    config as unknown as Record<string, unknown>,
    requestFn,
  );
}

export async function getEncryptedConfig(
  _direction: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<EncryptedConfig | null> {
  const obj = await fetchConfigSection('encrypted', requestFn);
  return obj as EncryptedConfig | null;
}

export async function saveEncryptedConfig(
  _direction: string,
  config: EncryptedConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection('encrypted', config as unknown as Record<string, unknown>, requestFn);
}

export async function getEncryptedActionConfig(
  direction: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<EncryptedActionConfig | null> {
  const obj = await fetchConfigSection(`encrypted_actions_${direction}`, requestFn);
  return obj as EncryptedActionConfig | null;
}

export async function saveEncryptedActionConfig(
  direction: string,
  config: EncryptedActionConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection(
    `encrypted_actions_${direction}`,
    config as unknown as Record<string, unknown>,
    requestFn,
  );
}

export async function listPasswordBook(
  requestFn: ApiRequestFn = apiRequest,
): Promise<PasswordBookEntry[]> {
  try {
    const resp = await requestFn<PasswordBookEntry[]>('/attachment-security/password-book');
    return resp ?? [];
  } catch {
    return [];
  }
}

export async function addPasswordBookEntry(
  password: string,
  description: string | null,
  requestFn: ApiRequestFn = apiRequest,
): Promise<PasswordBookEntry> {
  return requestFn('/attachment-security/password-book', {
    method: 'POST',
    body: { password, description: description || null },
  });
}

export async function deletePasswordBookEntry(
  id: number,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await requestFn(`/attachment-security/password-book/${id}`, { method: 'DELETE' });
}

export async function getActiveContentConfig(
  direction: string,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ActiveContentConfig | null> {
  const obj = await fetchConfigSection('active_content', requestFn);
  return obj as ActiveContentConfig | null;
}

export async function saveActiveContentConfig(
  direction: string,
  config: ActiveContentConfig,
  requestFn: ApiRequestFn = apiRequest,
): Promise<void> {
  await saveConfigSection('active_content', config as unknown as Record<string, unknown>, requestFn);
}

// ---------------------------------------------------------------------------
// GT-12196：租户级附件安全配置。
//
// 上面那些 fetchConfigSection/saveConfigSection 走的是通用 /config-overrides
// （config_file=attachd.cf）—— 那是**全局键值表，没有租户维度**，所以租户管理员
// 读写会被 403，而平台管理员改一次会波及全网关。
//
// 下面这对函数走专用的租户级端点：服务端按当前租户上下文读写，读取语义是
// 租户值 → 平台默认回退（租户没配过时返回平台默认，而不是空配置——附件安全是
// 防护功能，"没配过"不能等同于"不检测"）。
//
// 覆盖范围 = 产品 2026-07-20 拍板归租户的三节：反病毒处置 / 图片识别 / 加密附件。
// 附件基础限制、密码本、扫描结果、AV 库更新仍是平台级，继续走原路径。
// ---------------------------------------------------------------------------

export interface TenantAttachmentSecuritySettings {
  tenant_id?: number;
  antivirus: {
    virus_action: string;
    timeout_action: string;
  };
  image_detect: {
    ocr_mode: string;
    ocr_max_count: number;
    qr_mode: string;
    qr_max_count: number;
    qr_light_action: string;
    qr_deep_exceed_action: string;
    qr_deep_exceed_warn: boolean;
    qr_deep_routes: Record<string, boolean>;
  };
  encrypted: {
    detect_mode: string;
    extract_password_from_body: boolean;
    extract_password_from_filename: boolean;
    use_password_book: boolean;
    recursive_detect: boolean;
    max_password_attempts: number;
    mark_suspicious: boolean;
    decrypt_fail_action: string;
  };
}

export async function getTenantAttachmentSecuritySettings(
  requestFn: ApiRequestFn = apiRequest,
): Promise<TenantAttachmentSecuritySettings> {
  return requestFn<TenantAttachmentSecuritySettings>('/attachment-security/settings');
}

// GT-12704：body 必须是**对象**，不能在这里先 JSON.stringify。
// 公共请求层 apiRequest 已经统一做一次 `JSON.stringify(options.body)`
// （webapp/src/lib/api/client.ts），这里再序列化一次就变成双重序列化 ——
// 发出去的请求体顶层是个被引号包住的字符串，后端按结构体绑定直接 400
// （json: cannot unmarshal string into Go value of type
// models.AttachmentSecurityTenantConfig），三节租户级配置全都存不下去。
export async function saveTenantAttachmentSecuritySettings(
  settings: TenantAttachmentSecuritySettings,
  requestFn: ApiRequestFn = apiRequest,
): Promise<ConfigMutationResult<TenantAttachmentSecuritySettings>> {
  return requestFn<ConfigMutationResult<TenantAttachmentSecuritySettings>>('/attachment-security/settings', {
    method: 'PUT',
    body: settings,
  });
}
