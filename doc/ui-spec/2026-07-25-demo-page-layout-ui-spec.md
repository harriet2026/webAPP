# Webapp 页面大布局 UI 规格

- 日期：2026-07-25（v6 于 2026-07-28 以“邮件安全总览”重测改写）
- 状态：v6，页面大布局、全局字体、标题栏控件与首屏工具条整改基线
- 文档类型：跨页面 UI 布局规范
- 适用范围：`webapp/` 标准后台页面
- 首个验收页面：邮件安全总览（统计报表 › 邮件安全总览）
- UI 事实源：运行中的 webapp 页面 `/[locale]/statistics/security-overview`
- 参考实现：`src/components/statistics/security-overview/SecurityOverviewPage.tsx`
- 共享布局原语：`src/components/shared/page-shell.tsx`
- 应用外壳：`src/components/layout/app-shell.tsx`
- 上位设计语言：[`DESIGN.md`](../../../DESIGN.md)
- 配套交互规范：[跨页面柔和交互反馈 UI 规格](./2026-07-25-cross-page-gentle-interaction-feedback-ui-spec.md)
- 配套国际化规范：[跨页面国际化与文本完整性 UI 规格](./2026-07-28-cross-page-i18n-text-integrity-ui-spec.md)

## 0. v6 修订说明

v2–v5 以运行中的 demo `/security-ops-dashboard` 为事实源，规定了
“`gray-50` 外层留白 + `gray-100` 内层画布 + 白色标题带”的三层 framed 结构，
并要求页面统一走 `FramedPage`。

v6 改以运行中的 webapp 页面 **邮件安全总览** 为唯一事实源，在 1440×900、
100% zoom、DPR 1 下重新实测，并据此改写全部尺寸、画布和标题栏规则。核心
变化：

- **画布从“两层灰阶”改为“单层浅色画布 + 白色表面”**。页面主体是一整块
  连续的 `#F8F9FB`，不再区分 `gray-50` 外层与 `gray-100` 内层；白色只
  出现在标题带和一级卡片上。
- **组合方式从 `FramedPage` 改为 `PageShell(default) + PageHeader + 业务区块`**。
  参考页面直接组合默认 variant，不再使用 `FramedPage` / `PageBody` 三层封装。
- **单层画布由 `PageShell` 自绘实现**：`bg-[#F8F9FB]` 叠加
  `shadow-[0_0_0_32px_#F8F9FB]`，用 32px 的实心投影把 `PageViewport`
  的 32px 内边距一起涂成同色，形成无缝的连续画布。
- **标题带是全宽白色带**：`PageHeader` 默认 variant 通过 `-mx-8 -mt-8`
  溢出到 `PageViewport` 边缘，形成横贯主滚动区的白色标题带，底部 1px 分隔线。
- **标题带允许并推荐带图标**：标题前放 20×20 主题色图标；标题为 20/28、
  **600**、`-0.5px` 字距（`tracking-tight`），副标题为 **12/16**、400。
- **首屏工具/状态区是标准白色卡片**：邮件安全总览首个区块是筛选工具条，
  为 `rounded-xl`（12px）、1px 边框、`shadow-sm` 的白色卡片，与其它一级
  卡片同一表面规格；加载失败态复用同一卡片表面并叠加 destructive 语义色。

v5 中关于两层灰阶、禁止 box-shadow 涂抹父层、禁止 PageHeader 负边距、
强制 `FramedPage`、以及 46px `StatusBanner` 的硬性条款，均被本版对应条款覆盖。
字体、圆角、品牌色和其它语义 token 仍遵循 `DESIGN.md`。

## 1. 目的

webapp 与参考页面之间最需要统一的，是页面最外层的空间关系与表面层级，
而不是卡片内部细节。本规格固定：后台外壳尺寸与滚动责任、页面四周 32px
呼吸空间、单层 `#F8F9FB` 画布与白色表面的两层关系、标题带的字体与位置。

本规格只定义**页面大布局**，不定义邮件安全总览的 KPI、图表、趋势、明细表、
下钻或数据接口等业务交互。

目标：

- 固定后台外壳的尺寸和滚动责任；
- 保留页面四周 32px 的呼吸空间，且该空间与页面主体同为 `#F8F9FB`；
- 统一“`#F8F9FB` 连续画布 + 白色标题带 + 白色一级卡片”的两层表面关系；
- 让页面通过共享布局原语获得一致结构，禁止逐页复制布局 class；
- 为后续其它页面整改提供可量化、可截图验收的基线。

## 2. 适用范围与例外

### 2.1 默认适用

以下页面默认使用本规格：

- 仪表盘、系统状态、监控和统计页面；
- 列表、日志、策略、设置等标准后台路由；
- 同时包含页面标题和主体内容的一级页面。

### 2.2 不直接适用

以下场景不套用完整结构：

- 登录、错误页等全屏路由；
- Dialog、Drawer、Popover 内的嵌入页面；
- 打印、导出和独立大屏；
- 明确登记为 full-bleed 的沉浸式页面。

嵌入场景不应重复渲染后台侧栏、顶部栏、32px 外层留白或页面标题带，由宿主
容器提供标题和内边距。

### 2.3 与既有设计说明的关系

本规格是从运行中的邮件安全总览页面浏览器实测得到的**页面大布局事实源**。
对于邮件安全总览及后续按其对齐的标准后台页面：

- 侧边栏使用实测的 256px，而不是 `DESIGN.md` 旧描述中的 240px；
- 页面保留 `PageViewport` 内的 32px 外层留白，不使用负边距抵消整块留白；
- 页面主体画布为单层 `#F8F9FB`，该局部规则覆盖 `DESIGN.md` 与本规格 v5
  中的两层灰阶描述；
- 页面标题带位于主滚动区顶部、横贯页面宽度，是唯一允许的全宽白色带；
- 字体、圆角、品牌色、状态色和其它语义 token 仍遵循 `DESIGN.md`。

## 3. 标准布局结构

```text
Viewport
├── SidebarNav                         256px × 100dvh, shrink-0
└── Workspace                          flex-1, min-w-0
    ├── Topbar                         56px, white, 1px bottom border
    └── MainScroll                     flex-1, overflow-y: auto
        └── PageViewport               padding: 32px, bg-background
            └── PageShell(default)     #F8F9FB canvas, space-y-6
                ├── PageHeader         white full-bleed band (-mx-8 -mt-8)
                └── PageBlocks         white rounded-xl cards, gap 24px
```

结构职责不可交换：

- `Viewport` 和 `Workspace` 只负责应用级布局；
- `MainScroll` 是标准页面唯一的纵向滚动容器；
- `PageViewport` 负责 32px 外层内边距和页面可用高度；
- `PageShell` 负责把整块画布涂成连续 `#F8F9FB` 并提供 24px 区块节奏；
- `PageHeader` 负责全宽白色标题带、图标、标题、副标题和页面级操作；
- 业务区块（工具条、卡片、图表、表格）负责各自内容，统一使用白色卡片表面。

## 4. 核心尺寸

### 4.1 几何尺寸

| 区域 | 规格 | 代码依据 |
|---|---:|---|
| 侧边栏宽度 | 256px | `w-64`，`shrink-0` |
| 顶部栏高度 | 56px | `h-14`（Header） |
| 顶部栏水平内边距 | 24px | `px-6` |
| 顶部栏控件间距 | 12px | `gap-3` |
| 页面外层留白 | 32px，四边一致 | `PageViewport` `p-8` |
| 标题带水平内边距 | 32px | 默认 `PageHeader` `px-8` |
| 标题带垂直内边距 | 16px | `py-4` |
| 标题带底边 | 1px hairline | `border-b border-border` |
| 标题图标尺寸 | 20×20px | `h-5 w-5`，`mt-0.5` |
| 图标与标题间距 | 12px | `gap-3` |
| 标题与副标题间距 | 4px | 默认 variant `space-y-1` |
| 一级区块纵向间距 | 24px | `PageShell` 默认 `space-y-6` |
| 标题带到首个区块间距 | 8px | `PageHeader` `mb-2` |
| 卡片内边距 | 16px | `p-4` |
| 卡片圆角 | 12px | `rounded-xl` |
| 主内容网格间距 | 24px | `gap-6` |
| 紧凑网格间距 | 16px | `gap-4` |

所有尺寸以 CSS px 为基准，不随蓝色/绿色主题变化。

### 4.2 画布与表面颜色

| 层级 | 亮色模式 | 暗色模式 | 说明 |
|---|---|---|---|
| PageViewport 内边距底色 | 被 PageShell 投影覆盖为 `#F8F9FB` | 同 `--background` | 32px 留白与主体同色 |
| PageShell 画布 | `#F8F9FB` / `rgb(248,249,251)` | `--background` | 单层连续画布 |
| 页面标题带 | `#FFFFFF` | `--background` | 全宽白色标题带 |
| 标题带底边 | `#E5E7EB`（gray-200） | `gray-800` | 1px hairline |
| 一级卡片表面 | `#FFFFFF` | `bg-card` | 工具条、KPI、图表、表格 |
| 一级卡片边框 | `#E5E7EB`（gray-200） | `border-border` | 1px |

硬规则：

- 页面主体是**单层**连续画布 `#F8F9FB`，32px 外层留白与主体同色，二者
  之间不得出现任何灰阶色带或接缝；
- 单层画布由 `PageShell` 的 `bg-[#F8F9FB]` + `shadow-[0_0_0_32px_#F8F9FB]`
  实现；32px 投影用于把 `PageViewport` 的 `p-8` 留白涂成同色，是本规格
  明确允许的手法；
- 白色只出现在标题带和一级卡片上，形成“浅色画布 + 白色表面”两层关系；
- 蓝色/绿色主题不改变画布与表面的中性颜色；
- 暗色模式统一回落到 `--background` / `bg-card`；
- 不得用未经核对的 `bg-muted` 等 token 近似替代 `#F8F9FB`，除非其最终
  computed color 已等于 `rgb(248,249,251)`。

## 5. 宽度计算

标准桌面态不设置页面 `max-width`，页面随可用工作区流式拉伸。

设：

- 视口宽度为 `V`；
- 侧边栏宽度 `S = 256`；
- 页面外层留白 `G = 32`。

则：

```text
WorkspaceWidth  = V - S
MainScrollWidth = V - S
PageShellWidth  = V - S - 2G      // PageShell 内容盒（不含 32px 投影环）
```

浏览器实测（DPR 1）：

| 视口宽度 | Workspace / MainScroll | PageShell 内容盒 |
|---:|---:|---:|
| 1920px | 1664px | 1600px |
| 1440px | 1184px | 1120px |

验收容差：

- 应用外壳、外层留白和标题带内边距：`±1px`；
- 因子像素分配导致的等分网格列宽：`±1px`；
- 不允许通过新增 `max-width` 让大屏页面居中收窄。

标题带因使用 `-mx-8` 溢出，其外框宽度为 `MainScrollWidth`（1440px 下 1184px、
1920px 下 1664px），而工具条、卡片等区块宽度为 `PageShellWidth`（1120 / 1600px）。

## 6. 应用外壳

### 6.1 侧边栏

- 宽度固定为 256px，必须 `shrink-0`；
- 高度占满动态视口，内部菜单可独立纵向滚动；
- 侧边栏不随主内容滚动离开视口；
- 深色侧边栏是页面唯一的大面积深色表面；
- 菜单悬浮与选中态遵循配套交互规范，不在页面内重复实现。

### 6.2 顶部栏

- 高度固定 56px，位于 Workspace 顶部；
- 白色表面 `#FFFFFF`，底部 1px 分隔线 `#E5E7EB`；
- 控件整体右对齐；
- 水平内边距 24px，组内间距 12px；
- 顶部栏 `shrink-0`，不参与主内容滚动；
- 产品形态、主题、语言和用户菜单只改变内容，不改变顶部栏高度。

### 6.3 主滚动区

- 高度为动态视口减去顶部栏及可见的全局横幅；
- 使用 `overflow-y: auto`，自身内边距为 0；
- 页面滚动发生在主滚动区，而不是 `body`；
- `Workspace` 及其可收缩子节点必须使用 `min-width: 0`，防止宽内容撑破视口；
- 横向溢出由具体表格或图表容器处理，禁止让整个页面出现横向滚动。

### 6.4 全局字体

- webapp 全局无衬线字体使用 100–900 可变 Geist；
- 根布局使用 `geist/font/sans` 的 `GeistSans`，通过 `--font-geist-sans`
  提供给全局 `font-sans`，实测 computed family 为 `GeistSans`；
- 全局等宽字体使用 `geist/font/mono` 的 100–900 可变 `GeistMono`；
- 禁止从 `geist/font` 根入口加载按 100–900 分档的多份静态字体；
- 页面标题、正文、按钮、卡片和表单控件默认继承全局字体，不再分别导入
  字体或添加局部 `font-family` 补丁；
- 浏览器验收必须在 `document.fonts.ready` 后确认加载的是单个
  `font-weight: 100 900` 字体资源，而不是 400/500/600/700 多个分档资源。

字体族在不同加载器中可能显示为 `Geist` 或 `GeistSans`；应以字重轴、文字盒
和最终像素为验收依据，不以 family 展示名称是否相同作为失败条件。

## 7. 页面框架

### 7.1 PageViewport

`PageViewport` 是主滚动区的直接内容容器（`app-shell.tsx` 中带
`data-testid="app-page-viewport"` 的 `div`）：

- 四边统一 32px（`p-8`）；
- `min-height: 100%`，填满主滚动区；
- 默认布局（`data-layout="default"`）下背景为 `bg-background`；该背景会被
  `PageShell` 的 32px 投影完全覆盖为 `#F8F9FB`；
- 页面标题带和页面主体都必须落在这 32px 留白之内的视觉画布上；
- 禁止子页面再叠加第二层 `p-8` 形成 64px 双重留白。

### 7.2 PageShell（default variant）

- 使用 `PageShell` 默认 variant（`data-layout="default"`），类名叠加
  `space-y-6`；
- 参考页面额外声明：
  `min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB]`，
  暗色 `dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]`；
- `bg-[#F8F9FB]` 铺满内容盒，`shadow-[0_0_0_32px_#F8F9FB]` 把 32px 外层
  留白涂成同色，形成无缝连续画布；
- 自身宽度占满 `PageViewport` 可用宽度，不设置 `max-width`；
- 通过 `space-y-6` 给一级区块提供 24px 纵向节奏；
- 该 box-shadow 仅用于铺色，不产生可见阴影边缘，也不得替代卡片自身阴影。

### 7.3 PageHeader（default variant）

#### 7.3.1 容器与位置

- 背景为亮色 `#FFFFFF`，暗色 `--background`；
- 底边为 1px：亮色 `#E5E7EB`（gray-200），暗色 `gray-800`；
- 通过 `-mx-8 -mt-8 mb-2` 溢出到 `PageViewport` 边缘，形成横贯主滚动区的
  **全宽白色标题带**；下方保留 8px（`mb-2`）到首个区块；
- 左右内边距 32px（`px-8`），上下内边距 16px（`py-4`）；
- 不设圆角、不设阴影；
- 内层使用 `flex`、`items-center`、`justify-between`（`@[560px]` 断点内）；
- 标准页面推荐在标题前放置 20×20 主题色图标；无图标页面标题起点相应左移，
  但仍处于 `PageViewport.x + 32px` 内边距之后。

邮件安全总览在 1440×900 视口中的实测坐标：

| 节点 | x | y | 宽 | 高 |
|---|---:|---:|---:|---:|
| 标题带外框 | 256px | 56px | 1184px | 81px |
| 图标 | 288px | 74px | 20px | 20px |
| 标题 `h1` | 320px | 72px | 264.02px | 28px |
| 副标题 `p` | 320px | 104px | 264.02px | 16px |

标题带 81px 高度来自 `16 + 28 + 4 + 16 + 16 + 1px bottom border`
（上内边距 + 标题 + 标题副标题间距 + 副标题 + 下内边距 + 底边），随内容
自然收敛，不得硬编码 `height: 81px`。

#### 7.3.2 标题与副标题

| 元素 | 字体 | 字号/行高 | 字重 | 字距 | 颜色（亮色） |
|---|---|---|---:|---|---|
| 页面标题 `h1` | GeistSans | 20px / 28px | 600 | `-0.5px`（`tracking-tight`） | `text-foreground`（近黑 `#0A0A0A`） |
| 页面副标题 `p` | GeistSans | 12px / 16px | 400 | `normal` | `text-body`（中性次要文字色） |

排版规则：

- 标题、副标题、图标和操作控件必须继承同一 100–900 Geist 可变字形来源；
- 一个页面只有一个主标题，使用语义化 `h1`；
- 标题使用 `text-xl font-semibold tracking-tight`（20/28、600、`-0.5px`），
  不得改为 700 或 `normal` 字距；
- 副标题使用 `text-xs leading-4`（12/16、400），`max-w-3xl` 限宽，不得
  升为 14/20；
- 标题与副标题之间为 4px（`space-y-1`）；
- 副标题是可选项；无副标题时标题带高度随内容自然收敛；
- 文案来自 i18n，不在共享组件中硬编码；四语覆盖、长文案布局和
  `U+FFFD` 零容忍遵循配套国际化与文本完整性规格。

#### 7.3.3 标题图标

- 图标位于标题组最前，`h-5 w-5`（20×20px），`shrink-0`；
- 使用 `mt-0.5`（2px）与标题基线对齐；
- 颜色为 `text-primary`（主题色，蓝色主题下为蓝色）；
- 图标与右侧文字列间距 12px（`gap-3`）；
- 图标是标准标题带的一部分，不需要独立 variant；无图标时不得改变
  其余排版规则。

#### 7.3.4 页面级操作区

- 操作区 `flex`、`items-center`，控件间距 12px（`gap-3`），`shrink-0`；
- 在 `@[560px]` 及以上与标题组同排、右对齐并垂直居中；
- 宽度不足时操作区落到标题组下方（`self-end`），标题带高度随内容增长；
- 操作控件统一使用共享的标题栏 Select / Button 规格，不直接套用全局
  紧凑控件默认值；
- hover、focus、pressed、loading 动效遵循配套的跨页面柔和交互反馈规格。

#### 7.3.5 宽度不足与长文案

- 标题带左侧文字容器必须 `min-width: 0`；
- 右侧操作区不得被标题挤压、截断或覆盖；
- 换行检查点为 `PageHeader` 内层容器 560px（`@container` + `@[560px]`），
  以容器宽度判断，而不是只看 viewport；
- zh/en/th/ru 下允许标题或副标题自然换行，不使用省略号隐藏页面语义；
- 响应式状态仍保持 16px 上下、32px 左右内边距。

#### 7.3.6 字体字形与控件验收方法

不得只看到 Tailwind class 或 computed `font-weight` 相同就判定通过。
标题栏字体验收至少包含：

1. 等待 `document.fonts.ready`；
2. 确认标题带、标题、副标题和按钮继承同一字体族；
3. 在资源列表中确认加载 100–900 可变 Geist（`GeistSans`），而非分档静态版；
4. 读取 `font-size`、`line-height`、`font-weight`、`letter-spacing`；
5. 使用 `Range.getBoundingClientRect()` 测量实际文字盒，而不是只测外框；
6. 在相同 viewport、zoom、device scale 下截取标题带并比较可见 RGBA 像素。

邮件安全总览 1440×900 基线文字盒：

| 文本 | 字号/行高 | 字重 | 字距 |
|---|---:|---:|---:|
| `邮件安全总览` | 20/28 | 600 | `-0.5px` |
| 副标题全文 | 12/16 | 400 | `normal` |

### 7.4 业务区块与卡片表面

- 一级区块直接作为 `PageShell` 的子节点排列，彼此间距 24px（`space-y-6`）；
- 首个区块距标题带底边 8px（标题带 `mb-2`）；
- 一级卡片使用白色表面 `#FFFFFF`、1px `#E5E7EB` 边框、`rounded-xl`（12px）
  圆角和 `shadow-sm`（`0 1px 3px rgba(0,0,0,.1)`, `0 1px 2px -1px rgba(0,0,0,.1)`）；
- 卡片默认内边距 16px（`p-4`）；
- 卡片之间的浅色缝隙即单层画布 `#F8F9FB`，不得再插入第三种灰色；
- 页面自身不再额外添加第二层外边距或 `p-8`。

### 7.5 首屏工具/状态区

邮件安全总览首个区块是**筛选工具条**，用于承载租户范围、邮件方向和时间范围
筛选。它是一个标准一级卡片，不是悬浮条：

| 项目 | 规格 |
|---|---|
| 宽度 | `100%`，占满 PageShell 内容盒（1440px 下 1120px） |
| 背景 | `#FFFFFF` |
| 边框 | 1px `#E5E7EB` |
| 圆角 | 12px（`rounded-xl`） |
| 阴影 | `shadow-sm` |
| 内边距 | 16px（`p-4`） |
| 内容间距 | 16px（`gap-4`），`flex-wrap` |

1440×900 实测：工具条外框 `x=288, y=145, w=1120, h=68`。

页级健康 / 告警 / 加载失败态复用同一卡片表面，并叠加语义色：

- 加载失败卡片使用 `role="alert"`、`border-destructive/30`、`bg-destructive/5`，
  内含图标、标题、说明和重试按钮；
- 语义色使用 destructive / warning / success 对应的 token，不改变卡片的
  圆角、边框宽度和阴影几何；
- 状态不能只靠颜色表达，必须同时提供图标和明确文案；
- loading 骨架占位应保持与最终内容一致的卡片高度基线，避免数据返回后跳动。

## 8. 滚动与高度

标准页面只允许以下滚动层：

1. 侧边栏菜单在自身高度不足时滚动；
2. 主页面由 `MainScroll` 纵向滚动；
3. 表格、时间线或超宽图表可在自己的边界内横向滚动。

禁止：

- `body` 与 `MainScroll` 同时出现纵向滚动条；
- 在 `PageShell` 内再创建一个整页纵向滚动容器；
- 标题带随页面内容单独滚动而顶部栏也滚动；
- 为避免溢出给业务根节点使用 `overflow: hidden`，导致菜单、Tooltip 或
  focus ring 被裁切。

如果页面需要 sticky 工具栏，应相对 `MainScroll` 定位并明确顶部偏移，不得
创建新的整页滚动上下文。

## 9. 响应式规则

### 9.1 桌面基线

像素级基线为视口宽度 `≥ 1280px`：

- 侧边栏保持 256px；
- 页面外层留白保持 32px；
- 标题带标题、图标和操作在 `@[560px]` 断点内同排；
- 页面主体流式占满剩余宽度。

### 9.2 中等宽度

在 `1024px–1279px`：

- 应用外壳尺寸不变；
- 页面外层留白和卡片内边距不变；
- 标题带操作区可在空间不足时换到标题下方；
- 业务网格应根据 **PageShell 内容盒宽度**（容器查询）降列，不能只依据整个
  viewport 的 Tailwind `lg` 断点。

### 9.3 窄屏

在无法同时容纳 256px 侧边栏和有效页面内容时：

- 侧边栏切换为图标轨或覆盖式抽屉（`md` 以下隐藏 `aside`）；
- 顶部栏保留 56px；
- 页面外层留白可收敛为 16px；
- 卡片内边距可收敛为 12–16px；
- 标题带操作区换行，控件宽度不得溢出；
- 窄屏规则由共享 AppShell 统一处理，页面不得各自隐藏侧边栏。

## 10. 共享组件与实现边界

大布局必须收敛到共享原语，不允许每个页面重新拼装。

| 共享组件 | 负责 | 不负责 |
|---|---|---|
| `AppShell` | Sidebar、Topbar、MainScroll、`PageViewport`（32px 留白与可用高度） | 页面标题和业务内容 |
| `PageShell`（default） | `space-y-6` 区块节奏、页面画布铺色标识（`data-layout`） | 标题排版和业务内容 |
| `PageHeader`（default） | 全宽白色标题带、图标、标题/副标题排版、页面级操作 | 页面内容筛选逻辑 |
| 业务卡片（`Card` / `PageSurface`） | 白色一级表面、`rounded-xl`、1px 边框、`shadow-sm` | 页面大布局 |

实现要求：

- 优先复用 `src/components/shared/page-shell.tsx` 的 `PageShell` /
  `PageHeader` 默认 variant，不新增一套同义组件；
- 参考页面组合为 `PageShell + PageHeader + 业务区块`，页面通过 `className`
  在 `PageShell` 上声明 `#F8F9FB` 画布与 32px 投影；
- 单层画布颜色与 32px 投影是本规格明确认可的实现手法，取代 v5 的
  “两层灰阶 + 禁止 box-shadow 涂抹”条款；
- 标题带图标、标题、副标题排版由 `PageHeader` 默认 variant 固定，页面只传
  `title`、`description`、`icon`、`actions`；
- RootLayout 全局使用 `geist/font/sans` 与 `geist/font/mono` 的可变字体；
  标题带、操作区和业务内容统一通过继承获得同一字形来源；
- `FramedPage` / `PageBody` 作为历史 framed 结构保留，仅供仍需两层灰阶的
  遗留页面使用；新页面以本规格的默认 variant 为准；
- embedded 场景使用低层原语或独立 variant，不通过覆盖 class 猜测宿主环境。

标准页面调用示例（对齐邮件安全总览）：

```tsx
<PageShell
  className="min-h-full bg-[#F8F9FB] shadow-[0_0_0_32px_#F8F9FB] dark:bg-background dark:shadow-[0_0_0_32px_var(--background)]"
  data-testid="security-overview-page"
>
  <PageHeader title={t('title')} description={t('subtitle')} icon={Shield} />
  <FilterBar {...filterProps} />
  <KpiCards {...kpiProps} />
  {/* ...其余一级区块，彼此 24px 间距 */}
</PageShell>
```

## 11. 禁止模式

- 在页面主体画布上重新引入 `gray-50` 外层 + `gray-100` 内层的两层灰阶；
- 让 32px 外层留白与页面主体出现不同颜色或可见接缝；
- 页面根节点再叠加一层 `p-8`，形成 64px 双重留白；
- 一级卡片之间插入第三种灰色底或透明叠色造成的色带；
- 把标题带做成非全宽的内缩白卡，破坏横贯主滚动区的白色带；
- 为标准桌面页面设置任意 `max-w-*` 并居中；
- 页面内硬编码侧边栏宽度或顶部栏高度；
- 页面自行使用 `position: fixed` 模拟 AppShell；
- `body`、MainScroll 和页面内层三层同时滚动；
- 蓝色/绿色主题切换时改变布局尺寸；
- 只比较 `font-weight` 数值，不核对实际字体资源和文字盒；
- 把标题降回 700 或去掉 `-0.5px` 字距，把副标题升为 14/20；
- 用 box-shadow 铺色时产生可见阴影边缘，或用它替代卡片自身阴影；
- 用截图近似值替代本规格中的 256/56/32/24px 核心尺寸。

## 12. 浏览器证据

本规格在运行中的 webapp 页面
`/[locale]/statistics/security-overview` 上进行 DOM、computed style、
边界尺寸和截图验证（1440×900 与 1920×960，100% zoom，DPR 1）。

### 12.1 外壳与画布实测（1440×900）

| 节点 | x | y | 宽 | 高 | 关键 computed |
|---|---:|---:|---:|---:|---|
| Sidebar | 0 | 0 | 256 | 900 | `width: 256px`，`shrink-0` |
| Topbar | 256 | 0 | 1184 | 56 | `#FFFFFF`，`border-bottom: 1px #E5E7EB` |
| MainScroll | 256 | 56 | 1184 | 844 | `overflow-y: auto`，`padding: 0` |
| PageShell 内容盒 | 288 | 56 | 1120 | 流式 | `bg: rgb(248,249,251)`，`box-shadow: 0 0 0 32px rgb(248,249,251)`，`padding: 0` |

画布颜色层级必须读作：

```text
#F8F9FB 连续画布（含 32px 外层留白）
├── #FFFFFF 全宽标题带
└── #FFFFFF 一级卡片
```

不得读作“外层 gray-50 + 内层 gray-100 两层灰阶”。

### 12.2 标题带实测（1440×900）

- 标题带外框 `x=256, y=56, w=1184, h=81`，`#FFFFFF`，底边 1px `#E5E7EB`，
  内边距 `16px 32px`，外边距 `-32px -32px 8px`；
- 图标 `x=288, y=74, 20×20`，`text-primary`（蓝色主题下为蓝色）；
- 标题 `邮件安全总览`：`x=320, y=72, w≈264, h=28`，GeistSans 20/28、600、
  `-0.5px`，`text-foreground`；
- 副标题：`x=320, y=104, h=16`，12/16、400，`text-body`，`max-w-3xl`；
- 标题与副标题间距 4px（`space-y-1`）。

### 12.3 首屏工具条与区块节奏（1440×900）

- 筛选工具条外框 `x=288, y=145, w=1120, h=68`，`#FFFFFF`，1px `#E5E7EB`，
  `rounded-xl`（12px），`shadow-sm`，内边距 16px，内容间距 16px，`flex-wrap`；
- 标题带底边到工具条顶边 8px（`mb-2`）；
- 一级区块之间纵向间距 24px（`space-y-6`）。

### 12.4 1920px 宽度验证

- Sidebar 保持 `x=0, w=256`；
- PageShell 内容盒 `x=288, w=1600`，从 1120px 流式增长到 1600px，左右
  外层留白仍为 32px；
- 页面没有设置最大宽度。

### 12.5 加载失败态

后端接口不可用时，页面在标题带与筛选工具条下方渲染一张
`role="alert"` 卡片（`border-destructive/30`、`bg-destructive/5`），含
图标、标题、说明和重试按钮；卡片圆角、边框和阴影与其它一级卡片一致，仅
叠加 destructive 语义色。此态可作为单层画布 + 白色表面关系的清晰视觉样本。

## 13. Webapp 对齐验收

邮件安全总览页面按本规格整改后，必须同时满足：

- [ ] 侧边栏实测宽度为 256px；
- [ ] 顶部栏实测高度为 56px，白色表面且底边为 1px `#E5E7EB`；
- [ ] 页面与顶部栏、侧边栏、主滚动区右边和底边均保留 32px 外层留白；
- [ ] 页面主体为单层 `#F8F9FB` 连续画布，32px 留白与主体同色、无接缝；
- [ ] 单层画布由 `PageShell` `bg-[#F8F9FB]` + `shadow-[0_0_0_32px_#F8F9FB]` 实现；
- [ ] 未出现 `gray-50` / `gray-100` 两层灰阶；
- [ ] RootLayout 全局加载单个 100–900 GeistSans 与单个 100–900 GeistMono；
- [ ] 页面组件统一继承全局字体，不存在局部字体补丁；
- [ ] 标题带为全宽白色带，横贯主滚动区，底边 1px `#E5E7EB`，无圆角/阴影；
- [ ] 标题带内边距为上下 16px、左右 32px；
- [ ] 标题前有 20×20 主题色图标，图标与标题间距 12px；
- [ ] 标题使用 GeistSans 20/28、600、`-0.5px` 字距、`text-foreground`；
- [ ] 副标题使用 GeistSans 12/16、400、`text-body`；
- [ ] 标题与副标题之间为 4px；
- [ ] 标题带底边到首个区块为 8px；
- [ ] 首个区块（筛选工具条）为白色 `rounded-xl`（12px）、1px 边框、
  `shadow-sm`、16px 内边距的卡片；
- [ ] 一级区块之间纵向间距为 24px；
- [ ] 一级卡片统一为白色表面、1px `#E5E7EB` 边框、12px 圆角、`shadow-sm`；
- [ ] 加载失败态复用同一卡片表面并叠加 destructive 语义色与 `role="alert"`；
- [ ] 1440px 视口下 PageShell 内容盒宽度为 1120px，允许 `±1px`；
- [ ] 1920px 视口下 PageShell 内容盒流式增长到 1600px；
- [ ] 页面没有 `max-width` 造成大屏收窄；
- [ ] 只有 MainScroll 承担页面纵向滚动；
- [ ] 页面无横向滚动条；
- [ ] 蓝色和绿色主题下几何尺寸完全一致；
- [ ] zh/en/th/ru 文案变化不破坏标题带；
- [ ] 页面通过 `PageShell + PageHeader + 业务区块` 组合，没有复制布局 JSX。

## 14. 完成定义

页面只有在以下条件全部满足时，才算完成大布局对齐：

1. 共享 AppShell 与 `PageShell` / `PageHeader` 默认 variant 承担全部大布局职责；
2. 浏览器实测核心尺寸符合 256/56/32/24px 规则；
3. 单层 `#F8F9FB` 画布 + 白色标题带 + 白色卡片的两层表面关系正确；
4. 页面滚动责任唯一，无嵌套整页滚动；
5. 标题带的字体、字重、行高、字距、颜色、图标、起点和操作区位置符合 §7.3；
6. 1440px 和 1920px 截图与参考页面的大空间关系一致；
7. 1024px 下无业务区块被压成不可用窄列；
8. 主题、语言和产品形态只改变内容或 token，不改变结构；
9. 页面内不存在针对 AppShell 的双重留白或 fixed 补丁；
10. 后续页面可直接复用，无需重新定义尺寸；
11. 页级健康/告警/失败态通过统一的白色卡片表面 + 语义色获得一致几何；
12. 全站统一继承 100–900 可变 Geist，关键文案像素复核一致。
