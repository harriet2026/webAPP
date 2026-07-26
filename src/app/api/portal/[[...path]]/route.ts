import { NextRequest } from 'next/server';

const BACKEND_URL = process.env.API_BACKEND_URL || 'http://127.0.0.1:18080';

function cleanResponseHeaders(backendResp: Response): Headers {
  const respHeaders = new Headers();
  backendResp.headers.forEach((value, key) => {
    // set-cookie is handled below via getSetCookie(): Headers.forEach/.set()
    // collapse repeated headers into one, which for Set-Cookie silently
    // drops every cookie but the last when a response sets more than one.
    if (!['transfer-encoding', 'content-encoding', 'set-cookie'].includes(key.toLowerCase())) {
      respHeaders.set(key, value);
    }
  });
  for (const cookie of backendResp.headers.getSetCookie()) {
    respHeaders.append('set-cookie', cookie);
  }
  return respHeaders;
}

function forwardClientIP(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  const xff = request.headers.get('x-forwarded-for');
  if (xff) headers['x-forwarded-for'] = xff;
  const xri = request.headers.get('x-real-ip');
  if (xri) headers['x-real-ip'] = xri;
  return headers;
}

export async function GET(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const backendPath = pathname.replace(/^\/api\/portal/, '/portal') + search;
  const target = new URL(backendPath, BACKEND_URL);

  const backendResp = await fetch(target, { headers: forwardClientIP(request), cache: 'no-store' as RequestCache });

  const contentType = backendResp.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return new Response(backendResp.body, {
      status: backendResp.status,
      headers: cleanResponseHeaders(backendResp),
    });
  }

  return new Response(backendResp.body, {
    status: backendResp.status,
    headers: cleanResponseHeaders(backendResp),
  });
}

export async function POST(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const backendPath = pathname.replace(/^\/api\/portal/, '/portal') + search;
  const target = new URL(backendPath, BACKEND_URL);

  const body = await request.text();

  const backendResp = await fetch(target, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...forwardClientIP(request) },
    cache: 'no-store' as RequestCache,
  });

  return new Response(backendResp.body, {
    status: backendResp.status,
    headers: cleanResponseHeaders(backendResp),
  });
}
