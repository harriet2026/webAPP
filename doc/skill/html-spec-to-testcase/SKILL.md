---
name: html-spec-to-testcase
description: 前后端已实现的模块，需要根据 webapp/doc/html-spec/<模块>/ 的可视化规格产出/维护测试用例时使用；产物是自文档化的 Playwright spec（测试用例即文档，无独立 .md 用例文档），并在研发高频迭代下靠双指纹漂移检测保持用例可维护、质量可保证。触发词：html_spec 出测试用例、测试用例即文档、自文档化用例、根据 html_spec 生成用例、系统测试用例、端到端运行态用例、发信拦截验证、reconcile 用例、迭代后更新测试用例、检查旧用例是否过时。
argument-hint: "<html_spec 模块名>"
user-invocable: true
---

# html_spec → 自文档化测试用例

为 `webapp/doc/html-spec/<模块>/` 已实现的模块产出测试用例，并在研发**高频迭代**下持续维护。

> **核心原则：测试用例即文档。** 不产出独立的 `qc/cases/*.md`，而是让**一份自文档化的 Playwright spec** 同时是「可执行测试 + 可读用例文档 + 原生报告里的文档视图」。文档视图由 Playwright HTML/JSON/JUnit reporter 直接呈现，零自写抽取脚本。

目标：**用例可维护 + 质量可保证**。为此有两条铁律（下面展开）——**双真源**（防假绿）与**双指纹**（防迭代漂移）。

## 何时用 / 不用

- **用**：某模块前后端已实现、`webapp/doc/html-spec/<模块>/index.html` 已存在，要为它出用例，或迭代后更新用例。
- **不用**：需要从 zod `superRefine`/字段**穷举**边界/等价类/安全的**深度全覆盖** → 那是 `qc-test-workflow`（本技能与它**互补**：本技能保「跟 html_spec 同步 + 断言不过时」，qc-test-workflow 保「深度全覆盖」）。
- 复用 qc/ 基设：`qc/scripts/playwright/`（config、`pages/` PO 层、`lib/` helper）。产物落盘 `qc/`，守 `qc/AGENTS.md` 写边界。

## 铁律一：双真源（防假绿）

> 用例的两件事来自**不同**真源，混用就制造假绿/假红。

| 关注点 | 真源 | 说明 |
|---|---|---|
| **测什么**（用例点/覆盖维度） | **html_spec** | 只从 html_spec 枚举功能点，**不读 `design/origin/spec/`**、不从源码穷举派生用例点 |
| **断言的期望值是多少** | **契约代码** | 后端 `internal/api/*` handler/校验 + 前端 zod `superRefine`。html_spec **只作意图参考、常滞后**（实证：priority=0、默认优先级 2000→500/800/999、whitelist_mode 必填，html_spec 全是滞后一方） |

- **把 html_spec 的措辞/数值硬编码进断言 = 定时炸弹**（html_spec 一滞后就假绿/假红）。期望值一律取自契约代码，并在 `expected` 注解里**溯源到代码位置**（文件#符号/行）。
- **契约文件常不在 html_spec 暗示的位置**：html_spec 的信息架构（如画成"策略流水线抽屉"）可能与实现落位（如 `BehaviorControlPage.tsx` 的 Collapsible + `/behavior-control/...` 路由）分家。按**真实 API 路径 / handler 反查**定位契约文件，别照 html_spec 的结构猜。
- **分层断言**：同一字段 UI 层与 API 层合法边界可不同（priority=0 后端已放宽、前端仍 `min(1)`）——UI 用例断前端契约、API 用例断后端契约。
- **i18n：断稳定标识符，不断译文**。错误/文案过 `t()` 时，屏幕是译文、契约是 message key / 后端 error code——断言绑**key/error code**（稳定），不绑渲染出的译文（译文会随 html_spec 措辞漂移，把你拖回"硬编码文案"雷区）。
  - **例外（被测的就是那段文案语义时）**：当用例要验的行为**本身就是文案的语义**（如"优先级越大越优先"这句方向措辞就是要验的行为），断言绑 **i18n 源文件（`zh.json`）里该条的文案值**——此时 zh.json 是该语义的契约真源，`impl-rev` 指向 zh.json 里该 key。仍**不绑 html_spec 措辞**。
- **横切约定也是合法测点源**：分页信封 `{items,total,page,page_size}`、401/鉴权、导出版本号等来自 `internal/api/AGENTS.md` 等**跨模块契约**，html_spec 不会写。测点以 html_spec 为主，但这类公认横切约定可补充为标准测点（断言值同样取契约代码）。

## 元数据契约（把用例信息编码进原生报告）

每条 test 用 `tag` + `annotation` + `test.step` 承载全部用例信息——三者都渲染进 Playwright 原生报告，就是文档视图。**完整可套用示例见 [example-contract-spec.ts](example-contract-spec.ts)。**

| 用例信息 | 编码 |
|---|---|
| 用例ID / 测试点 | test 标题前缀 + `tag:['@SF-VAL-009']`（可过滤） |
| 类型 / 优先级 | `tag:['@ui','@P0']` |
| 前置条件 | `annotation:[{type:'precondition'}]` |
| 测试步骤 | `await test.step('...', …)`（进 trace，即步骤文档） |
| 预期结果 | `annotation:[{type:'expected', description:'<值> ← <契约代码 文件#符号>'}]` + 真实断言 |
| 测点来源 | `annotation:[{type:'source', description:'html_spec#锚点'}]` |
| **html_spec 指纹** | `annotation:[{type:'source-rev', description:'<锚点id> @ <hash>'}]`，hash 由 `fingerprint.py source-rev <index.html> <锚点id>` 算 |
| **契约代码指纹** | `annotation:[{type:'impl-rev', description:'<file>#<符号> @ <hash>'}]`，hash 由 `fingerprint.py impl-rev <file>` 算 |
| 文件级（模块/覆盖/不覆盖/风险） | 文件头 JSDoc 块 + `test.describe('<子模块>')` |
| 已知未修缺陷 | **`test.fail()`**（修复后自动转红提醒回收），**禁止无条件 `test.skip`** 吞掉 |

### 指纹算法（唯一真源 = [fingerprint.py](fingerprint.py)，别手算）
双指纹必须**可被他人复算**，否则形同虚设。所以：**只用 `fingerprint.py` 算，绝不手写占位 hash（如 `a1b2c3d`、`e4f5g6h`）**，且注解里存"定位符"（source 存锚点 id、impl 存 `file#符号`）——定位符 + 脚本 = 谁都能复现同一 hash。
- `source-rev`：脚本对该锚点 `<section>` 的**规格文本**取 hash，自动剔除 preview/screenshot/demo/script/style 噪声块——**改运行态预览不会误报规格漂移，改字段/约束表才翻转**。
  - **锚点必须逐字等于 index.html 里真实的 `id=` 值**（不是你自造的"章节号-slug"）。**写入前先跑一次** `fingerprint.py source-rev`：报 `anchor not found` = 锚点写错，改到真实 id。
  - html_spec 常只有 **section 级**锚点（多个字段共用一个 `id`），于是多条测点共享同一 `source-rev`。reconcile 时该锚点漂移会**一起触发这几条复核**（over-flag）——人工判断具体是哪个字段变了即可，别因为"只改了一个字段"就跳过其余同锚点用例。
- `impl-rev`：`git hash-object` **整文件**短 hash——**同一文件里所有符号共享同一 impl-rev 值**，`#符号` 只是人读定位符，别按符号各造一个值。文件任意改动都翻转（故意 over-flag，多触发一次复核 ≪ 漏检假绿的代价）。
  - **一条 test 依赖多个契约文件**（如前端 tsx + 后端 handler）→ 写**多条 `impl-rev`**，一文件一条。
  - **超大共享文件**（如 310KB 的 `zh.json`）整文件 hash 会剧烈 over-flag（无关改动也翻转）→ 除非该文件确是被测契约，否则把 `impl-rev` 指向**更窄的真正契约文件**。

## 两种模式

进入先判定：目标模块**首次** → generate；**已有测试 spec、代码/html_spec 已迭代** → reconcile。

### generate（首次）
1. 读双真源：html_spec（测点）+ 契约代码（断言值 + `impl-rev`）。
2. 枚举 html_spec 功能点 → 派生测试点（派生完整性见下）。
3. 逐点写自文档化 test，套上面的契约；期望值取自契约代码并溯源；分层断言；未修缺陷用 `test.fail`。**凡模块有运行态处置/效果，必含运行态系统闭环用例（见《运行态系统闭环》），不能只有 UI/API 契约断言。**
4. 跑 Playwright，HTML/JSON/JUnit 报告即用例/报告视图。**不产出独立 `.md` 用例文档**——**常驻覆盖矩阵始终内嵌在 spec 文件头 JSDoc**（唯一真源，跟着测试走）。

### reconcile（铁律二：双指纹防迭代漂移）
> 「旧用例还合理」≠「旧用例还通过」。最危险的是**仍通过但测的是过时行为**（假绿），纯重跑测不出来。

1. 读每条 test 的 `source-rev`（html_spec）+ `impl-rev`（代码）。**首轮回填基线**——触发条件是指纹**缺失、或不可复算/系手工占位**（present 但用 `fingerprint.py` 复算不出同值，等同无有效基线；**别拿坏指纹去做漂移比对**，否则满屏假漂移或卡 not found）。做法：**不能凭空检测过去的漂移**（没有历史基线），先逐条**对齐当前契约代码复核并改对断言**（把此刻的假绿修掉），再用 `fingerprint.py` 盖**当前**指纹作基线。**漂移检测从此刻向后生效**，不追溯既往。之后每轮才走下面的比对。
2. 重算两指纹，逐条判：
   - 两者都没变 → **仍有效**。
   - `source-rev` 变 → **需更新**（规格改了，潜在假绿）：复核改写 + 刷新指纹。
   - `impl-rev` 变但 `source-rev` 没变 → **需复核**（代码改了、html_spec 没跟上，揪假绿主战场）：要么是 bug（写成失败用例/`test.fail`），要么 html_spec 滞后（用例对齐代码 + 提请回写 html_spec），确认后刷新 `impl-rev`。
   - 锚点/来源已删 → **已过时** → 进【建议删除】清单，人确认后**真删**（不长期挂 fixme 攒僵尸）。
   - **判定歧义时**（旧断言本就模糊、没绑死值）：把"模糊断言→按当前契约精确化"归 **需更新**；把"契约新增了旧用例从未覆盖的强校验/不变量"归 **需复核/新增缺口**。
3. 用派生矩阵扫 html_spec 新功能点 → **新增缺口**补写。
4. 产出**变更报告 + 覆盖矩阵**（= 版本说明，见下）。

## 派生完整性（推理完全）

「推理完全」= 对 html_spec **已表达内容**系统穷举 + **未表达处显式标缺口**（不猜、不静默跳）。逐类展开 html_spec：字段每取值/等价类、**禁用条件两侧**、**流程图每分支**、表格列/排序/分页/空态、弹窗每关闭路径、§9 每条差异标注、空/加载/错误态、产品形态/角色/权限维度、**运行态处置/效果的端到端闭环（见下节《运行态系统闭环》——凡规则/配置会改变真实流量处置的模块，此维度必测，不是可选）**。组合用**正交表 + 边界组合**（非全笛卡尔）。

两类缺口分开标进覆盖矩阵，都**不造假 test**：
- **html_spec 未定义处**（如某边界值）→「html_spec 未定义」格，移交 qc-test-workflow，**不臆造假约束**。
- **html_spec 已表达但实现完全缺席**（端点/字段根本没落地，无契约可断、写不出可证伪断言）→「已表达未实现」格，提请研发补实现 / PO 裁决。**别硬写 `test.fail`**——`test.fail` 是给"有失败断言的已知缺陷"，不是给"根本没有可断的契约"。

## 运行态系统闭环（必测维度——别只写 UI/API 契约断言）

> 契约断言只证明"规则被正确存下 / 表单挡对了值 / 存的 action 字段等于某枚举"，**不证明"发一封该命中的信真的被拦"**。凡模块的规则/配置会改变**真实流量的处置**，缺这层就不是完整系统用例——实测：本技能的派生分类若只照字面展开，会产出满屏 UI+API 契约点却**一条运行态闭环都没有**（把"存进去的 action=quarantine"当成了"真被隔离"）。

**判定谓词（可观察，先答这一句再决定要不要写）**：html_spec 是否描述了运行态**处置/效果**——命中规则后邮件被隔离/拒绝/丢弃/审核/放行、被打标改写、被限速、被召回等？**是 → 覆盖矩阵必须含 ≥1 组端到端运行态用例**，且按下面 recipe 逐"动作/效果"等价类展开（不是只测一个 happy path）。否 → 该模块本就无运行态出口，跳过本节。

**一条运行态用例的形状（recipe，照填不要负向禁止）**：
1. **建**：用真实持久化通道建规则/配置（API 或 UI 建，非 mock）。
2. **触发**：走真实通道送入一个会**命中**的输入（发信 SMTP / 真实请求），并配一个**不命中**的对照输入（命中/不命中两侧都要）。
3. **观察**：从可观察出口读系统**实际**行为——mail log 的 `action`/`reason`、SMTP 应答码、隔离/审核队列、注入的信头、召回记录等（不是读回自己刚写的规则字段）。
4. **断言**：实际处置 == 该规则**动作/效果的语义**。期望值真源 = **动作语义契约 + 引擎处置逻辑**（如 `MapPrimaryActionToUnifiedAction` + antispam 引擎），`source` 锚点指 html_spec 的动作/业务逻辑段，`impl-rev` 同时指引擎/handler + 前端建规则契约（多文件多条）。
5. **逐等价类**：每个动作/效果（deliver→放行 / quarantine→隔离 / block→拒绝 / discard→丢弃 / review→审核 / tag→打标…）各 ≥1 条；核心命中语义（如条件合并 `(OR任一) AND (AND全部)`）至少验一命中 + 一关键不命中。

**环境不可达**：用 `test.skip(!reachable, '...')` 条件门控（允许，见常见错误表）——但**用例必须写出来**。门控是"这次没跑"，不是"可以不写"；别拿"环境不稳/发信慢"当借口把整个运行态维度删成 0 条。

**与 qc-test-workflow 的边界**：运行态**代表性闭环**（每动作/效果一条 + 命中两侧）属**本技能必测**，不许以"这是深度覆盖"为由整段甩给 qc-test-workflow；后者只接 54 条件逐项 / 海量输入穷举那类深度活。

## 变更报告 + 覆盖矩阵（= 测试用例版本说明）

**常驻覆盖矩阵**（html_spec 每功能点 → 用例数 / 状态 / 是否仅 happy-path，「哪些没测、只测正路径」一眼可见）**始终内嵌在 spec 文件头 JSDoc**，generate/reconcile 都在原地更新它——它是唯一真源。

reconcile 每次**另外自动产出一份变更报告**（非手工维护，避免版本说明自身漂移），落盘 `qc/reports/`（`qc/reports/` 在 `qc/` 内，不违反写边界）：
- 头部：`git ref` + 日期 + 模块。
- 【新增 / 需更新 / 需复核(代码漂移) / 建议删除】用例清单（用例ID + 测试点 + 漂移原因）。
- 【新功能缺口】清单。
- 引用/快照当轮的常驻覆盖矩阵（不另立第二份真源）。

## 常见错误（RED 基线实测，务必避免）

| 反模式 | 正确做法 |
|---|---|
| 另写 `case_*.md` + `traceability.md` 一堆分离文档 | 全部信息进**一份自文档化 spec** 的 tag/annotation/step |
| 用例信息只在 `//` 注释或独立 .md | 注释进不了原生报告；用 `annotation`/`tag`/`test.step` |
| 断言硬编码 html_spec 的措辞/数值 | 期望值取**契约代码**并溯源；html_spec 只作测点来源 |
| 无 `source-rev`/`impl-rev` | 无指纹 = reconcile 无法自动检测漂移 = 迭代必攒假绿 |
| 手写占位 hash（`a1b2c3d`）/ 自造锚点（`5-白名单模式`） | 指纹**不可复算 = 等于没有**。只用 `fingerprint.py` 实算，锚点用真实 `id=`，写前跑一次不报 not found |
| 已知缺陷用 `test.skip('GT-xxx')` 吞掉 | 用 `test.fail()`——修好自动转红提醒回收。**条件性环境门控**如 `test.skip(!smtpReachable, '...')` 合理、不受此限（它不吞缺陷）；`test.fail()` 用例要保证**只有最后那条契约断言**是失败点，别让前置 step 因无关原因先抛错稀释信号 |
| 空断言 `toBeVisible()` 冒充覆盖 | 每条预期可证伪、绑定契约代码行为 |
| 负例（期望 400/401）用会对非 2xx 抛错的 API helper | 负例用原始 `request.put/get` 拿状态码断言，别用 CRUD helper（它拿到码前先 throw） |
| 只写 UI/API 契约断言，漏了"真的发信看会不会被拦"的系统闭环（假完整）；把"存进去的 action=quarantine"当成"真被隔离" | 凡模块有运行态处置/效果，必补端到端运行态用例：真实建规则→真实触发（发信/真实请求）→**观察系统实际处置**（mail log action/reason、SMTP 码、隔离队列…）→断言 == 动作语义；逐动作等价类、命中/不命中两侧 |

## GREEN 自检（交付前逐项过）

- [ ] 只有 spec 文件，**无独立 `.md` 用例文档**。
- [ ] 每条 test 有 用例ID `tag` + 优先级/类型 `tag` + `precondition`/`expected`/`source` 注解 + `test.step` 步骤。
- [ ] `expected` 注解溯源到**契约代码位置**；断言值非 html_spec 硬编码；UI/API 分层断言正确。
- [ ] 每条 test 有 `source-rev` + `impl-rev` 双指纹，**由 `fingerprint.py` 实算**（非手写占位）、锚点为真实 `id=`（跑一次不报 not found）。
- [ ] 已知未修缺陷用 `test.fail()`，无无条件 `test.skip`。
- [ ] **凡 html_spec 描述了运行态处置/效果的模块，覆盖矩阵含 ≥1 组端到端运行态用例**（真实建规则→真实触发→观察系统实际处置→断言 == 动作语义），逐动作/效果等价类、命中/不命中两侧；只有 UI/API 契约断言 = 不完整系统用例（环境不可达用 `test.skip(!reachable)` 门控，但用例仍要写）。
- [ ] 派生矩阵覆盖 html_spec 各元素；未定义处标进覆盖矩阵，未臆造。
- [ ] 常驻覆盖矩阵内嵌在 spec 文件头 JSDoc；reconcile 另出变更报告到 `qc/reports/`（引用该矩阵，不另立第二份）。

## 残留流程风险（如实告知，技能无法自动消除）

reconcile 只在**被调用时**生效，管不了迭代节奏。要真「可维护」，建议把 reconcile **绑定触发**（`design/origin` 指针变动、相关 handler/schema 变更、或进 CI）——否则双指纹检测形同虚设。
