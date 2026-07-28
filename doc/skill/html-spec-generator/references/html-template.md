# HTML Spec 模板参考

本文件是 `html-spec-generator` 技能的完整 HTML 模板。生成 html_spec 文件时，复制此模板为骨架，替换 `<...>` 占位符为实际内容。

## 完整 HTML 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><页面名称> - HTML 规格说明</title>
  <!-- Tailwind CDN（兜底 demo 组件预览区的 utility class） -->
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* ===== 设计变量（参考 demo globals.css） ===== */
    :root {
      --primary: oklch(0.52 0.226 262);
      --primary-foreground: oklch(0.985 0 0);
      --background: oklch(0.98 0.01 205);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --card-foreground: oklch(0.145 0 0);
      --muted: oklch(0.97 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --border: oklch(0.922 0 0);
      --destructive: oklch(0.577 0.245 27.325);
      --radius: 0.625rem;
      --diff-bg: oklch(0.97 0.013 25);
      --diff-border: oklch(0.65 0.2 25);
      --question-bg: oklch(0.97 0.05 95);
      --question-border: oklch(0.75 0.15 90);
      --font-sans: "Geist", "Geist Fallback", system-ui, sans-serif;
      --font-mono: "Geist Mono", "Geist Mono Fallback", monospace;
    }

    /* ===== 基础样式 ===== */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background: var(--background);
      color: var(--foreground);
      line-height: 1.6;
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* ===== 元信息头 ===== */
    .spec-header {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
    }
    .spec-header h1 {
      color: var(--primary);
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    .meta-table td {
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--border);
    }
    .meta-table td:first-child {
      font-weight: 600;
      width: 160px;
      color: var(--muted-foreground);
      white-space: nowrap;
    }

    /* ===== 组件列表（规格书头目录） ===== */
    .component-toc {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.25rem 2rem;
      margin-bottom: 2rem;
    }
    .component-toc > h2 {
      color: var(--primary);
      font-size: 1.05rem;
      margin-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.5rem;
    }
    .component-toc ul {
      list-style: none;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 0.5rem;
    }
    .component-toc li {
      padding: 0.375rem 0.75rem;
      border-radius: calc(var(--radius) - 4px);
      background: var(--muted);
      font-size: 0.875rem;
    }
    .component-toc li a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    .component-toc li a:hover {
      text-decoration: underline;
    }
    .component-toc .toc-layer-links {
      font-size: 0.75rem;
      color: var(--muted-foreground);
      margin-left: 1rem;
    }
    .component-toc .toc-layer-links a {
      color: var(--muted-foreground);
      font-weight: 400;
    }
    .component-toc .toc-badge {
      display: inline-block;
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.0625rem 0.375rem;
      border-radius: calc(var(--radius) - 4px);
      background: var(--primary);
      color: var(--primary-foreground);
      white-space: nowrap;
    }

    /* ===== 章节通用 ===== */
    section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem 2rem;
      margin-bottom: 1.5rem;
    }
    section > h2 {
      color: var(--primary);
      border-bottom: 2px solid var(--primary);
      padding-bottom: 0.5rem;
      margin-bottom: 1.25rem;
      font-size: 1.25rem;
    }
    h3 {
      font-size: 1.05rem;
      margin: 1rem 0 0.75rem;
      color: var(--foreground);
    }
    h4 {
      font-size: 0.95rem;
      margin: 0.75rem 0 0.5rem;
      color: var(--muted-foreground);
    }

    /* ===== 表格 ===== */
    table.spec-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      margin: 1rem 0;
    }
    table.spec-table th {
      background: var(--muted);
      color: var(--foreground);
      font-weight: 600;
      text-align: left;
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--border);
      white-space: nowrap;
    }
    table.spec-table td {
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--border);
      vertical-align: top;
    }
    table.spec-table tr:nth-child(even) td {
      background: var(--muted);
    }

    /* ===== 截图 ===== */
    .screenshot-figure {
      margin: 1rem 0;
      text-align: center;
    }
    .screenshot-figure img {
      max-width: 100%;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 2px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .screenshot-figure figcaption {
      margin-top: 0.5rem;
      font-size: 0.8125rem;
      color: var(--muted-foreground);
    }

    /* ===== 组件规格卡片 ===== */
    .component-spec {
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 2px);
      padding: 1rem 1.25rem;
      margin: 1rem 0;
      background: var(--card);
    }
    .component-spec > h3 {
      color: var(--primary);
      border-left: 4px solid var(--primary);
      padding-left: 0.75rem;
    }

    /* ===== 代码块 ===== */
    pre {
      background: var(--muted);
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 4px);
      padding: 1rem;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      line-height: 1.5;
      margin: 1rem 0;
    }
    code {
      font-family: var(--font-mono);
      font-size: 0.85em;
    }

    /* ===== Mermaid 容器 ===== */
    .mermaid {
      text-align: center;
      margin: 1rem 0;
      padding: 1rem;
      background: var(--muted);
      border-radius: calc(var(--radius) - 2px);
    }

    /* ===== 差异标注 ===== */
    .diff-section {
      border-left: 4px solid var(--diff-border);
      background: var(--diff-bg);
    }
    .diff-section > h2 {
      color: var(--diff-border);
      border-bottom-color: var(--diff-border);
    }
    .diff-badge {
      display: inline-block;
      background: var(--diff-border);
      color: var(--primary-foreground);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: calc(var(--radius) - 4px);
      margin-right: 0.5rem;
    }

    /* ===== 需确认事项 ===== */
    .question-section {
      border-left: 4px solid var(--question-border);
      background: var(--question-bg);
    }
    .question-section > h2 {
      color: var(--question-border);
      border-bottom-color: var(--question-border);
    }

    /* ===== 徽标 ===== */
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: calc(var(--radius) - 4px);
    }
    .badge-high { background: oklch(0.65 0.2 25); color: white; }
    .badge-medium { background: oklch(0.75 0.15 90); color: var(--foreground); }
    .badge-low { background: oklch(0.85 0.05 150); color: var(--foreground); }

    /* ===== 引用块 ===== */
    blockquote {
      border-left: 4px solid var(--destructive);
      background: var(--diff-bg);
      padding: 0.75rem 1rem;
      margin: 1rem 0;
      font-size: 0.875rem;
      border-radius: 0 calc(var(--radius) - 4px) calc(var(--radius) - 4px) 0;
    }

    /* ===== 可交互组件 HTML 预览区 ===== */
    .component-preview {
      border: 2px dashed var(--primary);
      border-radius: var(--radius);
      padding: 1.5rem;
      margin: 1rem 0;
      background: var(--background);
      position: relative;
      overflow: auto;
    }
    .component-preview::before {
      content: "🖥 可交互组件预览（从 demo 提取的实际 HTML+CSS）";
      position: absolute;
      top: -0.625rem;
      left: 0.75rem;
      background: var(--primary);
      color: var(--primary-foreground);
      font-size: 0.6875rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: calc(var(--radius) - 4px);
      white-space: nowrap;
    }
    /* 预览区内嵌的 demo 元素重置，避免被 spec 文档样式污染 */
    .component-preview * {
      box-sizing: border-box;
    }

    /* ===== 交互层级块 ===== */
    .interaction-layer {
      border: 1px solid var(--border);
      border-left: 4px solid var(--primary);
      border-radius: calc(var(--radius) - 2px);
      padding: 1rem 1.25rem;
      margin: 1.5rem 0;
      background: var(--card);
    }
    .interaction-layer > h4 {
      color: var(--primary);
      font-size: 0.95rem;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .layer-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      background: var(--primary);
      color: var(--primary-foreground);
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .trigger-path {
      background: var(--muted);
      border-radius: calc(var(--radius) - 4px);
      padding: 0.5rem 0.75rem;
      margin: 0.5rem 0 1rem;
      font-size: 0.8125rem;
      color: var(--muted-foreground);
    }
    .trigger-path strong {
      color: var(--foreground);
    }

    /* ===== DOM 树比对结果表 ===== */
    .dom-comparison {
      margin: 1rem 0;
      border: 1px solid var(--border);
      border-radius: calc(var(--radius) - 4px);
      overflow: hidden;
    }
    .dom-comparison > h5 {
      background: var(--muted);
      padding: 0.5rem 0.75rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--foreground);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    .dom-comparison > h5::before {
      content: "🔍";
      font-size: 0.875rem;
    }
    .dom-comparison table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
    }
    .dom-comparison th {
      background: var(--muted);
      font-weight: 600;
      text-align: left;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--border);
    }
    .dom-comparison td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .dom-comparison tr:last-child td {
      border-bottom: none;
    }
    .dom-pass { color: oklch(0.5 0.15 150); font-weight: 600; }
    .dom-fail { color: var(--destructive); font-weight: 600; }
    .dom-fixed { color: oklch(0.6 0.15 90); font-weight: 600; }

    /* ===== 层级超链接索引表 ===== */
    table.layer-index {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      margin: 1rem 0;
    }
    table.layer-index th {
      background: var(--muted);
      font-weight: 600;
      text-align: left;
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--border);
    }
    table.layer-index td {
      padding: 0.625rem 0.75rem;
      border: 1px solid var(--border);
      vertical-align: top;
    }
    table.layer-index td a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 600;
    }
    table.layer-index td a:hover {
      text-decoration: underline;
    }

    /* ===== 子文件返回导航 ===== */
    .layer-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1.25rem;
      background: var(--muted);
      border-radius: var(--radius);
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }
    .layer-nav a {
      color: var(--primary);
      text-decoration: none;
      font-weight: 600;
    }
    .layer-nav a:hover {
      text-decoration: underline;
    }

    /* ===== 版本历史 / 规格版本 ===== */
    .version-history-section { margin: 1.5rem 0; }
    .version-history-table td:nth-child(5) { color: var(--muted-foreground, #64748b); }
    .spec-version { font-weight: 600; color: oklch(0.52 0.226 262); }
  </style>
</head>
<body>

<!-- ========== 0. 元信息头 ========== -->
<header class="spec-header">
  <h1><页面名称> 详细产品规格说明</h1>
  <table class="meta-table">
    <tr><td>spec 源</td><td><code>design/origin/spec/&lt;对应spec文件&gt;</code></td></tr>
    <tr><td>demo 源</td><td><code>design/origin/demo/app/&lt;页面路径&gt;/page.tsx</code> -&gt; <code>components/&lt;对应组件目录&gt;/</code></td></tr>
    <tr><td>覆盖 spec 章节</td><td>§X-§Y（全量/部分）</td></tr>
    <tr><td>遵循约束</td><td><code>design/origin/implement.md</code></td></tr>
    <tr><td>页面名称</td><td>&lt;从 spec/demo 提取&gt;</td></tr>
    <tr><td>路由路径</td><td>&lt;demo 路由，如 /email-handling/disposal-center&gt;</td></tr>
    <tr><td>组件入口</td><td>&lt;demo 组件路径，如 EmailDisposalCenterPage&gt;</td></tr>
    <tr><td>i18n 标题 key</td><td>&lt;如 nav.emailDisposalCenter&gt;</td></tr>
    <tr><td>导航层级</td><td>&lt;如 邮件处置 &gt; 邮件处置中心&gt;</td></tr>
    <tr><td>权限矩阵</td><td>&lt;引用 spec §0 矩阵或直接内联&gt;</td></tr>
    <!-- 版本字段：来自该模块 version.json 最新一条 history 记录；规格版本用 current_version 渲染 -->
    <tr><td>规格版本</td><td><span class="spec-version">v2</span></td></tr>
    <tr><td>生成日期</td><td>2026-07-13</td></tr>
    <tr><td>demo 源 commit</td><td><code>f98e029</code></td></tr>
    <tr><td>spec 源 commit</td><td><code>8db3a98</code></td></tr>
  </table>
</header>

<!-- ========== 0.1 组件列表（规格书头目录） ========== -->
<!-- 列出本规格书涵盖的全部组件，含交互层级数，多层交互的层级 1+ 子文件也列出超链接 -->
<nav class="component-toc">
  <h2>📋 组件列表（点击跳转）</h2>
  <ul>
    <li>
      <a href="#component-2-1">2.1 查询筛选区 SearchFilters</a>
      <span class="toc-badge">1层</span>
    </li>
    <li>
      <a href="#component-2-2">2.2 数据表格 MailListTable</a>
      <span class="toc-badge">3层</span>
      <span class="toc-layer-links">
        <a href="./layer-1-edit-dialog.html">层级1</a>
        <a href="./layer-2-form-linked.html">层级2</a>
      </span>
    </li>
    <li>
      <a href="#component-2-3">2.3 分页器 Pagination</a>
      <span class="toc-badge">1层</span>
    </li>
    <li>
      <a href="#dialog-3-1">3.1 放行确认弹窗</a>
      <span class="toc-badge">2层</span>
      <span class="toc-layer-links">
        <a href="./layer-1-release-confirm.html">层级1</a>
      </span>
    </li>
    <!-- 更多组件... -->
  </ul>
</nav>

<!-- ========== 0.2 版本历史 ========== -->
<!-- 0.2 版本历史（从 version.json 的 history 渲染，最新在上） -->
<section id="version-history" class="version-history-section">
  <h2>🕑 版本历史</h2>
  <table class="version-history-table spec-table">
    <thead>
      <tr><th>版本</th><th>生成日期</th><th>demo commit</th><th>spec commit</th><th>变更摘要</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>v2</td><td>2026-07-13</td>
        <td><code>f98e029</code></td><td><code>8db3a98</code></td>
        <td>抽屉表单校验规则变更；动作下拉新增"仅记录"</td>
      </tr>
      <tr>
        <td>v1</td><td>2026-07-01</td>
        <td><code>804efb9</code></td><td><code>8db3a98</code></td>
        <td>初版：IP 黑白名单、抽屉表单、动作下拉</td>
      </tr>
    </tbody>
  </table>
</section>

<!-- ========== 1. 页面布局结构 ========== -->
<section id="layout">
  <h2>1. 页面布局结构</h2>

  <h3>1.1 区域划分</h3>
  <table class="spec-table">
    <thead>
      <tr>
        <th>区域</th><th>名称</th><th>元素概览</th><th>尺寸</th><th>响应式</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>A区</td><td>页面标题区</td><td>&lt;标题 + 描述&gt;</td>
        <td>h-14 (56px)</td><td>全断点固定</td>
      </tr>
      <tr>
        <td>B区</td><td>查询筛选区</td><td>&lt;关键字 + 下拉 + 日期&gt;</td>
        <td>自适应</td><td>sm:单行 xl:折行</td>
      </tr>
      <!-- 更多区域... -->
    </tbody>
  </table>

  <h3>1.2 整页默认态截图</h3>
  <figure class="screenshot-figure">
    <img src="./screenshots/page-full-default.png" alt="整页默认态">
    <figcaption>整页默认态截图（浏览器实际渲染）</figcaption>
  </figure>

  <h3>1.3 视觉规范</h3>
  <table class="spec-table">
    <thead><tr><th>属性</th><th>值</th><th>来源</th></tr></thead>
    <tbody>
      <tr><td>主色</td><td><code>oklch(0.52 0.226 262)</code>（紫蓝）</td><td>demo globals.css --primary</td></tr>
      <tr><td>圆角</td><td><code>0.625rem</code>（--radius）</td><td>demo globals.css</td></tr>
      <tr><td>字体</td><td>Geist / Geist Fallback</td><td>demo globals.css --font-sans</td></tr>
      <tr><td>图标库</td><td>lucide-react，16/20px</td><td>demo 组件 import</td></tr>
      <!-- 更多... -->
    </tbody>
  </table>
</section>

<!-- ========== 2. 逐组件规格 ========== -->
<section id="components">
  <h2>2. 逐组件规格</h2>

  <!-- ===== 组件 1：单层交互示例 ===== -->
  <article class="component-spec">
    <h3>2.1 &lt;组件名，如：查询筛选区 SearchFilters&gt;</h3>

    <h4>组件元信息</h4>
    <table class="spec-table">
      <tbody>
        <tr><td>demo 组件路径</td><td><code>components/xxx/yyy.tsx</code></td></tr>
        <tr><td>Props 接口</td><td><code>&lt;列出 Props 类型定义&gt;</code></td></tr>
        <tr><td>状态管理</td><td>&lt;useState/useMemo/Context 等&gt;</td></tr>
        <tr><td>交互层级数</td><td>1 层（无嵌套交互）</td></tr>
      </tbody>
    </table>

    <!-- ===== 交互层级 0：初始态 ===== -->
    <div class="interaction-layer">
      <h4><span class="layer-badge">0</span> 交互层级 0：初始态（默认渲染）</h4>
      <div class="trigger-path"><strong>触发路径</strong>：页面加载即渲染，无需交互</div>

      <!-- 可交互组件 HTML 预览（从 demo 提取的实际 HTML+CSS） -->
      <div class="component-preview">
        &lt;!-- 此处嵌入从 demo 页面提取的组件 outerHTML + computed style --&gt;
        &lt;!-- 提取方法：run_playwright_code page.evaluate(el =&gt; el.outerHTML, selector) --&gt;
        &lt;!-- 保留 demo 的 Tailwind class，spec 文档内嵌 Tailwind CDN 兜底 --&gt;
      </div>

      <figure class="screenshot-figure">
        <img src="./screenshots/query-filters-default.png" alt="查询筛选区初始态">
        <figcaption>层级 0 截图（浏览器实际渲染）</figcaption>
      </figure>

      <table class="spec-table">
        <thead>
          <tr>
            <th>序号</th><th>元素类型</th><th>文案/标签</th><th>图标</th>
            <th>占位符/默认值</th><th>校验规则</th><th>禁用条件</th>
            <th>交互行为</th><th>i18n key</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td><td>Input(text)</td><td>-</td><td>Search(16px)</td>
            <td>"搜索..."</td><td>去空格&gt;256截断</td><td>无</td>
            <td>输入后回车触发查询</td><td>search.keyword</td>
          </tr>
          <tr>
            <td>2</td><td>Select(多选)</td><td>"邮件状态"</td><td>-</td>
            <td>全选</td><td>-</td><td>无</td>
            <td>选中后立即过滤</td><td>filter.mailStatus</td>
          </tr>
          <!-- 更多元素... -->
        </tbody>
      </table>
    </div>

    <h4>数据与交互流</h4>
    <div class="mermaid">
graph TD
    A[用户输入] --> B[组件 State]
    B --> C{校验}
    C -->|通过| D[调用父组件回调]
    C -->|失败| E[显示错误提示]
    D --> F[父组件触发 API 查询]
    </div>
  </article>

  <!-- ===== 组件 2：多层交互示例（表格 -> 编辑弹窗 -> 表单联动） ===== -->
  <!-- 多层交互：层级 0 内嵌，层级 1+ 拆分为子文件，主文件放超链接索引表 -->
  <article class="component-spec" id="component-2-2">
    <h3>2.2 &lt;组件名，如：数据表格 MailListTable（多层交互）&gt;</h3>

    <h4>组件元信息</h4>
    <table class="spec-table">
      <tbody>
        <tr><td>demo 组件路径</td><td><code>components/xxx/yyy.tsx</code></td></tr>
        <tr><td>Props 接口</td><td><code>&lt;列出 Props 类型定义&gt;</code></td></tr>
        <tr><td>状态管理</td><td>&lt;useState/useMemo/Context 等&gt;</td></tr>
        <tr><td>交互层级数</td><td>3 层（表格初始态 -&gt; 编辑弹窗 -&gt; 表单联动）</td></tr>
        <tr><td>拆分策略</td><td>层级 0 内嵌本文件；层级 1、2 拆分为独立子文件</td></tr>
      </tbody>
    </table>

    <!-- 交互层级关系总览 -->
    <h4>交互层级关系图</h4>
    <div class="mermaid">
graph LR
    L0["层级0: 表格初始态"] -->|点击'编辑'按钮| L1["层级1: 编辑弹窗打开"]
    L1 -->|选择'规则类型'| L2["层级2: 表单联动渲染"]
    L2 -->|提交| L0
    L1 -->|取消/ESC| L0
    </div>

    <!-- ===== 交互层级 0：表格初始态（内嵌在主文件） ===== -->
    <div class="interaction-layer">
      <h4><span class="layer-badge">0</span> 交互层级 0：表格初始态（默认渲染）</h4>
      <div class="trigger-path"><strong>触发路径</strong>：页面加载即渲染，无需交互</div>

      <div class="component-preview">
        &lt;!-- 嵌入从 demo 提取的表格 HTML+CSS --&gt;
      </div>

      <figure class="screenshot-figure">
        <img src="./screenshots/table-layer-0-default.png" alt="表格初始态">
        <figcaption>层级 0 截图（浏览器实际渲染）</figcaption>
      </figure>

      <h4>表格列定义</h4>
      <table class="spec-table">
        <thead>
          <tr>
            <th>列序</th><th>列名</th><th>字段名</th><th>数据类型</th>
            <th>宽度</th><th>对齐</th><th>排序</th><th>渲染规则</th><th>i18n key</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td><td>复选框</td><td>-</td><td>-</td>
            <td>40px</td><td>center</td><td>否</td><td>Checkbox</td><td>-</td>
          </tr>
          <tr>
            <td>2</td><td>时间</td><td>time</td><td>datetime</td>
            <td>160px</td><td>left</td><td>是</td><td>YYYY-MM-DD HH:mm</td><td>col.time</td>
          </tr>
          <!-- 更多列... -->
        </tbody>
      </table>

      <h4>行操作（触发层级 1 的入口）</h4>
      <table class="spec-table">
        <thead><tr><th>操作名</th><th>图标</th><th>触发条件</th><th>交互行为</th><th>跳转层级</th><th>i18n key</th></tr></thead>
        <tbody>
          <tr><td>查看</td><td>Eye(16px)</td><td>任意状态</td><td>打开右侧详情抽屉</td><td>-&gt; 层级1</td><td>btn.view</td></tr>
          <tr><td>编辑</td><td>Pencil(16px)</td><td>非系统预置</td><td>打开编辑弹窗</td><td>-&gt; 层级1</td><td>btn.edit</td></tr>
        </tbody>
      </table>

      <!-- DOM 树比对结果表 -->
      <div class="dom-comparison">
        <h5>DOM 树比对结果</h5>
        <table>
          <thead><tr><th>比对项</th><th>demo 实际 DOM</th><th>提取的 HTML</th><th>是否一致</th></tr></thead>
          <tbody>
            <tr><td>根节点</td><td>div.rounded-lg.border</td><td>div.rounded-lg.border</td><td class="dom-pass">✅</td></tr>
            <tr><td>表格行数</td><td>5</td><td>5</td><td class="dom-pass">✅</td></tr>
            <!-- 更多比对项... -->
          </tbody>
        </table>
      </div>
    </div>

    <!-- ===== 交互层级 1+：拆分为子文件，主文件放超链接索引表 ===== -->
    <h4>交互层级详情（层级 1+ 拆分为独立文件）</h4>
    <table class="layer-index">
      <thead>
        <tr><th>层级</th><th>名称</th><th>触发路径</th><th>详情链接</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>0</td><td>表格初始态</td><td>页面加载</td>
          <td>上方内嵌</td>
        </tr>
        <tr>
          <td>1</td><td>编辑弹窗打开</td>
          <td>点击"编辑"按钮 -&gt; onClick 打开 Dialog</td>
          <td><a href="./layer-1-edit-dialog.html">查看详情 -&gt;</a></td>
        </tr>
        <tr>
          <td>2</td><td>表单联动渲染</td>
          <td>选择"规则类型" -&gt; onChange 条件渲染</td>
          <td><a href="./layer-2-form-linked.html">查看详情 -&gt;</a></td>
        </tr>
      </tbody>
    </table>
  </article>
</section>

<!-- ========== 3. 弹窗/抽屉/对话框规格 ========== -->
<section id="dialogs">
  <h2>3. 弹窗/抽屉/对话框规格</h2>

  <article class="component-spec">
    <h3>3.1 &lt;弹窗名，如：放行确认弹窗&gt;</h3>

    <!-- 弹窗也按交互层级拆分（如果弹窗内有多步交互） -->
    <div class="interaction-layer">
      <h4><span class="layer-badge">0</span> 弹窗打开态</h4>
      <div class="trigger-path"><strong>触发路径</strong>：点击"放行"按钮</div>

      <div class="component-preview">
        &lt;!-- 嵌入从 demo 提取的弹窗 HTML+CSS --&gt;
      </div>

      <figure class="screenshot-figure">
        <img src="./screenshots/release-dialog-open.png" alt="放行确认弹窗打开态">
        <figcaption>弹窗打开态截图（浏览器实际渲染）</figcaption>
      </figure>

    <table class="spec-table">
      <tbody>
        <tr><td>触发条件</td><td>点击"放行"按钮</td></tr>
        <tr><td>形态</td><td>居中弹窗 / 右侧抽屉</td></tr>
        <tr><td>尺寸</td><td>w-[480px]</td></tr>
        <tr><td>关闭方式</td><td>取消/确认/ESC/点击遮罩</td></tr>
        <tr><td>demo 组件</td><td><code>components/xxx/yyy-dialog.tsx</code></td></tr>
      </tbody>
    </table>

    <h4>UI 元素</h4>
    <table class="spec-table">
      <thead><tr><th>序号</th><th>元素类型</th><th>文案</th><th>默认值</th><th>校验</th><th>交互</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Select</td><td>"改判邮件类型"</td><td>"正常邮件"</td><td>11类枚举</td><td>选择后携带 finalType</td></tr>
        <tr><td>2</td><td>Button</td><td>"取消"</td><td>-</td><td>-</td><td>关闭弹窗</td></tr>
        <tr><td>3</td><td>Button</td><td>"确认"</td><td>-</td><td>-</td><td>提交处置动作</td></tr>
      </tbody>
    </table>
  </article>
</section>

<!-- ========== 4. 数据模型与 API 映射 ========== -->
<section id="api-mapping">
  <h2>4. 数据模型与 API 映射</h2>

  <h3>4.1 前端数据模型</h3>
  <pre><code>interface LogItem {
  id: string
  tid: string
  // ...从 demo 代码原样提取
}</code></pre>

  <h3>4.2 spec 定义的 API</h3>
  <table class="spec-table">
    <thead><tr><th>接口</th><th>方法</th><th>路径</th><th>说明</th><th>spec 章节</th></tr></thead>
    <tbody>
      <tr><td>列表查询</td><td>GET</td><td>/api/v1/disposal/mails</td><td>分页查询处置记录</td><td>§5.4</td></tr>
      <!-- 更多... -->
    </tbody>
  </table>

  <h3>4.3 网关现有 API 映射</h3>
  <blockquote>
    ⚠️ 遵循 implement.md：spec 定义的 API 不一定直接实现。如需新增 API，标注 <code>[需确认]</code>。
  </blockquote>
  <table class="spec-table">
    <thead><tr><th>spec API</th><th>网关现有 API</th><th>映射方式</th><th>备注</th></tr></thead>
    <tbody>
      <tr><td>GET /api/v1/disposal/mails</td><td>GET /api/v1/mail-logs</td><td>字段映射</td><td>demo 模型-&gt;网关模型</td></tr>
      <tr><td>POST /api/v1/disposal/mails/actions</td><td>[需确认] 新增</td><td>-</td><td>spec 要求批量改判，现有 API 不支持</td></tr>
    </tbody>
  </table>

  <h3>4.4 数据库表映射</h3>
  <table class="spec-table">
    <thead><tr><th>spec 表</th><th>网关现有表</th><th>字段映射</th><th>备注</th></tr></thead>
    <tbody>
      <tr><td>disposal_mail_log</td><td>mail_log</td><td>tid-&gt;tid, mail_type-&gt;email_type</td><td>命名差异</td></tr>
    </tbody>
  </table>
</section>

<!-- ========== 5. 业务逻辑规格 ========== -->
<section id="business-logic">
  <h2>5. 业务逻辑规格</h2>

  <h3>5.1 状态机</h3>
  <div class="mermaid">
stateDiagram-v2
    [*] --> Quarantined
    Quarantined --> Delivered: release
    Delivered --> Recalled: recall
    Recalled --> [*]
  </div>

  <h3>5.2 状态转换规则</h3>
  <table class="spec-table">
    <thead><tr><th>当前状态</th><th>允许的动作</th><th>目标状态</th><th>前置条件</th><th>来源</th></tr></thead>
    <tbody>
      <tr><td>quarantined</td><td>release</td><td>delivered</td><td>管理员有权限</td><td>spec §1.3</td></tr>
      <tr><td>delivered</td><td>recall</td><td>recalled</td><td>选中≤10封</td><td>spec §3.4</td></tr>
    </tbody>
  </table>

  <h3>5.3 权限与可见性</h3>
  <p>&lt;引用 spec §0 矩阵 + demo 代码中的 useProductProfile() 实际控制逻辑&gt;</p>

  <h3>5.4 关键业务约束</h3>
  <table class="spec-table">
    <thead><tr><th>约束</th><th>值</th><th>来源</th></tr></thead>
    <tbody>
      <tr><td>批量放行上限</td><td>500 封</td><td>spec §3.2</td></tr>
      <!-- 更多... -->
    </tbody>
  </table>
</section>

<!-- ========== 6. 交互规格 ========== -->
<section id="interaction">
  <h2>6. 交互规格</h2>

  <h3>6.1 状态变化规则</h3>
  <table class="spec-table">
    <thead><tr><th>状态</th><th>触发条件</th><th>页面表现</th><th>用户反馈</th><th>恢复方式</th></tr></thead>
    <tbody>
      <tr><td>加载</td><td>查询/翻页</td><td>骨架屏</td><td>按钮禁用</td><td>数据返回恢复</td></tr>
    </tbody>
  </table>

  <h3>6.2 Tooltip 规格</h3>
  <table class="spec-table">
    <thead><tr><th>字段</th><th>所在位置</th><th>文案</th><th>触发方式</th><th>最大宽度</th></tr></thead>
    <tbody>
      <!-- 从 spec §3.1 + demo 代码 + 浏览器 hover 验证提取 -->
    </tbody>
  </table>

  <h3>6.3 异常场景</h3>
  <table class="spec-table">
    <thead><tr><th>场景</th><th>触发条件</th><th>页面表现</th><th>来源</th></tr></thead>
    <tbody>
      <!-- 从 spec §4 提取 -->
    </tbody>
  </table>
</section>

<!-- ========== 7. 国际化规格 ========== -->
<section id="i18n">
  <h2>7. 国际化规格</h2>

  <h3>7.1 支持语言</h3>
  <table class="spec-table">
    <thead><tr><th>语言</th><th>locale</th><th>示例</th></tr></thead>
    <tbody>
      <tr><td>简体中文</td><td>zh-CN</td><td>邮件处置中心</td></tr>
      <tr><td>English</td><td>en-US</td><td>Email Disposal Center</td></tr>
      <tr><td>泰文</td><td>th-TH</td><td>ศูนย์จัดการอีเมล</td></tr>
      <tr><td>&lt;第四语言&gt;</td><td>&lt;locale&gt;</td><td>...</td></tr>
    </tbody>
  </table>

  <h3>7.2 i18n key 清单</h3>
  <table class="spec-table">
    <thead><tr><th>i18n key</th><th>中文文案</th><th>使用位置</th></tr></thead>
    <tbody>
      <tr><td>nav.emailDisposalCenter</td><td>邮件处置中心</td><td>侧边栏</td></tr>
      <tr><td>btn.release</td><td>放行</td><td>批量操作区</td></tr>
      <!-- 更多... -->
    </tbody>
  </table>
</section>

<!-- ========== 8. 响应式规格 ========== -->
<section id="responsive">
  <h2>8. 响应式规格</h2>

  <table class="spec-table">
    <thead><tr><th>断点</th><th>表格表现</th><th>筛选区表现</th><th>详情抽屉</th></tr></thead>
    <tbody>
      <tr><td>≥1920px</td><td>列全展示</td><td>单行</td><td>80% 宽</td></tr>
      <tr><td>1366-1919px</td><td>列全展示</td><td>可折行</td><td>80% 宽</td></tr>
      <tr><td>1024-1365px</td><td>次要列可隐藏</td><td>折行</td><td>80% 宽</td></tr>
      <tr><td>&lt;1024px</td><td>横向滚动</td><td>折行</td><td>100% 宽</td></tr>
    </tbody>
  </table>

  <figure class="screenshot-figure">
    <img src="./screenshots/responsive-1920px.png" alt="1920px 响应式">
    <figcaption>1920px 断点截图</figcaption>
  </figure>
  <figure class="screenshot-figure">
    <img src="./screenshots/responsive-1024px.png" alt="1024px 响应式">
    <figcaption>1024px 断点截图</figcaption>
  </figure>
</section>

<!-- ========== 9. 与 spec 的差异标注 ========== -->
<section id="diffs" class="diff-section">
  <h2>9. 与 spec 的差异标注</h2>
  <table class="spec-table">
    <thead>
      <tr>
        <th>差异编号</th><th>位置</th><th>spec 描述</th><th>demo 实现</th>
        <th>影响评估</th><th>建议</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><span class="diff-badge">D-001</span></td>
        <td>§2.2 D区</td>
        <td>spec 说"相似度"列默认显示</td>
        <td>demo 中相似度列默认隐藏</td>
        <td><span class="badge badge-low">低</span></td>
        <td>以 demo 为准</td>
      </tr>
      <tr>
        <td><span class="diff-badge">D-002</span></td>
        <td>§3.2</td>
        <td>spec 说召回上限10封</td>
        <td>demo 中无上限校验</td>
        <td><span class="badge badge-high">高</span></td>
        <td>需在实现时补上</td>
      </tr>
    </tbody>
  </table>
</section>

<!-- ========== 10. 需确认事项 ========== -->
<section id="questions" class="question-section">
  <h2>10. 需确认事项</h2>
  <blockquote>
    遵循 implement.md：冲突/新增 API/底层不支持的事项，列在此处待用户确认，不自行决定。
  </blockquote>
  <table class="spec-table">
    <thead><tr><th>编号</th><th>事项</th><th>类型</th><th>说明</th></tr></thead>
    <tbody>
      <tr>
        <td>Q-001</td>
        <td>批量改判 API</td>
        <td><span class="badge badge-medium">新增 API</span></td>
        <td>spec 要求批量改判，网关现有 API 仅支持单条</td>
      </tr>
    </tbody>
  </table>
</section>

<!-- ========== Mermaid 渲染 ========== -->
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<script>
  mermaid.initialize({ startOnLoad: true, theme: 'default' });
</script>

</body>
</html>
```

## 交互层级子文件模板

多层交互的层级 1+ 拆分为独立 HTML 子文件。每个子文件包含：返回导航、层级元信息、HTML 预览、截图、元素表、DOM 树比对结果表。子文件与主文件同在 `<模块名>/` 子目录下，共享同一套 CSS（内嵌或引用共享 `../assets/spec-style.css`）。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>层级 &lt;N&gt;：&lt;层级名称&gt; - &lt;页面名称&gt; HTML 规格说明</title>
  <!-- Tailwind CDN（兜底 demo 组件预览区的 utility class） -->
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* ===== 同主文件样式（或引用共享 ../assets/spec-style.css） ===== */
    :root {
      --primary: oklch(0.52 0.226 262);
      --primary-foreground: oklch(0.985 0 0);
      --background: oklch(0.98 0.01 205);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --muted: oklch(0.97 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --border: oklch(0.922 0 0);
      --destructive: oklch(0.577 0.245 27.325);
      --radius: 0.625rem;
      --font-sans: "Geist", "Geist Fallback", system-ui, sans-serif;
      --font-mono: "Geist Mono", "Geist Mono Fallback", monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background: var(--background);
      color: var(--foreground);
      line-height: 1.6;
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }
    /* 复制主文件的全部 CSS 样式（spec-header/meta-table/section/spec-table/
       screenshot-figure/component-spec/component-preview/interaction-layer/
       layer-badge/trigger-path/dom-comparison/layer-nav/layer-index/pre/code/mermaid 等） */
    /* ... 此处省略，与主文件 <style> 完全一致 ... */
  </style>
</head>
<body>

<!-- ===== 返回导航 ===== -->
<nav class="layer-nav">
  <a href="./index.html#component-2-2">&larr; 返回主文件</a>
  <span>层级 <N> / <总层级数></span>
  <a href="./layer-<N+1>-<描述>.html">层级 <N+1>: <描述> -&gt;</a>
</nav>

<!-- ===== 层级元信息头 ===== -->
<header class="spec-header">
  <h1>交互层级 &lt;N&gt;：&lt;层级名称，如：编辑弹窗打开&gt;</h1>
  <table class="meta-table">
    <tr><td>所属组件</td><td>2.&lt;X&gt; &lt;组件名&gt;</td></tr>
    <tr><td>主文件</td><td><a href="./index.html">index.html</a></td></tr>
    <tr><td>层级编号</td><td>层级 &lt;N&gt; / &lt;总层级数&gt;</td></tr>
    <tr><td>触发路径</td><td>&lt;从上一层如何触发到本层，如：层级0 表格行操作列 -&gt; Pencil 图标 / "编辑"按钮 -&gt; onClick 打开 Dialog&gt;</td></tr>
    <tr><td>demo 组件</td><td><code>components/xxx/yyy-dialog.tsx</code></td></tr>
  </table>
</header>

<!-- ===== 该层级的完整内容 ===== -->
<section class="interaction-layer">
  <h4><span class="layer-badge">&lt;N&gt;</span> 交互层级 &lt;N&gt;：&lt;层级名称&gt;</h4>
  <div class="trigger-path"><strong>触发路径</strong>：&lt;详细触发路径&gt;</div>

  <!-- 可交互组件 HTML 预览（从 demo 提取的实际 HTML+CSS） -->
  <div class="component-preview">
    &lt;!-- 嵌入从 demo 提取的该状态 HTML+CSS --&gt;
    &lt;!-- 先点击触发到该状态，再提取 outerHTML + computed style --&gt;
  </div>

  <!-- 截图 -->
  <figure class="screenshot-figure">
    <img src="./screenshots/table-layer-<N>-<描述>.png" alt="层级<N>截图">
    <figcaption>层级 &lt;N&gt; 截图（浏览器实际渲染）</figcaption>
  </figure>

  <!-- UI 元素清单表 -->
  <h4>UI 元素清单</h4>
  <table class="spec-table">
    <thead>
      <tr>
        <th>序号</th><th>元素类型</th><th>文案/标签</th><th>默认值</th>
        <th>校验</th><th>交互行为</th><th>跳转层级</th><th>i18n key</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td><td>Select</td><td>"规则类型"</td><td>"IP黑白名单"</td>
        <td>必选</td><td>onChange 联动表单</td><td>-&gt; 层级&lt;N+1&gt;</td><td>form.ruleType</td>
      </tr>
      <tr>
        <td>2</td><td>Input</td><td>"规则名称"</td><td>""</td>
        <td>必填,2-64字</td><td>输入校验</td><td>-</td><td>form.ruleName</td>
      </tr>
      <tr>
        <td>3</td><td>Button</td><td>"取消"</td><td>-</td>
        <td>-</td><td>关闭弹窗</td><td>-&gt; 层级0</td><td>btn.cancel</td>
      </tr>
      <tr>
        <td>4</td><td>Button</td><td>"确认"</td><td>-</td>
        <td>表单校验通过</td><td>提交+关闭</td><td>-&gt; 层级0</td><td>btn.confirm</td>
      </tr>
    </tbody>
  </table>

  <!-- DOM 树比对结果表（强制） -->
  <div class="dom-comparison">
    <h5>DOM 树比对结果（提取的 HTML vs demo 实际 DOM）</h5>
    <table>
      <thead><tr><th>比对项</th><th>demo 实际 DOM</th><th>提取的 HTML</th><th>是否一致</th></tr></thead>
      <tbody>
        <tr><td>根节点</td><td>div.fixed.inset-0</td><td>div.fixed.inset-0</td><td class="dom-pass">✅</td></tr>
        <tr><td>遮罩层</td><td>div.bg-black/50</td><td>div.bg-black/50</td><td class="dom-pass">✅</td></tr>
        <tr><td>弹窗容器</td><td>div.bg-white.rounded-lg.w-[480px]</td><td>div.bg-white.rounded-lg.w-[480px]</td><td class="dom-pass">✅</td></tr>
        <tr><td>标题文案</td><td>"编辑规则"</td><td>"编辑规则"</td><td class="dom-pass">✅</td></tr>
        <tr><td>表单字段数</td><td>4</td><td>4</td><td class="dom-pass">✅</td></tr>
        <tr><td>确认按钮 disabled</td><td>false</td><td>false</td><td class="dom-pass">✅</td></tr>
        <!-- 更多比对项... -->
      </tbody>
    </table>
  </div>
</section>

<!-- ===== 底部返回导航 ===== -->
<nav class="layer-nav">
  <a href="./index.html#component-2-2">&larr; 返回主文件</a>
  <a href="./layer-<N+1>-<描述>.html">层级 <N+1>: <描述> -&gt;</a>
</nav>

</body>
</html>
```

## index.html 索引页模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML Spec 索引</title>
  <style>
    :root {
      --primary: oklch(0.52 0.226 262);
      --primary-foreground: oklch(0.985 0 0);
      --background: oklch(0.98 0.01 205);
      --foreground: oklch(0.145 0 0);
      --card: oklch(1 0 0);
      --border: oklch(0.922 0 0);
      --muted: oklch(0.97 0 0);
      --muted-foreground: oklch(0.556 0 0);
      --radius: 0.625rem;
      --font-sans: "Geist", "Geist Fallback", system-ui, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background: var(--background);
      color: var(--foreground);
      line-height: 1.6;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      color: var(--primary);
      margin-bottom: 1.5rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }
    .spec-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
      overflow: hidden;
      transition: box-shadow 0.2s;
    }
    .spec-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .spec-card a {
      display: block;
      padding: 1.25rem;
      text-decoration: none;
      color: inherit;
    }
    .spec-card h3 {
      color: var(--primary);
      margin-bottom: 0.5rem;
      font-size: 1rem;
    }
    .spec-card p {
      font-size: 0.8125rem;
      color: var(--muted-foreground);
      margin: 0.25rem 0;
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.125rem 0.5rem;
      border-radius: calc(var(--radius) - 4px);
      margin-top: 0.5rem;
    }
    .badge-done { background: oklch(0.85 0.05 150); color: var(--foreground); }
    .badge-todo { background: var(--muted); color: var(--muted-foreground); }
    .status-done { border-left: 4px solid oklch(0.6 0.1 150); }
    .status-todo { border-left: 4px solid var(--border); }
    .card-version-badge {
      display: inline-block; padding: 0.1rem 0.5rem; border-radius: 0.5rem;
      background: oklch(0.52 0.226 262 / 0.12); color: oklch(0.52 0.226 262);
      font-size: 0.75rem; font-weight: 600; margin-left: 0.4rem;
    }
    .card-generated-at { font-size: 0.7rem; color: #94a3b8; margin-left: 0.3rem; }
  </style>
</head>
<body>
  <h1>HTML Spec 索引</h1>
  <div class="grid">
    <div class="spec-card status-done">
      <a href="email-handling-disposal-center/index.html">
        <h3>邮件处置中心</h3>
        <p>路由: /email-handling/disposal-center</p>
        <p>spec: 0702邮件处置中心.md</p>
        <span class="badge badge-done">✅ 已生成</span>
        <!-- 版本徽标：v3 用模块 version.json 的 current_version 渲染，日期用最新 history 的 generated_at；version.json 缺失（尚未生成）的模块不显示 -->
        <!-- 注意：实际的 html_spec/index.html 若采用可折叠结构 <details class="spec-card"><summary><div class="card-summary">…，则把这两个 span 放进 .card-summary 里、紧跟状态徽标（✅/⬜）之后；类名与样式不变 -->
        <span class="card-version-badge">v3</span>
        <span class="card-generated-at">2026-07-13</span>
      </a>
    </div>
    <div class="spec-card status-todo">
      <a href="filter-rules-pipeline/index.html">
        <h3>策略流水线</h3>
        <p>路由: /filter-rules/pipeline</p>
        <p>spec: 策略流水线需求文档.md</p>
        <span class="badge badge-todo">⬜ 待生成</span>
      </a>
    </div>
    <!-- 更多卡片... -->
  </div>
</body>
</html>
```
