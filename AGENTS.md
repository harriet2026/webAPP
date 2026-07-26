# AGENTS.md — `webapp/` (admin console & Playwright E2E)

Guidance for AI agents working under `webapp/` (the Next.js admin console). For project-wide rules see the root [AGENTS.md](../AGENTS.md). Shared E2E runner notes, the flaky-rerun policy, and the **"Python E2E 与 Playwright E2E 不能同时运行"** rule live in [`tests/AGENTS.md`](../tests/AGENTS.md) and apply here too.

The webapp is served separately from apiserver (`API_BACKEND_URL` proxies `/api/v1`). It is the **business rules + 邮件日志** UI; cluster-level config/deployment is clustermgr's webui (see [`internal/cluster/AGENTS.md`](../internal/cluster/AGENTS.md)) — do not move capabilities between them.

## UI 设计

做任何界面/视觉相关的工作（新页面、组件、布局、配色、排版、间距、状态样式）前，**先参考根目录的 [`DESIGN.md`](../DESIGN.md)**。它是本控制台的设计语言权威：定义了配色 token（canvas / sidebar / brand primary / 威胁语义色阶）、字体（Geist sans / Geist Mono）、shadcn/ui new-york + Tailwind v4 token 层，以及统一的六层页面语义栈（heading → 全局 filter/toolbar → summary → 主内容 → detail → page actions）。新页面应沿用该语义栈与既有 token，不要自造配色/间距/排版；`/statistics/security-overview` 是首个参考样板页。

## 改前端时不要重打镜像 —— 用宿主机 dev server + 热重载（已验证）

**默认的 `PLAYWRIGHT_BASE_URL=http://localhost` 打的是 compose 里的 `webapp-app` 容器，跑的是镜像里已编译好的产物。**
所以改了 `webapp/src/**` 后如果不重建镜像，Playwright 看到的还是旧界面——很容易误判成"改了没用/产品有 bug"。
但**为一次前端小改就重打一遍 webapp 镜像（分钟级）是浪费**：调试期改用宿主机 Next.js dev server，它自带
Fast Refresh，**改完存盘即生效，完全不用 build**：

```bash
# 1) 起 dev server（一次即可，之后一直开着；API 代理默认就指向 127.0.0.1:18080 的 apiserver，无需额外配置）
cd webapp && npm run dev            # :3000

# 2) 预热一次（见下方"冷编译"坑），然后把 Playwright 指向它
curl -s -o /dev/null http://localhost:3000/zh/login
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/specs/<x>.spec.ts --reporter=line
# runner 同理：python3 webapp/tests/run_e2e_pw.py --base-url http://localhost:3000 --start <片段>
```

要点与坑：

- **改 `webapp/src/**` → 存盘即热重载**，不需要 `npm run build`，更不需要 `build.py` / `docker compose up`。改 spec（`webapp/tests/`）本来就不需要 build。
- **冷编译会假失败**：dev server 是按路由懒编译的，某个页面第一次访问要编译数秒~数十秒，容易撞上 Playwright 的
  10s 断言超时，表现为"某个本来该过的用例超时失败"（实测：冷跑失败、预热后同一用例 8.9s 通过）。所以先 `curl` 一下目标页面预热，
  或对首次失败的用例重跑一次再判定。**不要**因为冷编译超时就去改产品代码。
- **最终认证仍必须跑镜像**：全量回归（尤其是要"认证通过"的那一轮）要用 `build.py` 重建 webapp 镜像 + 默认
  `http://localhost`，因为生产/CI 跑的是 `next build` 的产物（dev server 与 production build 在 RSC/缓存/压缩上并不完全等价）。
  节奏：**迭代期用 dev server 免 build → 全部修完后重建镜像跑一次完整回归认证**。
- webapp 镜像构建涉及 Node base image 和 npm registry；具体 `NODE_IMAGE`、`BASE_IMAGE_REGISTRY`、`NPM_CONFIG_REGISTRY` 等 build args 以根目录 [`AGENTS.md`](../AGENTS.md) 和 `python3 build.py --help/--status` 为准，不要在 webapp 文档里另写一套 registry 规则。
- 重建 webapp 镜像时选择一个显式 `IMAGE_TAG`，并把同一个值同时传给 `build.py --image-tag` 和 `docker compose`。启动前用 `docker compose config --images` 和容器 image ID 验证，不要靠同时维护 `:8.0` / `:1.0.0` 两个别名掩盖 tag 漂移。Clean host 还必须先有与当前源码匹配的 `tmpl-webapp-builder`、`tmpl-webapp-runtime` 固定模板镜像；`--all-images` 不会自动构建它们。

## Playwright E2E 测试

### 【必守】spec 里的写请求必须打**绝对**的 apiserver 地址

runner 把 `PLAYWRIGHT_BASE_URL` 设成 **`http://localhost`**，而 webapp 把 http **301** 到
https。按 HTTP 语义 **301 会把 POST/PUT/DELETE 降级成 GET 并丢掉请求体**，所以用相对路径
`page.request.post('/api/v1/...')` 会静默出事：

| 调用 | 实际发生 |
| --- | --- |
| `POST /tenants` | → `GET /tenants` → `200 {items:[…]}` → 读 `.tenant` 报 `Cannot read properties of undefined` |
| `PUT …/status` | → `GET` → `200` → **`expect(resp.ok()).toBeTruthy()` 照样通过，但根本没写进去** |
| `DELETE /tenants/:id` | → `GET` → 资源从未清理（tenants 表已被历次 E2E 堆到上千条） |
| `POST /auth/login` | → `GET` → `400 {"message":"EOF"}` → helper 静默返回 `undefined` |

**最危险的是"绿着的假断言"**：读操作（GET→GET）不受影响，整份 spec 看着正常，只有恰好读了
响应体的用例会炸，而且**只在 runner 里复现、单跑必过**（单跑用 config 的 https baseURL，不
重定向）。判 flaky 前先用 runner 的条件复现：
`PLAYWRIGHT_BASE_URL=http://localhost npx playwright test <spec>`。

正确写法（`tests/e2e/helpers/seed-data.ts` 一直是这个写法，照抄）：

```ts
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:18080/api/v1';
```

写完还要**回读断言** —— `ok()` 区分不了「真写入」和「降级后的 GET」：

```ts
expect((await check.json()).status).toBe('active');   // 不能只看 activated.ok()
```

巡检：`grep -rnE 'request\.(post|put|patch|delete)\([^)]*/api/' webapp/tests/e2e/`，
挑出其中**相对路径**的那些。

### 租户级页面：只写 `osgateway_selected_tenant` 不够，必须同时写 `osg_viewer=tenant`

GT-12245 (`feecfffd56`) 起，**平台视角会主动清除残留的租户选择**。测试里只塞
`localStorage.osgateway_selected_tenant` + `osg_selected_tenant` cookie 而不设
`osg_viewer=tenant` 的话，选择会被清空，租户级模块开关随即变成 `aria-disabled` +
`title="请先选择租户，再修改此模块"`，点击直接超时。

- 用 `webapp/tests/run_e2e_pw.py`（优先用它，逐个 .spec.ts 跑、失败即停且定位精确）：
  - 按 spec 文件名字母顺序，一次只跑一个 .spec.ts；遇到第一个有失败的 spec 就停，打印
    「第几个/共几个、文件名、失败的测试」。脚本内部已 unset 代理、`PLAYWRIGHT_BASE_URL` 默认 http://localhost、在 webapp 目录下调用 npx。
  - spec 清单**运行时动态发现**（glob webapp/tests/e2e/specs/*.spec.ts），随时增删 .spec.ts 自动生效；`--start` 同样支持序号或文件名片段（推荐用文件名片段）。
  - 常用：
    - `python3 webapp/tests/run_e2e_pw.py` —— 从第 1 个 spec 全跑
    - `python3 webapp/tests/run_e2e_pw.py --list` —— 打印带序号的 spec 清单
    - `python3 webapp/tests/run_e2e_pw.py --start N` 或 `--start <文件名片段>` —— 从某个 spec 开始
    - `--reruns N` —— 失败的测试自动重跑（透传 playwright `--retries`），重跑通过即算 flaky-pass（默认 1，`--reruns 0` 关闭）
    - `--timeout 900`（单 spec 超时秒，默认 600）、`--base-url`、`--no-regress`
  - 同样在 `--start`（非第 1 个）跑完全过后自动从第 1 个完整回归一次。
- 整套 playwright 也可一条命令跑（不需要逐文件定位时，**需在 webapp 目录下执行**）：

  ```
  unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY && PLAYWRIGHT_BASE_URL=http://localhost timeout 1800 npx playwright test --reporter=list 2>&1 > /tmp/playwright_result.txt
  ```
