import { readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';

import { isDemoAuthBypassEnabled } from '@/lib/demo-auth-bypass';

// MD Spec 文档（doc/md_spec-version/*.md）用 Markdown 图片语法引用同目录下的
// `./assets/<TICKET>/<file>.png` 截图。`/md-spec/version/[...path]` 只是一个
// 读文件内容再交给 react-markdown 渲染的 RSC 页面，本身不具备"按扩展名回传
// 二进制文件 + 正确 Content-Type"的能力，所以图片相对路径永远解析不到任何
// 真实资源（GT-12934 复检发现全文 11 张截图无一能显示）。这里补一个专门的
// 二进制直出路由，与 `/html-spec/[...path]/route.ts` 服务 doc/html-spec 静
// 态资源的做法保持同一模式；`markdown-spec-viewer.tsx` 侧把 Markdown 里的
// `./assets/...` 相对路径重写为 `/md-spec/assets/...` 指向这里。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ASSETS_ROOT = join(
  /* turbopackIgnore: true */ process.cwd(),
  'doc',
  'md_spec-version',
  'assets',
);

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function resolveAssetFile(pathSegments: string[]): string | null {
  if (pathSegments.length === 0) {
    return null;
  }

  // 与 html-spec route.ts 同样的坑：catch-all 段在到达 route handler 前不会
  // 被解码，spec 目录里的中文/全角字符（如 "GT-12923【0813】..."）必须先解码
  // 才能当文件路径用，否则 readFile() 会静默 ENOENT。
  let decodedSegments: string[];
  try {
    decodedSegments = pathSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }

  if (decodedSegments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return null;
  }

  const filePath = join(
    /* turbopackIgnore: true */ process.cwd(),
    'doc',
    'md_spec-version',
    'assets',
    ...decodedSegments,
  );
  return filePath.startsWith(`${ASSETS_ROOT}${sep}`) ? filePath : null;
}

export async function GET(_request: Request, context: RouteContext) {
  // MD Spec 是开发者工件，与 md-spec 页面本身走同一个产品形态切换开关。
  if (!isDemoAuthBypassEnabled(process.env.OSGATEWAY_PRODUCT_FORM_SWITCHER)) {
    return new Response('Not Found', { status: 404 });
  }

  const { path } = await context.params;
  const filePath = resolveAssetFile(path);
  if (!filePath) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const file = await readFile(/* turbopackIgnore: true */ filePath);
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
