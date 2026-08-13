import { readdirSync } from 'fs';
import { resolve } from 'path';
import { NextResponse } from 'next/server';

/**
 * GET /api/dev/version-specs
 *
 * 返回"变更规格"下拉菜单的完整条目列表，合并扫描两个目录：
 *   - doc/html_spec-version/*.html — 早期工单产出的只读 HTML 规格
 *     （由 html-spec-PM-version 技能生成，走 /html-spec/version/* 直出）。
 *   - doc/md_spec-version/*.md — GT-12923【0813】起改用 md-spec-generator
 *     （MD-spec-PM-version 技能）生成的 Markdown 规格，走 /md-spec/version/*
 *     的渲染页面查看（浏览器不能直接把 .md 渲染成排版好的页面，需要专门的
 *     查看器，见 src/app/md-spec/version/[...path]/page.tsx）。
 *
 * 无需手动维护列表：每次在任一目录新增 spec 文件后自动出现在此入口。
 * 只在开发/预览环境使用 —— 入口本身受 OSGATEWAY_PRODUCT_FORM_SWITCHER=true 门控。
 */
type SpecEntry = { ticket: string; label: string; url: string };

function listSpecs(dirName: string, ext: string, urlPrefix: string): SpecEntry[] {
  const dir = resolve(process.cwd(), 'doc', dirName);
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    // 目录在生产构建中不存在属正常，静默返回空列表。
    return [];
  }
  return files
    .filter((f) => f.endsWith(ext))
    .map((f) => {
      const ticket = f.replace(new RegExp(`\\${ext}$`), '');
      return { ticket, label: ticket, url: `${urlPrefix}/${f}` };
    });
}

export async function GET() {
  const specs = [
    ...listSpecs('html_spec-version', '.html', '/html-spec/version'),
    ...listSpecs('md_spec-version', '.md', '/md-spec/version'),
  ].sort((a, b) => a.ticket.localeCompare(b.ticket));

  return NextResponse.json({ specs });
}
