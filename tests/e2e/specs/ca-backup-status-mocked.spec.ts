import { test, expect, Page } from '@playwright/test';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'build', 'bin');

function buildBinary(name: string, pkg: string): string {
  const binary = path.join(BIN_DIR, name);
  if (!fs.existsSync(binary)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    execSync(`go build -o ${binary} ${pkg}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
  }
  return binary;
}

interface Procs {
  web: ChildProcess | null;
  agentMock: net.Server | null;
  tmpDir: string;
  webToken: string;
  webURL: string;
}

// startMockAgentSocket serves a minimal ctl unix socket that answers every
// request with {OK:true, Doc:{}}. clustermgr `serve` fail-fasts at startup if it
// cannot GetDoc() from the agent socket (cmd/clustermgr/main.go), so a clusterless
// web-only harness still needs *a* socket that responds. The mocked frontend tests
// intercept the real API via page.route, so the Doc content is irrelevant here.
function startMockAgentSocket(sockPath: string): Promise<net.Server> {
  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('data', (d) => {
      buf += d.toString();
      try {
        JSON.parse(buf); // ctl requests are a single JSON object
      } catch {
        return; // wait for the full request
      }
      conn.write(JSON.stringify({ OK: true, Doc: {} }));
      conn.end();
    });
    conn.on('error', () => {});
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(sockPath, () => resolve(server));
  });
}

// startClusterlessWeb starts only the clustermgr web server (no osg-agent) so
// we can mock /api/security/secrets-status via page.route and isolate the
// front-end rendering of the three CA backup states (red/green/yellow) without
// depending on live cluster state.
async function startClusterlessWeb(): Promise<Procs> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-backup-mock-'));
  const sockPath = path.join(tmpDir, 'ctl.sock');
  // No real osg-agent running, but clustermgr serve fail-fasts at startup unless
  // it can GetDoc() from the ctl socket. Serve a minimal mock socket so the web
  // server comes up; page.route intercepts the real API before the backend is
  // reached for the mocked tests, so the mock Doc content is never used.
  const agentMock = await startMockAgentSocket(sockPath);
  const clustermgrBin = buildBinary('clustermgr', './cmd/clustermgr');
  const webPort = 18400 + Math.floor(Math.random() * 100);
  const webURL = `http://127.0.0.1:${webPort}`;
  let webToken = '';
  let webStarted = false;

  const web = spawn(clustermgrBin, [
    'serve',
    `--socket=${sockPath}`,
    `--listen=127.0.0.1:${webPort}`,
    '--idle-seconds=3600',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

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

  return { web, agentMock, tmpDir, webToken, webURL };
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

async function gotoSecurityTab(page: Page, webURL: string, webToken: string) {
  page.on('dialog', async dialog => {
    if (dialog.type() === 'prompt') {
      await dialog.accept(webToken);
    }
  });
  await page.addInitScript((token) => {
    localStorage.setItem('web_token', token);
  }, webToken);
  await page.goto(webURL);
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-tab="security"]').click();
  await expect(page.locator('#tab-security')).toBeVisible();
}

test.describe('CA Backup Status — yellow/green rendering (mocked API)', () => {
  // Shared spawned clustermgr (beforeAll) + cross-test cluster state ⇒ must run
  // serially (default parallel workers each start their own clustermgr).
  test.describe.configure({ mode: 'serial' });
  let procs: Procs | undefined;

  test.beforeAll(async () => {
    procs = await startClusterlessWeb();
  });

  test.afterAll(async () => {
    await stopProcs(procs);
  });

  test('Green state: backup present + fingerprint matches', async ({ page }) => {
    await page.route('**/api/security/secrets-status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          ca_backup: {
            has_backup: true,
            exported_at: 1720000000,
            fingerprint_match: true,
            fingerprint_disagree: false,
            signing_nodes: [{ node_id: 'node-a', status: 'yes' }],
          },
        }),
      });
    });
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const caBox = page.locator('#ca-backup-box');
    await expect(caBox).toBeVisible({ timeout: 10000 });
    // Green = .ok class, text mentions "已备份".
    await expect(caBox.locator('.ca-backup.ok')).toBeVisible({ timeout: 10000 });
    await expect(caBox).toContainText('已备份');
    await expect(caBox).toContainText('node-a:yes');
  });

  test('Yellow state: backup present but fingerprint mismatch (CA rotated)', async ({ page }) => {
    await page.route('**/api/security/secrets-status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          ca_backup: {
            has_backup: true,
            exported_at: 1720000000,
            fingerprint_match: false,
            fingerprint_disagree: false,
            signing_nodes: [{ node_id: 'node-a', status: 'yes' }],
          },
        }),
      });
    });
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const caBox = page.locator('#ca-backup-box');
    await expect(caBox).toBeVisible({ timeout: 10000 });
    // Yellow = .warn class, text mentions "已过期" / "重新导出".
    await expect(caBox.locator('.ca-backup.warn')).toBeVisible({ timeout: 10000 });
    await expect(caBox).toContainText('已过期');
    await expect(caBox).toContainText('重新导出');
  });

  // Backend returns status="unknown" (distinct from "no") for a node that was
  // unreachable/timed out during the real-time probe (internal/cluster/webui/
  // security.go), so a network blip on one node isn't misrendered as "this
  // node has no signing capability". app.js has no separate CSS class per
  // status — it just interpolates `node_id:status` as plain text (line ~1203)
  // — so this test's job is to prove "unknown" flows through unmangled to the
  // DOM (not coerced to "no"/blank/undefined by any front-end logic), not to
  // assert a distinct visual style.
  test('Per-node "unknown" status (unreachable node) renders distinctly from "no"', async ({ page }) => {
    await page.route('**/api/security/secrets-status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          ca_backup: {
            has_backup: true,
            exported_at: 1720000000,
            fingerprint_match: true,
            fingerprint_disagree: false,
            signing_nodes: [
              { node_id: 'node-a', status: 'yes' },
              { node_id: 'node-b', status: 'unknown' },
            ],
          },
        }),
      });
    });
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const caBox = page.locator('#ca-backup-box');
    await expect(caBox).toBeVisible({ timeout: 10000 });
    await expect(caBox).toContainText('node-a:yes');
    await expect(caBox).toContainText('node-b:unknown');
    // Must not be silently coerced to "no" for the unreachable node.
    await expect(caBox).not.toContainText('node-b:no');
  });
});
