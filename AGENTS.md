# AGENTS.md — `webapp/` (admin console)

Guidance for AI agents working under `webapp/` (the Next.js admin console). For project-wide rules see the root [AGENTS.md](../AGENTS.md). Python E2E runner conventions and the rule about not running Python E2E and a browser automation suite against the same backend concurrently live in [`tests/AGENTS.md`](../tests/AGENTS.md).

Browser-driven UI regression for this console lives in `qc/` (yml framework, `qc/README.md` / `qc/scripts/playwright/README.md` / `qc/docs/yml-framework-reference.md`), not under `webapp/`. This file only keeps the lessons that are specific to *how webapp itself behaves* under browser automation — they apply regardless of which suite is driving the browser.

The webapp is served separately from apiserver (`API_BACKEND_URL` proxies `/api/v1`). It is the **business rules + 邮件日志** UI; cluster-level config/deployment is clustermgr's webui (see [`internal/cluster/AGENTS.md`](../internal/cluster/AGENTS.md)) — do not move capabilities between them.

## UI 设计

做任何界面/视觉相关的工作（新页面、组件、布局、配色、排版、间距、状态样式）前，**先参考根目录的 [`DESIGN.md`](../DESIGN.md)**。它是本控制台的设计语言权威：定义了配色 token（canvas / sidebar / brand primary / 威胁语义色阶）、字体（Geist sans / Geist Mono）、shadcn/ui new-york + Tailwind v4 token 层，以及统一的六层页面语义栈（heading → 全局 filter/toolbar → summary → 主内容 → detail → page actions）。新页面应沿用该语义栈与既有 token，不要自造配色/间距/排版；`/statistics/security-overview` 是首个参考样板页。

## 改前端时不要重打镜像 —— 用宿主机 dev server + 热重载（已验证）

**qc 的 yml UI 层默认打 `test_env.yml.local.json` 里配置的 `web.url`，通常指向一个交付形态部署（跑的是镜像里已编译好的产物）。**
所以改了 `webapp/src/**` 后如果不重建镜像，那套 UI 自动化看到的还是旧界面——很容易误判成"改了没用/产品有 bug"。
但**为一次前端小改就重打一遍 webapp 镜像（分钟级）是浪费**：调试期改用宿主机 Next.js dev server，它自带
Fast Refresh，**改完存盘即生效，完全不用 build**：

```bash
# 1) 起 dev server（一次即可，之后一直开着；API 代理默认就指向 127.0.0.1:18080 的 apiserver，无需额外配置）
cd webapp && npm run dev            # :3000

# 2) 预热一次（见下方"冷编译"坑），然后把要验证的 qc 用例指向它
curl -s -o /dev/null http://localhost:3000/zh/login
cd qc && OSG_QC_WEB_URL=http://localhost:3000 npm run test:yml:ui-only -- --grep "<CASE_ID>"
```

要点与坑：

- **改 `webapp/src/**` → 存盘即热重载**，不需要 `npm run build`，更不需要 `build.py` / `docker compose up`。
- **冷编译会假失败**：dev server 是按路由懒编译的，某个页面第一次访问要编译数秒~数十秒，容易撞上浏览器自动化的
  断言超时，表现为"某个本来该过的用例超时失败"（实测：冷跑失败、预热后同一用例几秒内通过）。所以先 `curl` 一下目标页面预热，
  或对首次失败的用例重跑一次再判定。**不要**因为冷编译超时就去改产品代码。
- **最终认证仍必须跑镜像**：全量回归（尤其是要"认证通过"的那一轮）要用 `build.py` 重建 webapp 镜像，指向部署好的目标环境，
  因为生产/CI 跑的是 `next build` 的产物（dev server 与 production build 在 RSC/缓存/压缩上并不完全等价）。
  节奏：**迭代期用 dev server 免 build → 全部修完后重建镜像跑一次完整回归认证**。
- webapp 镜像构建涉及 Node base image 和 npm registry；具体 `NODE_IMAGE`、`BASE_IMAGE_REGISTRY`、`NPM_CONFIG_REGISTRY` 等 build args 以[构建说明](../docs/operations/build.md) 和 `python3 build.py --help/--status` 为准，不要在 webapp 文档里另写一套 registry 规则。
- 重建 webapp 镜像时选择一个显式 `IMAGE_TAG`，并把同一个值同时传给 `build.py --image-tag` 和 `docker compose`。启动前用 `docker compose config --images` 和容器 image ID 验证，不要靠同时维护 `:8.0` / `:1.0.0` 两个别名掩盖 tag 漂移。Clean host 还必须先有与当前源码匹配的 `tmpl-webapp-builder`、`tmpl-webapp-runtime` 固定模板镜像；`--all-images` 不会自动构建它们。
- 给 UI 自动化补 `data-testid` 后，远端/容器环境必须先重建并替换 webapp 镜像；源码里能 grep 到不等于浏览器 DOM 已更新。排查时先查容器 image ID，再去运行镜像的 `/app/.next` 或 `/usr/share/nginx/html` grep 新 testid，最后看实际 DOM。

## 给 webapp 写浏览器自动化用例时的经验

这里只收对**这个 webapp 界面本身**成立的经验（跟哪套框架在驱动浏览器无关）。执行方式、runner
命令、目录约定属于驱动它的那套套件自己的文档（当前是 `qc/`），不在本文件重复维护。

### 租户级页面：只写 `osgateway_selected_tenant` 不够，必须同时写 `osg_viewer=tenant`

GT-12245 (`feecfffd56`) 起，**平台视角会主动清除残留的租户选择**。用浏览器自动化模拟"已选定
租户"时，只塞 `localStorage.osgateway_selected_tenant` + `osg_selected_tenant` cookie 而不设
`osg_viewer=tenant` 的话，选择会被清空，租户级模块开关随即变成 `aria-disabled` +
`title="请先选择租户，再修改此模块"`，点击直接超时。三者必须一起写，例见
`qc/scripts/playwright/specs/maintained/html-spec/sender_filter_html_spec.qc.spec.ts`：

```ts
localStorage.setItem('osgateway_selected_tenant', String(tenantId));
document.cookie = `osg_selected_tenant=${tenantId}; path=/; SameSite=Strict`;
document.cookie = 'osg_viewer=tenant; path=/; SameSite=Strict';
```
