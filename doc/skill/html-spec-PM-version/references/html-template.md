# HTML Spec 静态模板参考

本模板供 `html-spec-generator` 生成只读 HTML 规格。它保留交互预览，但所有交互预览都由真实 webapp 的状态截图序列和对应信息组成，不包含业务组件 HTML、模拟交互控件或 mock 状态机。

使用时替换 `<...>` 占位符，并按实际模块增删章节。不要加入 Tailwind CDN、从 webapp 提取的 `outerHTML`、表单控件、事件属性或 JavaScript。

## 模块主文件模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><页面名称> - HTML 规格说明</title>
  <style>
    :root {
      --primary: #4f46e5;
      --background: #f7f8fa;
      --foreground: #172033;
      --card: #ffffff;
      --muted: #f1f3f7;
      --muted-foreground: #64748b;
      --border: #dbe1ea;
      --danger: #b42318;
      --danger-bg: #fff1f0;
      --warning: #9a6700;
      --warning-bg: #fff8db;
      --success: #16794a;
      --radius: 10px;
      --font-sans: "Geist", "Noto Sans SC", system-ui, sans-serif;
      --font-mono: "Geist Mono", ui-monospace, monospace;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      max-width: 1440px;
      margin: 0 auto;
      padding: 32px;
      background: var(--background);
      color: var(--foreground);
      font: 14px/1.65 var(--font-sans);
    }
    a { color: var(--primary); }
    code { font-family: var(--font-mono); }
    h1, h2, h3, h4 { line-height: 1.35; }

    .spec-header,
    .toc,
    section {
      margin-bottom: 24px;
      padding: 24px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
    }
    .spec-header h1 {
      margin: 0 0 16px;
      color: var(--primary);
      font-size: 24px;
    }
    section > h2 {
      margin: 0 0 18px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--primary);
      color: var(--primary);
      font-size: 20px;
    }
    h3 { margin: 22px 0 10px; font-size: 17px; }
    h4 { margin: 16px 0 8px; font-size: 15px; }

    .meta-table,
    .spec-table,
    .matrix-table {
      width: 100%;
      margin: 12px 0;
      border-collapse: collapse;
    }
    .meta-table th,
    .meta-table td,
    .spec-table th,
    .spec-table td,
    .matrix-table th,
    .matrix-table td {
      padding: 9px 10px;
      border: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    .meta-table th,
    .spec-table th,
    .matrix-table th {
      background: var(--muted);
      font-weight: 650;
      white-space: nowrap;
    }
    .meta-table th { width: 180px; }
    .matrix-table td:not(:first-child),
    .matrix-table th:not(:first-child) { text-align: center; }

    .toc ul {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 8px 20px;
      margin: 0;
      padding-left: 20px;
    }
    .toc a { text-decoration: none; }

    .interaction-preview {
      margin: 20px 0;
      padding: 18px;
      border: 1px solid var(--border);
      border-left: 4px solid var(--primary);
      border-radius: var(--radius);
      background: var(--card);
    }
    .interaction-preview > h3 { margin-top: 0; color: var(--primary); }
    .preview-sequence {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .sequence-label {
      display: inline-block;
      margin-bottom: 6px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--primary);
      color: #fff;
      font-size: 12px;
      font-weight: 650;
    }
    .state-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px 16px;
      margin: 10px 0 16px;
      padding: 12px;
      border-radius: 8px;
      background: var(--muted);
    }
    .state-meta dt { font-weight: 650; }
    .state-meta dd { margin: 0; }

    .screenshot-figure {
      margin: 16px 0 22px;
      text-align: center;
    }
    .screenshot-figure img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0 auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 3px 14px rgb(15 23 42 / 10%);
    }
    .screenshot-figure figcaption {
      margin-top: 8px;
      color: var(--muted-foreground);
      font-size: 13px;
    }

    .legend {
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--muted);
    }
    .diff-section {
      border-left: 4px solid var(--danger);
      background: var(--danger-bg);
    }
    .question-section {
      border-left: 4px solid var(--warning);
      background: var(--warning-bg);
    }
    .status-done { color: var(--success); font-weight: 650; }
    .status-open { color: var(--danger); font-weight: 650; }
    .source-note {
      padding: 12px 14px;
      border-left: 4px solid var(--primary);
      background: var(--muted);
    }

    @media (max-width: 760px) {
      body { padding: 12px; }
      .spec-header, .toc, section { padding: 16px; }
      .table-scroll { overflow-x: auto; }
      .meta-table th { width: auto; }
    }
  </style>
</head>
<body>
  <header class="spec-header">
    <h1><页面名称> 规格说明</h1>
    <div class="table-scroll">
      <table class="meta-table">
        <tbody>
          <tr><th>规格版本</th><td>v&lt;N&gt;</td></tr>
          <tr><th>生成日期</th><td>&lt;YYYY-MM-DD&gt;</td></tr>
          <tr><th>页面路由</th><td><code>&lt;/zh/route&gt;</code></td></tr>
          <tr><th>webapp 源码</th><td><code>&lt;webapp/src/...&gt;</code></td></tr>
          <tr><th>webapp commit</th><td><code>&lt;short-hash&gt;</code></td></tr>
          <tr><th>需求依据</th><td>用户当前描述 + 可获得的历史决定 + webapp 当前运行态</td></tr>
          <tr><th>历史对话</th><td>&lt;已使用/当前上下文未提供&gt;</td></tr>
          <tr><th>对照 spec</th><td>&lt;not-used 或路径；仅作差异对照&gt;</td></tr>
          <tr><th>验证环境</th><td>&lt;URL、locale、主题、视口、形态、角色&gt;</td></tr>
        </tbody>
      </table>
    </div>
    <p class="source-note">
      webapp 同时是原型与实际项目。本规格保留交互预览，但预览仅由真实状态截图
      和对应信息组成，不包含可操作控件、事件或脚本。
    </p>
  </header>

  <nav class="toc" aria-label="规格目录">
    <h2>目录</h2>
    <ul>
      <li><a href="#form-role-matrix">产品形态与角色</a></li>
      <li><a href="#overview">功能概述</a></li>
      <li><a href="#layout">页面布局</a></li>
      <li><a href="#components">截图式交互预览</a></li>
      <li><a href="#api">数据与 API</a></li>
      <li><a href="#logic">业务逻辑与权限</a></li>
      <li><a href="#exceptions">异常场景</a></li>
      <li><a href="#diffs">差异标注</a></li>
      <li><a href="#questions">需确认事项</a></li>
      <li><a href="#history">版本历史</a></li>
    </ul>
  </nav>

  <section id="form-role-matrix">
    <h2>1. 产品形态 × 角色差异矩阵</h2>
    <div class="table-scroll">
      <table class="matrix-table">
        <thead>
          <tr>
            <th>角色</th>
            <th>AI-单</th>
            <th>传统-单</th>
            <th>云-多</th>
            <th>AI-多</th>
            <th>传统-多</th>
          </tr>
        </thead>
        <tbody>
          <tr><th>平台管理员</th><td>—</td><td>—</td><td>✅</td><td>✅</td><td>✅</td></tr>
          <tr><th>租户管理员</th><td>✅</td><td>✅</td><td>🔒</td><td>✅</td><td>✅</td></tr>
        </tbody>
      </table>
    </div>
    <p class="legend">✅ 显示且可编辑　🔒 显示但只读　❌ 隐藏　— 无此角色　? 无法验证</p>
  </section>

  <section id="overview">
    <h2>2. 功能概述</h2>
    <p>&lt;功能背景、用户目标和范围&gt;</p>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>功能点</th><th>说明</th><th>对应区域/状态</th><th>依据</th></tr></thead>
        <tbody>
          <tr><td>&lt;功能点&gt;</td><td>&lt;说明&gt;</td><td><a href="#state-default">&lt;区域&gt;</a></td><td>&lt;用户/webapp&gt;</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="layout">
    <h2>3. 页面布局与默认态</h2>
    <figure class="screenshot-figure">
      <img src="./screenshots/page-default.png" alt="<页面名称>默认态整页截图">
      <figcaption>默认态；&lt;locale / 主题 / 视口 / 形态 / 角色&gt;</figcaption>
    </figure>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>区域</th><th>位置</th><th>内容</th><th>尺寸/布局</th><th>响应式</th></tr></thead>
        <tbody>
          <tr><td>A</td><td>&lt;顶部&gt;</td><td>&lt;标题、操作区&gt;</td><td>&lt;观察值&gt;</td><td>&lt;断点表现&gt;</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="components">
    <h2>4. 截图式交互预览</h2>

    <article class="interaction-preview" id="state-default">
      <h3>4.1 &lt;组件&gt; — 默认态预览</h3>
      <dl class="state-meta">
        <div><dt>触发路径</dt><dd>页面加载后直接显示</dd></div>
        <div><dt>路由</dt><dd><code>&lt;/zh/route&gt;</code></dd></div>
        <div><dt>视口</dt><dd>&lt;1440 × 900&gt;</dd></div>
        <div><dt>形态/角色</dt><dd>&lt;AI-多 / 租户管理员&gt;</dd></div>
        <div><dt>验证依据</dt><dd>&lt;浏览器操作 + 源码路径&gt;</dd></div>
      </dl>

      <div class="preview-sequence">
        <figure class="screenshot-figure">
          <span class="sequence-label">状态 1 / 默认态</span>
          <img src="./screenshots/component-default.png" alt="<组件>默认态截图">
          <figcaption>&lt;截图中需要审查的重点&gt;</figcaption>
        </figure>
      </div>

      <h4>UI 元素</h4>
      <div class="table-scroll">
        <table class="spec-table">
          <thead>
            <tr>
              <th>#</th><th>元素</th><th>文案/图标</th><th>默认值/占位符</th>
              <th>校验/禁用</th><th>交互结果</th><th>形态/角色差异</th><th>i18n key</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td><td>&lt;Input&gt;</td><td>&lt;搜索 / Search&gt;</td><td>&lt;请输入...&gt;</td>
              <td>&lt;规则&gt;</td><td>&lt;回车后刷新列表&gt;</td><td>[Base] ✅</td><td>&lt;search.placeholder&gt;</td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <article class="interaction-preview" id="state-dialog-open">
      <h3>4.2 &lt;弹窗&gt; — 打开交互预览</h3>
      <dl class="state-meta">
        <div><dt>触发路径</dt><dd>默认态 → 点击“&lt;按钮&gt;”</dd></div>
        <div><dt>前置条件</dt><dd>&lt;权限、选中项、测试数据&gt;</dd></div>
        <div><dt>可观察结果</dt><dd>&lt;遮罩、焦点、字段默认值、按钮状态&gt;</dd></div>
        <div><dt>恢复方式</dt><dd>&lt;取消、ESC、遮罩等实际行为&gt;</dd></div>
      </dl>

      <div class="preview-sequence">
        <figure class="screenshot-figure">
          <span class="sequence-label">状态 1 / 触发前</span>
          <img src="./screenshots/dialog-before-open.png" alt="<弹窗>打开前截图">
          <figcaption>点击“&lt;按钮&gt;”前的真实页面状态</figcaption>
        </figure>
        <figure class="screenshot-figure">
          <span class="sequence-label">状态 2 / 触发后</span>
          <img src="./screenshots/dialog-open.png" alt="<弹窗>打开态截图">
          <figcaption>真实 webapp 中点击后得到的打开态</figcaption>
        </figure>
      </div>

      <div class="table-scroll">
        <table class="spec-table">
          <thead><tr><th>字段/按钮</th><th>类型</th><th>默认值</th><th>校验</th><th>操作结果</th><th>数据/API</th></tr></thead>
          <tbody>
            <tr><td>&lt;名称&gt;</td><td>&lt;Input&gt;</td><td>&lt;空&gt;</td><td>&lt;必填，2–64 字&gt;</td><td>&lt;错误文案或提交结果&gt;</td><td>&lt;request.name&gt;</td></tr>
          </tbody>
        </table>
      </div>
    </article>
  </section>

  <section id="api">
    <h2>5. 数据模型与 API 映射</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>界面元素</th><th>前端字段</th><th>API</th><th>请求/响应字段</th><th>格式化/转换</th><th>依据</th></tr></thead>
        <tbody>
          <tr><td>&lt;列表&gt;</td><td><code>&lt;items&gt;</code></td><td><code>GET &lt;/api/...&gt;</code></td><td><code>&lt;data.items&gt;</code></td><td>&lt;转换&gt;</td><td>&lt;源码路径&gt;</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="logic">
    <h2>6. 业务逻辑、权限与交互结果</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>场景</th><th>前置条件</th><th>操作</th><th>预期可观察结果</th><th>权限/租户边界</th><th>依据</th></tr></thead>
        <tbody>
          <tr><td>&lt;筛选&gt;</td><td>&lt;有数据&gt;</td><td>&lt;选择状态&gt;</td><td>&lt;列表刷新、条件保留&gt;</td><td>&lt;仅本租户&gt;</td><td>&lt;浏览器验证&gt;</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="exceptions">
    <h2>7. 异常与边界状态</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>状态</th><th>触发条件</th><th>截图</th><th>页面表现</th><th>恢复方式</th><th>验证状态</th></tr></thead>
        <tbody>
          <tr><td>&lt;校验失败&gt;</td><td>&lt;空值提交&gt;</td><td><a href="./screenshots/validation-error.png">查看</a></td><td>&lt;字段错误文案&gt;</td><td>&lt;修正后重试&gt;</td><td>已验证</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="responsive">
    <h2>8. 国际化与响应式</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>locale/视口</th><th>截图</th><th>布局变化</th><th>文案/截断</th><th>验证结果</th></tr></thead>
        <tbody>
          <tr><td>&lt;zh / 1024px&gt;</td><td><a href="./screenshots/responsive-1024.png">查看</a></td><td>&lt;筛选区换行&gt;</td><td>&lt;无截断&gt;</td><td>通过</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="related">
    <h2>9. 关联功能模块</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>模块</th><th>关系</th><th>数据/跳转</th><th>影响</th><th>依据</th></tr></thead>
        <tbody>
          <tr><td>&lt;上游模块&gt;</td><td>&lt;依赖&gt;</td><td>&lt;字段或路由&gt;</td><td>&lt;影响&gt;</td><td>&lt;浏览器/源码&gt;</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="diffs" class="diff-section">
    <h2>10. 差异标注</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead>
          <tr>
            <th>编号</th><th>目标要求</th><th>webapp 当前实现</th><th>状态</th>
            <th>复核日期</th><th>验证依据</th><th>处理说明/版本</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>D-001</td><td>&lt;用户要求&gt;</td><td>&lt;当前实现&gt;</td>
            <td class="status-open">未解决</td><td>&lt;YYYY-MM-DD&gt;</td><td>&lt;截图/操作/源码&gt;</td><td>&lt;说明&gt;</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="questions" class="question-section">
    <h2>11. 需确认事项</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead>
          <tr>
            <th>编号</th><th>事项</th><th>原因</th><th>状态</th>
            <th>复核日期</th><th>验证依据</th><th>处理说明/版本</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Q-001</td><td>&lt;待确认问题&gt;</td><td>&lt;浏览器和源码均无法确认&gt;</td>
            <td class="status-open">无法验证</td><td>&lt;YYYY-MM-DD&gt;</td><td>&lt;已检查范围&gt;</td><td>&lt;需要谁确认&gt;</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section id="history">
    <h2>12. 版本历史</h2>
    <div class="table-scroll">
      <table class="spec-table">
        <thead><tr><th>版本</th><th>日期</th><th>webapp commit</th><th>对照 spec commit</th><th>摘要</th></tr></thead>
        <tbody>
          <tr><td>v&lt;N&gt;</td><td>&lt;YYYY-MM-DD&gt;</td><td><code>&lt;hash&gt;</code></td><td><code>not-used</code></td><td>&lt;变更摘要&gt;</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</body>
</html>
```

## 可选状态子文件模板

仅当状态很多、主文件过长时使用。子文件仍然是截图式交互预览，不包含业务组件或模拟交互。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><状态名称> - <页面名称>规格</title>
  <style>
    /* 复制主文件的文档样式，或引用 ../assets/ 下的本地共享 CSS。 */
  </style>
</head>
<body>
  <nav><a href="./index.html#components">← 返回模块主规格</a></nav>
  <main class="interaction-preview">
    <h1><状态名称></h1>
    <dl class="state-meta">
      <div><dt>触发路径</dt><dd><完整操作路径></dd></div>
      <div><dt>前置条件</dt><dd><角色、权限、数据></dd></div>
      <div><dt>验证环境</dt><dd><URL、locale、主题、视口></dd></div>
      <div><dt>验证依据</dt><dd><浏览器操作、DOM 信息、源码路径></dd></div>
    </dl>
    <div class="preview-sequence">
      <figure class="screenshot-figure">
        <span class="sequence-label">状态 &lt;N&gt;</span>
        <img src="./screenshots/<状态截图>.png" alt="<状态名称>截图">
        <figcaption><截图重点说明></figcaption>
      </figure>
    </div>
    <table class="spec-table">
      <thead><tr><th>元素/区域</th><th>状态信息</th><th>交互结果</th><th>数据/API</th><th>形态/角色差异</th></tr></thead>
      <tbody>
        <tr><td><元素></td><td><文案、值、禁用、校验></td><td><操作后的可观察结果></td><td><字段映射></td><td><差异></td></tr>
      </tbody>
    </table>
  </main>
</body>
</html>
```

## 总索引卡片模板

```html
<article class="spec-card status-done">
  <a href="./<模块名>/index.html">
    <h2><页面名称></h2>
    <p>路由：<code><路由></code></p>
    <p>截图式交互预览：<状态数量> 个状态</p>
    <span class="badge">v<N></span>
    <time datetime="<YYYY-MM-DD>"><YYYY-MM-DD></time>
  </a>
</article>
```

## 模板检查清单

- 每条关键交互有真实的触发前/后截图序列、触发路径、对应元素和结果信息。
- 页面使用 `.interaction-preview` 承载截图和信息，不使用 `.component-preview`。
- 页面没有提取的 `outerHTML`、业务表单控件、事件属性或模拟操作脚本。
- 页面不加载 Tailwind CDN。
- 页面不包含 `<script>`；流程图使用预渲染图片或内嵌 SVG。
- 截图和内部链接使用相对路径。
- 形态/角色矩阵、差异、待确认、版本历史齐全。
- 离线打开时仍可阅读全部核心信息。
