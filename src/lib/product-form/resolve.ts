export type Capabilities = { ai: boolean; multiTenant: boolean; saas: boolean };
export type Viewer = 'platform' | 'tenant';

// Form → capabilities presets. Single TS source of truth, mirroring Go
// productform.presets (internal/productform/productform.go). The parity test
// (product-form-resolve-parity.test.ts) feeds these into resolve() and checks
// the output against Go-generated vectors, so any drift from Go fails CI.
export const PRESETS: Record<string, Capabilities> = {
  cloud: { ai: true, multiTenant: true, saas: true },
  'ai-multi': { ai: true, multiTenant: true, saas: false },
  'ai-single': { ai: true, multiTenant: false, saas: false },
  'legacy-multi': { ai: false, multiTenant: true, saas: false },
  'legacy-single': { ai: false, multiTenant: false, saas: false },
};

// ----------------------------------------------------------------------------
// 产品形态切换器（OSGATEWAY_PRODUCT_FORM_SWITCHER）相关常量。
// 把「形态 id 顺序 + i18n 后缀 + 品牌文案 key + cookie 名」全部内聚到这里，
// 消除切换器组件 / sidebar / middleware 各自维护映射表的耦合：
// 新增形态只需改 PRESETS + 此处的 metadata，消费方零改动。
// ----------------------------------------------------------------------------

// 会话级 UI 覆盖 cookie 名。非 HttpOnly（edge middleware 要读）；不设
// Max-Age → 浏览器窗口关闭即失效，满足「不持久化」要求。
// context.tsx 与 proxy.ts 共用此常量，避免魔法字符串重复定义。
export const FORM_OVERRIDE_COOKIE = 'osg_form_override';

// 供 UI 使用的形态元数据，cloud 在前 → 对应 spec §3.2 预设表顺序。
// i18n key 后缀 + 品牌文案 key 都在这里与 form id 绑定，单一维护点。
export interface FormMeta {
  id: string;
  /** 产品形态下拉文案的 i18n key 后缀（与 messages 的 productForm.* 对应）。 */
  i18nKey: string;
  /** 侧栏品牌文案的完整 i18n key（branding.*Name）。 */
  brandKey: string;
}

export const FORM_METADATA: FormMeta[] = [
  { id: 'cloud',        i18nKey: 'cloud',        brandKey: 'branding.cloudName' },
  { id: 'ai-multi',     i18nKey: 'aiMulti',     brandKey: 'branding.aiMultiName' },
  { id: 'ai-single',    i18nKey: 'aiSingle',    brandKey: 'branding.aiSingleName' },
  { id: 'legacy-multi', i18nKey: 'legacyMulti', brandKey: 'branding.legacyMultiName' },
  { id: 'legacy-single',i18nKey: 'legacySingle',brandKey: 'branding.legacySingleName' },
];

// 按 form id 反查元数据。未命中返回 null（合法形态 id 永远命中）。
const FORM_META_BY_ID: Record<string, FormMeta> = Object.fromEntries(
  FORM_METADATA.map((m) => [m.id, m]),
);

export function formMeta(form: string): FormMeta | null {
  return FORM_META_BY_ID[form] ?? null;
}

/** 当前形态是否为真实 preset。context / middleware 用它做覆盖值校验。 */
export function isValidForm(form: string): boolean {
  return form in PRESETS;
}

// Capabilities for a product-form string. Unknown/invalid forms fall back to
// the most-restrictive all-false set (edge gates then redirect gated routes);
// a correct deployment never hits this, since the apiserver fast-fails on an
// invalid OSG_PRODUCT_FORM (productform.ParseForm).
export function capabilitiesForForm(form: string): Capabilities {
  return PRESETS[form] ?? { ai: false, multiTenant: false, saas: false };
}

export interface FeatureDef {
  id: string;
  visibility: string;
  scope: string;
  platformAccess: string; // edit | readonly
  tenantAccess: string;   // edit | readonly | hidden | na
  platformHidden: boolean;
  grantable: boolean;
  href?: string;
}

export interface ResolvedAccess {
  visible: boolean;
  locked: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

const HIDDEN: ResolvedAccess = { visible: false, locked: false, canEdit: false, readOnly: false };

function evalVisibility(rule: string, c: Capabilities): 'show' | 'lock' | 'hide' {
  switch (rule) {
    case 'ALWAYS': return 'show';
    case 'AI_ELSE_LOCK': return c.ai ? 'show' : (c.saas ? 'lock' : 'hide');
    case 'AI_ELSE_HIDE': return c.ai ? 'show' : 'hide';
    case 'MULTI_ONLY': return c.multiTenant ? 'show' : 'hide';
    case 'SINGLE_ONLY': return !c.multiTenant ? 'show' : 'hide';
    case 'SAAS_ONLY': return c.saas ? 'show' : 'hide';
    default: return 'hide';
  }
}

// Explicit state machine; mirrors Go Resolve exactly (parity test enforces it). See spec §3.5.
export function resolve(
  f: FeatureDef,
  c: Capabilities,
  viewer: Viewer,
  grants: string[] = [],
): ResolvedAccess {
  const vis = evalVisibility(f.visibility, c);
  const locked = vis === 'lock';

  if (vis === 'hide') return HIDDEN;
  if (f.platformHidden && c.multiTenant && viewer === 'platform') return HIDDEN;
  if (f.grantable && viewer === 'tenant' && !grants.includes(f.id)) {
    return c.saas
      ? { visible: true, locked: true, canEdit: false, readOnly: false }
      : HIDDEN;
  }
  if (viewer === 'platform' || !c.multiTenant) {
    if (f.platformAccess === 'readonly') {
      return { visible: true, locked, canEdit: false, readOnly: true };
    }
    return { visible: true, locked, canEdit: !locked, readOnly: false };
  }
  switch (f.tenantAccess) {
    case 'hidden': return HIDDEN;
    case 'readonly': return { visible: true, locked, canEdit: false, readOnly: true };
    default: return { visible: true, locked, canEdit: !locked, readOnly: false };
  }
}
