'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// GT-12923【0813】要求 HTML Spec 索引可以直接深链到某个需求名称（如
// GT-12931）在这份 .md 文件里的具体章节。react-markdown 默认不会给标题生成
// id（本项目未装 rehype-slug/rehype-raw，装包环境当前有网络问题，改为在这
// 个查看器内自行实现一个不依赖新包的 slug 算法），所以这里对 h1~h3 的渲染
// 结果附加一个由标题文本派生的 id，供 `#slug` 深链跳转；同一份文档内重复的
// slug 通过计数器去重。算法思路与 skill 文档约定的锚点生成规则保持一致
// （小写化、空格转短横线、保留中文字符、去除标点）。
function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    // 白名单而非黑名单：只保留字母、数字、连字符、下划线、中文/日文/韩文字符，
    // 其余任何符号（含箭头 → ← 等，之前的黑名单实现遗漏过这类符号导致锚点
    // id 与预期文本脱节）统一剔除，避免今后新增标点符号时再次出现同样的问题。
    .replace(/[^a-z0-9\-_\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7a3]/g, '');
}

function useHeadingIdFactory() {
  return useMemo(() => {
    const seen = new Map<string, number>();
    return (children: ReactNode) => {
      const base = slugify(extractText(children)) || 'section';
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}-${count}`;
    };
  }, []);
}

// 项目未安装 @tailwindcss/typography（`prose` 类在本项目里是无样式的空类），
// 所以这里不依赖 `prose`，而是给每个 Markdown 元素显式指定 Tailwind 类，
// 只在这一个只读查看器内生效，不影响全局样式。
function buildComponents(getHeadingId: (children: ReactNode) => string): Components {
  return {
    h1: ({ children }) => (
      <h1
        id={getHeadingId(children)}
        className="mt-8 mb-4 scroll-mt-20 text-2xl font-semibold tracking-tight text-foreground first:mt-0"
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        id={getHeadingId(children)}
        className="mt-8 mb-3 scroll-mt-20 border-b border-border pb-2 text-xl font-semibold text-foreground"
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 id={getHeadingId(children)} className="mt-6 mb-2 scroll-mt-20 text-base font-semibold text-foreground">
        {children}
      </h3>
    ),
    p: ({ children }) => <p className="mb-3 leading-relaxed text-sm text-foreground">{children}</p>,
    a: ({ children, href }) => (
      <a href={href} className="text-primary underline underline-offset-2 hover:text-primary/80">
        {children}
      </a>
    ),
  ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1 text-sm text-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1 text-sm text-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-border pl-4 text-sm text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    // 行内代码没有 language-* className；代码块由父级 <pre> 包裹，此处仍复用同一 code 组件。
    const isBlock = /language-/.test(className ?? '');
    return (
      <code
        className={
          isBlock
            ? 'block whitespace-pre font-mono text-xs'
            : 'rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground'
        }
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-md border border-border bg-muted/60 p-3">{children}</pre>
  ),
  hr: () => <hr className="my-6 border-border" />,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border px-3 py-2 align-top text-xs text-foreground">{children}</td>
  ),
    img: ({ src, alt }) => (
      // eslint-disable-next-line @next/next/no-img-element -- 只读 spec 查看器，图片路径为相对文档路径，非站内资产。
      <img src={typeof src === 'string' ? src : undefined} alt={alt} className="mb-2 max-w-full rounded-md border border-border" />
    ),
  };
}

export function MarkdownSpecViewer({ title, content }: { title: string; content: string }) {
  const getHeadingId = useHeadingIdFactory();
  const components = useMemo(() => buildComponents(getHeadingId), [getHeadingId]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4">
        <p className="text-xs font-medium text-muted-foreground">MD Spec</p>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </main>
    </div>
  );
}
