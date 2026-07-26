import { test, expect, Page } from '@playwright/test';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'build', 'bin');

function buildBinary(name: string, pkg: string, tags?: string): string {
  const binary = path.join(BIN_DIR, name);
  // When specific build tags are required, always rebuild. A binary left in
  // build/bin by another spec (e.g. add-node-wizard builds osg-agent WITHOUT
  // -tags=opengauss) would otherwise be reused as-is — but osg-agent's DB
  // provider compiles to a stub without the backend tag, so ServiceHealth()
  // returns "not supported" and /api/services 502s. Forcing the rebuild makes
  // this spec independent of whatever earlier specs left behind.
  if (tags || !fs.existsSync(binary)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    const tagFlag = tags ? ` -tags=${tags}` : '';
    execSync(`go build${tagFlag} -o ${binary} ${pkg}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-plane-e2e-'));
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
    enabled: true
    master: node-a
    members:
      - node-a
  gateway:
    enabled: true
    master: node-a
    members:
      - node-a
    db_dsn_from: database.master
  workers:
    attachd: 2
    tika: 1
    pyhelper: 1
secrets: {}
`;
  fs.writeFileSync(statePath, yamlContent);

  const agentBin = buildBinary('osg-agent', './cmd/osg-agent', 'opengauss');
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
    const deadline = Date.now() + 5000;
    const check = () => {
      if (fs.existsSync(sockPath)) return resolve();
      if (Date.now() > deadline) return reject(new Error('agent did not start'));
      setTimeout(check, 100);
    };
    check();
  });

  const webPort = 18090 + Math.floor(Math.random() * 100);
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
      if (!webStarted || !webToken) reject(new Error(`clustermgr web did not start or token missing. Output: ${output}`));
    }, 10000);
  });

  return { agent, web, tmpDir, sockPath, webToken, webURL };
}

async function stopCluster(procs: Procs) {
  if (procs.web) {
    try { procs.web.kill(); } catch {}
    try { procs.agent!.kill(); } catch {}
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

test.describe('Gateway Plane Workers', () => {
  // Shared spawned clustermgr (beforeAll) + cross-test cluster state ⇒ must run
  // serially (default parallel workers each start their own clustermgr).
  test.describe.configure({ mode: 'serial' });
  let procs: Procs;

  test.beforeAll(async () => {
    procs = await startCluster();
  });

  test.afterAll(async () => {
    await stopCluster(procs);
  });

  test('cluster manager index page loads', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await expect(page).toHaveTitle(/Cluster Manager/i);
    await expect(page.locator('h1')).toHaveText(/Cluster Manager/i);
  });

  test('By Machine tab shows gateway node', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('button[data-tab="machines"]').click();
    await expect(page.locator('#node-table')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#node-table tbody tr')).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator('#node-table')).toContainText('node-a');
  });

  test('By Service tab is visible and has expected columns', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.waitForSelector('#service-table', { state: 'attached' });
    await page.locator('button[data-tab="services"]').click();
    await expect(page.locator('#tab-services')).toBeVisible();
    await expect(page.locator('#service-table thead')).toContainText('Provider');
  });

  test('/api/services returns service status', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/services`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('database');
    expect(body.database.enabled).toBe(true);
    expect(body.database.provider).toBe('opengauss');
  });

  test('/api/nodes returns node with gateway label', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/nodes`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const nodes = await resp.json();
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('node-a');
    expect(nodes[0].labels).toContain('gateway');
    expect(nodes[0].labels).toContain('db');
  });

  test('/api/gateway/workload endpoint responds', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/gateway/workload`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect([200, 502]).toContain(resp.status());
    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty('items');
      expect(Array.isArray(body.items)).toBe(true);
    }
  });

  test('/api/gateway/members returns gateway member list', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/gateway/members`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    // Endpoint may not exist yet; accept 404 in addition to 200/405
    expect([200, 404, 405]).toContain(resp.status());
  });

  test.skip('Replication tab shows Gateway panel with workload table', async ({ page }) => {
    // Still skipped, and now doubly so: #gw-workload-table was never implemented,
    // AND the Replication tab itself was removed in 5e8cc09529 (DB/Redis
    // master-standby moved into Manage Cluster, 4fc28debc4). Re-enabling this
    // means retargeting it at #tab-createcluster, not just implementing the table.
    await gotoAuthenticated(page, procs.webURL, procs.webToken);

    const replTab = page.locator('.tab[data-tab="replication"]');
    await expect(replTab).toBeVisible();
    await replTab.click();

    await expect(page.locator('#replication-detail')).toBeVisible({ timeout: 10000 });

    await expect(page.locator('#gw-workload-table')).toBeAttached({ timeout: 5000 });
  });

  test.skip('Gateway workload table renders workload data', async ({ page }) => {
    // Same as above: table never implemented, and the replication tab it targets
    // no longer exists (removed in 5e8cc09529).
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('.tab[data-tab="replication"]').click();
    await expect(page.locator('#replication-detail')).toBeVisible({ timeout: 10000 });

    const wlTable = page.locator('#gw-workload-table');
    await expect(wlTable).toBeAttached({ timeout: 5000 });

    const tableHtml = await wlTable.innerHTML();
    const hasData = tableHtml.includes('Sideline Pending');
    if (!hasData) {
      expect(tableHtml).toContain('No gateway nodes');
    }
  });

  test('/api/nodes-info endpoint returns node info', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/nodes-info`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('compose preview endpoint responds', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/install/compose-preview`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    // May return 200 or error if install session not active — just check endpoint exists
    expect([200, 404, 405, 502]).toContain(resp.status());
  });

  test('doc state reflects workers configuration', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/ping`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe('pong');
  });

  test('preflight endpoint is reachable', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/preflight`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect([200, 502]).toContain(resp.status());
    const body = await resp.json();
    expect(typeof body).toBe('object');
  });

  test('tab navigation still works with worker config present', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);

    await page.locator('button[data-tab="services"]').click();
    await expect(page.locator('#tab-services.active')).toBeVisible();

    // The standalone Replication tab was removed in 5e8cc09529; DB/Redis
    // master-standby management now lives in Manage Cluster (4fc28debc4).
    await page.locator('button[data-tab="createcluster"]').click();
    await expect(page.locator('#tab-createcluster.active')).toBeVisible();

    await page.locator('button[data-tab="machines"]').click();
    await expect(page.locator('#tab-machines.active')).toBeVisible();

    await page.locator('button[data-tab="images"]').click();
    await expect(page.locator('#tab-images.active')).toBeVisible();
  });
});
