import { readFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { notFound } from 'next/navigation';

import { isDemoAuthBypassEnabled } from '@/lib/demo-auth-bypass';
import { MarkdownSpecViewer } from './markdown-spec-viewer';

// GT-12923【0813】起，增量功能变更规格改用 Markdown 产出（md-spec-generator /
// MD-spec-PM-version 技能），与旧的 doc/html_spec-version/*.html 并行存在。
// 浏览器不能把裸 .md 文件渲染成排版好的页面，所以这里不是像 html-spec 那样
// 直出文件字节，而是服务端读文件内容后交给 MarkdownSpecViewer 客户端组件用
// react-markdown + remark-gfm 渲染（GFM 表格是这套 spec 模板的核心排版单元）。
export const dynamic = 'force-dynamic';

const MD_SPEC_VERSION_ROOT = join(
  /* turbopackIgnore: true */ process.cwd(),
  'doc',
  'md_spec-version',
);

type PageProps = {
  params: Promise<{ path: string[] }>;
};

function resolveSpecFile(pathSegments: string[]): string | null {
  if (pathSegments.length === 0) {
    return null;
  }

  // Next.js does NOT decode catch-all ([...path]) segments before handing
  // them to the page — each segment still carries its raw percent-encoding
  // (e.g. "GT-12923%E3%80%900813%E3%80%91....md"). Spec filenames routinely
  // contain full-width brackets and other non-ASCII characters, so this must
  // be decoded before it is ever used as a filesystem path, or readFile()
  // silently ENOENTs on every request (GT-12923 repro).
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
    ...decodedSegments,
  );
  return filePath.startsWith(`${MD_SPEC_VERSION_ROOT}${sep}`) ? filePath : null;
}

export default async function MarkdownSpecPage({ params }: PageProps) {
  // MD Spec 与 HTML Spec 共享同一个开发者可见性开关：入口和文件内容都只在
  // 本地/预览环境的产品形态切换器打开时才可访问。
  if (!isDemoAuthBypassEnabled(process.env.OSGATEWAY_PRODUCT_FORM_SWITCHER)) {
    notFound();
  }

  const { path } = await params;
  const filePath = resolveSpecFile(path);
  if (!filePath) {
    notFound();
  }

  let content: string;
  try {
    content = await readFile(/* turbopackIgnore: true */ filePath, 'utf-8');
  } catch {
    notFound();
  }

  const title = basename(filePath).replace(/\.md$/, '');

  return <MarkdownSpecViewer title={title} content={content} />;
}
