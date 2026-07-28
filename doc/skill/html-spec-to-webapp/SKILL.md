---
name: html-spec-to-webapp
description: 用户指定 webapp/doc/html-spec/<模块名>/ 下的某个 HTML 规格，要求把该规格在 webapp 中实现/落地/补齐时使用。触发词：实现这个 html_spec、把 spec 落地到 webapp、按 html_spec 改 webapp、html_spec 实现、规格落地。
argument-hint: "<html_spec 模块名>"
user-invocable: true
---

# html_spec → webapp 落地实现

把 `webapp/doc/html-spec/<模块名>/` 的规格实现到 `webapp/`，并以**运行中的 demo 为基准**逐交互态验证 DOM 与行为。

> **核心原则**
> 1. **规格是契约，demo 运行态是 UI 事实源。** 二者冲突以 demo 实际渲染为准，并在报告中标注。
> 2. **多半不是从零写。** webapp 通常已有部分实现，本技能的第一产物是**差距表**，不是新文件。
> 3. **"完成"由三张表定义**：差距表（行数 == 规格条目数 N）+ layer 验证表（每行有 DOM 证据）+ mock 覆盖清单（模块每个 endpoint 有 dispatcher 路由与来自 demo 的 fixture 数据源）。任何一行缺失，任务就没做完。

---

## Step 0：读规格头，起两个服务

`index.html` 顶部的 `spec-header` 写明了这次落地的全部坐标，先读它，不要凭模块名猜：

| spec-header 字段 | 用途 |
|---|---|
| `demo 源` | demo 组件路径（第二事实源，读 TS 类型/条件分支） |
| `路由路径` | demo 端 URL（浏览器对齐的左侧） |
| `i18n 标题 key` | webapp 端 messages key 的锚点 |
| `权限矩阵` | 角色/视角门控 |
| `覆盖 spec 章节` / `spec 源` | 业务逻辑的原始 PRD |

起服务（**两个都必须真的起来**），用 Bash 工具 `run_in_background: true` 后台跑（命令末尾**不要**加 `&`、不要套 `nohup`，让 harness 跟踪进程并在退出时通知）：

```bash
cd design/origin/demo && PORT=3111 npm run dev    # demo（基准侧），端口固定 3111
cd webapp && npm run dev                          # webapp（目标侧），端口 3000
```

**就绪判定用页面标题，不要用 HTTP 状态码**：webapp 的 `<title>` 是 `OSGateway Admin`，demo 是 `Email Security Gateway`。3000 可能被别的进程（如静态目录服务）占着，`curl` 照样 200，但那不是 webapp。

### 浏览器怎么起（已实测，唯一验证可用路径）

本仓库**没有系统 `google-chrome`**；chrome-skill 在本机报 `setsockopt: Operation not permitted` / crashpad 崩溃。已验证可用的是 **Playwright 自带 chromium**（`~/.cache/ms-playwright/`）：在 `webapp/` 目录下、`.cjs` 脚本、带 `--no-sandbox`：

```js
// webapp/probe.cjs —— 用完即删，禁止 git add
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  // webapp 侧必须开 Mock 模式（goto 之前注入；demo 侧不需要）：
  await p.addInitScript(() => localStorage.setItem('osgateway_mock_enabled', '1'));
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.goto('http://localhost:3111/<demo路由>', { waitUntil: 'networkidle' });
  console.log(await p.title());                    // 确认真的是目标页
  await p.screenshot({ path: '/tmp/demo-x.png', fullPage: true });
  console.log(await p.locator('<选择器>').innerHTML());  // DOM 提取
  await b.close();
})();
```

同一脚本换 URL 即采 webapp 侧。点击、聚焦、展开抽屉都用 Playwright API 驱动。Mock 模式手工开法：顶栏 ProductFormSwitcher 下拉 →「Mock 数据」（关闭 = `removeItem`）。

> Playwright chromium + `--no-sandbox` 仍不通 = **阻塞**：修复或明确报告用户，不要静默降级为"源码对比"。

---

## Step 1：差距表（先数条目，再逐条闭环）

**默认假设 webapp 已有实现**（同名组件、同名路由、已有 e2e）。定位方式：

```
□ 从 spec-header 的 i18n key / 页面名，grep webapp/src 找现有组件与路由
□ 打开现有组件、其 import 树、webapp/messages/*.json 相关 key、已有 tests
□ 摸底 mock 覆盖：本模块页面调用的每个 endpoint，在 src/lib/mock/dispatcher.ts
  里有无路由、src/lib/mock/fixtures.ts 里有无数据（这是 Step 3 mock 覆盖清单的现状列）
```

**覆盖率由计数锁定，防抽样**：

```
□ 先逐节数出 N = 规格 §2 逐组件 + §3 弹窗抽屉 + §4 数据模型 + §5 业务逻辑 + §6 交互 的条目总数，
  并把分节小计写进报告（如 §2:12 + §3:5 + §4:8 + §5:9 + §6:7 = 41），供用户复核 N 没被数小
□ 差距表行数必须 == N，每行带章节锚点（§x.y），结论 ∈ { ✓已一致 / 待修正 / 有意偏离(附理由) / 待用户确认(§10) }
```

行数 < N，或表里出现"其余类似""抽样核对""主要差异如下"字样 → 差距表未完成，回去补齐。

| 规格条目 | webapp 现状 | 结论 |
|---|---|---|
| §2.1 表格列定义 | 7 列（多 name/priority） | **待修正** |
| §2.4 IP 组类型 | 后端未支持，已 disabled | **有意偏离**（记录理由） |
| §10 Q-003 开关即时生效 | — | **待用户确认**（禁止擅自决定） |

**规格 §9（差异标注）与 §10（需确认事项）是硬约束**：§10 的每一条都要在动手前**一次性**抛给用户确认；不要边做边猜，也不要因为"看起来显然"就替用户决定。**§10 条目不适用核心原则 1**——即使答案在 demo 运行态里可以直接观察到，它仍是产品决策，须用户确认。「有意偏离」同理受门控：全部偏离条目连同 §10 一起在动手前知会用户；拿不准偏离是否可接受时升级为「待用户确认」，不要把难实现的条目私自归为有意偏离。

---

## Step 2：状态矩阵 = `layer-*.html` 全集

```bash
ls webapp/doc/html-spec/<模块名>/*.html webapp/doc/html-spec/<模块名>/screenshots/
```

每个 `layer-N-xxx.html` 是一个交互态。把它们列成矩阵，**每一行既是实现清单，也是 Step 4 验证表的行**。screenshots/ 是每个状态的目标像素。

---

## Step 2.5：规模分叉

- 差距表里「待修正」≤ 3 条、不动数据模型/serde/后端契约 → 直接 Step 3。
- 否则走 superpowers 主线（本仓库的既定工序）：
  1. superpowers:brainstorming 收敛方案 → spec 写入 `design/implement/spec/<模块名>-html-spec-alignment.md`（差距表与 layer 矩阵放进 spec）；
  2. superpowers:writing-plans → plan 写入 `design/implement/plan/` 同名文件；
  3. superpowers:subagent-driven-development（或 executing-plans）逐任务执行。

  这两个目录的文件按根 AGENTS.md 允许 commit & push；代码改动仍须用户确认后才提交。

---

## Step 3：实现

映射规则、token 替换、i18n、图表、形态门控与 webapp 框架红线（哪些文件禁止修改），**完整沿用 webapp-pixel-alignment 技能**的附录 A–F 与「webapp 框架红线」两节，此处不重复。落地时额外遵守：

- `design/origin/implement.md` 的约束（四语国际化、复用统一规则系统 action、不新增规则系统）。
- 新增 i18n key 必须同时写入 `messages/{zh,en,th,ru}.json` 四语；先搜索再新增。
- demo 的硬编码色 → webapp design token（遵循根目录 `DESIGN.md`）；禁止从 demo 拷 `components/ui/*` 或引入 `recharts`。
- 后端 API 已存在 → 数据层走 `src/lib/api/`；未存在 → 页面只打 mock。**两种路径都必须同步补齐 mock**（见下节）。

### Mock 与 demo 对齐（必做，不分路径）

webapp 的 mock 层：`src/lib/api/client.ts` 在 Mock 开关（localStorage `osgateway_mock_enabled`，UI 在 ProductFormSwitcher 下拉）开启且 `isMockable()` 命中时，把请求委托给 `src/lib/mock/dispatcher.ts`（路由表）+ `src/lib/mock/fixtures.ts`（fixture 数据），不发真实 fetch。

实现页面的同时补齐 mock，交付一张 **mock 覆盖清单**（与差距表并列的产物）：

| endpoint（method + path） | dispatcher 路由 | fixture 数据源（demo 哪个组件/常量） |
|---|---|---|

- **后端 API 已存在也要注册 mock 路由**：Step 4 的对齐验证在 Mock 模式下跑，未注册的路由 `isMockable()` 不命中会放行到真实后端，拿到的是本地 DB 数据而不是 demo 数据，DOM 对不齐。
- **fixture 数据照抄 demo 组件的硬编码数据**：行数、字段值、状态分布逐项一致（含触发徽章/禁用态/分页/详情抽屉所需的边界行），目标是 Mock 模式下 webapp 渲染的 DOM 与 demo 逐字段相同。类型用 webapp 侧契约（`@/types/*`、`src/lib/api/*`），不照抄 demo 的 TS 类型。
- **layer 矩阵里的每个交互态都要有数据可达**：需要多页、筛选命中/未命中、错误提示等状态的，fixture/handler 按 query 参数分支支持（参考 fixtures.ts 里现有的 `mockRBLFilterRulesList`）。
- **警惕 dispatcher 的 fallback 空壳**：未注册的 GET 不 404，静默返回 `{ items: [], total: 0 }` 或 `{}`——页面"能打开但列表是空的"不是空态设计，是 mock 没注册的症状，回来补路由。

---

## Step 4：浏览器逐状态对齐 —— layer 验证表（不可跳过）

统一基线：同视口 1440×900、同缩放、webapp 开 Mock 模式（见 Step 0）、产品形态/视角与 demo 一致。

对 Step 2 矩阵中的**每一个** layer 填一行，**四列全有内容才算该行验证过**：

| layer | 触发路径（真实点击序列） | DOM 证据 + 对比结论 | 截图对（demo / webapp 路径） |
|---|---|---|---|

- **DOM 列是证据核心，且与截图列同等要求产物锚点**：用 Playwright 提取两侧该状态的 DOM 并**落盘**（如 `/tmp/dom-layer4-{demo,webapp}.html`）或在报告里附关键摘录，再给逐层核对结论——结构层级、文案、字段/列、禁用态（disabled/aria-disabled）、选中态（aria-selected/data-state）、校验提示、浮层挂载点。**只有结论没有产物路径/摘录 = 没验证**；只有截图同样 = 没验证——截图是目标，不是证据。
- **触发路径列必须是真实交互**：开抽屉、切 tab、展开下拉、聚焦输入、打开确认框，由 probe 脚本在两侧分别真实驱动进入该状态（复杂态的 DOM/截图产物本身就是"真的到达过"的留痕）。嵌套交互**递归下沉**：抽屉里的表格、行操作菜单、菜单打开的确认框，触发到叶子。
- **DOM 对比含数据值**：Mock 模式下两侧的行数、单元格文案、徽章/状态值应逐项一致（这就是 Step 3 mock 覆盖清单的验收）。webapp 侧列表为空而 demo 有数据 → 先怀疑 dispatcher fallback 空壳（mock 路由没注册），回 Step 3 补，不要记作"webapp 空态差异"。
- 每行对照该 layer 文件的字段表逐字段回填（占位符、默认值、校验规则、禁用条件）。
- 某 layer 因差距表条目未实现/有意偏离而在 webapp 侧**无法触发** → 该行 DOM 列与截图列填「阻塞于 §x.y」。该行不算验证通过，但**行不能缺**——它在报告里就是未完成项的显式记录。

代码级验证同时跑：

```bash
cd webapp && npx tsc --noEmit && npm run lint      # 全量类型 + lint
npx vitest run src/<模块目录>/                      # 模块单测
python3 webapp/tests/run_e2e_pw.py --start <spec文件名片段> --no-regress   # 先只跑本模块相关 spec
```

长命令用 `run_in_background: true` 后台跑。`run_e2e_pw.py` 失败即停并打印「第几个/共几个、文件名、失败的测试」，以它的末尾汇总为准；grep vitest / go 风格日志时只认**行首**的 `^ok` / `^FAIL` / `^--- FAIL:`（测试名带 "Fail" 不是失败）。改动面大时最后补全量 e2e。

---

## Step 5：交付报告

1. **N（含分节小计）与差距表终态**：差距表行数 == N，每行 ✓已实现 / 有意偏离(理由，已知会用户) / 待确认(§10)。改完的「待修正」即转 ✓；没改完的保留「待修正」并**显式声明任务未完成**；一条都不能悄悄消失。
2. **layer 验证表**：每个 layer 一行、四列齐全（含 DOM 产物路径/摘录与截图路径；阻塞行标「阻塞于 §x.y」）。
3. **mock 覆盖清单终态**：模块调用的每个 endpoint 都有 dispatcher 路由 + fixture 数据源（demo 组件/常量）；缺失的显式列出并说明原因，不许静默依赖 fallback 空壳。
4. **实测证据**：tsc / lint / 单测 / e2e 的真实输出。没跑就说没跑。

未经用户确认，不 commit、不 push（`design/implement/{spec,plan}/` 下的 spec/plan 文档除外）。

---

## 红旗表 —— 出现以下念头即为违规

| 念头 | 事实 |
|---|---|
| "demo 起不来，先按截图和源码实现吧" | demo 起不来是**阻塞**。修好它，或明确告知用户被阻塞。不要静默降级。 |
| "浏览器起不来，用源码对比代替 DOM 对比" | 源码推断 ≠ 实际渲染。唯一验证可用路径是 Playwright chromium + `--no-sandbox`（Step 0）；仍不通就报告阻塞，不要跳过。 |
| "截图都存了，DOM 就不用提了" | 截图是**目标**，DOM 提取才是**证据**。验证表该行 DOM 列为空 = 没验证。 |
| "5 个 layer 验了 3 个，剩下俩结构类似" | 静态一致的组件，hover/disabled/校验态经常不同。**每行都要触发**，抽样 = 未完成。 |
| "差距表列主要差异就够了" | 行数 == N 是硬性检查。"主要差异"就是抽样。 |
| "§10 这条很明显，demo 里就能看到答案" | §10 是产品决策，不适用"以 demo 为准"。禁止擅自决定，一次性抛给用户。 |
| "这条太难实现，标『有意偏离』吧" | 偏离是否可接受是产品决策。拿不准就升级为「待用户确认」，且全部偏离须在动手前知会用户。 |
| "后端 API 是真的，mock 就不用做了" | Step 4 在 Mock 模式下验证，真实后端的数据 ≠ demo 数据，对齐无从谈起。mock 路由 + fixture 是本技能的交付物之一。 |
| "Mock 模式下页面能打开、没报错，mock 算通了" | dispatcher 对未注册路由静默返回空壳（`{items:[]}`），不 404。"能打开"证明不了 mock 存在，数据值逐项等于 demo 才算。 |
| "先说做完了，验证放后面" | 三张表没填满，就不能说"完成"。 |

---

## 常见陷阱

- 直接照抄 demo 的 Tailwind 硬编码色 → 暗色模式必崩。
- 只在 webapp 单侧截图自检 → 缺少 demo 基线，对齐无从谈起。
- 新 i18n key 只加 zh/en → 四语必须齐（`v3-i18n-parity` 类测试会红）。
- webapp 不开 Mock 模式 → 真实数据永远对不齐 demo。
- 开了 Mock 模式但没给本模块注册 mock 路由 → 请求放行到真实后端或被 fallback 空壳兜底，列表为空/数据无关，照样对不齐。
- fixture 随手编数据而不抄 demo 硬编码数据 → 结构对了值不对，DOM 逐字段对比过不了，返工。
- 只验证默认态就报告完成 → 抽屉/弹窗/下拉/空态/loading 全在首屏之外。
