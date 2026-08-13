'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// 项目未安装 @tailwindcss/typography（`prose` 类在本项目里是无样式的空类），
// 所以这里不依赖 `prose`，而是给每个 Markdown 元素显式指定 Tailwind 类，
// 只在这一个只读查看器内生效，不影响全局样式。
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-8 mb-4 text-2xl font-semibold tracking-tight text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 mb-3 border-b border-border pb-2 text-xl font-semibold text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-base font-semibold text-foreground">{children}</h3>
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

export function MarkdownSpecViewer({ title, content }: { title: string; content: string }) {
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
