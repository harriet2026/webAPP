import { NextRequest } from 'next/server';
import { cleanResponseHeaders } from './response-headers';

const BACKEND_URL = process.env.API_BACKEND_URL || 'http://127.0.0.1:18080';

function forwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  // content-type MUST be forwarded for multipart/form-data: the boundary
  // parameter lives here, and without it the backend cannot parse the body.
  const passthrough = ['cookie', 'authorization', 'x-tenant-id', 'x-forwarded-for', 'x-real-ip', 'content-type'];
  request.headers.forEach((value, key) => {
    if (passthrough.includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });
  return headers;
}

export async function GET(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const backendPath = pathname + search;
  const target = new URL(backendPath, BACKEND_URL);

  const headers = forwardHeaders(request);
  const backendResp = await fetch(target, { headers, cache: 'no-store' as RequestCache });

  const isSSE = backendResp.headers.get('content-type')?.includes('text/event-stream');

  if (isSSE && backendResp.body) {
    const reader = backendResp.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch {
          controller.close();
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      status: backendResp.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  return new Response(backendResp.body, {
    status: backendResp.status,
    headers: cleanResponseHeaders(backendResp),
  });
}

export async function POST(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const backendPath = pathname + search;
  const target = new URL(backendPath, BACKEND_URL);

  const headers = forwardHeaders(request);
  // Read as arrayBuffer (not text) so multipart/form-data and other binary
  // bodies reach the backend byte-for-byte; request.text() would UTF-8
  // transcode the body and corrupt binary part data.
  const body = await request.arrayBuffer();

  const backendResp = await fetch(target, { method: 'POST', headers, body, cache: 'no-store' as RequestCache });

  return new Response(backendResp.body, {
    status: backendResp.status,
    headers: cleanResponseHeaders(backendResp),
  });
}

export async function PUT(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const backendPath = pathname + search;
  const target = new URL(backendPath, BACKEND_URL);

  const headers = forwardHeaders(request);
  const body = await request.arrayBuffer();

  const backendResp = await fetch(target, { method: 'PUT', headers, body, cache: 'no-store' as RequestCache });

  return new Response(backendResp.body, {
    status: backendResp.status,
    headers: cleanResponseHeaders(backendResp),
  });
}

export async function DELETE(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const backendPath = pathname + search;
  const target = new URL(backendPath, BACKEND_URL);

  const headers = forwardHeaders(request);

  const backendResp = await fetch(target, { method: 'DELETE', headers, cache: 'no-store' as RequestCache });

  return new Response(backendResp.body, {
    status: backendResp.status,
    headers: cleanResponseHeaders(backendResp),
  });
}
