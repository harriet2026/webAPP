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

/**
 * 认证仿冒的 proceed 允许不启用任何标记（表示纯放行），但一旦启用某种
 * 标记，其内容就必须完整填写。此处镜像后端 validateASMarkDelivery 的空值规则，
 * 让保存请求在浏览器端就被拦截。
 */
export function hasEmptyAuthSpoofingTag(config: AuthSpoofingConfig): boolean {
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
  ].some(hasEmptyEnabledTag);
}
