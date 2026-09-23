import type { AuthSpoofingConfig, CheckItem } from '@/types/auth-spoofing';

type TaggableItem = Pick<
  CheckItem,
  | 'enabled'
  | 'action'
  | 'tag_subject_enabled'
  | 'tag_subject_content'
  | 'tag_header_enabled'
  | 'tag_header_name'
  | 'tag_header_value'
  | 'tag_body_enabled'
  | 'tag_body_content'
>;

function hasEmptyEnabledTag(item: TaggableItem): boolean {
  if (!item.enabled || item.action !== 'proceed') return false;

  return (
    (!!item.tag_subject_enabled && !item.tag_subject_content?.trim()) ||
    (!!item.tag_header_enabled &&
      (!item.tag_header_name?.trim() || !item.tag_header_value?.trim())) ||
    (!!item.tag_body_enabled && !item.tag_body_content?.trim())
  );
}

const AUTH_SPOOFING_HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const AUTH_SPOOFING_HEADER_NAME_MAX_LENGTH = 64;

function taggableItems(config: AuthSpoofingConfig): TaggableItem[] {
  const protocolItems = [
    ...Object.values(config.protocol_checks.spf),
    ...Object.values(config.protocol_checks.dkim),
    ...Object.values(config.protocol_checks.dmarc),
    ...Object.values(config.protocol_checks.ptr),
  ];

  return [
    ...Object.values(config.format_checks),
    ...protocolItems,
    config.similar_domain,
    config.display_name_spoof.inbound,
    config.display_name_spoof.outbound,
    config.display_name_spoof.internal,
  ];
}

/** 与后端 validateMarkDeliveryTagPolicy 的信头名称约束保持一致。 */
export function isValidAuthSpoofingHeaderName(name: string): boolean {
  return name.length > 0 &&
    name.length <= AUTH_SPOOFING_HEADER_NAME_MAX_LENGTH &&
    AUTH_SPOOFING_HEADER_NAME_PATTERN.test(name);
}

/**
 * 认证仿冒的 proceed 允许不启用任何标记（表示纯放行），但一旦启用某种
 * 标记，其内容就必须完整填写。此处镜像后端 validateASMarkDelivery 的空值规则，
 * 让保存请求在浏览器端就被拦截。
 */
export function hasEmptyAuthSpoofingTag(config: AuthSpoofingConfig): boolean {
  return taggableItems(config).some(hasEmptyEnabledTag);
}

export function hasInvalidAuthSpoofingHeaderName(config: AuthSpoofingConfig): boolean {
  return taggableItems(config).some((item) =>
    item.enabled &&
    item.action === 'proceed' &&
    !!item.tag_header_enabled &&
    !isValidAuthSpoofingHeaderName(item.tag_header_name ?? ''),
  );
}
