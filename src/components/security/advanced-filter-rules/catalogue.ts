import type { FieldDef } from '@/types/unified-rules';

// 51-condition catalogue for the advanced filter rules ConditionsEditor
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

// 数值/阈值类条件的取值约束（语言无关）。unitKey 指向 i18n 单位词
// （v3Conditions.units.*）；min/max/step 同时用于 <input type="number"> 的原生
// 约束、配置说明卡的「有效范围」以及表达式预览的「超出范围」诊断。仅需要的
// 条件声明；缺省表示无额外约束。此处只放语言无关的数字/键，可翻译文案（对象
// 含义、运算符业务影响、示例、推荐配置）走 i18n 的 desc_<key> 可选子键。
// recommend：语言无关的「默认有效模板」。mode 是数值面板 5 种比较方式之一
// （与 serde.MatchMode 的数值子集一致，此处内联声明以避免 catalogue ↔ serde
// 的循环依赖），value 为对应阈值（between 时写作 "lo,hi"）。它同时驱动配置面板
// 的「应用推荐配置」按钮、数值输入框占位示例，以及说明卡自动生成的「有效示例 /
// 推荐配置」两行——因此这些可翻译文案无需为每个数值条件逐条编写。
export interface ConditionMeta {
  unitKey?: string;
  min?: number;
  max?: number;
  step?: number;
  recommend?: { mode: 'gt' | 'ge' | 'lt' | 'le' | 'between'; value: string };
}

export interface ConditionDef {
  key: string; // i18n + identity key
  category: ConditionCategory;
  field: string | null; // registry field, or null = catalogue-only (disabled)
  envelope?: boolean; // SMTP envelope marker for the preview
  panel: PanelKind;
  subgroup?: 'headerLayer' | 'envelopeLayer' | 'senderAttr' | 'connection' | 'contentAttr';
  meta?: ConditionMeta; // 数值约束 + 单位（可选，仅数值/阈值类条件声明）
}

export const CONDITIONS: ConditionDef[] = [
  // --- 邮件基础信息 (18) ---
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
  { key: 'attachmentCount', category: 'attachment', field: 'attachment_count', panel: 'number', meta: { unitKey: 'count', min: 0, max: 100, step: 1, recommend: { mode: 'ge', value: '10' } } },
  { key: 'encryptedAttachment', category: 'attachment', field: 'is_encrypted_attachment', panel: 'select' },
  { key: 'attachmentMd5', category: 'attachment', field: 'attachment_md5', panel: 'text' },
  { key: 'attachmentSizeTotal', category: 'attachment', field: 'attachment_size_total', panel: 'number', meta: { unitKey: 'mb', min: 0, max: 1024, step: 1, recommend: { mode: 'gt', value: '50' } } },
  { key: 'attachmentSizeSingle', category: 'attachment', field: 'attachment_size_single', panel: 'number', meta: { unitKey: 'mb', min: 0, max: 1024, step: 1, recommend: { mode: 'gt', value: '20' } } },
  { key: 'nestedZipLevel', category: 'attachment', field: 'nested_zip_level', panel: 'number', meta: { unitKey: 'level', min: 1, max: 20, step: 1, recommend: { mode: 'gt', value: '5' } } },
  { key: 'nestedFileCount', category: 'attachment', field: 'nested_file_count', panel: 'number', meta: { unitKey: 'count', min: 0, max: 10000, step: 1, recommend: { mode: 'gt', value: '1000' } } },
  { key: 'imageQrCodeResult', category: 'attachment', field: 'image_qr_code_result', panel: 'select' },
  { key: 'qrCodeCount', category: 'attachment', field: 'qr_code_count', panel: 'number', meta: { unitKey: 'count', min: 0, max: 100, step: 1, recommend: { mode: 'ge', value: '3' } } },
  { key: 'attachmentZipBomb', category: 'attachment', field: 'is_zip_bomb', panel: 'select' },

  // --- 安全检测 (20) ---
  { key: 'urlCount', category: 'security', field: 'url_count', panel: 'number', meta: { unitKey: 'count', min: 0, max: 1000, step: 1, recommend: { mode: 'gt', value: '20' } } },
  { key: 'url', category: 'security', field: 'urls', panel: 'text' },
  { key: 'rblResult', category: 'security', field: 'rbl', panel: 'select' },
  { key: 'urlDomain', category: 'security', field: 'urls', panel: 'text' },
  { key: 'spfResult', category: 'security', field: 'spf_result', panel: 'select' },
  { key: 'dkimResult', category: 'security', field: 'dkim_result', panel: 'select' },
  { key: 'dmarcResult', category: 'security', field: 'dmarc_result', panel: 'select' },
  { key: 'ptrResult', category: 'security', field: 'ptr_result', panel: 'select' },
  { key: 'similarDomain', category: 'security', field: 'domain_imp', panel: 'number', meta: { unitKey: 'editDistance', min: 0, max: 10, step: 1, recommend: { mode: 'le', value: '2' } } },
  { key: 'displayNameSpoof', category: 'security', field: 'exec_imp', panel: 'select' },
  { key: 'mailFromEmpty', category: 'security', field: 'mailfrom_empty', panel: 'select' },
  { key: 'mailFromFromConsistency', category: 'security', field: 'envelope_header_mismatch', panel: 'select' },
  { key: 'virusScanResult', category: 'security', field: 'virus_scan_result', panel: 'select' },
  { key: 'comprehensiveEngineResult', category: 'security', field: 'cac_tag', panel: 'select' },
  { key: 'senderIpCount15Min', category: 'security', field: 'sender_ip_count_15min', panel: 'number', meta: { unitKey: 'count', min: 0, max: 10000, step: 1, recommend: { mode: 'gt', value: '50' } } },
  { key: 'senderRecipientCount15Min', category: 'security', field: 'sender_recipient_count_15min', panel: 'number', meta: { unitKey: 'count', min: 0, max: 100000, step: 1, recommend: { mode: 'gt', value: '500' } } },
  { key: 'senderMailCount15Min', category: 'security', field: 'sender_mail_count_15min', panel: 'number', meta: { unitKey: 'count', min: 0, max: 100000, step: 1, recommend: { mode: 'gt', value: '200' } } },
  { key: 'senderMailCountDaily', category: 'security', field: 'sender_mail_count_daily', panel: 'number', meta: { unitKey: 'count', min: 0, max: 1000000, step: 1, recommend: { mode: 'gt', value: '2000' } } },
  { key: 'senderRateLimit15', category: 'security', field: 'sender_rate_limit_15', panel: 'number', meta: { unitKey: 'count', min: 0, max: 100000, step: 1, recommend: { mode: 'gt', value: '100' } } },
  { key: 'recipientCount', category: 'security', field: 'recipient_count', panel: 'number', meta: { unitKey: 'count', min: 0, max: 10000, step: 1, recommend: { mode: 'gt', value: '100' } } },
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
