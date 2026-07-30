import { test, expect, Page } from '@playwright/test';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

// Task 9 (终验) Part D — Playwright happy-path coverage for the P3 webui
// upgrade adapter (internal/cluster/webui/upgrade.go, Task 8) — EXTENDED by
// review finding I7 with the actual front-end panel (the 升级 tab in
// static/index.html + app.js), so this spec now has two layers:
//
//  1. the original API-through-the-browser-context checks (page.request)
//     against the REAL clustermgr serve binary's /api/upgrade/* routes;
//  2. UI-driving checks in the ca-backup-status-mocked.spec.ts style
//     (localStorage token + tab click + locator assertions), with the
//     data-heavy endpoints mocked via page.route and the cheap ones
//     (plan/abandon 501 stubs) hitting the real server.
//
// Pattern followed (buildBinary / startMockAgentSocket / startClusterlessWeb
// / stopProcs) is copied from ca-backup-status-mocked.spec.ts, the existing
// "mocked ctl, no live cluster" convention for clustermgr-webui specs.

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'build', 'bin');

// buildBinary here ALWAYS rebuilds (unlike the other clustermgr-webui specs'
// copy of this helper, which only builds if the binary is absent) — this
// spec exists specifically to certify Task 8's freshly-added routes, and
// the documented trap (task-9-brief.md) is that a stale build/bin/clustermgr
// silently serves an OLD embedded webui missing them. Forcing a rebuild here
// means this spec is correct to run standalone; it does make it slightly
// slower than the other specs when run as part of a full suite that already
// rebuilt fresh binaries moments earlier (acceptable trade for correctness).
function buildBinaryFresh(name: string, pkg: string): string {
  const binary = path.join(BIN_DIR, name);
  fs.mkdirSync(BIN_DIR, { recursive: true });
  try { fs.unlinkSync(binary); } catch { /* absent is fine */ }
  execSync(`go build -o ${binary} ${pkg}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
  return binary;
}

interface Procs {
  web: ChildProcess | null;
  agentMock: net.Server | null;
  tmpDir: string;
  dataRoot: string;
  webToken: string;
  webURL: string;
}

// startMockCtlSocket serves a minimal ctl unix socket that answers just
// enough ops for collect.Collector.Facts() (internal/cluster/upgradeflow/
// collect/collect.go) to complete without error for the ver=="" (status/
// packages/register) case: get_doc, get_self, get_nodes_info. Everything
// else (cluster_build_info, db_migrate_status, ...) gets a well-formed
// "not supported" error response — exactly how a real osg-agent answers an
// op it doesn't implement, which Facts already treats as a soft "unknown"
// collection diagnostic (see collect.go's c.warnf call sites), never a crash.
// One JSON request/response per TCP-like connection, matching ctl.Client's
// rawRequestWithTimeout framing (encode one Request, decode one Response,
// close).
function startMockCtlSocket(sockPath: string, dataRoot: string): Promise<net.Server> {
  const doc = {
    version: 1,
    updated_by: 'self',
    cluster_token_hash: '',
    nodes: [
      { id: 'self', advertise_ip: '127.0.0.1', data_root: dataRoot },
    ],
    services: {},
  };
  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('data', (d) => {
      buf += d.toString();
      let req: any;
      try {
        req = JSON.parse(buf);
      } catch {
        return; // wait for the full request
      }
      let resp: any;
      switch (req.op) {
        case 'get_doc':
          resp = { ok: true, doc };
          break;
        case 'get_self':
          resp = {
            ok: true,
            self: {
              node_id: 'self',
              agent_addr: '',
              advertise_ip: '127.0.0.1',
              ca_ready: false,
              has_ca_key: false,
              runtime_install: {},
            },
          };
          break;
        case 'get_nodes_info':
          resp = { ok: true, nodes_info: [] };
          break;
        default:
          resp = { ok: false, error: `not supported (mock ctl socket): ${req.op}` };
      }
      conn.write(JSON.stringify(resp));
      conn.end();
    });
    conn.on('error', () => {});
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(sockPath, () => resolve(server));
  });
}

// startUpgradePanelWeb spawns one clustermgr serve against a fresh, private
// dataRoot.
//
//   basePort — each describe block gets a DISJOINT random range, so the two
//     (now three) concurrently-spawned servers in this file cannot collide on
//     a port.
//   env — extra environment for the spawned process; used by the package
//     lifecycle block to shrink OSG_UPGRADE_UPLOAD_MAX_BYTES so the upload
//     cap can be exercised for real instead of being mocked.
async function startUpgradePanelWeb(basePort = 18500, env: Record<string, string> = {}): Promise<Procs> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-panel-mock-'));
  const dataRoot = path.join(tmpDir, 'data');
  fs.mkdirSync(dataRoot, { recursive: true });
  const sockPath = path.join(tmpDir, 'ctl.sock');
  const agentMock = await startMockCtlSocket(sockPath, dataRoot);

  // The critical trap this test exists to avoid (task-9-brief.md): buildBinary
  // in the OTHER clustermgr-webui specs only rebuilds when the binary is
  // absent, so a binary built before Task 8 landed would silently keep
  // serving a mux without /api/upgrade/* — force-rebuild here.
  const clustermgrBin = buildBinaryFresh('clustermgr', './cmd/clustermgr');
  const webPort = basePort + Math.floor(Math.random() * 100);
  const webURL = `http://127.0.0.1:${webPort}`;
  let webToken = '';
  let webStarted = false;

  const web = spawn(clustermgrBin, [
    'serve',
    `--socket=${sockPath}`,
    `--listen=127.0.0.1:${webPort}`,
    '--idle-seconds=3600',
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });

  await new Promise<void>((resolve, reject) => {
    let output = '';
    const tryResolve = () => {
      if (webStarted && webToken) resolve();
    };
    const onData = (data: Buffer) => {
      output += data.toString();
      const tokenMatch = output.match(/web token:\s*(\S+)/);
      if (tokenMatch) {
        webToken = tokenMatch[1];
      }
      if (output.includes('serving on')) {
        webStarted = true;
      }
      tryResolve();
    };
    web.stdout!.on('data', onData);
    web.stderr!.on('data', onData);
    setTimeout(() => {
      if (!webStarted || !webToken) reject(new Error(`clustermgr web did not start. Output: ${output}`));
    }, 10000);
  });

  return { web, agentMock, tmpDir, dataRoot, webToken, webURL };
}

async function stopProcs(procs: Procs | undefined) {
  if (!procs) return;
  if (procs.web) {
    try { procs.web.kill(); } catch {}
  }
  if (procs.agentMock) {
    try { procs.agentMock.close(); } catch {}
  }
  try {
    fs.rmSync(procs.tmpDir, { recursive: true, force: true });
  } catch {}
}

test.describe('Upgrade panel API surface (mocked ctl, no front-end panel yet)', () => {
  // Shared spawned clustermgr (beforeAll) ⇒ serial, same convention as the
  // other clustermgr-webui specs sharing one process.
  test.describe.configure({ mode: 'serial' });
  let procs: Procs | undefined;

  test.beforeAll(async () => {
    procs = await startUpgradePanelWeb();
  });

  test.afterAll(async () => {
    await stopProcs(procs);
  });

  test('GET /api/upgrade/status without a token is rejected (401)', async ({ page }) => {
    const resp = await page.request.get(`${procs!.webURL}/api/upgrade/status`);
    expect(resp.status()).toBe(401);
  });

  test('Happy path: status → packages → register (path traversal 400) → delete (404 never-staged)', async ({ page }) => {
    const headers = { 'X-Web-Token': procs!.webToken };

    // 1. Status: the panel's core read — same upgradeflow.Derive(f) result
    // the CLI's `upgrade status --json` prints (see
    // TestJSONContractCLIWebuiStatusParity, cmd/clustermgr).
    const statusResp = await page.request.get(`${procs!.webURL}/api/upgrade/status`, { headers });
    expect(statusResp.status()).toBe(200);
    const statusBody = await statusResp.json();
    expect(statusBody).toHaveProperty('state');
    expect(statusBody.state).toHaveProperty('NodeVersions');
    expect(statusBody.state.NodeVersions).toHaveProperty('self');
    expect(statusBody.state.RollbackAvailable).toBe(false);

    // 2. Packages: nothing staged yet in the fresh dataRoot ⇒ empty list, not
    // an error (proves the GET route + local-disk scan wiring, not just that
    // it 404s).
    const packagesResp = await page.request.get(`${procs!.webURL}/api/upgrade/packages`, { headers });
    expect(packagesResp.status()).toBe(200);
    const packagesBody = await packagesResp.json();
    expect(packagesBody.items ?? []).toEqual([]);

    // 3. Register: a path-traversal filename must be rejected with 400
    // BEFORE any filesystem write is attempted (internal/cluster/webui/
    // upgrade.go's register handler; unit-pinned by
    // TestUpgradePackageRegisterRejectsPathTraversal, exercised here through
    // an actual HTTP round trip against the live server instead).
    const registerResp = await page.request.post(`${procs!.webURL}/api/upgrade/package/register`, {
      headers,
      data: { filename: '../../etc/passwd' },
    });
    expect(registerResp.status()).toBe(400);

    // 4. Capability routes (review finding I7): every capability-table row's
    // webui entry must be ROUTED — 404 means the capability is missing.
    for (const [method, p] of [
      ['POST', '/api/upgrade/node'],
      ['POST', '/api/upgrade/node/local'],
      ['POST', '/api/upgrade/push-all'],
      ['POST', '/api/upgrade/rollback'],
      ['POST', '/api/upgrade/migrate'],
      ['GET', '/api/upgrade/collect'],
      ['POST', '/api/upgrade/baseline'],
      ['GET', '/api/upgrade/plan'],
      ['POST', '/api/upgrade/control-plane/launch'],
      ['POST', '/api/upgrade/control-plane/resume-stopped'],
      ['POST', '/api/upgrade/control-plane/abandon'],
      ['GET', '/api/upgrade/control-plane/status'],
    ] as const) {
      const resp = method === 'GET'
        ? await page.request.get(`${procs!.webURL}${p}`, { headers })
        : await page.request.post(`${procs!.webURL}${p}`, { headers, data: {} });
      expect(resp.status(), `${method} ${p} must be routed`).not.toBe(404);
    }

    // 5. Delete: a version that was never staged must never be reported as
    // successfully removed. The exact 4xx code depends on WHERE Gate's
    // real-Facts evaluation stops it — this mocked ctl has no peer
    // transport, so Facts.NodePkg for the lone participant comes back
    // Probed:false (an "unknown", fail-closed input per derive.go's
    // documented unknown-vocabulary rule — see internal/cluster/upgradeflow/
    // derive.go and Task 3's progress notes), which denies (409) before the
    // handler even reaches its own "was this version ever staged here" 404
    // check (unit-pinned with an injected, fully-"known" Facts fixture by
    // TestUpgradePackageDeleteNeverStagedReturns404). Either way the
    // contract this test cares about — a delete of nothing is never
    // silently reported as OK, and never crashes as a 500 — holds.
    const deleteResp = await page.request.delete(`${procs!.webURL}/api/upgrade/package/8.1.0-never-staged`, { headers });
    expect([404, 409]).toContain(deleteResp.status());
  });
});

// ---------------------------------------------------------------------------
// UI layer (finding I7): the 升级 tab now exists — drive it the way
// ca-backup-status-mocked.spec.ts drives the Security tab.
// ---------------------------------------------------------------------------

// GotoUpgradeTabOptions lets a test inspect (and selectively cancel) the
// confirm()/prompt() dialogs the panel raises. The panel puts operator-facing
// FACTS in those dialogs — most importantly spec §1's pre-distribute byte
// estimate — so a test that only auto-accepts them cannot tell an honest
// estimate from an invented one.
interface GotoUpgradeTabOptions {
  // dialogs receives every dialog message in the order it was raised.
  dialogs?: string[];
  // dismiss cancels (rather than accepts) confirm() dialogs whose message
  // matches — the operator-said-no path.
  dismiss?: RegExp;
}

async function gotoUpgradeTab(page: Page, webURL: string, webToken: string, opts: GotoUpgradeTabOptions = {}) {
  page.on('dialog', async (dialog) => {
    if (opts.dialogs) opts.dialogs.push(dialog.message());
    if (dialog.type() === 'prompt') {
      await dialog.accept(webToken);
      return;
    }
    if (opts.dismiss && opts.dismiss.test(dialog.message())) {
      await dialog.dismiss();
      return;
    }
    await dialog.accept(); // confirm() dialogs on destructive buttons
  });
  await page.addInitScript((token) => {
    localStorage.setItem('web_token', token);
  }, webToken);
  await page.goto(webURL);
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-tab="upgrade"]').click();
  await expect(page.locator('#tab-upgrade')).toBeVisible();
}

test.describe('Upgrade panel UI (mocked API)', () => {
  test.describe.configure({ mode: 'serial' });
  let procs: Procs | undefined;

  test.beforeAll(async () => {
    procs = await startUpgradePanelWeb(18600);
  });

  test.afterAll(async () => {
    await stopProcs(procs);
  });

  test('status overview renders staged packages, node versions and rollback availability', async ({ page }) => {
    await page.route('**/api/upgrade/status*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('op')) {
        // Gate query for the disabled-state rendering: deny with a fixed
        // reason so the panel must show it VERBATIM.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            state: {},
            gate: { op: url.searchParams.get('op'), target: url.searchParams.get('target'), allowed: false, reason: '测试拒绝理由-P4' },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: {
            StagedVersions: ['8.1.0'],
            NodeVersions: { 'node-a': '8.0.0', 'node-b': '8.0.0', 'node-c': '8.0.0' },
            ActivePins: { 'node-b': '8.0.0' },
            RollbackAvailable: true,
            // §2 事实表 / §3.1 第 5 条 — THREE states, and the third one is
            // the point: node-c is ABSENT from the map because nobody could
            // ask it (old agent answers 404 / node unreachable). It must
            // render 未知, never 无.
            site_baselines: { 'node-a': true, 'node-b': false },
            control_plane: { nodes: { 'node-a': { state: 'idle', updated_at: 1 } } },
          },
          preflight_warnings: [],
          collection_diagnostics: [],
        }),
      });
    });
    await page.route('**/api/upgrade/packages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ Version: '8.1.0', SHA256: 'deadbeefcafef00d', Dev: false, UpgradeFrom: ['8.0.0'] }],
          incoming: [
            { name: 'osgateway-8.2.0-full.tar.gz', path: '/var/lib/osgateway/upgrade-packages/incoming/osgateway-8.2.0-full.tar.gz', size: 1048576, mod_time: '2026-07-29T03:04:05Z' },
          ],
        }),
      });
    });

    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await expect(page.getByTestId('upg-status-summary')).toContainText('8.1.0');
    await expect(page.getByTestId('upg-status-summary')).toContainText('rollback 可用: 是');
    // Staged package row + its per-row delete button.
    await expect(page.getByTestId('upg-pkg-table')).toContainText('8.1.0');
    await expect(page.getByTestId('upg-del-8.1.0')).toBeVisible();
    // Node table shows declared versions and the pin.
    await expect(page.getByTestId('upg-node-table')).toContainText('node-a');
    await expect(page.getByTestId('upg-node-table')).toContainText('node-b');
    // Node selector was populated.
    await expect(page.locator('#upg-node option')).toHaveCount(3);

    // Site-baseline column: all THREE states rendered distinctly.
    await expect(page.getByTestId('upg-baseline-node-a')).toHaveText('有');
    await expect(page.getByTestId('upg-baseline-node-b')).toHaveText('无');
    await expect(page.getByTestId('upg-baseline-node-c')).toHaveText('未知');

    // incoming/ listing (finding I9): the scp arrival path is now visible,
    // with the register hint wired to the register input.
    await expect(page.getByTestId('upg-inc-name-osgateway-8.2.0-full.tar.gz')).toBeVisible();
    await expect(page.getByTestId('upg-incoming-table')).toContainText('1.0 MB');
    await page.getByTestId('upg-inc-reg-osgateway-8.2.0-full.tar.gz').click();
    await expect(page.getByTestId('upg-register-filename')).toHaveValue('osgateway-8.2.0-full.tar.gz');

    // Gate check: buttons get disabled with the server's verbatim reason.
    await page.getByTestId('upg-ver').fill('8.1.0');
    await page.getByTestId('upg-gates').click();
    await expect(page.getByTestId('upg-gate-out')).toContainText('测试拒绝理由-P4');
    await expect(page.getByTestId('upg-pushall')).toBeDisabled();
    await expect(page.getByTestId('upg-node-go')).toBeDisabled();
    await expect(page.getByTestId('upg-rollback-exec')).toBeDisabled();
  });

  // plan and abandon are no longer 501 stubs — both are implemented and hit
  // the live clustermgr serve process here (no route mocks), so what is
  // asserted is the REAL server's refusal for this mocked, package-less
  // cluster, rendered verbatim by the panel.
  test('plan renders the real server refusal for an unregistered version', async ({ page }) => {
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    // No version filled in yet -> the panel refuses locally without a call.
    await page.getByTestId('upg-plan').click();
    await expect(page.getByTestId('upg-cp-out')).toContainText('先在「升级执行」填写目标版本');

    // With a version: nothing is registered in this fresh dataRoot, so
    // upgradeflow.BuildStage1Plan refuses and the panel echoes it verbatim.
    await page.getByTestId('upg-ver').fill('8.1.0');
    await page.getByTestId('upg-plan').click();
    await expect(page.getByTestId('upg-cp-out')).toContainText('尚未登记');
    await expect(page.getByTestId('upg-cp-out')).not.toContainText('501');
  });

  test('abandon prompts for an ack reason and renders the real server verdict', async ({ page }) => {
    // gotoUpgradeTab's dialog handler accepts prompt() with the web token,
    // so the mandatory ack reason is supplied non-empty; the confirm() that
    // follows selects --now.
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-cp-abandon').click();
    // This mocked ctl exposes no admitted participants and no active claim,
    // so the server refuses with one of its two nothing-to-act-on verdicts —
    // never a 501, and never a claimed success.
    await expect(page.getByTestId('upg-cp-out')).toContainText(/无参与节点|nothing to act on/);
    await expect(page.getByTestId('upg-cp-out')).not.toContainText('✅');
  });

  test('push-all denial renders the server reason and never claims success', async ({ page }) => {
    await page.route('**/api/upgrade/push-all', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: '推全前置门禁未通过：测试用拒绝' }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('8.1.0');
    await page.getByTestId('upg-pushall').click(); // confirm() auto-accepted by the dialog handler
    await expect(page.getByTestId('upg-exec-out')).toContainText('推全前置门禁未通过：测试用拒绝');
    await expect(page.getByTestId('upg-exec-out')).not.toContainText('✅');
  });

  // ── preflight (§0.1 capability row 升级前检查) ──────────────────────────
  // Green and red are two DIFFERENT renderings, and the red one must quote
  // the server's reason verbatim — the panel never re-derives a verdict.

  test('preflight renders the pass verdict together with its business warnings', async ({ page }) => {
    await page.route('**/api/upgrade/preflight*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '9.9.1',
          allowed: true,
          reason: '',
          // PreflightWarnings() — allowed, but NOT silent: these are the
          // dev-package / site-baseline banners the CLI also prints.
          preflight_warnings: ['9.9.1 是开发/测试构建包（manifest.dev=true）'],
          collection_diagnostics: ['node-c: cluster_build_info 不支持，按未知处理'],
        }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-preflight').click();
    await expect(page.getByTestId('upg-exec-out')).toContainText('✅ preflight 通过');
    await expect(page.getByTestId('upg-exec-out')).toContainText('⚠ 9.9.1 是开发/测试构建包');
    await expect(page.getByTestId('upg-exec-out')).toContainText('（采集诊断）node-c');
  });

  test('preflight denial and the gate check quote the SAME reason sentence verbatim', async ({ page }) => {
    // One sentence, two surfaces: /preflight and /status?op= are both fed by
    // upgradeflow.Gate, so a panel that paraphrased either would put two
    // different explanations of one refusal in front of the operator.
    const REASON = '版本 9.9.1 尚未分发到节点 node-b（缺 pkg/），拒绝升级';
    await page.route('**/api/upgrade/preflight*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '9.9.1', allowed: false, reason: REASON,
          preflight_warnings: [], collection_diagnostics: [],
          fingerprint_diff: '- schema_fingerprint: abc123\n+ schema_fingerprint: def456',
        }),
      });
    });
    await page.route('**/api/upgrade/status*', async (route) => {
      const url = new URL(route.request().url());
      const op = url.searchParams.get('op');
      if (!op) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: {} }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state: {}, gate: { op, allowed: false, reason: REASON } }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-preflight').click();
    await expect(page.getByTestId('upg-exec-out')).toContainText('⛔ preflight 拒绝：' + REASON);
    // The fingerprint diff is the actionable payload of a fingerprint-class
    // refusal — dropping it would leave the operator with a verdict and no
    // way to act on it.
    await expect(page.getByTestId('upg-exec-out')).toContainText('指纹差异：');
    await expect(page.getByTestId('upg-exec-out')).toContainText('schema_fingerprint: def456');

    await page.getByTestId('upg-gates').click();
    await expect(page.getByTestId('upg-gate-out')).toContainText(REASON);
  });

  // ── distribute (§0.1 capability row 分发到各节点; §1「分发前展示预计字节量」) ──

  test('distribute states the estimated bytes BEFORE the confirmation, then renders the per-node matrix', async ({ page }) => {
    const ESTIMATE = [
      '预计传输字节量（版本 9.9.1，目标节点 2 台）：',
      '  完整包 (dist tarball)：1.2 GB/节点 × 2 = 2.4 GB',
      '  镜像 (7 个 image tar)：820.0 MB/节点 × 2 = 1.6 GB',
      '  合计：4.0 GB（每节点 2.0 GB）',
      '',
    ].join('\n');
    let estimateCalls = 0;
    await page.route('**/api/upgrade/package/distribute-estimate*', async (route) => {
      estimateCalls++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ nodes: ['node-b', 'node-c'], total: 4e9, per_node: 2e9, formatted: ESTIMATE }),
      });
    });
    await page.route('**/api/upgrade/package/distribute', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '9.9.1',
          ok: false, // partial failure must NOT render as success
          items: [
            { Node: 'node-b', Artefact: 'package.tar.gz', Outcome: 'sent', Error: '' },
            { Node: 'node-b', Artefact: 'images/apiserver.tar', Outcome: 'skipped_verified_identical', Error: '' },
            { Node: 'node-c', Artefact: 'package.tar.gz', Outcome: 'unreachable', Error: 'dial tcp 10.0.0.9:7700: connect: connection refused' },
          ],
        }),
      });
    });

    const dialogs: string[] = [];
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken, { dialogs });

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-distribute').click();

    // 1. After confirming: the full (node, artefact, outcome) matrix, with the
    //    failing row's error text and an overall verdict that says partial.
    //    Awaited FIRST so it doubles as the synchronisation point for the
    //    estimate→confirm→transfer chain below (the click only kicks it off).
    await expect(page.getByTestId('upg-exec-out')).toContainText('⛔ 部分分发失败');
    await expect(page.getByTestId('upg-exec-out')).toContainText('✅ node-b package.tar.gz [sent]');
    await expect(page.getByTestId('upg-exec-out')).toContainText('node-b images/apiserver.tar [skipped_verified_identical]');
    await expect(page.getByTestId('upg-exec-out')).toContainText('⛔ node-c package.tar.gz [unreachable]：dial tcp 10.0.0.9:7700');
    await expect(page.getByTestId('upg-exec-out')).not.toContainText('✅ 分发完成');

    // 2. The estimate reached the operator BEFORE they were asked to confirm.
    //    Asserted on the confirm() text, not on the output pane: the pane is
    //    overwritten by the transfer result as soon as the dialog is accepted,
    //    so a pane assertion here would be a race. The pane rendering of the
    //    estimate is pinned deterministically by the two cancel-path tests
    //    (the pane keeps the estimate when the operator says no).
    expect(dialogs.length, 'distribute must ask for confirmation').toBeGreaterThan(0);
    expect(dialogs[0]).toContain('预计传输字节量（版本 9.9.1，目标节点 2 台）');
    expect(dialogs[0]).toContain('确认把版本 9.9.1 的包分发到全部参与节点？');
    expect(estimateCalls).toBe(1);
  });

  test('distribute admits an unavailable estimate instead of inventing one, and cancelling transfers nothing', async ({ page }) => {
    await page.route('**/api/upgrade/package/distribute-estimate*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'stat pkg dir: permission denied' }),
      });
    });
    let distributeCalls = 0;
    await page.route('**/api/upgrade/package/distribute', async (route) => {
      distributeCalls++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) });
    });

    const dialogs: string[] = [];
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken, { dialogs, dismiss: /确认把版本/ });

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-distribute').click();

    // The pane keeps the estimate text alongside the cancellation (nothing
    // overwrites it on this path), so both surfaces can be asserted here.
    await expect(page.getByTestId('upg-exec-out')).toContainText('（预计字节量估算不可用）');
    await expect(page.getByTestId('upg-exec-out')).toContainText('已取消。');
    expect(dialogs[0]).toContain('（预计字节量估算不可用）');
    // No fabricated number anywhere in what the operator was shown.
    expect(dialogs[0]).not.toMatch(/合计：\s*\d/);
    expect(distributeCalls, 'a cancelled confirmation must not distribute').toBe(0);
  });

  // ── control-plane launch (§0.1 阶段 1 一键编排; §6.4.1 的 probe→formal 两阶段) ──

  test('control-plane launch happy path: ONE panel-side submit, op_id and note rendered', async ({ page }) => {
    // §6.4.1's probe stage and formal stage are ONE server-side operation
    // sharing one op_id; the panel issues a single POST and reports what came
    // back. Counting the requests pins that the panel does not run its own
    // two-step sequence (which would mint the very gap the spec forbids).
    let launchCalls = 0;
    await page.route('**/api/upgrade/control-plane/launch', async (route) => {
      launchCalls++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          op_id: 'op-a1b2c3d4e5f60718',
          version: '9.9.1',
          note: '已发起一键编排：各参与节点将全停 -> 逐台装 -> 启动；用「编排状态查询」跟踪进度',
        }),
      });
    });

    const dialogs: string[] = [];
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken, { dialogs });

    // No version → refused locally, nothing is submitted.
    await page.getByTestId('upg-cp-launch').click();
    await expect(page.getByTestId('upg-cp-out')).toContainText('先在「升级执行」填写目标版本');
    expect(launchCalls).toBe(0);

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-cp-launch').click();

    await expect(page.getByTestId('upg-cp-out')).toContainText('✅ 已发起 op_id=op-a1b2c3d4e5f60718');
    await expect(page.getByTestId('upg-cp-out')).toContainText('全停 -> 逐台装 -> 启动');
    expect(launchCalls, 'the panel submits the launch exactly once').toBe(1);
    // The operator was warned about the mail-flow outage before it started.
    expect(dialogs.some((m) => m.includes('邮件流中断窗口'))).toBeTruthy();
  });

  test('control-plane launch blocked by per-node readiness names what each node is missing', async ({ page }) => {
    // EvaluateLaunchReadiness runs BEFORE any stage=formal fan-out, so this
    // 409 is what "readiness checked before anything is stopped" looks like
    // from the browser: a refusal that names the deficient nodes.
    await page.route('**/api/upgrade/control-plane/launch', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: '一键编排前置检查未通过：node-b 未持有版本 9.9.1 的包（缺 pkg/，先 distribute）；node-c 的 upgrade helper 未应答',
          collection_diagnostics: [],
        }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-cp-launch').click();

    const out = page.getByTestId('upg-cp-out');
    await expect(out).toContainText('node-b 未持有版本 9.9.1 的包');
    await expect(out).toContainText('node-c 的 upgrade helper 未应答');
    await expect(out).not.toContainText('✅ 已发起');
  });

  test('control-plane launch refused while another process holds the staging lock (409)', async ({ page }) => {
    const LOCK_ERR = '无法取得升级暂存目录锁（另一个 register/rm/distribute/编排 正在本机运行？）：timeout';
    await page.route('**/api/upgrade/control-plane/launch', async (route) => {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: LOCK_ERR }) });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-cp-launch').click();

    await expect(page.getByTestId('upg-cp-out')).toHaveText(LOCK_ERR);
  });

  test('a launch that fails its probe stage shows the manual-fallback pointer, never a success', async ({ page }) => {
    await page.route('**/api/upgrade/control-plane/launch', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: '编排能力探测未通过：node-c 未在探测窗口内应答',
          op_id: 'op-deadbeefdeadbeef',
          note: '本次一键编排不可用（编排能力探测未通过，见错误信息）——回退到手工路径：请参考 doc/upgrade-runbook.md 阶段 1 的手工命令序列（逐节点执行）。',
        }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-cp-launch').click();

    const out = page.getByTestId('upg-cp-out');
    await expect(out).toContainText('编排能力探测未通过：node-c 未在探测窗口内应答');
    await expect(out).toContainText('doc/upgrade-runbook.md 阶段 1 的手工命令序列');
    await expect(out).not.toContainText('✅ 已发起');
  });

  // ── status: the control_plane phase of a RUNNING orchestration ────────────

  test('status summary reports an active orchestration with its phase and op id', async ({ page }) => {
    await page.route('**/api/upgrade/status*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('op')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: {}, gate: { allowed: true } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          state: {
            StagedVersions: ['9.9.1'],
            NodeVersions: { 'node-a': '8.0.0', 'node-b': '8.0.0' },
            RollbackAvailable: false,
            site_baselines: { 'node-a': false, 'node-b': false },
            control_plane: {
              nodes: {
                'node-a': { state: 'active', op_id: 'op-1122334455667788', mode: 'full', stage: 'formal', phase: 'installing', owner_alive: true, updated_at: 1 },
                'node-b': { state: 'idle', updated_at: 1 },
              },
            },
          },
          preflight_warnings: [],
          collection_diagnostics: [],
        }),
      });
    });
    await page.route('**/api/upgrade/packages', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], incoming: [] }) });
    });

    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    const summary = page.getByTestId('upg-status-summary');
    await expect(summary).toContainText('编排状态:');
    await expect(summary).toContainText('node-a=active(installing op=op-1122334455667788)');
    await expect(summary).toContainText('node-b=idle');
  });

  // This one caught a real bug: cpStatus used to read `cp.Nodes`, but GET
  // /api/upgrade/control-plane/status serialises upgradeflow.ControlPlaneStatus
  // whose only field is tagged `json:"nodes"`. The capitalised read was always
  // undefined, so the 编排状态查询 button reported "未在任何参与节点观察到编排
  // 操作。" while an orchestration was actively running. The status-overview row
  // reads the correct lowercase key, which is why it went unnoticed — this
  // button had no UI test. TestUpgradePanelControlPlaneStatusUsesBackendFieldNames
  // now guards the field names statically as well.
  test('编排状态查询 renders each participant mirror from the endpoint payload', async ({ page }) => {
    await page.route('**/api/upgrade/control-plane/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // The REAL wire shape (ControlPlaneStatus{Nodes map[string]Mirror
        // `json:"nodes"`} + Mirror's own lowercase tags) — do not "fix" this
        // mock to match the renderer.
        body: JSON.stringify({
          nodes: {
            'node-a': { state: 'active', op_id: 'op-1122334455667788', mode: 'full', stage: 'formal', phase: 'installing', owner_alive: true, updated_at: 1 },
            'node-b': { state: 'idle', updated_at: 1, last_op: { op_id: 'op-00ff', outcome: 'success' } },
          },
        }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-cp-status').click();
    const out = page.getByTestId('upg-cp-out');
    await expect(out).toContainText('node-a: active op_id=op-1122334455667788 mode=full stage=formal phase=installing');
    await expect(out).toContainText('node-b: idle last_op=(op_id=op-00ff outcome=success)');
  });

  // ── audit_warning (审计不可写时的在带内披露) ──────────────────────────────

  test('a successful mutation still surfaces the server audit_warning', async ({ page }) => {
    // The easiest warning to drop is the one riding a SUCCESS response — the
    // renderer is busy composing a ✅ line. It must survive.
    const WARN = '审计未写入 (audit log not recorded): database is locked';
    await page.route('**/api/upgrade/push-all', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: '9.9.1', rollback_from: '8.0.0', warnings: [], audit_warning: WARN }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-pushall').click();

    const out = page.getByTestId('upg-exec-out');
    await expect(out).toContainText('✅ 已推全到 9.9.1');
    await expect(out).toContainText('⚠ ' + WARN);
  });

  test('a refused upload (concurrency limit 1) renders the server reason verbatim', async ({ page }) => {
    // spec §7 行 2247: the second concurrent upload is REFUSED, not queued —
    // and the refusal itself carries the audit warning when audit is down.
    const BUSY = '另一个升级包上传正在进行中（本端点并发上限为 1，spec §7）：请等待其完成后重试。' +
      '多 GB 包建议走 scp 到 <pkgroot>/incoming/ 而不是浏览器上传。';
    await page.route('**/api/upgrade/package', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: BUSY, audit_warning: '审计未写入 (audit log not recorded): disk full' }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-upload-file').setInputFiles({
      name: 'osgateway-9.9.1-full.tar.gz',
      mimeType: 'application/gzip',
      buffer: Buffer.from('not really a package'),
    });
    await page.getByTestId('upg-upload').click();

    const msg = page.getByTestId('upg-pkg-msg');
    await expect(msg).toContainText('并发上限为 1');
    await expect(msg).toContainText('审计未写入');
    await expect(msg).not.toContainText('已上传');
    // A refused upload must not pre-fill the register box — that would invite
    // registering a file that never landed.
    await expect(page.getByTestId('upg-register-filename')).toHaveValue('');
  });

  // ── C1 (Critical, security): stored XSS via an incoming/ file name ──────
  //
  // The file name in <pkgroot>/incoming/ is attacker-chosen — scp is spec §1's
  // PRIMARY arrival path, so anything that can write there picks the string
  // the panel renders, and the upload validator cannot gate those bytes at
  // all. The renderer must therefore be inert BY CONSTRUCTION: the four
  // data-testid cells are built as DOM nodes, so the payload below can only
  // ever be text.
  test('a hostile incoming/ file name is rendered as inert TEXT, never as markup', async ({ page }) => {
    const PAYLOAD = 'osgateway-8.1.0" onmouseover="window.__xss=1" x=".tar.gz';
    await page.route('**/api/upgrade/packages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          incoming: [{ name: PAYLOAD, path: '/var/lib/osgateway/upgrade-packages/incoming/x', size: 1024, mod_time: '2026-07-29T03:04:05Z' }],
        }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    const cell = page.getByTestId(`upg-inc-name-${PAYLOAD}`);
    await expect(cell).toBeVisible();
    // The name is TEXT, verbatim — not markup, and not partially eaten by an
    // attribute break-out.
    await expect(cell).toHaveText(PAYLOAD);
    // No injected ATTRIBUTE anywhere in the row. Asserted on the parsed DOM's
    // attribute NAMES, not on serialized HTML: the payload's own bytes
    // legitimately appear inside the (correctly escaped) data-testid VALUE,
    // so a substring check on innerHTML would fail on a perfectly safe row.
    // What matters is whether the browser turned any of it into an attribute.
    const attrNames = await page.locator('#upg-incoming-table tbody tr').first().evaluate((tr) =>
      Array.from(tr.querySelectorAll('*')).flatMap((elm) => Array.from(elm.attributes).map((a) => a.name)));
    expect(attrNames.some((n) => n.startsWith('on'))).toBe(false);
    expect(attrNames.sort()).toEqual(['data-testid', 'data-testid', 'data-testid', 'data-testid', 'style']);
    // And the payload does not fire even when its trigger is exercised.
    await page.mouse.move(5, 5);
    await cell.hover();
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();

    // M7: the per-file sha256 button must still WORK for such a name — it
    // used to re-find its cell with a CSS selector built from the raw name,
    // which throws SyntaxError on a `"` and silently did nothing.
    await page.route('**/api/upgrade/package/sha256*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha256: 'cafef00ddeadbeef' }) });
    });
    await page.getByTestId(`upg-inc-hash-${PAYLOAD}`).click();
    await expect(page.getByTestId(`upg-inc-sha-${PAYLOAD}`)).toHaveText('cafef00ddeadbeef');
  });

  // ── I1: the gate reading must be taken under the operator's overrides ───
  test('ticking 收编长期 pin makes 检查门禁 read the gate WITH the override', async ({ page }) => {
    const queries: string[] = [];
    await page.route('**/api/upgrade/status*', async (route) => {
      const url = new URL(route.request().url());
      const op = url.searchParams.get('op');
      if (!op) {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ state: { StagedVersions: ['8.1.0'], NodeVersions: {}, RollbackAvailable: false }, preflight_warnings: [] }),
        });
        return;
      }
      queries.push(route.request().url());
      // The server answers ALLOW when the override rides along, DENY when it
      // does not — i.e. exactly what GateWithOverrides does for ◇.
      const adopted = url.searchParams.get('adopt_foreign_pins') === '1';
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          state: {},
          gate: adopted
            ? { op, allowed: true, reason: '' }
            : { op, allowed: false, reason: '推全被拒：以下节点存在与本次目标版本不同的长期 pin' },
        }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('8.1.0');
    await page.getByTestId('upg-adopt-pins').check();
    await page.getByTestId('upg-gates').click();

    await expect(page.getByTestId('upg-gate-out')).toContainText('✅ 推全');
    await expect(page.getByTestId('upg-gate-out')).not.toContainText('长期 pin');
    // The buttons the override exists to enable must NOT be left disabled.
    await expect(page.getByTestId('upg-pushall')).toBeEnabled();
    expect(queries.every((q) => q.includes('adopt_foreign_pins=1'))).toBe(true);
  });

  // ── I3: unsupported_peer is neither success nor failure ────────────────
  test('distribute names an unsupported_peer node instead of rendering it ✅', async ({ page }) => {
    await page.route('**/api/upgrade/package/distribute-estimate*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ formatted: '预计：1 GB\n' }) });
    });
    await page.route('**/api/upgrade/package/distribute', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          version: '8.1.0',
          // Deliberately ok:true — DistributeResult excludes unsupported_peer
          // from OK, so the ONLY thing standing between the operator and
          // "everything arrived" is how the panel renders this row.
          ok: true,
          items: [
            { Node: 'node-b', Artefact: 'package.tar.gz', Outcome: 'sent', Error: '' },
            { Node: 'node-c', Artefact: 'package.tar.gz', Outcome: 'unsupported_peer', Error: 'peer returned 404' },
          ],
        }),
      });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-ver').fill('8.1.0');
    await page.getByTestId('upg-distribute').click();

    const out = page.getByTestId('upg-exec-out');
    await expect(out).toContainText('node-c package.tar.gz [unsupported_peer]');
    await expect(out).not.toContainText('✅ node-c');
    await expect(out).toContainText('首跳兼容性');
    await expect(out).toContainText('包并未送达这些节点');
  });

  // ── M1: §4.3's 产品版本 / 修订号 split ─────────────────────────────────
  test('the node fact table splits the declared version into 产品版本 and 修订号', async ({ page }) => {
    await page.route('**/api/upgrade/status*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('op')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: {}, gate: { allowed: true, reason: '' } }) });
        return;
      }
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          state: {
            StagedVersions: ['8.1.1'],
            staged_version_parts: [{ full: '8.1.1', product: '8.1', revision: '1' }],
            NodeVersions: { 'node-a': '8.1.0' },
            node_version_parts: { 'node-a': { full: '8.1.0', product: '8.1', revision: '0' } },
            RollbackAvailable: false,
          },
          preflight_warnings: [],
        }),
      });
    });
    await page.route('**/api/upgrade/packages', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], incoming: [] }) });
    });
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await expect(page.getByTestId('upg-nodever-product-node-a')).toHaveText('8.1');
    await expect(page.getByTestId('upg-nodever-revision-node-a')).toHaveText('0');
    // The staged line says the same thing, so 8.1.0 → 8.1.1 reads as a
    // REVISION release rather than as a major upgrade.
    await expect(page.getByTestId('upg-status-summary')).toContainText('产品版本 8.1 / 修订号 1');
  });
});

// ---------------------------------------------------------------------------
// Package lifecycle against the REAL server and REAL disk (no route mocks):
// upload → incoming/ listing → 填入登记 → register → 已登记 table. Everything
// here is the actual clustermgr serve process writing to its own dataRoot, so
// the assertions cover the panel AND the endpoints AND the on-disk staging
// tree together — the one path in this feature that can be exercised
// end-to-end without a live multi-node cluster.
//
// Its own server (own dataRoot) because registering a version MUTATES shared
// state: the mocked-UI block above asserts on a package-less cluster (e.g.
// "尚未登记"), and a stray registration there would silently invert it.
// ---------------------------------------------------------------------------

// Upload cap for this block's server: small enough that a 5 KiB body trips
// spec §7's per-upload limit for real, large enough for the synthetic
// packages below (a two-file tar.gz is a few hundred bytes).
const LIFECYCLE_UPLOAD_MAX_BYTES = 4096;

// makeDistTarball writes a minimal but STRUCTURALLY REAL dist-full package:
// one top-level directory (upgradeflow.singleTopLevelDir), a VERSION file, and
// upgrade/manifest.json whose version matches (upgrademeta.Load). With
// withUpgradeMeta=false it deliberately omits upgrade/ — the "包缺少 upgrade/
// 元数据目录" refusal register must produce rather than staging a package
// whose failure would only surface later, mid-upgrade.
function makeDistTarball(workDir: string, version: string, opts: { withUpgradeMeta: boolean }): string {
  const top = `osgateway-${version}-full`;
  const root = path.join(workDir, top);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'VERSION'), `${version}\n`);
  if (opts.withUpgradeMeta) {
    fs.mkdirSync(path.join(root, 'upgrade'), { recursive: true });
    fs.writeFileSync(path.join(root, 'upgrade', 'manifest.json'), JSON.stringify({
      dev: false,
      generated_at: '2026-07-29T00:00:00Z',
      git_rev: '0000000000000000000000000000000000000000',
      host_binaries: {},
      images: {},
      matrix: {},
      schema_fingerprint: 'sha256:playwright-fixture',
      upgrade_from: ['8.0.0'],
      version,
    }));
  }
  const out = path.join(workDir, `${top}.tar.gz`);
  fs.rmSync(out, { force: true });
  execSync(`tar -czf ${out} -C ${workDir} ${top}`, { stdio: 'pipe' });
  return out;
}

test.describe('Upgrade panel package lifecycle (real server, real disk)', () => {
  test.describe.configure({ mode: 'serial' });
  let procs: Procs | undefined;
  let fixtureDir = '';

  test.beforeAll(async () => {
    procs = await startUpgradePanelWeb(18700, {
      OSG_UPGRADE_UPLOAD_MAX_BYTES: String(LIFECYCLE_UPLOAD_MAX_BYTES),
    });
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-panel-fixtures-'));
  });

  test.afterAll(async () => {
    await stopProcs(procs);
    try { fs.rmSync(fixtureDir, { recursive: true, force: true }); } catch {}
  });

  test('upload → incoming listing → sha256 → 填入登记 → register → 已登记 table', async ({ page }) => {
    const tarball = makeDistTarball(fixtureDir, '9.9.1', { withUpgradeMeta: true });
    const filename = path.basename(tarball);
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    // Nothing staged and nothing waiting yet — the two empty-state hints are
    // what an operator sees on a fresh node.
    await expect(page.locator('#upg-pkg-empty')).toBeVisible();
    await expect(page.locator('#upg-incoming-empty')).toBeVisible();

    // 1. Upload: the real multipart POST lands the bytes in <pkgroot>/incoming/.
    await page.getByTestId('upg-upload-file').setInputFiles(tarball);
    await page.getByTestId('upg-upload').click();
    await expect(page.getByTestId('upg-pkg-msg')).toContainText(`已上传 ${filename}`);
    // A successful upload pre-fills the register box (the next step's input).
    await expect(page.getByTestId('upg-register-filename')).toHaveValue(filename);

    // 2. The incoming/ listing now confirms what actually landed (finding I9:
    //    scp/upload arrival must be visible, not inferred).
    await page.getByTestId('upg-refresh').click();
    await expect(page.getByTestId(`upg-inc-name-${filename}`)).toBeVisible();
    await expect(page.locator('#upg-incoming-empty')).toBeHidden();
    await expect(page.getByTestId('upg-incoming-err')).toBeHidden();

    // 3. Per-file sha256 is an explicit opt-in action, and it returns the real
    //    digest of the file on disk.
    const onDiskSHA = execSync(`sha256sum ${tarball}`).toString().trim().split(/\s+/)[0];
    await page.getByTestId(`upg-inc-hash-${filename}`).click();
    await expect(page.getByTestId(`upg-inc-sha-${filename}`)).toHaveText(onDiskSHA);

    // 4. 填入登记 only fills the input (register stays an explicit step).
    await page.getByTestId('upg-register-filename').fill('');
    await page.getByTestId(`upg-inc-reg-${filename}`).click();
    await expect(page.getByTestId('upg-register-filename')).toHaveValue(filename);
    await expect(page.getByTestId('upg-pkg-msg')).toContainText('点「登记 (register)」完成登记');

    // 5. Register: real extraction + manifest validation + staging.
    await page.getByTestId('upg-register').click();
    await expect(page.getByTestId('upg-pkg-msg')).toContainText('已登记版本 9.9.1');
    await expect(page.getByTestId('upg-pkg-msg')).not.toContainText('dev 包');

    // 6. The staged table (refreshed by register itself) now carries the
    //    version, its manifest's upgrade_from, and a per-row delete button.
    await expect(page.getByTestId('upg-pkg-table')).toContainText('9.9.1');
    await expect(page.getByTestId('upg-pkg-table')).toContainText('8.0.0');
    await expect(page.getByTestId('upg-del-9.9.1')).toBeVisible();
    await expect(page.locator('#upg-pkg-empty')).toBeHidden();
    await expect(page.getByTestId('upg-status-summary')).toContainText('已登记版本: 9.9.1');

    // 7. Re-registering the identical file is idempotent, not a second entry.
    await page.getByTestId('upg-register').click();
    await expect(page.getByTestId('upg-pkg-msg')).toContainText('（重复登记，幂等）');
    await expect(page.getByTestId('upg-pkg-table').locator('tbody tr')).toHaveCount(1);
  });

  test('register refuses a package without upgrade/ metadata and renders the reason', async ({ page }) => {
    const tarball = makeDistTarball(fixtureDir, '9.9.2', { withUpgradeMeta: false });
    const filename = path.basename(tarball);
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-upload-file').setInputFiles(tarball);
    await page.getByTestId('upg-upload').click();
    await expect(page.getByTestId('upg-pkg-msg')).toContainText(`已上传 ${filename}`);

    await page.getByTestId('upg-register').click();
    // The server's own refusal, verbatim — "registering it anyway would only
    // defer the failure" is the point of this gate.
    await expect(page.getByTestId('upg-pkg-msg')).toContainText('包缺少 upgrade/ 元数据目录');
    await expect(page.getByTestId('upg-pkg-msg')).not.toContainText('已登记版本');

    // Nothing was staged: the earlier 9.9.1 row must still be the only one.
    await page.getByTestId('upg-refresh').click();
    await expect(page.getByTestId('upg-pkg-table')).not.toContainText('9.9.2');
  });

  test('register refuses a file that is not a gzip stream at all', async ({ page }) => {
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-upload-file').setInputFiles({
      name: 'osgateway-9.9.3-full.tar.gz',
      mimeType: 'application/gzip',
      buffer: Buffer.from('this is plainly not a tarball'),
    });
    await page.getByTestId('upg-upload').click();
    await expect(page.getByTestId('upg-pkg-msg')).toContainText('已上传 osgateway-9.9.3-full.tar.gz');

    await page.getByTestId('upg-register').click();
    await expect(page.getByTestId('upg-pkg-msg')).toContainText('is not a gzip stream');
    await expect(page.getByTestId('upg-pkg-msg')).not.toContainText('已登记版本');
  });

  test('an upload above the configured cap is refused with the server limit (spec §7)', async ({ page }) => {
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken);

    await page.getByTestId('upg-upload-file').setInputFiles({
      name: 'osgateway-9.9.9-full.tar.gz',
      mimeType: 'application/gzip',
      buffer: Buffer.alloc(LIFECYCLE_UPLOAD_MAX_BYTES + 1024, 0x41),
    });
    await page.getByTestId('upg-upload').click();

    // The cap is enforced by counting bytes actually copied, so the refusal
    // states the configured maximum rather than a client-declared size. NOTE:
    // there is no front-end size pre-check — the 8 GiB (here 4 KiB) limit is a
    // server-side refusal only, which is why this test drives the real server.
    await expect(page.getByTestId('upg-pkg-msg')).toContainText(
      `upload exceeds the configured maximum of ${LIFECYCLE_UPLOAD_MAX_BYTES} bytes`);
    await expect(page.getByTestId('upg-pkg-msg')).not.toContainText('已上传');
    // The rejected upload must leave nothing behind in incoming/.
    await page.getByTestId('upg-refresh').click();
    await expect(page.getByTestId('upg-incoming-table')).not.toContainText('osgateway-9.9.9-full.tar.gz');
  });

  test('the pre-distribute estimate is the REAL servers measurement of the real target set', async ({ page }) => {
    // Same numbers, same formatter as the CLI (upgradeflow.
    // FormatTransferEstimate): the panel quotes the server, it does not
    // compute. This mocked-ctl cluster has exactly one participant (self,
    // never a distribute target), so the honest answer is a 0-node, 0-byte
    // total — measured, not invented, and per-node still reports the actual
    // registered tarball size.
    const dialogs: string[] = [];
    await gotoUpgradeTab(page, procs!.webURL, procs!.webToken, { dialogs, dismiss: /确认把版本/ });

    await page.getByTestId('upg-ver').fill('9.9.1');
    await page.getByTestId('upg-distribute').click();

    await expect(page.getByTestId('upg-exec-out')).toContainText('预计传输字节量（版本 9.9.1，目标节点 0 台）');
    await expect(page.getByTestId('upg-exec-out')).toContainText('已取消。');
    expect(dialogs[0]).toContain('预计传输字节量（版本 9.9.1，目标节点 0 台）');
    expect(dialogs[0]).toContain('合计：0 B');
    // The per-node package figure is the tarball actually staged in step 1 of
    // this block (a few hundred bytes), so it must be a non-zero B figure
    // rather than a placeholder.
    expect(dialogs[0]).toMatch(/完整包 \(dist tarball\)：[1-9]\d* B\/节点/);
    // Cancelling leaves the output at the estimate — no transfer was reported.
    await expect(page.getByTestId('upg-exec-out')).not.toContainText('分发完成');
  });
});
