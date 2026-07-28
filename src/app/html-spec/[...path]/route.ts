import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

import { isDemoAuthBypassEnabled } from '@/lib/demo-auth-bypass';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HTML_SPEC_ROOT = resolve(process.cwd(), 'doc', 'html-spec');
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function resolveSpecFile(pathSegments: string[]): string | null {
  if (
    pathSegments.length === 0 ||
    pathSegments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }

  const filePath = resolve(HTML_SPEC_ROOT, ...pathSegments);
  return filePath.startsWith(`${HTML_SPEC_ROOT}${sep}`) ? filePath : null;
}

export async function GET(_request: Request, context: RouteContext) {
  // HTML Spec is a developer artifact. Keep both its menu entry and its files
  // behind the same explicit switch that enables the product-form dev controls.
  if (!isDemoAuthBypassEnabled(process.env.OSGATEWAY_PRODUCT_FORM_SWITCHER)) {
    return new Response('Not Found', { status: 404 });
  }

  const { path } = await context.params;
  const filePath = resolveSpecFile(path);
  if (!filePath) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const file = await readFile(filePath);
    return new Response(new Uint8Array(file), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
