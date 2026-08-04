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
import type { ApiRequestFn } from './client';
import { apiRequest } from './client';

interface ConfigOverride {
  id: number;
  config_file: string;
  section_name: string;
  config_key: string;
  config_value: string;
  value_type: 'string' | 'int' | 'float' | 'bool';
  is_active: boolean;
  description: string;
}

async function fetchConfigSection(
  section: string,
  requestFn: ApiRequestFn,
): Promise<Record<string, unknown> | null> {
  try {
    const resp = await requestFn<{ total: number; page: number; limit: number; items: ConfigOverride[] }>(
      `/config-overrides?config_file=attachd.cf&section_name=${encodeURIComponent(section)}&page=1&limit=200`,
    );
    const obj: Record<string, unknown> = {};
    for (const item of resp.items ?? []) {
      if (!item.is_active) continue;
      switch (item.value_type) {
        case 'int':
          obj[item.config_key] = parseInt(item.config_value, 10);
          break;
        case 'float':
          obj[item.config_key] = parseFloat(item.config_value);
          break;
        case 'bool':
          obj[item.config_key] = item.config_value === 'true';
          break;
        default:
          obj[item.config_key] = item.config_value;
      }
    }
    return obj;
  } catch {
    return null;
  }
}

async function saveConfigSection(
  section: string,
  config: Record<string, unknown>,
  requestFn: ApiRequestFn,
): Promise<void> {
  const resp = await requestFn<{ total: number; page: number; limit: number; items: ConfigOverride[] }>(
    `/config-overrides?config_file=attachd.cf&section_name=${encodeURIComponent(section)}&page=1&limit=200`,
  );
  const existing = new Map<string, ConfigOverride>();
  // GT-12197: 该节还没有任何配置行时后端可能返回 items: null（Go nil slice）。
  // 读路径 fetchConfigSection 早有 `?? []` 兜底，这里漏了，导致保存在发出任何
  // PUT/POST 之前就抛 TypeError —— 表现为「只有 GET、无写请求、保存失败」。
  for (const item of resp.items ?? []) {
    existing.set(item.config_key, item);
  }
  for (const [key, rawValue] of Object.entries(config)) {
    let valueType: string;
    let strValue: string;
    if (typeof rawValue === 'boolean') {
      valueType = 'bool';
      strValue = String(rawValue);
    } else if (typeof rawValue === 'number') {
      valueType = Number.isInteger(rawValue) ? 'int' : 'float';
      strValue = String(rawValue);
    } else {
      valueType = 'string';
      strValue = rawValue == null ? '' : String(rawValue);
    }
    const prev = existing.get(key);
    if (prev) {
      await requestFn(`/config-overrides/${prev.id}`, {
        method: 'PUT',
        body: { config_value: strValue, value_type: valueType },
      });
    } else {
      await requestFn('/config-overrides', {
        method: 'POST',
        body: {
          config_file: 'attachd.cf',
          section_name: section,
          config_key: key,
          config_value: strValue,
          value_type: valueType,
        },
      });
    }
  }
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
  const cfg = obj as ImageDetectConfig;
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

export async function saveTenantAttachmentSecuritySettings(
  settings: TenantAttachmentSecuritySettings,
  requestFn: ApiRequestFn = apiRequest,
): Promise<TenantAttachmentSecuritySettings> {
  return requestFn<TenantAttachmentSecuritySettings>('/attachment-security/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
