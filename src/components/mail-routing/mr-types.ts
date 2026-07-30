// 邮件路由 html_spec 对齐基建 —— 后续四个 Tab（收信域管理/转发设置/出站路由/发信认证）共享的类型与
// 校验工具。对齐 doc/html-spec/admin-forwarding/index.html §4.1 前端数据模型。

export type ProbeStatus = 'normal' | 'abnormal' | 'unchecked' | 'partial';
export type EnableStatus = 'enabled' | 'disabled';
export type TestState = 'idle' | 'loading' | 'ok' | 'fail';
export type RcptMatchType = 'contains' | 'equals' | 'regex';
export type TlsLevel = 'plain' | 'prefer' | 'force' | 'forceVerify';
export type AuthTlsMode = 'off' | 'prefer' | 'force';

/** Treat missing/legacy wire values as "not checked" instead of constructing an invalid i18n key. */
export const normalizeProbeStatus = (status: unknown): ProbeStatus => {
  switch (status) {
    case 'normal':
    case 'abnormal':
    case 'unchecked':
    case 'partial':
      return status;
    default:
      return 'unchecked';
  }
};

export const isIPv4 = (v: string) =>
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(v.trim());

export const isDomain = (v: string) =>
  /^(?=.{1,255}$)([a-zA-Z0-9](-?[a-zA-Z0-9])*\.)+[a-zA-Z]{2,}$/.test(v.trim());

export const isHostOrIp = (v: string) => isIPv4(v) || isDomain(v);

export const SYSTEM_DEFAULT_HELO = 'mail.gateway.local';
