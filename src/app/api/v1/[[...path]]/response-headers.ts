// 从 route.ts 拆出的响应头清洗 helper：Next 的 route 类型校验不允许 route
// 文件导出 handler 之外的符号（.next/dev/types 会红），单测又需要 import 它，
// 故独立成模块。
export function cleanResponseHeaders(backendResp: Response): Headers {
  const respHeaders = new Headers();
  backendResp.headers.forEach((value, key) => {
    // set-cookie is handled below via getSetCookie(): Headers.forEach/.set()
    // collapse repeated headers into one, which for Set-Cookie SILENTLY DROPS
    // every cookie but the last (e.g. a 2FA-verify response setting both the
    // session cookie AND the trust-device cookie would lose one of the two).
    if (!['transfer-encoding', 'content-encoding', 'set-cookie'].includes(key.toLowerCase())) {
      respHeaders.set(key, value);
    }
  });
  for (const cookie of backendResp.headers.getSetCookie()) {
    respHeaders.append('set-cookie', cookie);
  }
  return respHeaders;
}
