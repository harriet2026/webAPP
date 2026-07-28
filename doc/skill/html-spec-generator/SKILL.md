---
name: "html-spec-generator"
description: "基于用户当前描述与 design/origin/demo 原型生成纯 HTML 可视化规格说明到 webapp/doc/html-spec/；没有 design/origin/spec 原始需求文档时，以用户描述和 demo 为准，原始 spec 如存在则用于差异对照。以 demo 页面/组件模块为组织单元，必须按模块子目录存放：webapp/doc/html-spec/<模块名>/index.html、screenshots/、layer-*.html；禁止把模块主文件或截图平铺在 html_spec 根目录。产出可在浏览器直接打开的 HTML 规格文档：内嵌 CSS（以 demo 视觉风格为准）、页面截图位、字段表格、交互流程图、差异标注、与 demo 行为一致的可操作组件预览。生成或重生成时必须逐项核对“与 spec 的差异标注”和“需确认事项”中的问题是否已解决，并保留状态和验证依据。支持页面级和组件级两种粒度。必须通过浏览器访问运行中的 demo（DOM 分析、截图、点击交互验证）确认实际渲染细节与交互行为。Invoke when user asks for 生成HTML规格、html_spec、HTML规格说明、可视化规格文档、从 demo 生成 HTML spec、组件规格 HTML。"
argument-hint: "<页面路由或组件名>"
user-invocable: true
---

# HTML 可视化规格说明生成技能

## 职责

读取用户当前描述与 `design/origin/demo/`（可运行的 Next.js 原型代码），以 **demo 页面或组件模块** 为组织单元，交叉产出 **纯 HTML 可视化规格说明**，输出到 `webapp/doc/html-spec/<模块名>/` 子目录。若 `design/origin/spec/` 原始需求文档不存在或未提供，必须以**用户描述和 demo** 为准；不得因缺少原始 spec 阻塞生成或虚构 spec 内容。原始 spec 存在时用于需求补充和差异对照，发生冲突时优先遵循用户当前描述，并如实记录 demo 当前实现。

产物为可在浏览器直接打开的 HTML 文件，内嵌 CSS（以 demo 视觉风格为准）、嵌入浏览器验证截图、**将实际可交互组件 HTML 化后嵌入规格文档**（从运行中的 demo 提取渲染后的 HTML+CSS，在 spec 中 1:1 还原组件视觉，并用少量内联 JS 复刻 demo 中可点击、可输入、可展开、可关闭的状态变化）、用可视化布局展示规格：页面截图位 + **可交互组件预览区** + 元素标注 + 字段表格 + 交互流程图 + 差异标注。**涉及多层交互的组件，按交互层级拆分后逐一列出**，每层独立呈现其 HTML 预览 + 截图 + 元素表，方便审查。

生成或重生成时，必须读取已有 HTML spec 中“9. 与 spec 的差异标注”和“10. 需确认事项”（扩展模板中的 §15/§16），对每个历史编号逐项核对是否已经解决；状态只能标为“已解决 / 部分解决 / 未解决 / 无法验证”，并记录复核日期、demo 源码或浏览器 DOM/交互证据、处理说明或解决版本。不得批量写“均已解决”，不得删除已解决条目的追溯记录。

**必须通过浏览器访问运行中的 demo**，通过 DOM 分析、截图、点击交互、**HTML 提取**等手段确认实际渲染细节与交互行为；html_spec 中的组件预览必须能在规格文档内执行对应交互，不能仅凭源码推断或生成静态外观。

> 本技能**只做规格提取与可视化呈现**，不修改 demo 代码、不修改 spec 文档、不做代码实现。落地实现由后续 `design/implement/spec/` 和 `design/implement/plan/` 流程承接。

---

## 触发条件

当用户要求执行以下任一场景时调用本技能：

- 基于 demo 原型代码生成 HTML 规格说明
- 为某页面/模块生成 html_spec
- 关键词：「生成HTML规格」「html_spec」「HTML规格说明」「可视化规格文档」「从 demo 生成 HTML spec」「组件规格 HTML」

---

## 核心原则

### 首要原则（最高优先）：产品形态 × 角色视角差异矩阵（强制）

在多产品形态并存、且区分平台/租户管理员视角时，同一功能组件/页面的**可见性与可编辑性**会随"产品形态 × 角色"变化。html_spec 必须把这类差异用统一范式显式标注，禁止只描述单一形态、单一角色的形态。此原则优先级最高，其余原则均在满足本原则的前提下执行。

**产品形态枚举（5 种，与 demo 产品形态切换器一致）：**

| 简称 | 全称 | 说明 |
|---|---|---|
| AI-单 | AI版-单租户 | 单租户部署，具备 AI 能力 |
| 传统-单 | 传统版-单租户 | 单租户部署，无 AI 能力 |
| 云-多 | 云网关-多租户 | SaaS 多租户，平台托管 |
| AI-多 | AI版-多租户 | 私有化多租户，具备 AI 能力 |
| 传统-多 | 传统版-多租户 | 私有化多租户，无 AI 能力 |

**用户角色枚举（2 种，与 demo 登录视角切换器一致）：**

| 角色 | 说明 |
|---|---|
| 平台管理员 | 系统级最高权限，管理租户、全局配置、系统资源 |
| 租户管理员 | 租户级权限，仅管理所属租户内的配置与数据 |

**图例规范（全文档强制统一）：**

| 符号 | 含义 | 说明 |
|---|---|---|
| ✅ | 显示且可编辑 | 该角色在此形态下可见，并拥有完整操作权限 |
| 🔒 | 显示但只读 | 该角色在此形态下可见，但不可修改 |
| ❌ | 隐藏 | 前端不展示入口；直接拼接 URL 访问时后端拦截返回 403/404 |
| — | 无此角色 | 该形态下不存在此角色（如单租户形态无平台管理员时） |

**编写标记规范（用于章节/元素文案前缀）：**

| 标记 | 含义 | 使用场景 |
|---|---|---|
| `[Base]` | 功能基线 | 所有产品形态、所有角色共用的内容 |
| `[Overlay]` | 形态差异包 | 与基线存在差异的内容，需注明适用形态 |
| `[单租户]` | 单租户形态差异 | 适用于 AI-单、传统-单 |
| `[多租户]` | 多租户形态差异 | 适用于 云-多、AI-多、传统-多 |
| `[多租户差异：XXX]` | UI 差异标注 | 在原型/截图描述中标注多租户特有的差异点 |

**标注要求（页面级 + 组件级双层，均强制）：**

- **页面级**：主文件在 §0 元信息头之后、组件列表之前，必须有一个 `<section id="form-role-matrix">` 差异矩阵章节。矩阵为"形态（5 列）× 角色（分组行）"的 `matrix-table`，单元格用上述图例符号；矩阵下方附图例说明块。
- **组件级**：每个组件 `article` 的元信息表、以及 UI 元素清单表，都要新增"形态/角色差异"列，用图例符号 + 编写标记标注该组件/元素在各形态角色下的差异；无差异的用 `[Base]` 一次性说明即可，不必逐格重复。
- **数据来源**：差异结论以 Phase 1.5 逐形态 × 逐角色的浏览器实际渲染（可见/只读/隐藏）为准；与 spec 权限矩阵不一致时以 demo 为准并在 §15 差异章节标注。
- **国际化独立**：四语国际化与本矩阵无关，属 §13 国际化规格，禁止混入差异矩阵。

### 第零原则：demo 运行态是 UI 第一事实源

- **以浏览器中实际运行的 demo 为第一事实源**：所有 UI 描述必须通过浏览器访问 demo 页面、读取 DOM、截图、点击交互来确认实际渲染效果。
- **以 demo 源码为第二事实源**：用于补充浏览器无法直接获取的信息（如 TypeScript 类型定义、内部状态管理逻辑、隐藏的条件分支代码）。
- **业务目标优先取用户当前描述**；用户未说明时，原始 spec（如存在）可补充业务逻辑，demo 用于记录当前实际 UI 和可观察行为。
- 用户描述、demo 与原始 spec 冲突时：分别记录“目标要求”和“当前实现”，同时在差异标注块列出差异；缺少原始 spec 时明确写“未提供”，不阻塞生成。

> **铁律：源码推断 ≠ 实际渲染。** Tailwind class 的组合效果、条件渲染分支、CSS 层叠、组件库默认行为等，都可能让最终渲染结果与源码阅读的预期不同。必须用浏览器验证。

### 第一原则：逐元素落地级详细度

不是"这个页面有一个搜索框"，而是每个 UI 元素都有完整的字段表格：元素类型、文案/标签、图标、占位符、默认值、校验规则、禁用条件、交互行为、i18n key。

### 第二原则：交叉引用

每个 html_spec 文件**必须**在头部标注 demo 源路径与需求依据。原始 spec 存在且被读取时再标注对应路径；不存在或未使用时明确写“原始 spec：未提供/未使用”，不得伪造引用。

### 第三原则：遵循 implement.md 约束

所有 html_spec 文件必须遵循 `design/origin/implement.md` 的落地约束（四语国际化、复用统一规则系统 action、冲突先确认、不新增规则系统等）。

### 第四原则：HTML 可视化呈现

产物是纯 HTML 文件（内嵌 CSS，不依赖外部框架），用可视化布局展示规格：
- 页面截图嵌入（相对路径引用 `screenshots/` 目录中的图片）
- **可交互组件 HTML 预览区**（从 demo 提取的实际 HTML+CSS，1:1 还原组件视觉）
- 元素标注表格（带 demo 视觉风格）
- 交互流程图（内嵌 Mermaid 或 SVG）
- 差异标注块（醒目的视觉区分）
- 需确认事项块

### 第五原则：可交互组件 HTML 化 + 交互层级拆分

**不只截图，还要把组件"活"的 HTML 嵌入 spec 文档中**，让审查者能直接在规格文档里看到组件的实际渲染效果（样式、布局、文案），并能操作组件进入与 demo 一致的交互状态，而不仅仅看一张静态图片或一段不可操作的 HTML。

**交互可执行要求**：
1. 每个 `<div class="component-preview">` 内的按钮、输入框、下拉框、复选框、表格排序、分页、弹窗/抽屉开关、Tooltip/Hover 等交互入口，必须能在 html_spec 中操作。
2. 交互行为必须以运行中的 demo 为准：点击后出现/隐藏的元素、文案变化、禁用状态、校验提示、选中态、焦点态、遮罩层、弹窗位置、表单联动、表格排序方向等，都要与 demo 点击验证结果一致。
3. html_spec 不调用真实后端；涉及 API 的操作用内联 mock 数据和状态切换复刻 demo 前端行为，不能因为缺少接口而让按钮无响应。
4. 多层交互子文件中的预览也必须可操作；子文件展示某一层状态时，应提供返回/关闭/切换等与 demo 对应的本层交互，或在触发路径旁明确该层由主文件哪个操作进入。
5. 只嵌入 `outerHTML`、截图或静态状态不算完成。必须为可操作控件绑定最小必要的内联 JS，并在浏览器中打开生成后的 html_spec 实测一次。

**HTML 化方法**：
1. 从运行中的 demo 页面，用 `run_playwright_code` 执行 `page.evaluate()` 提取目标组件根元素的 `outerHTML`。
2. 提取组件依赖的 computed style（关键 CSS 属性：display/flex/grid/colors/borders/padding/margin/font/border-radius 等），内联到提取出的 HTML 元素的 `style` 属性中，或追加为 `<style>` 块。
3. 将提取的 HTML+CSS 嵌入 spec 文档的 `<div class="component-preview">` 容器中，确保在 spec 文档中 1:1 还原组件视觉。
4. 如果 demo 使用了 Tailwind utility class，保留原始 class（spec 文档内嵌 Tailwind CDN 或等效 CSS 变量），同时用 computed style 兜底。
5. 为提取出的控件补充最小交互脚本：按 demo 的状态机复刻 `open/close`、`selected`、`checked`、`disabled`、`error`、`loading`、排序/分页、表单联动等前端状态变化；禁止用空 `onclick` 或只弹 `alert()` 冒充交互。
6. **逐层 DOM 树比对**（强制）：每个交互层级提取 HTML 后，必须与 demo 该状态的实际 DOM 树做逐节点比对，确认提取的 HTML 与浏览器实际渲染的 DOM 完全一致。比对方法见下方"逐层 DOM 树比对"。
7. **生成后交互回放**（强制）：打开生成后的 html_spec 文件，按从 demo 记录的关键路径逐项点击/输入/hover，确认预览区状态变化、截图、元素表和交互说明一致；发现不一致时先修 html_spec，再记录差异。

**逐层 DOM 树比对**（每个交互层级强制执行）：

对每个交互层级，提取 HTML 后必须与 demo 实际 DOM 树做比对验证，确保嵌入 spec 的 HTML 与浏览器真实渲染一致：

1. **获取 demo 实际 DOM 树**：在该交互层级状态下，用 `read_page` 获取 accessibility snapshot（语义化 DOM 结构），或用 `run_playwright_code` 执行 `page.evaluate()` 遍历组件 DOM 树提取结构化节点信息（tagName / class / text / children）。
2. **比对提取的 HTML 与实际 DOM**：逐节点比对提取的 outerHTML 与实际 DOM 树：
   - 节点数量是否一致（子节点数、孙节点数）。
   - 每个节点的 tagName、class 列表、text content 是否一致。
   - 关键属性（aria-*、data-*、role、disabled、checked 等）是否一致。
   - 条件渲染节点（demo 源码中有 `{condition && <X/>}` 的）是否实际渲染（该出现的出现、该隐藏的隐藏）。
3. **记录比对结果**：在每个 `interaction-layer` 块中嵌入一个 `dom-comparison` 表格，记录比对结果：

```html
<div class="dom-comparison">
  <h5>DOM 树比对结果</h5>
  <table class="spec-table">
    <thead><tr><th>比对项</th><th>demo 实际 DOM</th><th>提取的 HTML</th><th>是否一致</th></tr></thead>
    <tbody>
      <tr><td>根节点</td><td>div.flex.gap-4</td><td>div.flex.gap-4</td><td>✅</td></tr>
      <tr><td>子节点数</td><td>3</td><td>3</td><td>✅</td></tr>
      <tr><td>按钮文案</td><td>"查询"</td><td>"查询"</td><td>✅</td></tr>
      <tr><td>隐藏的导出按钮</td><td>未渲染（权限控制）</td><td>未包含</td><td>✅</td></tr>
    </tbody>
  </table>
</div>
```

4. **不一致时**：如果比对发现差异（提取的 HTML 缺少节点、class 不一致、文案不同等），以 demo 实际 DOM 为准修正提取的 HTML，并在差异表中记录修正内容。

**交互层级拆分**：
当一个组件涉及多层交互（如：表格行 -> 点击"编辑" -> 打开弹窗 -> 弹窗内表单 -> 表单内有联动下拉），**必须按交互层级拆分为多个独立的预览块**，逐一列出。每个预览块必须包含：HTML 预览 + 截图 + 元素表 + **DOM 树比对结果表**。

**多层交互拆文件**：为避免单文件过大，层级 1 及以上的交互层级拆分为独立 HTML 子文件，主文件用超链接索引表连接。层级 0（初始态）保留在主文件内嵌。

主文件中的超链接索引表示例：

```html
<!-- 主文件 <模块名>/index.html 中，组件 2.2 的交互层级索引 -->
<article class="component-spec">
  <h3>2.2 数据表格 MailListTable（多层交互）</h3>
  <!-- 组件元信息表 -->
  <!-- 交互层级关系图（Mermaid） -->

  <!-- 层级 0：内嵌在主文件 -->
  <div class="interaction-layer">
    <h4><span class="layer-badge">0</span> 交互层级 0：表格初始态（默认渲染）</h4>
    <div class="component-preview"><!-- 提取的初始态 HTML+CSS --></div>
    <img src="./screenshots/table-layer-0-default.png">
    <table class="spec-table">元素清单...</table>
    <div class="dom-comparison">DOM 树比对结果表</div>
  </div>

  <!-- 层级 1+：拆分为子文件，主文件放超链接索引表 -->
  <h4>交互层级详情（拆分为独立文件）</h4>
  <table class="spec-table layer-index">
    <thead><tr><th>层级</th><th>名称</th><th>触发路径</th><th>详情链接</th></tr></thead>
    <tbody>
      <tr><td>0</td><td>表格初始态</td><td>页面加载</td><td>上方内嵌</td></tr>
      <tr><td>1</td><td>编辑弹窗打开</td><td>点击"编辑"按钮</td><td><a href="./layer-1-edit-dialog.html">查看详情 -&gt;</a></td></tr>
      <tr><td>2</td><td>表单联动渲染</td><td>选择"规则类型"</td><td><a href="./layer-2-form-linked.html">查看详情 -&gt;</a></td></tr>
    </tbody>
  </table>
</article>
```

子文件示例（`<模块名>/layer-1-edit-dialog.html`）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>层级 1：编辑弹窗打开 - <页面名称></title>
  <!-- 内嵌与主文件相同的 CSS（或引用共享 spec-style.css） -->
  <script src="https://cdn.tailwindcss.com"></script>
  <style>/* 同主文件样式 */</style>
</head>
<body>
  <!-- 返回导航 -->
  <nav class="layer-nav">
    <a href="./index.html#component-2-2">← 返回主文件</a>
    <a href="./layer-2-form-linked.html">层级 2：表单联动 →</a>
  </nav>

  <header class="spec-header">
    <h1>交互层级 1：编辑弹窗打开</h1>
    <table class="meta-table">
      <tr><td>所属组件</td><td>2.2 数据表格 MailListTable</td></tr>
      <tr><td>主文件</td><td><a href="./index.html"><模块名>/index.html</a></td></tr>
      <tr><td>触发路径</td><td>层级0 表格行操作列 -> Pencil 图标 / "编辑"按钮 -> onClick 打开 Dialog</td></tr>
    </table>
  </header>

  <section class="interaction-layer">
    <div class="component-preview"><!-- 提取的弹窗 HTML+CSS --></div>
    <figure class="screenshot-figure">
      <img src="./screenshots/table-layer-1-edit-dialog.png">
    </figure>
    <table class="spec-table">弹窗 UI 元素清单...</table>
    <div class="dom-comparison">DOM 树比对结果表</div>
  </section>
</body>
</html>
```

> **铁律**：每个交互层级都必须有独立的 HTML 预览 + 截图 + 元素表 + **DOM 树比对结果表**。审查者看任一层都能独立理解该状态的 UI 规格，不需要跨层拼接。嵌入的 HTML 预览必须与 demo 实际 DOM 树逐节点比对一致，不一致时以 demo 实际 DOM 为准修正。**多层交互拆分为独立 HTML 子文件，用超链接连接**，避免单文件过大。

### 第六原则：按模块子目录存放产物

每个页面级或组件级规格都必须拥有独立子目录：`webapp/doc/html-spec/<模块名>/`。主文件固定命名为 `index.html`，截图固定放在同级 `screenshots/`，交互层级子文件固定放在同级 `layer-<N>-<描述>.html`。根目录只允许放总索引 `index.html` 和共享资源 `assets/`；禁止生成 `html_spec/<模块名>.html`、`html_spec/<模块名>-layer-*.html` 或 `html_spec/screenshots/<模块名>/` 这类平铺结构。

### 第七原则：历史版本管理（git + 版本元数据）

demo/spec 迭代后重新生成某模块的 html_spec 会覆盖旧文件；历史快照边界由 `design/origin` submodule 的 git 历史承担，技能本身**不存目录快照、不自动提交**，只维护每模块一份版本元数据 `version.json`。

**version.json（版本号唯一权威来源，路径 `webapp/doc/html-spec/<模块>/version.json`）：**

```json
{
  "module": "filter-rules-pipeline-ip-filter",
  "current_version": 2,
  "history": [
    { "version": 1, "generated_at": "2026-07-01",
      "demo_commit": "804efb9", "spec_commit": "8db3a98",
      "summary": "初版：IP 黑白名单、抽屉表单、动作下拉" },
    { "version": 2, "generated_at": "2026-07-13",
      "demo_commit": "f98e029", "spec_commit": "8db3a98",
      "summary": "抽屉表单校验规则变更；动作下拉新增\"仅记录\"" }
  ]
}
```

- `current_version`：当前最新版本号，从文件读取后 +1，不从 HTML 解析。
- `history[]`：每次生成追加一条；`generated_at` 用真实日期（`YYYY-MM-DD`）；`demo_commit`/`spec_commit` 取该模块 demo 页面目录与 spec 文件的短 hash；`summary` 由技能基于本次观察到的 demo/spec 变化撰写一行（非 HTML 机械 diff）。
- version.json 缺失即视为首次生成（本次 v1，流程结束时新建该文件）。

---

## 前置条件

调用本技能前需确认：

1. **目标模块**：用户指定要生成的 demo 页面模块（路由路径或组件名）。
   - **页面级**：路由路径（如 `/email-handling/disposal-center`）对应 demo 源码 `design/origin/demo/app/email-handling/disposal-center/page.tsx`。
   - **组件级**：组件名（如 `MailListTable`）对应 demo 源码 `design/origin/demo/components/<对应目录>/`。
   - 可从 `design/origin/demo/components/sidebar-nav.tsx` 的 `navItems` 树获取全部页面路由清单。
2. **spec 关联文件**：需找出与目标模块相关的 spec 文件（spec/ 下的文件名通常能对应，也可按内容关键词检索）。
3. **demo 服务运行中**：必须确认 demo 开发服务器已启动（`pnpm --dir design/origin/demo dev`，默认端口 3000）。
   - 如果服务未运行，先在终端执行 `pnpm --dir design/origin/demo dev` 启动（后台运行），等待 `Ready in ...` 输出后继续。
   - 后续所有浏览器操作基于 `http://localhost:3000<路由>`。

---

## 文件组织

```
webapp/doc/html-spec/
├── index.html                         # 索引页：全部 html_spec 清单 + 覆盖状态（可点击跳转）
├── assets/                            # HTML 共享资源
│   └── spec-style.css                 # 共享样式（可选，各文件也可内嵌）
└── <模块名>/                          # 每个模块一个子目录，内含该模块的全部 HTML 文件和截图
    ├── index.html                     # 主文件：页面模块 1:1，含元信息/布局/层级0预览/数据/API/差异等
    ├── screenshots/                   # 该模块的浏览器验证截图
    │   ├── page-full-default.png      # 整页默认态截图
    │   ├── query-filters-default.png   # 各区域截图
    │   ├── release-dialog-open.png     # 交互状态截图
    │   └── responsive-1024px.png       # 响应式截图
    ├── layer-<N>-<描述>.html           # 子文件：多层交互的每个交互层级拆分为独立 HTML（超链接连接）
    └── ...                             # 更多层级子文件
```

**强制目录规则**：每个模块的所有产物（主文件、层级子文件、截图）统一放在 `html_spec/<模块名>/` 子目录下，避免不同模块的文件混放。不得在 `webapp/doc/html-spec/` 根目录直接生成模块 HTML 文件；不得把截图集中放到 `webapp/doc/html-spec/screenshots/<模块名>/`。

### 多层交互拆文件策略

为避免单个 HTML 文件过大（嵌入的组件 HTML+CSS+截图+表格堆积），**多层交互组件的每个交互层级拆分为独立的 HTML 文件**，主文件与子文件之间用超链接连接：

- **主文件**（`<模块名>/index.html`）：包含元信息、页面布局、组件元信息、交互层级关系图（Mermaid）、层级 0（初始态）的完整内容（预览+截图+元素表+DOM 比对），其余章节（API/业务逻辑/交互/国际化/响应式/差异/需确认），以及指向各子文件的**超链接索引表**。
- **子文件**（`<模块名>/layer-<N>-<描述>.html`）：每个交互层级（层级 1、2、...N）一个独立 HTML 文件，包含该层级的完整内容（触发路径、HTML 预览、截图、元素表、DOM 树比对结果表），以及返回主文件的**超链接**。子文件与主文件同在 `<模块名>/` 子目录下，用相对路径 `./layer-<N>-<描述>.html` 互引。
- **单层交互组件**：不拆分，直接内嵌在主文件的 `interaction-layer` 块中。
- **判断标准**：当主文件嵌入全部层级后预估超过 ~500 行 HTML（或含大量内联 HTML+CSS 的组件预览），拆分为子文件。

### 命名规则

demo 页面路径 -> html_spec 子目录名映射：

| demo 页面路径 | html_spec 子目录名 | 主文件路径 |
|---------------|-------------------|----------|
| `/security-ops-dashboard`（系统状态） | `system-status/` | `html_spec/system-status/index.html` |
| `/email-handling/disposal-center` | `email-handling-disposal-center/` | `html_spec/email-handling-disposal-center/index.html` |
| `/email-handling/disposal-settings` | `email-handling-disposal-settings/` | `html_spec/email-handling-disposal-settings/index.html` |
| `/filter-rules/pipeline` | `filter-rules-pipeline/` | `html_spec/filter-rules-pipeline/index.html` |
| `/filter-rules/group-policy` | `filter-rules-group-policy/` | `html_spec/filter-rules-group-policy/index.html` |
| `/statistics/security-overview` | `statistics-security-overview/` | `html_spec/statistics-security-overview/index.html` |
| `/monitor/dashboard` | `monitor-dashboard/` | `html_spec/monitor-dashboard/index.html` |
| `/admin/users` | `admin-users/` | `html_spec/admin-users/index.html` |
| `/admin/tenants` | `admin-tenants/` | `html_spec/admin-tenants/index.html` |
| ... | ... | ... |

组件级子目录命名：`component-<组件名>/`，主文件固定为 `component-<组件名>/index.html`（如 `component-mail-list-table/index.html`）。

交互层级子文件命名：`<模块子目录>/layer-<N>-<简述>.html`（如 `email-handling-disposal-center/layer-1-edit-dialog.html`、`email-handling-disposal-center/layer-2-form-linked.html`）。

### index.html 索引

`webapp/doc/html-spec/index.html` 维护全部页面/组件模块的覆盖状态，以可视化卡片网格呈现，每个模块一个卡片，含状态徽标（✅已生成 / ⬜待生成），可点击跳转到对应模块子目录的 `index.html`。

---

## HTML 文件模板

每个 html_spec 文件必须包含以下章节，以 HTML 语义化标签组织，内嵌 CSS **以 demo 视觉风格为准**。**完整可复制模板**见 [`references/html-template.md`](./references/html-template.md)，包含完整内嵌 CSS、各章节的表格结构、Mermaid 流程图示例。生成时以此为骨架填充内容。

### 文件结构概要

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><页面名称> - HTML 规格说明</title>
  <style>/* 内嵌样式，参考 demo globals.css 变量 */</style>
</head>
<body>
  <!-- 0. 元信息头 -->
  <header class="spec-header">
    <h1><页面名称> 详细产品规格说明</h1>
    <table class="meta-table">...</table>
  </header>

  <!-- 0.1 产品形态 × 角色视角差异矩阵（强制，形态5列 × 角色分组行） -->
  <section id="form-role-matrix">
    <h2>产品形态 × 角色差异矩阵</h2>
    <table class="matrix-table">
      <thead>
        <tr><th>角色 / 形态</th><th>AI-单</th><th>传统-单</th><th>云-多</th><th>AI-多</th><th>传统-多</th></tr>
      </thead>
      <tbody>
        <tr><td>平台管理员</td><td>—</td><td>—</td><td>✅</td><td>✅</td><td>✅</td></tr>
        <tr><td>租户管理员</td><td>✅</td><td>✅</td><td>🔒</td><td>✅</td><td>✅</td></tr>
      </tbody>
    </table>
    <p class="legend">图例：✅ 显示且可编辑 ｜ 🔒 显示但只读 ｜ ❌ 隐藏（URL 直连返回 403/404）｜ — 无此角色</p>
  </section>

  <!-- 0.2 组件列表（规格书头目录，列出全部组件+交互层级数+子文件超链接） -->
  <nav class="component-toc">
    <h2>📋 组件列表（点击跳转）</h2>
    <ul>
      <li><a href="#component-2-1">2.1 <组件名></a> <span class="toc-badge">1层</span></li>
      <li><a href="#component-2-2">2.2 <组件名></a> <span class="toc-badge">3层</span>
        <span class="toc-layer-links"><a href="./layer-1-xxx.html">层级1</a> ...</span></li>
    </ul>
  </nav>

  <!-- 0.3 功能概述（背景目标 + 功能点清单 + 数据流概述 + 角色权限边界） -->
  <section id="overview">
    <h2>功能概述</h2>
    <div class="overview-goal"><!-- 功能背景与目标 --></div>
    <table class="spec-table feature-list">
      <thead><tr><th>功能点</th><th>简述</th><th>对应组件</th></tr></thead>
      <tbody><tr><td><功能点></td><td><一句话简述></td><td><a href="#component-2-1"><组件名></a></td></tr></tbody>
    </table>
  </section>

  <!-- 1. 页面布局结构（含整页截图嵌入） -->
  <section id="layout">
    <figure class="screenshot-figure">
      <img src="./screenshots/page-full-default.png" alt="整页默认态">
      <figcaption>整页默认态截图</figcaption>
    </figure>
  </section>

  <!-- 2. 逐组件规格（每个组件一个 article，含可交互 HTML 预览 + 交互层级拆分） -->
  <section id="components">
    <article class="component-spec" id="component-2-1">
      <h3>2.1 <组件名></h3>
      <!-- 组件元信息表（含交互层级数） -->
      <!-- 交互层级关系图（Mermaid，多层交互时） -->
      <!-- 层级 0：内嵌 interaction-layer 块（初始态预览+截图+元素表+DOM比对） -->
      <div class="interaction-layer">
        <!-- 触发路径说明 -->
        <div class="component-preview"><!-- 从 demo 提取的实际 HTML+CSS --></div>
        <!-- 截图 -->
        <!-- UI 元素清单表 -->
        <!-- DOM 树比对结果表（与 demo 实际 DOM 逐节点比对） -->
      </div>
      <!-- 层级 1+：拆分为子文件，主文件放超链接索引表 -->
      <table class="spec-table layer-index">
        <tr><td>层级1</td><td><a href="./layer-1-xxx.html">查看详情 -&gt;</a></td></tr>
      </table>
    </article>
  </section>

  <!-- 3. 弹窗/抽屉/对话框规格 -->
  <!-- 4. 数据模型与 API 映射 -->
  <!-- 5. 关联功能模块（上游依赖 / 下游影响 / 配置联动 / 跨模块数据流向） -->
  <section id="related-modules">
    <h2>关联功能模块</h2>
    <table class="spec-table">
      <thead><tr><th>关联类型</th><th>模块</th><th>关系说明</th><th>数据/接口流向</th></tr></thead>
      <tbody>
        <tr><td>上游依赖</td><td><模块名></td><td><依赖其数据/配置></td><td><流向></td></tr>
        <tr><td>下游影响</td><td><模块名></td><td><本功能操作流向该模块></td><td><流向></td></tr>
        <tr><td>配置联动</td><td><模块名></td><td><开关/参数联动关系></td><td><流向></td></tr>
      </tbody>
    </table>
  </section>
  <!-- 6. 业务逻辑规格（含多租户数据隔离表现） -->
  <!-- 7. 交互规格（含批量 vs 单条操作差异表） -->
  <!-- 8. 异常场景规格（非法/边界值、权限冲突、后端超时降级、并发一致性） -->
  <section id="exceptions">
    <h2>异常场景规格</h2>
    <table class="spec-table">
      <thead><tr><th>异常类别</th><th>触发条件</th><th>预期表现（提示/兜底）</th></tr></thead>
      <tbody>
        <tr><td>非法输入/边界值</td><td><触发条件></td><td><预期表现></td></tr>
        <tr><td>权限不足/操作冲突</td><td><触发条件></td><td><预期表现></td></tr>
        <tr><td>后端超时/降级</td><td><触发条件></td><td><预期表现></td></tr>
        <tr><td>并发/数据一致性</td><td><触发条件></td><td><预期表现></td></tr>
      </tbody>
    </table>
  </section>
  <!-- 9. 国际化规格 -->
  <!-- 10. 响应式规格（嵌入各断点截图） -->

  <!-- 9. 与 spec 的差异标注（醒目红色边框） -->
  <section id="diffs" class="diff-section">
    <table class="diff-table">...</table>
  </section>

  <!-- 10. 需确认事项（醒目黄色边框） -->
  <section id="questions" class="question-section">
    <table class="question-table">...</table>
  </section>

  <!-- Mermaid CDN（如使用 Mermaid 流程图） -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({startOnLoad:true});</script>
</body>
</html>
```

### 章节清单

每个 html_spec 文件包含以下章节（与 detail_spec 章节对齐，但以 HTML 可视化呈现）：

1. **页面元信息**（`<header>`）：spec 源 / demo 源 / 覆盖章节 / 遵循约束 / 产品形态与视角差异
2. **产品形态 × 角色差异矩阵**（`<section id="form-role-matrix">`，强制）：形态（5 列）× 角色（分组行）的 `matrix-table`，单元格用 ✅/🔒/❌/— 图例符号，下附图例说明。见首要原则
3. **组件列表**（`<nav class="component-toc">`）：规格书头目录，列出本规格书涵盖的全部组件（含弹窗/抽屉），每个组件标注交互层级数（`toc-badge`），多层交互的层级 1+ 子文件也列出超链接（`toc-layer-links`）。点击可跳转到对应组件 `article` 的 `id` 锚点或子文件
4. **功能概述**（`<section id="overview">`）：**功能背景与目标**（该功能解决什么问题、面向什么场景，引用 spec 背景章节）、**功能点清单表**（逐条列出本页/模块的功能点 + 一句话简述 + 对应组件锚点）、**核心业务数据流概述**（一句话串起从入口到落库的主链路，细节引用业务逻辑章节）、**角色权限边界**（引用 §2 矩阵，说明各角色能做/不能做什么）
5. **页面布局结构**（`<section id="layout">`）：区域划分表 + 整页截图嵌入 + 视觉规范
6. **逐组件规格**（`<section id="components">`）：每个组件一个 `<article id="component-2-N">`，含**可交互组件 HTML 预览区**（从 demo 提取的实际 HTML+CSS）、组件截图、元信息表、UI 元素清单表、数据交互流（Mermaid/SVG）。**多层交互组件按交互层级拆分**：层级 0 内嵌在主文件，层级 1+ 拆分为独立 HTML 子文件，主文件用超链接索引表（`layer-index`）连接。每层独立呈现 HTML 预览 + 截图 + 元素表 + 触发路径 + **DOM 树比对结果表**（`dom-comparison`，提取的 HTML 与 demo 实际 DOM 逐节点比对）。**组件元信息表与 UI 元素清单表均须新增"形态/角色差异"列**，用 ✅/🔒/❌/— 图例符号 + `[Base]`/`[Overlay]`/`[单租户]`/`[多租户]` 编写标记标注差异（见首要原则）
7. **弹窗/抽屉/对话框规格**（`<section id="dialogs">`）：每个弹窗一个 `<article id="dialog-3-N">`，含截图、触发条件、UI 元素表
8. **数据模型与 API 映射**（`<section id="api-mapping">`）：前端数据模型（`<pre><code>` 代码块）、spec API 表、网关现有 API 映射表、数据库表映射表
9. **关联功能模块**（`<section id="related-modules">`）：**上游依赖模块**（本功能依赖哪些模块的数据/配置）、**下游影响模块**（本功能的操作会流向/影响哪些模块，如"加黑生成的策略流向发信人黑名单/内容规则模块"）、**配置联动关系**（跨模块的开关/参数联动）、**跨模块数据与接口流向表**。以 demo 可观察的跳转与生成关系为准，不可观察的列入 §16 需确认
10. **业务逻辑规格**（`<section id="business-logic">`）：状态机、状态转换规则表、权限与可见性、**多租户数据隔离表现**（各形态下租户间数据可见性与操作边界）、关键业务约束
11. **交互规格**（`<section id="interaction">`）：主操作流程、状态变化规则表、**批量操作 vs 单条操作逻辑差异表**（触发方式、确认方式、失败处理、结果反馈的差异）、Tooltip 规格表
12. **异常场景规格**（`<section id="exceptions">`）：独立成章，覆盖四类——**非法输入 / 边界值**、**权限不足 / 操作冲突**、**后端超时与降级兜底**、**并发与数据一致性**。每类给"触发条件 + 预期表现（提示文案/兜底行为）"；以 demo 可观察为主，不可观察的降级/并发策略列入 §16 需确认
13. **国际化规格**（`<section id="i18n">`）：支持语言表、i18n key 清单表
14. **响应式规格**（`<section id="responsive">`）：各断点行为表 + 嵌入断点截图
15. **与 spec 的差异标注**（`<section id="diffs" class="diff-section">`）：差异表（醒目红色边框 + 浅红背景）
16. **需确认事项**（`<section id="questions" class="question-section">`）：需确认表（醒目黄色边框 + 浅黄背景）

---

## 工作流程

### Phase 0：读取并递增版本（重生成时最先执行）

1. 读 `webapp/doc/html-spec/<模块>/version.json`：
   - 存在 → `prev = current_version`，本次 `version = prev + 1`。
   - 不存在 → 本次 `version = 1`，流程结束时新建该文件。
   - 重生成时同时读取现有主文件“与 spec 的差异标注”和“需确认事项”，建立完整的 D-* / Q-* 历史清单；后续必须逐项复核，不能遗漏或静默删除。
2. 取本次生成所基于的源 commit 短 hash（在仓库根执行）：
   - demo（页面级）：`git -C design/origin log -1 --format=%h -- demo/app/<目标路由>`
   - demo（组件级）：`git -C design/origin log -1 --format=%h -- demo/components/<对应目录>`
   - spec：`git -C design/origin log -1 --format=%h -- spec/<关联文件>`
3. 取生成日期（真实日期，`YYYY-MM-DD`）。
4. 暂存上述值，供 Phase 3 写回 version.json 与渲染版本行/版本历史表。

### Phase 1：定位与读取

1. **确认目标模块**：用户指定要生成的 demo 页面模块（路由路径）或组件名。
   - **页面级**：从 `sidebar-nav.tsx` 的 `navItems` 树找到对应的 `href` 路由，路由路径映射到 `demo/app/<路径>/page.tsx`。
   - **组件级**：用户指定组件名，在 `demo/components/` 下定位组件目录。
2. **定位 demo 源码**：
   - 读取 `page.tsx`（页面级）或组件入口文件（组件级），找到其引用的组件入口。
   - 读取该组件的完整源码及其全部子组件、依赖的 lib/config 文件。
3. **定位 spec 源文件（可选）**：
   - 按 demo 页面功能域，在 `design/origin/spec/` 下查找对应的 spec 文件（文件名匹配 + 内容关键词检索）。
   - 找到时读取相关 spec 文件的完整内容；不存在或未提供时记录 `spec: not-used`，继续以用户描述和 demo 为准，不得阻塞流程。
4. **读取约束**：读取 `design/origin/implement.md` 获取落地约束。

### Phase 1.5：启动 demo 并用浏览器验证实际渲染

> **强制步骤，不可跳过。** 源码阅读只能获取"写了什么"，浏览器验证才能确认"实际渲染成什么"。

1. **确认 demo 服务运行**：
   - 如果 `http://localhost:3000` 不可访问，在终端执行 `pnpm --dir design/origin/demo dev` 启动（后台运行）。
   - 等待 `Ready in ...` 输出，确认服务就绪。
2. **打开目标页面**：用 `open_browser_page` 打开 `http://localhost:3000<目标路由>`。
3. **整页截图**：对页面执行 `screenshot_page`，保存为参考截图（截图保存到 `webapp/doc/html-spec/<模块名>/screenshots/page-full-default.png`）。
4. **DOM 分析**：用 `read_page` 获取页面的 accessibility snapshot，验证：
   - 实际渲染的 DOM 结构与源码组件树是否一致。
   - 页面标题、区域划分、导航层级是否与预期匹配。
   - 是否有条件渲染的元素（如权限控制隐藏的区块、空态占位）。
5. **逐区域截图与验证**：对页面的每个主要区域执行：
   - `screenshot_page`（带 `ref` 或 `selector` 截取该区域）。
   - `read_page` 获取该区域的 DOM 结构，提取实际的文案、class、属性。
6. **交互验证**：对页面上的关键交互元素执行点击验证：
   - **按钮/操作**：用 `click_element` 点击每个操作按钮（查询、放行、召回、删除、导出等），截图记录点击后的 UI 变化。
   - **弹窗/抽屉**：触发后用 `screenshot_page` 截图，用 `read_page` 提取弹窗内的 DOM 结构与元素清单。
   - **表格交互**：点击表头排序、行内操作按钮、行复选框，验证实际交互行为。
   - **筛选器/下拉**：点击下拉选择器，截图记录选项列表与默认值。
   - **表单输入**：在输入框中输入测试值，验证校验提示与占位符。
   - **Hover/Tooltip**：用 `hover_element` 悬浮到带 Tooltip 的元素上，截图记录提示文案。
7. **可交互组件 HTML 提取**（核心步骤）：对每个组件的每个交互层级，从运行中的 demo 提取渲染后的 HTML+CSS：
   - 用 `run_playwright_code` 定位组件根元素（通过 selector 或 ref），执行 `page.evaluate(el => el.outerHTML, selector)` 提取 outerHTML。
   - 提取关键 computed style（用 `page.evaluate` 遍历 `getComputedStyle(el)` 取 display/flex/grid/colors/borders/padding/margin/font/border-radius 等），内联到 HTML 或追加为 `<style>` 块。
   - 保留 demo 的 Tailwind class（spec 文档内嵌 Tailwind CDN 或等效 CSS 变量兜底）。
   - 记录该组件在 demo 中的关键交互状态机：触发元素、事件类型、状态字段、DOM 变化、校验提示、禁用/选中/展开状态、弹窗/抽屉开关、表格排序分页等。
   - 将提取的 HTML+CSS 保存，供 Phase 3 嵌入 spec 文档的 `<div class="component-preview">` 容器。
   - **每个交互层级都要单独提取一次**（先点击触发到该状态，再提取该状态的 HTML）。
   - **逐层 DOM 树比对**（强制）：每个层级提取 HTML 后，立即用 `read_page` 获取该状态的 accessibility snapshot（或用 `page.evaluate` 遍历 DOM 树提取结构化节点信息），与提取的 HTML 做逐节点比对（节点数量、tagName、class、text content、关键属性），确认一致。不一致时以 demo 实际 DOM 为准修正提取的 HTML，并记录比对结果到 `dom-comparison` 表格。
8. **响应式验证**（至少验证 2 个断点）：
   - 用 `run_playwright_code` 设置不同视口宽度（如 1920px、1366px、1024px），截图记录响应式布局变化。
   - 代码示例：`await page.setViewportSize({ width: 1920, height: 1080 })`。
9. **暗色模式验证**（如 demo 支持）：切换暗色/亮色模式，截图记录配色变化。
10. **产品形态 × 角色差异验证**（强制，如 demo 支持切换）：用 demo 的产品形态切换器与登录视角切换器，**逐形态（AI-单/传统-单/云-多/AI-多/传统-多）× 逐角色（平台管理员/租户管理员）** 组合遍历，截图记录每个组合下功能组件/页面的入口可见性与可编辑性（可见可编辑 ✅ / 只读 🔒 / 隐藏 ❌ / 无此角色 —）。将结论整理成"形态 × 角色"矩阵，供 Phase 3 渲染 §0.1 差异矩阵及各组件的差异列。demo 不支持某形态/角色时，在矩阵中标注"demo 未覆盖"并列入 §16 需确认。

> **截图产物**：所有截图保存到 `webapp/doc/html-spec/<模块名>/screenshots/` 目录，文件名按 `<区域或交互>-<状态>.png` 命名（如 `query-filters-default.png`、`release-dialog-open.png`、`table-row-hover.png`）。在 HTML 文件中用相对路径 `./screenshots/<文件名>.png` 引用截图（主文件与子文件同在 `<模块名>/` 目录下，截图路径一致）。

### Phase 2：提取与交叉

对用户当前描述、demo 代码、可选的 spec 文档和**浏览器实际渲染**执行交叉提取：

1. **UI 结构提取**（从 demo 代码 **+ 浏览器 DOM 验证**）：
   - 页面区域划分、每个区域的 Tailwind class、逐个 UI 元素的 props 与行为、表格列定义、弹窗/抽屉规格、i18n key、TypeScript interface/type、Tooltip 文案。
   - **用浏览器截图 + DOM 确认实际文案、图标、位置、禁用状态。**
2. **业务逻辑提取**：
   - 优先提取用户当前描述中的目标、约束和已完成修改；原始 spec 存在时补充权限矩阵、数据流转、异常场景和测试用例，不存在时不得臆造。
3. **交叉比对**（demo 源码 vs spec 文档 vs 浏览器实际渲染）：
   - demo 源码的 UI 元素 vs spec 的界面布局设计 vs 浏览器实际渲染 -> 标注差异。
   - demo 的数据模型 vs spec 的接口与数据表 -> 标注映射与差异。
   - demo 源码的交互行为 vs spec 的交互设计 vs 浏览器点击验证的实际行为 -> 标注差异。
   - demo 源码的权限控制 vs spec 的权限矩阵 vs 浏览器切换形态后的实际可见性 -> 标注差异。
   - **源码与浏览器渲染不一致时，以浏览器实际渲染为准**，并在差异表中记录"源码写 X 但实际渲染为 Y"。

### Phase 2.5：交互层级拆分

对每个组件，分析其交互流程并**按层级拆分**，为每层准备独立的 HTML 预览 + 截图 + 元素表：

1. **梳理交互树**：从 demo 源码 + 浏览器实际操作，梳理出组件的全部交互路径（如：初始态 -> 点击按钮 A -> 弹窗打开 -> 弹窗内选择下拉 B -> 联动显示表单 C -> 提交 -> 关闭弹窗 -> 列表刷新）。
2. **按层级拆分**：将交互路径拆分为独立的交互层级，每层对应一个 UI 状态：
   - **层级 0**：组件初始态（默认渲染，无任何交互）。
   - **层级 1**：第一次交互后的态（如点击按钮后弹窗打开）。
   - **层级 2**：弹窗内进一步交互后的态（如表单联动）。
   - **层级 N**：更深层交互（如嵌套弹窗、多步引导）。
3. **每层产出**：为每个交互层级准备：
   - HTML 预览（从 Phase 1.5 步骤 7 提取的该状态 HTML+CSS）。
   - 截图（该状态的浏览器截图）。
   - 元素清单表（该状态可见的 UI 元素）。
   - 触发路径说明（从上一层如何触发到本层）。
   - **DOM 树比对结果表**（`dom-comparison`）：提取的 HTML 与 demo 实际 DOM 逐节点比对结果（节点数、tagName、class、text、关键属性是否一致），不一致项标注修正内容。
4. **多层交互拆文件**：层级 0（初始态）内嵌在主文件；层级 1 及以上拆分为独立 HTML 子文件（命名 `<模块名>/layer-<N>-<简述>.html`，与主文件同在模块子目录下），主文件用相对路径 `./layer-<N>-<简述>.html` 超链接索引表（`layer-index`）连接各子文件，子文件顶部放返回主文件的相对路径超链接。
5. **层级间关系图**：用 Mermaid 画出各交互层级之间的跳转关系（哪个操作从哪层跳到哪层），方便审查者理解全局交互流。关系图放在主文件的组件 `<article>` 内。

### Phase 3：生成 html_spec

1. 先创建或复用模块子目录 `webapp/doc/html-spec/<模块名>/`，并在其中生成主文件 `index.html`、截图目录 `screenshots/`、交互层级子文件 `layer-*.html`。根目录只更新总索引和共享资源，不放模块主文件。
2. 以 [`references/html-template.md`](./references/html-template.md) 为骨架，填充内容生成 HTML 文件。
3. **生成产品形态 × 角色差异矩阵**（`<section id="form-role-matrix">`，强制）：在元信息头之后、组件列表之前，用 Phase 1.5 步骤 10 遍历得到的结论渲染"形态（5 列）× 角色（分组行）"`matrix-table`，单元格填 ✅/🔒/❌/— 图例符号，矩阵下方附图例说明块。并在每个组件 `article` 的元信息表与 UI 元素清单表中补充"形态/角色差异"列（用图例符号 + `[Base]`/`[Overlay]`/`[单租户]`/`[多租户]` 编写标记）；无差异的组件用 `[Base]` 统一说明。四语国际化不进入本矩阵，仍归 §13。
4. **生成组件列表**（`<nav class="component-toc">`）：在差异矩阵之后、页面布局结构之前，列出本规格书涵盖的全部组件（含弹窗/抽屉），每个组件标注交互层级数（`toc-badge`），多层交互的层级 1+ 子文件也列出超链接（`toc-layer-links`）。每个组件的 `<article>` 必须设置 `id` 锚点（如 `component-2-1`、`dialog-3-1`），供组件列表超链接跳转。
5. **生成功能概述、关联功能模块、异常场景三章**：
   - **功能概述**（`<section id="overview">`，放组件列表之后）：写功能背景与目标（引用 spec 背景）、功能点清单表（逐条 + 简述 + 对应组件锚点）、核心业务数据流概述、角色权限边界（引用 §2 矩阵）。
   - **关联功能模块**（`<section id="related-modules">`）：记录上游依赖、下游影响、配置联动、跨模块数据/接口流向，以 demo 可观察的跳转与生成关系为准（如"加黑生成的策略流向发信人黑名单/内容规则模块"）。
   - **异常场景**（`<section id="exceptions">`，独立成章）：覆盖非法/边界值、权限不足/操作冲突、后端超时/降级、并发/数据一致性四类，每类给触发条件 + 预期表现。
   - 同时：业务逻辑章节补"多租户数据隔离表现"，交互章节补"批量 vs 单条操作差异表"。以上不可从 demo 观察到的降级/并发/联动策略，列入 §16 需确认，不臆造。
6. 所有 UI 描述**以浏览器实际渲染为准**，从截图 + DOM 验证提取，源码仅做补充。
7. 所有业务目标与验收描述**以用户当前描述为准**；未明确部分可结合 demo 当前行为，原始 spec 如存在只作补充和差异对照。
8. **嵌入可操作组件 HTML 预览**：将 Phase 1.5 步骤 7 提取的组件 HTML+CSS 嵌入 `<div class="component-preview">` 容器，确保在 spec 文档中 1:1 还原组件视觉；同时根据 demo 点击验证结果绑定最小必要的内联 JS，让按钮、输入、下拉、弹窗、Tooltip、排序/分页等交互能在 html_spec 内直接操作，行为与 demo 一致。保留 demo 的 Tailwind class，spec 文档内嵌 Tailwind CDN（`https://cdn.tailwindcss.com`）或等效 CSS 变量兜底。
9. **按交互层级组织组件规格**：对多层交互组件，按 Phase 2.5 拆分的层级，层级 0 内嵌在主文件的 `<div class="interaction-layer">` 块中（含 HTML 预览 + 截图 + 元素表 + 触发路径 + DOM 树比对结果表）。层级 1+ 拆分为独立 HTML 子文件（与主文件同在模块子目录下），主文件用相对路径超链接索引表（`layer-index`）连接，子文件顶部放返回导航超链接。层级间用 Mermaid 画出跳转关系图（放在主文件组件 article 内）。
10. 差异点用 `diff-table` 表格 + 醒目视觉样式（左侧红色边框 + 浅红背景）记录。重生成时对每个历史 D-* 逐项写明状态、复核日期、验证依据和处理说明/解决版本。
11. 需确认事项列入 §16 `question-table`（醒目黄色边框 + 浅黄背景），**不自行决定**。重生成时对每个历史 Q-* 逐项判断是否已经解决，已解决项也保留追溯记录。
12. 每个区域嵌入对应的截图文件（相对路径引用，主文件与子文件同在模块子目录下，统一用 `./screenshots/<文件名>.png`），如 `<img src="./screenshots/query-filters-default.png">`。
13. 交互流程图使用内嵌 Mermaid（通过 CDN 加载 mermaid.min.js）或内嵌 SVG。
14. CSS 内嵌在 `<style>` 标签中，参考 demo 的 `globals.css` 变量（primary 色 `oklch(0.52 0.226 262)`、radius `0.625rem`、字体 Geist），确保规格文档视觉风格与 demo 一致。
15. **生成后回放验证**：用浏览器打开生成后的 `index.html` 和每个 `layer-*.html`，按 demo 中记录的关键路径逐项点击/输入/hover。预览区交互结果必须与 demo 截图、DOM 比对表、元素表一致；不一致时修正 html_spec，不得只在文字中解释。
16. **写回 version.json**：向 `history` 追加本次记录（version / generated_at / demo_commit / spec_commit / summary），更新 `current_version`；version.json 不存在则以本模块名新建。`summary` 写一行本次相比上版的实际变化（首版写"初版：<覆盖要点>"）。
17. **渲染版本元信息**：在主文件 §0 meta-table 填入 `规格版本 v<N>` / `生成日期` / `demo 源 commit` / `spec 源 commit`（片段见 html-template.md）。
18. **渲染 §0.3 版本历史表**：在组件列表与页面布局之间插入 `<section id="version-history">`，从 version.json 的 `history` 按版本倒序渲染全部版本（片段见 html-template.md）。

### Phase 4：更新索引

更新 `webapp/doc/html-spec/index.html` 的覆盖状态卡片。同时更新该模块卡片的版本徽标：`card-version-badge` 用 version.json 的 `current_version` 渲染（如 `v3`），`card-generated-at` 用最新 history 的 `generated_at`（片段见 html-template.md）。version.json 缺失的模块不显示徽标。

---

## 关键注意事项

1. **必须用浏览器验证**：本技能的 UI 描述必须通过浏览器访问运行中的 demo、DOM 分析、截图、点击交互来确认实际渲染效果。**不能仅凭源码阅读推断 UI 细节。** 源码与浏览器渲染不一致时，以浏览器实际渲染为准。
2. **不修改 demo/spec 源文件**：本技能只读 demo 代码和 spec 文档，产物仅写入 `html_spec/`（含截图）。
3. **不自行实现功能**：html_spec 是规格说明，不是实现计划。落地实现由 `design/implement/spec/` 和 `design/implement/plan/` 承接。
4. **冲突不擅自决定**：用户当前描述决定目标要求，demo（浏览器渲染）记录当前实现；两者不一致时标注差异。原始 spec 如存在仅作补充/对照，缺失时不阻塞。涉及与网关底层冲突或需新增 API 的，列入 §16 需确认事项。
5. **遵循 implement.md**：四语国际化、复用统一规则系统 action、不新增规则系统等约束在 html_spec 中体现。
6. **HTML 自包含**：每个 HTML 文件内嵌 CSS，不依赖外部 CSS 框架。CDN 依赖仅限 Tailwind CDN（`https://cdn.tailwindcss.com`，用于兜底 demo 组件预览区的 utility class）和 Mermaid CDN（流程图）。截图用相对路径引用，确保整个 `html_spec/` 目录可离线打开（离线时 Tailwind/Mermaid CDN 不可用，但内嵌 CSS 仍保证基本可读性）。
7. **截图产物**：浏览器验证截图保存到 `html_spec/<模块名>/screenshots/`，在 HTML 文件中用相对路径 `./screenshots/<文件名>.png` 引用（主文件与子文件同目录，路径一致）。
8. **demo 启动**：使用 `pnpm --dir design/origin/demo dev` 启动 demo 开发服务器（端口 3000），浏览器访问 `http://localhost:3000<路由>` 进行验证。
9. **页面级与组件级**：用户指定路由路径时生成页面级 HTML（覆盖整页所有组件，子目录命名如 `email-handling-disposal-center/`）；用户指定组件名时生成组件级 HTML（只覆盖该组件及其子组件，子目录命名 `component-<组件名>/`）。
10. **可交互组件 HTML 化**：每个组件必须嵌入从 demo 提取的实际 HTML+CSS 预览（在 `<div class="component-preview">` 容器内），并绑定最小必要的内联 JS 让组件可操作，不能仅放截图、静态 `outerHTML` 或无响应控件。提取方法见 Phase 1.5 步骤 7。保留 demo 的 Tailwind class，spec 文档内嵌 Tailwind CDN 兜底。
11. **多层交互拆分**：涉及多层交互的组件（如表格 -> 弹窗 -> 表单联动），必须按交互层级拆分。层级 0（初始态）内嵌在主文件，层级 1+ 拆分为独立 HTML 子文件（命名 `<模块名>/layer-<N>-<简述>.html`，与主文件同在模块子目录下），主文件用相对路径超链接索引表连接，子文件顶部放返回导航。每层独立呈现 HTML 预览 + 截图 + 元素表 + 触发路径 + DOM 树比对结果表。审查者看任一层都能独立理解该状态的 UI 规格。层级间用 Mermaid 画出跳转关系图。
12. **逐层 DOM 树比对**（强制）：每个交互层级的 HTML 预览必须与 demo 该状态的实际 DOM 树做逐节点比对（节点数、tagName、class、text content、关键属性），比对结果记录在 `dom-comparison` 表格中嵌入该层块内（无论内嵌还是子文件）。不一致时以 demo 实际 DOM 为准修正提取的 HTML，并在比对表中标注修正内容。不能跳过比对直接嵌入未经校验的 HTML。
13. **文件大小控制**：单个 HTML 文件嵌入全部交互层级后预估超过 ~500 行 HTML 时，拆分子文件。每个模块的所有产物（主文件 `index.html`、层级子文件 `layer-*.html`、截图 `screenshots/`）统一放在 `html_spec/<模块名>/` 子目录下，避免不同模块的文件混放。子文件与主文件同目录，用相对路径 `./layer-*.html` 互引，共享同一套 CSS（内嵌或引用共享 `../assets/spec-style.css`），确保视觉风格一致。子文件必须包含返回主文件的超链接，主文件必须包含指向各子文件的超链接索引表。
14. **组件列表**（强制）：主文件元信息头之后必须包含 `<nav class="component-toc">` 组件列表目录，列出本规格书涵盖的全部组件（含弹窗/抽屉），每个组件标注交互层级数徽标（`toc-badge`，如"1层""3层"），多层交互的层级 1+ 子文件也列出超链接（`toc-layer-links`）。每个组件的 `<article>` 必须设置 `id` 锚点供列表跳转。审查者打开规格书首先看到组件全貌，可快速定位到感兴趣的组件。
15. **version.json 是版本号权威来源**：重生成时先读它取 `current_version` 再 +1，绝不从 index.html 解析版本号；缺失即首次生成（v1）。每模块一份，路径 `html_spec/<模块>/version.json`。
16. **不自动提交**：技能只写文件（含 version.json），**不执行 git commit/push**。历史快照边界由 `design/origin` submodule 的 git 承担；生成结束提示用户："已生成 v<N>，如需固化历史请在 design/origin submodule 提交。"
17. **回溯旧版本用 git**（不存目录快照）：version.json 每条 history 带 commit hash。查看某模块历史：`git -C design/origin log --oneline -- html_spec/<模块>/`；检出旧版：`git -C design/origin checkout <commit> -- html_spec/<模块>/`。
18. **产品形态 × 角色差异矩阵**（强制）：主文件必须包含 `<section id="form-role-matrix">`（元信息头之后、组件列表之前），用 5 种产品形态（AI-单/传统-单/云-多/AI-多/传统-多）× 2 种角色（平台管理员/租户管理员）矩阵 + ✅/🔒/❌/— 图例标注可见性与可编辑性；组件元信息表与 UI 元素清单表须补"形态/角色差异"列。差异结论以 Phase 1.5 逐形态 × 逐角色浏览器验证为准，与 spec 权限矩阵冲突时以 demo 为准并入 §15 差异标注。四语国际化与本矩阵无关，禁止混入（见首要原则）。
19. **系统视角三章**（强制）：主文件必须包含 §4 功能概述（背景目标 + 功能点清单 + 数据流概述 + 角色权限边界）、§9 关联功能模块（上游依赖 / 下游影响 / 配置联动 / 跨模块流向）、§12 异常场景（非法/边界值、权限冲突、后端超时降级、并发一致性）三章；业务逻辑章节补多租户数据隔离表现，交互章节补批量 vs 单条差异表。关联关系与异常表现以 demo 可观察为准，不可观察的降级/并发/联动策略列入 §16 需确认，禁止臆造 QPS、存储迁移等 demo 无法体现的后端指标。
20. **问题闭环复核**（强制）：重生成时逐项核对旧 §9/§10（扩展结构 §15/§16）的全部 D-* 与 Q-*，记录“已解决 / 部分解决 / 未解决 / 无法验证”、复核日期、验证依据和处理说明/解决版本；不得批量概括、遗漏编号或删除历史记录。
