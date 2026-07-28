import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import {
  capabilitiesForForm,
  FORM_OVERRIDE_COOKIE,
  isValidForm,
} from '@/lib/product-form/resolve';
import { isDemoAuthBypassEnabled } from '@/lib/demo-auth-bypass';

const intlMiddleware = createMiddleware(routing);

// Spec §8.1: proxy aligns on the authoritative HttpOnly JWT cookie
// (osgateway_token, set by the backend) rather than the client-managed
// osgateway_auth boolean flag. Middleware runs server-side and can read the
// HttpOnly cookie; this is the coarse login-state gate (existence check only,
// NOT JWT validation — validity is enforced by the backend / bootstrap authStale).
const AUTH_COOKIE = 'osgateway_token';
const LOCALES = ['zh', 'en', 'th', 'ru'];
// 无覆盖 cookie 且无环境变量时的默认形态，与 productform.DefaultForm 对齐。
const ENV_FORM = process.env.OSG_PRODUCT_FORM ?? 'ai-multi';

// 解析当前请求的生效形态：覆盖 cookie（仅当值为真实 preset 时才采纳）
// 优先于环境变量。每次请求都重新计算，因为 proxy 模块初始化
// 只执行一次，而用户切换时 cookie 会变化（无需进程重启）。
function resolveForm(request: NextRequest): string {
  const override = request.cookies.get(FORM_OVERRIDE_COOKIE)?.value;
  if (override && isValidForm(override)) return override;
  return ENV_FORM;
}

function isAuthPath(pathname: string): boolean {
  for (const locale of LOCALES) {
    const prefix = `/${locale}/login`;
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return true;
  }
  return pathname === '/login' || pathname.startsWith('/login/');
}

function isPortalPath(pathname: string): boolean {
  for (const locale of LOCALES) {
    const prefix = `/${locale}/portal`;
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return true;
  }
  return pathname === '/portal' || pathname.startsWith('/portal/');
}

function isTenantsPath(pathname: string): boolean {
  return /\/(zh|en|th|ru)\/tenants(\/|$)/.test(pathname);
}

function isAIAgentPath(pathname: string): boolean {
  return /\/(zh|en|th|ru)\/agent-center\/overview(\/|$)/.test(pathname);
}

function isLinkClicksPath(pathname: string): boolean {
  return /\/(zh|en|th|ru)\/logs\/link-clicks(\/|$)/.test(pathname);
}

// Coarse, form-level route gates enforced at the edge: redirect to /dashboard
// when the form lacks the capability. `enabled` is derived from the shared
// capability map, so adding a product form or flipping a capability needs no
// edit here. Fine-grained visibility (viewer/platformHidden/grants) is NOT done
// at the edge — that needs the full registry + viewer (spec §8.1).
// NOTE: each `match` must track the registry hrefs of that capability's
// MULTI_ONLY / AI_ELSE_* features (internal/productform/registry.go).
function buildEdgeGates(caps: ReturnType<typeof capabilitiesForForm>) {
  return [
    { enabled: !caps.multiTenant, match: isTenantsPath },
    { enabled: !caps.ai, match: isAIAgentPath },
    // link-clicks 在 registry 中是 AI_ELSE_HIDE；对传统形态拦截直接 URL 访问。
    { enabled: !caps.ai, match: isLinkClicksPath },
  ];
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Demo deployments explicitly opt into a login bypass by setting the same
  // server-side switch used to expose the product-form switcher to exactly
  // "true". Otherwise preserve the normal HttpOnly-token gate.
  // Preview: product-form switcher is always on so the preview skips login.
  const hasAuth =
    true ||
    isDemoAuthBypassEnabled(process.env.OSGATEWAY_PRODUCT_FORM_SWITCHER) ||
    !!request.cookies.get(AUTH_COOKIE)?.value;

  if (!isAuthPath(pathname) && !isPortalPath(pathname) && !hasAuth) {
    const locale = pathname.split('/')[1] || 'zh';
    if (LOCALES.includes(locale)) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
    return NextResponse.redirect(new URL('/zh/login', request.url));
  }

  // Edge gate 按请求计算，从而让切换器的覆盖 cookie 生效。
  const caps = capabilitiesForForm(resolveForm(request));
  for (const gate of buildEdgeGates(caps)) {
    if (gate.enabled && gate.match(pathname)) {
      const locale = pathname.split('/')[1] || 'zh';
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }
  }

  const rscHeader = request.headers.get('next-router-state-tree');
  const rscRequest = request.headers.get('RSC');
  const isRSCNavigation = rscRequest !== null && rscHeader !== null;

  if (isRSCNavigation) {
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

// Next.js statically analyzes `export const config` in this file at build
// time to derive the proxy matcher. It CANNOT resolve a value imported
// from another module — if this is ever extracted out again, the matcher is
// silently lost and the proxy falls back to running on EVERY request,
// including `/api/*` (which then gets redirected to /login instead of
// reaching the API route handler). Keep this an inline literal (GT-12077).
export const config = {
  // /portal/... must be matched WITHOUT a locale prefix too: the quarantine
  // digest may link to a bare /portal/... (older mails, hand-edited base URLs),
  // and without this entry next-intl never sees the request → 404. The auth gate
  // already exempts portal paths (isPortalPath), so recipients are not bounced to
  // /login. Mails sent from now on carry an explicit /<locale>/ prefix (GT-12077).
  matcher: ['/', '/(zh|en|th|ru)/:path*', '/portal/:path*'],
};
