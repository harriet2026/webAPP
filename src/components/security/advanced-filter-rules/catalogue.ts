import type { FieldDef } from '@/types/unified-rules';

// 54-condition catalogue for the advanced filter rules ConditionsEditor
// (layer-3-conditions.html rewrite). Field/category/envelope values are
// carried over verbatim from the legacy pre-rewrite catalogue module (already
// verified against the backend field registry) — only `panel` and `subgroup`
// are new.

export type ConditionCategory = 'mailBasic' | 'attachment' | 'security';

export type PanelKind =
  | 'text'
  | 'number'
  | 'select'
  | 'group'
  | 'featureGroup'
  | 'cidr'
  | 'time'
  | 'weekday'
  | 'mime';

export interface ConditionDef {
  key: string; // i18n + identity key
  category: ConditionCategory;
  field: string | null; // registry field, or null = catalogue-only (disabled)
  envelope?: boolean; // SMTP envelope marker for the preview
  panel: PanelKind;
  subgroup?: 'headerLayer' | 'envelopeLayer' | 'senderAttr' | 'connection' | 'contentAttr';
}

export const CONDITIONS: ConditionDef[] = [
  // --- 邮件基础信息 (19) ---
  { key: 'sender', category: 'mailBasic', field: 'from_address', panel: 'text', subgroup: 'headerLayer' },
  { key: 'recipient', category: 'mailBasic', field: 'recipient', panel: 'text', subgroup: 'headerLayer' },
  { key: 'subject', category: 'mailBasic', field: 'subject', panel: 'text', subgroup: 'headerLayer' },
  { key: 'cc', category: 'mailBasic', field: 'cc', panel: 'text', subgroup: 'headerLayer' },
  { key: 'bcc', category: 'mailBasic', field: 'bcc', panel: 'text', subgroup: 'headerLayer' },
  { key: 'body', category: 'mailBasic', field: 'content', panel: 'text', subgroup: 'contentAttr' },
  { key: 'header', category: 'mailBasic', field: 'header', panel: 'text', subgroup: 'headerLayer' },
  { key: 'envelopeSender', category: 'mailBasic', field: 'sender', envelope: true, panel: 'text', subgroup: 'envelopeLayer' },
  { key: 'envelopeRecipient', category: 'mailBasic', field: 'onercpt', envelope: true, panel: 'text', subgroup: 'envelopeLayer' },
  { key: 'senderGroup', category: 'mailBasic', field: 'sender_group', panel: 'group', subgroup: 'senderAttr' },
  { key: 'senderOrganization', category: 'mailBasic', field: null, panel: 'group', subgroup: 'senderAttr' },
  { key: 'featureGroup', category: 'mailBasic', field: 'feature_group', panel: 'featureGroup', subgroup: 'senderAttr' },
  { key: 'senderIp', category: 'mailBasic', field: 'client_ip', panel: 'cidr', subgroup: 'connection' },
  { key: 'senderIpGroup', category: 'mailBasic', field: 'sender_ip_group', panel: 'group', subgroup: 'senderAttr' },
  { key: 'geoIpCountry', category: 'mailBasic', field: 'geo_region', panel: 'group', subgroup: 'senderAttr' },
  { key: 'geoIpRegion', category: 'mailBasic', field: 'geo_region_name', panel: 'group', subgroup: 'senderAttr' },
  { key: 'keywordMatch', category: 'mailBasic', field: 'keyword_match', panel: 'text', subgroup: 'contentAttr' },
  { key: 'sendTime', category: 'mailBasic', field: 'send_time', panel: 'time' },
  { key: 'sendDayOfWeek', category: 'mailBasic', field: 'send_dow', panel: 'weekday' },

  // --- 附件相关 (13) ---
  { key: 'attachmentContent', category: 'attachment', field: 'doccontent', panel: 'text' },
  { key: 'attachmentName', category: 'attachment', field: 'attachment_names', panel: 'text' },
  { key: 'attachmentType', category: 'attachment', field: 'attachment_types', panel: 'mime' },
  { key: 'attachmentCount', category: 'attachment', field: 'attachment_count', panel: 'number' },
  { key: 'encryptedAttachment', category: 'attachment', field: 'is_encrypted_attachment', panel: 'select' },
  { key: 'attachmentMd5', category: 'attachment', field: 'attachment_md5', panel: 'text' },
  { key: 'attachmentSizeTotal', category: 'attachment', field: 'attachment_size_total', panel: 'number' },
  { key: 'attachmentSizeSingle', category: 'attachment', field: 'attachment_size_single', panel: 'number' },
  { key: 'nestedZipLevel', category: 'attachment', field: 'nested_zip_level', panel: 'number' },
  { key: 'nestedFileCount', category: 'attachment', field: 'nested_file_count', panel: 'number' },
  { key: 'imageQrCodeResult', category: 'attachment', field: 'image_qr_code_result', panel: 'select' },
  { key: 'qrCodeCount', category: 'attachment', field: 'qr_code_count', panel: 'number' },
  { key: 'attachmentZipBomb', category: 'attachment', field: 'is_zip_bomb', panel: 'select' },

  // --- 安全检测 (22) ---
  { key: 'urlCount', category: 'security', field: 'url_count', panel: 'number' },
  { key: 'url', category: 'security', field: 'urls', panel: 'text' },
  { key: 'rblResult', category: 'security', field: 'rbl', panel: 'select' },
  { key: 'urlSandboxResult', category: 'security', field: null, panel: 'select' },
  { key: 'shortLinkExpanded', category: 'security', field: null, panel: 'select' },
  { key: 'urlDomain', category: 'security', field: 'urls', panel: 'text' },
  { key: 'spfResult', category: 'security', field: 'spf_result', panel: 'select' },
  { key: 'dkimResult', category: 'security', field: 'dkim_result', panel: 'select' },
  { key: 'dmarcResult', category: 'security', field: 'dmarc_result', panel: 'select' },
  { key: 'ptrResult', category: 'security', field: 'ptr_result', panel: 'select' },
  { key: 'similarDomain', category: 'security', field: 'domain_imp', panel: 'number' },
  { key: 'displayNameSpoof', category: 'security', field: 'exec_imp', panel: 'select' },
  { key: 'mailFromEmpty', category: 'security', field: 'mailfrom_empty', panel: 'select' },
  { key: 'mailFromFromConsistency', category: 'security', field: 'envelope_header_mismatch', panel: 'select' },
  { key: 'virusScanResult', category: 'security', field: 'virus_scan_result', panel: 'select' },
  { key: 'comprehensiveEngineResult', category: 'security', field: 'cac_tag', panel: 'select' },
  { key: 'senderIpCount15Min', category: 'security', field: 'sender_ip_count_15min', panel: 'number' },
  { key: 'senderRecipientCount15Min', category: 'security', field: 'sender_recipient_count_15min', panel: 'number' },
  { key: 'senderMailCount15Min', category: 'security', field: 'sender_mail_count_15min', panel: 'number' },
  { key: 'senderMailCountDaily', category: 'security', field: 'sender_mail_count_daily', panel: 'number' },
  { key: 'senderRateLimit15', category: 'security', field: 'sender_rate_limit_15', panel: 'number' },
  { key: 'recipientCount', category: 'security', field: 'recipient_count', panel: 'number' },
];

export interface CatalogueItem {
  def: ConditionDef;
  selectable: boolean;
  reasonKey: 'catalogueOnly' | 'upcoming' | null;
}

// computeCatalogueItem decides whether a condition is selectable in the
// category tree, and if not, why ('catalogueOnly' / 'upcoming'). Unlike the
// legacy V3 helper, this has NO stage-gating parameter — the F2 rewrite
// pushes that decision to the caller/UI layer.
//
//   - field === null                              → catalogue-only (no registry field)
//   - field present but FieldDef missing/unsupported → upcoming (backend not wired yet)
//   - otherwise                                    → selectable
export function computeCatalogueItem(
  def: ConditionDef,
  fieldDefs: Record<string, FieldDef>,
): CatalogueItem {
  if (def.field === null) {
    return { def, selectable: false, reasonKey: 'catalogueOnly' };
  }
  const fd = fieldDefs[def.field];
  if (!fd || !fd.supported) {
    return { def, selectable: false, reasonKey: 'upcoming' };
  }
  return { def, selectable: true, reasonKey: null };
}
