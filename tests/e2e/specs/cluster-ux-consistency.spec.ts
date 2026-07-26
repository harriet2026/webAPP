import { test, expect, Page } from '@playwright/test';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  agent: ChildProcess | null;
  web: ChildProcess | null;
  tmpDir: string;
  sockPath: string;
  webToken: string;
  webURL: string;
}

async function startCluster(): Promise<Procs> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-ux-e2e-'));
  const statePath = path.join(tmpDir, 'cluster-state.yaml');
  const sockPath = path.join(tmpDir, 'ctl.sock');

  const yamlContent = `version: 1
updated_by: node-a
cluster_token_hash: ""
nodes:
  - id: node-a
    agent_addr: "127.0.0.1:7700"
    advertise_ip: "127.0.0.1"
    labels:
      - db
      - gateway
services:
  database:
    provider: opengauss
    enabled: true
    replication: async
    master: node-a
    members:
      - node-a
    listen_port: 5432
    repl_port: 5432
  redis:
    enabled: false
  gateway:
    enabled: true
    master: node-a
    members:
      - node-a
    db_dsn_from: database.master
secrets: {}
`;
  fs.writeFileSync(statePath, yamlContent);

  const agentBin = buildBinary('osg-agent', './cmd/osg-agent');
  const clustermgrBin = buildBinary('clustermgr', './cmd/clustermgr');

  const caDir = path.join(tmpDir, 'ca');
  fs.mkdirSync(caDir, { recursive: true });

  const agent = spawn(agentBin, [
    '-state', statePath,
    '-socket', sockPath,
    '-id', 'node-a',
    '-compose-dir', os.devNull,
    '-ca-dir', caDir,
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, OSG_ENV: 'dev' } });

  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const check = () => {
      if (fs.existsSync(sockPath)) return resolve();
      if (Date.now() > deadline) return reject(new Error('agent did not start'));
      setTimeout(check, 100);
    };
    check();
  });

  const webPort = 18200 + Math.floor(Math.random() * 100);
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
    // "serving on" and "web token:" are printed to different streams (out vs
    // os.Stdout) in clustermgr's serve command. We must see BOTH before the
    // app.js IIFE can find a non-empty token in localStorage and register tab
    // event listeners. Resolving on "serving on" alone leaves webToken empty
    // which causes app.js to early-return, skipping tab listener registration.
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
      if (!webStarted || !webToken) reject(new Error(`clustermgr web did not start or token missing. Output: ${output}`));
    }, 10000);
  });

  return { agent, web, tmpDir, sockPath, webToken, webURL };
}

async function stopCluster(procs: Procs | undefined) {
  if (!procs) return;
  if (procs.web) {
    try { procs.web.kill(); } catch {}
    try { procs.agent!.kill(); } catch {}
  } else if (procs.agent) {
    try { procs.agent.kill(); } catch {}
  }
  try {
    fs.rmSync(procs.tmpDir, { recursive: true, force: true });
  } catch {}
}

async function gotoAuthenticated(page: Page, webURL: string, webToken: string) {
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
}

async function gotoSecurityTab(page: Page, webURL: string, webToken: string) {
  await gotoAuthenticated(page, webURL, webToken);
  await page.locator('button[data-tab="security"]').click();
  await expect(page.locator('#tab-security')).toBeVisible();
}

async function gotoNodesTab(page: Page, webURL: string, webToken: string) {
  await gotoAuthenticated(page, webURL, webToken);
  await page.locator('button[data-tab="nodes"]').click();
  await expect(page.locator('#tab-nodes')).toBeVisible();
}

// The standalone "Replication" tab was removed in 5e8cc09529 and DB/Redis
// master-standby management folded into the Manage Cluster tab (4fc28debc4), so
// the DB replication surface now lives under #tab-createcluster.
async function gotoManageClusterTab(page: Page, webURL: string, webToken: string) {
  await gotoAuthenticated(page, webURL, webToken);
  await page.locator('button[data-tab="createcluster"]').click();
  await expect(page.locator('#tab-createcluster')).toBeVisible();
}

test.describe('Cluster UX Consistency', () => {
  // Shared spawned clustermgr (beforeAll) + cross-test cluster state ⇒ must run
  // serially (default parallel workers each start their own clustermgr).
  test.describe.configure({ mode: 'serial' });
  let procs: Procs | undefined;

  test.beforeAll(async () => {
    procs = await startCluster();
  });

  test.afterAll(async () => {
    await stopCluster(procs);
  });

  test('Security: IP allowlist text says 即时生效 not 后续版本生效', async ({ page }) => {
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const cidrPanel = page.locator('#tab-security .panel').first();
    await expect(cidrPanel).toBeVisible();
    await expect(cidrPanel).toContainText('即时生效');
    await expect(cidrPanel).not.toContainText('后续版本生效');
  });

  test('Security: port binding panel has 规划中 badge', async ({ page }) => {
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const portPanel = page.locator('#tab-security .panel').nth(1);
    await expect(portPanel).toBeVisible();
    await expect(portPanel.locator('h2')).toContainText('内部端口暴露状态');
    await expect(portPanel.locator('.badge-planned')).toBeVisible();
  });

  test('Security: secrets panel has rotation planned hint', async ({ page }) => {
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const secretsPanel = page.locator('#tab-security .panel').nth(2);
    await expect(secretsPanel).toBeVisible();
    await expect(secretsPanel.locator('h2')).toContainText('密钥状态');
    await expect(secretsPanel.locator('#secrets-table thead')).toBeVisible();
    await expect(secretsPanel.locator('.hint')).toContainText(/后续版本|轮转/);
  });

  test('Security: certificate status panel exists with table headers', async ({ page }) => {
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const certPanel = page.locator('#tab-security .panel').nth(3);
    await expect(certPanel).toBeVisible();
    await expect(certPanel.locator('h2')).toContainText('证书状态');
    await expect(certPanel.locator('#cert-table thead')).toBeVisible();
    await expect(certPanel.locator('#cert-table thead')).toContainText('节点');
    await expect(certPanel.locator('#cert-table thead')).toContainText('状态');
  });

  test('Nodes: drain confirm uses 提示性状态 not stop accepting', async ({ page }) => {
    await gotoNodesTab(page, procs!.webURL, procs!.webToken);

    const drainBtn = page.locator('.btn-node-drain').first();
    await expect(drainBtn).toBeVisible({ timeout: 10000 });

    let confirmText = '';
    page.on('dialog', async (dialog) => {
      confirmText = dialog.message();
      await dialog.dismiss();
    });
    await drainBtn.click();
    await page.waitForTimeout(500);

    expect(confirmText).toContain('draining');
    expect(confirmText).toContain('提示性状态');
    expect(confirmText).not.toContain('stop accepting new connections');
  });

  test('Replication: DB operation controls are present under Manage Cluster', async ({ page }) => {
    await gotoManageClusterTab(page, procs!.webURL, procs!.webToken);

    const dbCard = page.locator('#cc-db-card');
    await expect(dbCard).toBeVisible({ timeout: 10000 });

    // Standby setup is now the dual-machine mode + master/standby selects, and
    // the deploy/smoke actions, rather than a dedicated "setup standby" button.
    await expect(dbCard.locator('input[name="cc-db-mode"][value="dual"]')).toBeVisible();
    await expect(dbCard.locator('#cc-db-master')).toBeVisible();
    await expect(dbCard.locator('#cc-db-deploy')).toBeVisible();
    await expect(dbCard.locator('#cc-db-smoke')).toBeVisible();
  });

  test('Replication: shows DB replication status and switchover history', async ({ page }) => {
    await gotoManageClusterTab(page, procs!.webURL, procs!.webToken);

    // renderDBReplication() fills this from /api/db/replication/status: either
    // "Database not configured" (this spec's cluster has no DB deployed) or the
    // Mode/Master/LSN summary. Either way the region must render -- an empty one
    // means the status call or the renderer broke.
    const replStatus = page.locator('#cc-db-repl-status');
    await expect(replStatus).toBeVisible({ timeout: 10000 });
    await expect(replStatus).not.toBeEmpty();

    // Switchover history moved here with the tab merge.
    await expect(page.locator('#cc-db-promote-history')).toBeVisible();
  });
});
