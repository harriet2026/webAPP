# Webapp 跨页面柔和交互反馈 UI 规格

- 日期：2026-07-25
- 状态：v1，后续页面交互整改的规范基线
- 文档类型：跨页面 UI 交互规范
- 范围：`webapp/` 管理控制台
- 上位设计语言：[`DESIGN.md`](../../../DESIGN.md)
- 首个参考实现：`webapp/src/components/layout/sidebar-nav.tsx`
- 配套国际化规范：[跨页面国际化与文本完整性 UI 规格](./2026-07-28-cross-page-i18n-text-integrity-ui-spec.md)

## 1. 目的

当前不同页面对“这个组件可不可以点、鼠标是否已经落在目标上、键盘焦点在哪里”的反馈不一致：

- 一部分组件完全没有悬浮反馈；
- 一部分组件使用明显位移、发光、重阴影或高饱和色块，破坏安全运营控制台的稳定感；
- 一部分组件只依赖 Tailwind v4 的 `hover:` 变体，在浏览器报告 `hover:none` 的触控屏/混合输入设备上，即使用户实际使用鼠标也不会生效；
- `hover`、`selected`、`pressed`、`focus-visible` 经常混为同一种样式，用户无法区分“鼠标经过”和“当前已选中”。

本规格建立一套跨页面、跨组件、可测试的“柔和反馈”语言。目标不是让所有组件都动起来，而是让所有**可交互组件**以克制、统一的方式回应用户。

## 2. 设计原则

### 2.1 表面浮现，不做位置跳动

默认交互模型是 **Soft Surface Reveal（柔和表面浮现）**：

1. 容器位置和尺寸不变；
2. 通过轻微背景色、文字色、边缘或图标变化表达悬浮；
3. 进入和退出均平滑过渡；
4. 不用整体平移、上浮、弹跳或明显缩放表达普通 hover；
5. 只有真正可点击的卡片可获得轻微 elevation 变化。

### 2.2 状态必须可区分

| 状态 | 含义 | 视觉权重 |
|---|---|---:|
| Rest | 默认可交互状态 | 0 |
| Hovered | 鼠标/触控笔当前指向 | 1 |
| Focus-visible | 键盘焦点所在 | 3 |
| Pressed | 正在按下 | 2 |
| Selected / Active | 当前已选中或当前路由 | 3，持续 |
| Disabled | 不可操作 | 单独语义，不响应 hover/pressed |
| Loading | 操作处理中 | 保持组件位置，禁止重复操作 |

`Hovered` 不能伪装成 `Selected`。悬浮反馈应比选中态更轻，移出后完全恢复；选中态必须在鼠标移出后继续存在。

### 2.3 颜色只表达一层含义

- 普通 hover 以中性表面色为主，不抢占品牌主色；
- `{colors.primary}` 用于 selected、focus ring、主按钮及关键 CTA；
- success/warning/danger 等语义色只用于真实业务状态，不作为通用 hover 色；
- 蓝/绿主题切换只替换主题 token，不改变结构、时长、圆角、位移或尺寸；
- 跨页面整改禁止新增硬编码品牌色，优先使用 `bg-muted`、`bg-accent`、`text-foreground`、`ring-ring`、`border-border` 等语义 token。

### 2.4 可发现，但不制造噪声

可交互元素必须有反馈；静态信息块不得为了“统一”而增加 hover。判断标准：

- 点击后会导航、打开详情、切换状态或触发动作 → 必须有反馈；
- 仅展示统计、说明、状态或装饰 → 不增加反馈；
- 整行可点 → 整行反馈；
- 只有尾部按钮可点 → 只反馈按钮，不能让整行看起来可点。

### 2.5 统一风格优先复用组件

相同语义、相同状态模型和相同视觉层级的交互对象必须优先复用已有组件，不得在页面内重新复制一套结构或 class。统一风格应由共享组件、variant 和设计 token 保证，而不是依赖开发者逐页记忆相同数值。

复用顺序：

1. 直接使用现有共享组件；
2. 为现有组件补充语义化 variant 或 size；
3. 使用现有 primitive 组合业务组件；
4. 确认没有合适抽象后，再新增共享组件；
5. 只有确属单页、单业务语义且无复用预期的结构，才保留在页面内。

复用不是把所有页面塞进一个大型组件。业务数据获取、页面布局和领域流程可以留在页面层；视觉结构、交互状态、键盘行为、动效和无障碍能力应收敛到共享层。

## 3. 全局动效 token

后续统一整改应收敛到以下三档，不在页面内自定义新的时长。

| Token | 时长 | 缓动 | 用途 |
|---|---:|---|---|
| `motion-fast` | 120ms | `ease-out` | 按钮按下、图标按钮、链接颜色 |
| `motion-control` | 180ms | `cubic-bezier(0.22, 1, 0.36, 1)` | 输入框、Tab、菜单项、表格行 |
| `motion-surface` | 240ms | `cubic-bezier(0.22, 1, 0.36, 1)` | 卡片、侧边栏表面浮现、抽屉内导航 |

约束：

- 普通 hover 不得超过 240ms；
- Tooltip/Popover 的出现不超过 160ms，出现延迟由组件库统一控制；
- 整体容器 hover 不做位移；
- 普通图标最大缩放 `1.04`；
- 普通卡片不得在 hover 时缩放；
- Chevron 展开/收起允许 `rotate: 0deg ↔ 180deg`，使用 `motion-surface`；
- 禁止弹簧、回弹和无限循环动效用于常规业务组件。

## 4. 状态优先级

样式冲突时按以下优先级解析：

`disabled > loading > pressed > focus-visible > selected > hovered > rest`

具体规则：

- Disabled 不响应 hover，不改变鼠标经过时的表面色；
- Loading 保持当前尺寸和文案区域稳定，使用 spinner/进度图标替换或伴随原图标；
- Pressed 可以比 hover 略深，但按下不得造成布局位移；
- Focus-visible 必须比 hover 更明显，不能仅靠背景色；
- Selected 保持品牌色语义，hover 时只允许轻微加深；
- Hovered 只表达“当前指向”，不得显示 selected 的完整视觉。

## 5. 表面规格

### 5.1 深色表面：侧边栏、深色导航轨

侧边栏是本规格的首个参考：

| 元素 | Rest | Hovered | Selected | Selected + Hovered |
|---|---|---|---|---|
| 一级菜单 | `sidebar-foreground/72`，透明底 | 白色 7% 表面 + 极淡 1px 内边缘；文字变白；图标最多 `1.04` | `primary/15` + 白字 | `primary/18` + 极淡 primary 内边缘 |
| 二级菜单 | `sidebar-foreground/62`，透明底 | 白色 5% 表面 + 极淡 1px 内边缘；文字变白 | `primary/15` + 白字 | `primary/18` |
| 展开箭头 | 继承当前色 | 文字白度最多 85% | 继承 selected | 同 selected |

禁止：

- 整项左右移动；
- 高饱和蓝色大面积 hover；
- 左侧粗色条；
- 外发光；
- hover ring 与 selected ring 同等强度；
- 图标旋转或放大超过 `1.04`。

### 5.2 浅色表面：页面内容区

| 场景 | Hovered 表面 | 边缘/阴影 | 说明 |
|---|---|---|---|
| 表格可点击行 | `bg-muted/45` | 无新增阴影 | sticky 单元格必须同步变色，不能出现断层 |
| 普通列表项 | `bg-muted/50` | 可选 `inset 0 0 0 1px border/40` | 行高、内边距不变 |
| 下拉菜单项 | `bg-accent/70` | 无外阴影 | 文本保持 `foreground` |
| Tab（未选中） | `bg-muted/40` | 无 | selected 仍由 Tab 自身指示器表达 |
| 可点击卡片 | `bg-card` 不变或 `bg-muted/15` | border 稍强化；最多 `shadow-md` | 仅整卡可点时使用 |
| Ghost/Icon Button | `bg-muted/65` | 无 | 图标颜色从 body → foreground |
| Outline Button | `bg-muted/35` | border 从 hairline → strong | 不改变尺寸 |
| 文本链接 | primary 深一档 | underline/offset 平滑出现 | 不使用背景色块 |

静态卡片、KPI 展示卡、纯说明容器保持无 hover；如果 KPI 卡支持下钻，才应用“可点击卡片”规格并显示 `cursor-pointer`。

## 6. 组件族规格

### 6.1 Button

| 类型 | Hovered | Pressed | Focus-visible |
|---|---|---|---|
| Primary | `primary/90` | `primary-deep` | 2px `ring-ring` + offset |
| Outline | `bg-muted/35` + strong border | `bg-muted/60` | 2px `ring-ring` |
| Ghost | `bg-muted/65` | `bg-muted` | 2px `ring-ring` |
| Destructive | destructive 深一档 | 再深一档 | 2px destructive/ring |

- 使用 `motion-fast`；
- 不通过缩放按钮本体制造点击感；
- Disabled 使用 `opacity-50`/组件库既有语义，并阻止 hover；
- Loading 保留原宽度，防止按钮文字变化造成布局抖动。

### 6.2 Icon Button

- 36×36px，`rounded.control`；
- Hovered：`bg-muted/65`，图标由 body 色变为 foreground；
- Pressed：`bg-muted`；
- 必须有 `aria-label` 或可见 Tooltip；
- 危险动作的危险色在默认态即可识别，hover 只加表面，不突然从灰变红；
- 不做旋转、弹跳或超过 `1.04` 的缩放。

### 6.3 Table / Data Row

- 只有整行可点时，整行应用 hover；
- Hovered：`bg-muted/45`，`motion-control`；
- sticky 列、展开列、操作列与普通单元格保持同一背景；
- 行内按钮拥有自己的 hover，且其反馈强度高于行背景；
- selected row 使用 primary 淡色表面，不能依赖 hover；
- hover 不改变行高、不显示新增边框、不移动操作列；
- 不因 hover 临时显示关键业务信息；可隐藏的仅限冗余快捷操作，且键盘 focus 时同样显示。

### 6.4 Clickable Card / KPI Drill Entry

- 仅整卡可点时增加 `cursor-pointer`；
- Hovered：border 强度增加一档，最多从 `shadow-sm → shadow-md`；
- 不允许 `translate-y-*`、卡片缩放或重阴影；
- 卡片内部 CTA 有自己的 hover，不与整卡产生双重跳动；
- 静态 KPI 卡无 hover；
- selected 卡片使用 primary hairline/淡表面，hover 仅轻微加深。

### 6.5 List / Menu / Command Item

- Hovered：`bg-accent/70` 或 `bg-muted/50`；
- Selected：使用 primary 淡表面或组件库选中 token；
- Hovered 与 Selected 必须可区分；
- 子菜单采用比父菜单更弱的背景透明度；
- 打开 submenu 的 Chevron 使用 180° 旋转，不交换两个完全不同的图标节点；
- 菜单项高度、缩进和文字位置在 hover 前后保持不变。

### 6.6 Tabs / Segmented Control

- Hovered 只影响未选中项：`bg-muted/40` 或文字由 body → foreground；
- Selected 由 primary fill/indicator 表达；
- selected + hover 不移动 indicator，只轻微调整表面；
- 切换内容可使用 120–180ms 淡入，不做整页横向滑动；
- Focus-visible 必须有独立 ring，不能只依赖 selected 指示器。

### 6.7 Inputs / Select / Search

- Hovered：border 从 hairline 提升到 hairline-strong；
- Focus-visible：`ring-ring`，权重高于 hover；
- Invalid：错误边框/说明持续存在，hover 不覆盖；
- Disabled：不响应 hover；
- 输入框不得因 border 宽度变化改变尺寸，使用固定 1px border + 颜色变化；
- Select trigger 与 popover item 分别遵循输入控件和菜单项规格。

### 6.8 Chips / Badges / Filters

- 纯状态 Badge 不响应 hover；
- 可移除 condition-chip 在 hover 时轻微加强背景，`X` 图标变为 foreground；
- 可点击 Badge 必须有 `button` 语义或明确 role，不得用静态 `<span>` 伪装；
- 语义 Badge 的 success/warning/danger 颜色不可在 hover 时改成 primary。

### 6.9 Links

- 文字链接 hover 使用颜色加深或下划线显现；
- 下划线使用 `text-underline-offset`，避免贴字；
- 图标箭头可在链接内部移动最多 1px，但正文和容器不移动；
- 不给普通正文链接添加按钮式背景，除非它本身是 ghost button。

### 6.10 Tooltip / Popover / Drawer Trigger

- Tooltip 必须同时支持 hover 和 keyboard focus；
- Tooltip 不承载只有鼠标才能访问的关键操作；
- Popover/Dropdown 打开由 pressed/open 状态表达，不能只靠 trigger hover；
- Drawer/Modal trigger 遵循其本体（按钮、行或卡片）的 hover 规格；
- 弹层本身出现可使用淡入 + 轻微 scale，时长不超过 160ms；不得从无关方向飞入。

## 7. 输入设备兼容

### 7.1 Tailwind v4 风险

Tailwind v4 会把 `hover:` 变体编译到：

```css
@media (hover: hover) {
  .hover\:...:hover { ... }
}
```

在触控屏、二合一电脑、远程桌面或混合输入环境中，浏览器可能报告 `hover:none`。此时元素即使实际匹配 `:hover`，对应规则也不会应用。

### 7.2 规范要求

对于导航、菜单、表格行、可点击卡片等**必须提供可发现反馈**的组件：

1. 监听 `pointerenter` / `pointerleave`；
2. 仅接受 `pointerType === 'mouse' || pointerType === 'pen'`；
3. 通过 `data-hovered="true"` 或共享 hook 暴露状态；
4. 样式绑定到状态，而不是只依赖 Tailwind `hover:`；
5. 触摸输入不得留下 sticky hover；
6. 后续批量整改前，应抽取共享 `usePointerHover` 或等价 primitive，禁止每页复制不同实现。

参考行为：

```tsx
const [hovered, setHovered] = useState(false);

<button
  data-hovered={hovered ? 'true' : undefined}
  onPointerEnter={(event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      setHovered(true);
    }
  }}
  onPointerLeave={() => setHovered(false)}
/>
```

普通装饰性 hover 可继续使用 CSS；承载可用性提示的 hover 必须满足上述兼容要求。

## 8. 键盘与无障碍

- 每个可点击元素必须是真实 `button`/`a`，或具备完整 role、tabIndex 和键盘处理；
- `focus-visible` 不得被 `outline-none` 无替代地移除；
- Focus-visible 建议 2px `ring-ring` + 2px offset，必须比 hover 明显；
- Hover 中显示的快捷操作必须在 `focus-within` 时同样可见；
- 不以颜色作为唯一状态信息；selected/disabled/error 应同时有结构、图标、文案或 ARIA 状态；
- 对 `prefers-reduced-motion: reduce`：
  - 关闭 scale、位移等非必要几何动效；
  - Chevron 等状态旋转直接到达最终角度，不播放过渡；
  - 将过渡缩短或直接 `transition: none`；
  - 保留最终颜色/边缘反馈，不能把交互反馈整体移除。

## 9. 实现约束

### 9.1 应复用的位置

实现前必须先检索现有共享组件，优先修改共享 primitive，而不是逐页堆叠 class：

1. `components/ui/button`
2. `components/ui/dropdown-menu` / command/menu item
3. `components/ui/tabs`
4. `components/ui/table` 或共享 row primitive
5. 共享 clickable-card / list-item primitive
6. 页面专有组件

满足以下任一条件时，应提升为 variant、utility 或共享组件：

- 已在两个及以上页面出现；
- 虽只出现一次，但属于按钮、菜单项、Tab、表格行、可点击卡片等明确通用语义；
- 预计后续页面会使用同一结构和状态模型；
- 需要统一修复 hover、focus、disabled、reduced-motion 或输入设备兼容问题。

页面应通过 `variant`、`size`、`state`、`disabled`、`selected` 等语义化属性表达差异。不得通过复制组件源码、复制长串 class 或大量页面级覆盖来制造“近似复用”。

### 9.2 复用边界与例外

可以保留页面专有实现的条件：

- 组件承载独有的业务流程，而非仅文案、图标或尺寸不同；
- DOM 结构或交互模型与现有组件有实质差异；
- 抽成共享组件会引入大量仅服务单页的布尔属性或条件分支。

例外实现仍必须复用全局 token 和底层 primitive，并在代码评审说明未复用现有组件的原因。禁止为了“一致”创建包揽多个无关业务的大型万能组件。

共享组件变更必须：

- 保持现有调用方兼容，或同步完成调用方迁移；
- 将 hover、focus-visible、pressed、selected、disabled 和 loading 状态统一封装；
- 将 pointer 兼容与 reduced-motion 行为封装在共享层；
- 至少提供组件级状态测试，避免每个页面重复测试同一基础行为。

### 9.3 禁止模式

- `transition-all`：必须声明实际变化的属性；
- 普通 hover 使用 `shadow-lg`/`shadow-xl`；
- 普通容器 `translate-x/y` 或 `scale`；
- 同时使用背景、粗边框、发光、位移四种强调；
- 静态卡片添加 `cursor-pointer`；
- 为了视觉效果改变组件 hit area、行高或布局；
- 用 JS timeout 模拟 CSS 过渡；
- 只在 Playwright 默认桌面环境验证 hover；
- 以硬编码 blue 取代主题 token；
- hover 覆盖 error、disabled、selected 等更高优先级状态。
- 页面内复制已有共享组件的 JSX 或交互 class；
- 仅为换文案、图标、尺寸或颜色而新建同类组件；
- 页面通过高优先级 class 长期覆盖共享组件的核心状态样式。

## 10. 页面整改优先级

### P0：直接影响可用性

- 侧边栏和页面内导航；
- Dropdown/Command 菜单项；
- 整行可点击的表格/列表；
- Tabs/segmented control；
- 主按钮、次按钮、图标按钮；
- 可点击卡片和 KPI 下钻入口。

### P1：一致性与效率

- 筛选 chip、分页、快捷操作；
- Drawer/Modal trigger；
- 图例、可点击图表数据点；
- 设置页中的可选卡片、策略模板。

### P2：增强项

- 文本链接和辅助入口；
- Tooltip/Popover 细节；
- 非关键微图标反馈。

禁止以“一次性全局替换 class”的方式整改。每个页面先完成交互对象清单，再按组件语义选择对应规格。

## 11. 整改流程

每个页面按以下步骤执行：

1. **盘点**：列出页面所有交互对象及当前状态；
2. **检索**：在 `components/ui` 和共享业务组件中查找可直接复用的实现；
3. **分类**：按钮、行、卡片、菜单、Tab、输入、链接；
4. **排除**：标记静态组件，不给静态组件添加 hover；
5. **收敛**：优先修共享 primitive 或增加语义化 variant；
6. **实现**：页面只组合组件并补充业务逻辑；
7. **输入验证**：桌面鼠标 + `hover:none` 混合设备 + touch；
8. **键盘验证**：Tab 顺序、focus-visible、Enter/Space；
9. **动效验证**：正常模式 + reduced motion；
10. **主题验证**：蓝色主题 + 绿色主题；
11. **回归**：确认所有调用方及页面布局、行高、sticky、滚动区域未变化。

## 12. 测试与浏览器验收

### 12.1 Unit / Component

至少覆盖：

- pointerType=mouse → `data-hovered=true`；
- pointerleave → 状态清除；
- pointerType=touch → 不进入 hovered；
- disabled → 不应用 hovered 视觉；
- selected + hovered 使用选中态分支；
- reduced-motion class/variant 存在；
- focus-visible 不被 hover 状态覆盖。

### 12.2 浏览器矩阵

| 环境 | 必测项 |
|---|---|
| Chromium 桌面，`hover:hover` | 进入/退出平滑、状态无残留 |
| Chromium `hasTouch:true`，`hover:none` | 鼠标移动仍触发 pointer-driven feedback |
| 纯触摸 | 点击后不留下 sticky hover |
| 键盘 | Tab 可达、focus-visible 清晰 |
| Reduced motion | 无位移/缩放，最终表面反馈仍存在 |
| 蓝/绿主题 | 结构与强度一致，仅 token 色变化 |
| zh/en/th/ru | 文案长度变化不造成跳动或截断 |

浏览器验收不能只断言 class 存在，应至少检查：

- `data-hovered`；
- `getComputedStyle().backgroundColor`；
- `getComputedStyle().boxShadow` 或 border；
- `getBoundingClientRect()` 在 hover 前后不发生位置/尺寸变化；
- focus-visible 的 outline/ring；
- touch 离开后的状态清理。

### 12.3 视觉验收

- Hovered 一眼可发现，但不会比 selected 更抢眼；
- 页面同时出现多个可交互元素时，只有当前指向项浮现；
- 鼠标快速扫过列表时没有闪烁、弹跳或“灯带”效果；
- 卡片墙不会因每张卡 hover 都浮起而产生噪声；
- 键盘焦点比 hover 更明确；
- 禁用、错误和危险状态不被 hover 覆盖。

## 13. 完成定义（DoD）

一个页面只有同时满足以下条件才算完成交互整改：

- [ ] 已检索并优先复用现有共享组件、variant 和 token；
- [ ] 没有复制已有组件的 JSX 或长串交互 class；
- [ ] 新增通用交互已沉淀到共享组件，并覆盖所有调用方；
- [ ] 页面专有实现具备明确的业务差异，不是单纯视觉差异；
- [ ] 所有可交互组件均有 Rest/Hover/Focus/Pressed/Disabled 定义；
- [ ] Selected 与 Hovered 可区分；
- [ ] 静态组件没有虚假 hover；
- [ ] 没有普通容器位移、缩放、外发光或重阴影；
- [ ] `hover:none` + 鼠标环境仍有反馈；
- [ ] 触摸环境无 sticky hover；
- [ ] reduced-motion 下可用性不下降；
- [ ] 蓝/绿主题均使用语义 token；
- [ ] Unit/Component 测试通过；
- [ ] 浏览器矩阵通过；
- [ ] 页面布局、滚动、sticky、点击区域无回归。

## 14. 首个参考实现的已验证事实

`webapp/src/components/layout/sidebar-nav.tsx` 当前参考实现满足：

- pointer-driven hover，不依赖 Tailwind `@media (hover:hover)`；
- 一级菜单白色 7% 表面，二级菜单白色 5% 表面；
- 无整体位移、无外发光、无粗色条；
- 极淡 1px 内边缘；
- 一级图标最大缩放 `1.04`；
- 240ms 柔和缓动；
- `hover:none` 浏览器环境中，鼠标进入后 `data-hovered=true` 且背景生效；
- reduced motion 禁用非必要过渡。

后续页面应复用其**交互原则与输入兼容策略**，不能机械复制侧边栏的深色表面数值到浅色内容区。
