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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-e2e-'));
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
    const deadline = Date.now() + 5000;
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
    // Hermetic images dir: without this, clustermgr defaults to
    // /var/lib/osgateway/images, where leftover multi-GB dist tarballs on a dev
    // box make /api/images Inspect() each one and time out. Point at an empty
    // per-run tmp dir so the endpoint is fast and host-state-independent.
    `--images-dir=${path.join(tmpDir, 'images')}`,
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

/**
 * Navigate to the web URL, set the token in localStorage, then navigate again
 * so the app loads authenticated. This is the correct pattern for tests that
 * need page interaction (not just request-level API calls).
 */
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

test.describe('Cluster Manager Web UI', () => {
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

  test('index page loads with title', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await expect(page).toHaveTitle(/Cluster Manager/i);
    await expect(page.locator('h1')).toHaveText(/Cluster Manager/i);
  });

  test('shows By Machine tab with node data', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('button[data-tab="machines"]').click();

    await expect(page.locator('#node-table')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#node-table tbody tr')).toHaveCount(1);
    await expect(page.locator('#node-table')).toContainText('node-a');
  });

  test('switches to By Service tab', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    // Wait for the DOM to be ready (service-table exists but may be hidden initially)
    await page.waitForSelector('#service-table', { state: 'attached' });

    await page.locator('button[data-tab="services"]').click();

    await expect(page.locator('#tab-services')).toBeVisible();
    await expect(page.locator('#tab-machines')).not.toBeVisible();
    // Service table is visible; content depends on ops availability, just check headers
    await expect(page.locator('#service-table thead')).toContainText('Provider');
  });

  test('API /api/ping requires token', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/ping`);
    expect(resp.status()).toBe(401);
  });

  test('API /api/ping accepts valid token', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/ping`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe('pong');
  });

  test('API /api/nodes returns node list', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/nodes`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const nodes = await resp.json();
    expect(nodes.length).toBe(1);
    expect(nodes[0].id).toBe('node-a');
  });

  test('static assets are served', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/style.css`);
    expect(resp.status()).toBe(200);
    const body = await resp.text();
    expect(body).toContain('font-family');
  });

  test('tab buttons toggle visibility', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('button[data-tab="machines"]').click();

    await expect(page.locator('#tab-machines')).toBeVisible();
    await expect(page.locator('#tab-machines.active')).toBeVisible();

    await page.locator('button[data-tab="services"]').click();
    await expect(page.locator('#tab-services.active')).toBeVisible();
    await expect(page.locator('#tab-machines')).not.toBeVisible();

    await page.locator('button[data-tab="machines"]').click();
    await expect(page.locator('#tab-machines.active')).toBeVisible();
    await expect(page.locator('#tab-services')).not.toBeVisible();
  });

  test('Images tab is present and can be activated', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);

    const imagesTab = page.locator('.tab[data-tab="images"]');
    await expect(imagesTab).toBeVisible();
    await imagesTab.click();

    await expect(page.locator('#tab-images')).toBeVisible();
    await expect(page.locator('#tab-images')).toHaveClass(/active/);
  });

  test('Images tab shows image table', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('.tab[data-tab="images"]').click();

    await expect(page.locator('#image-table')).toBeVisible();
    // Table should have header columns
    await expect(page.locator('#image-table thead')).toContainText('Filename');
    await expect(page.locator('#image-table thead')).toContainText('Size');
    await expect(page.locator('#image-table thead')).toContainText('Loaded');
  });

  test('node table has Docker and Ready columns', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('button[data-tab="machines"]').click();
    await expect(page.locator('#node-table')).toBeVisible({ timeout: 10000 });

    const headers = page.locator('#node-table thead th');
    await expect(headers).toContainText(['Docker', 'Ready']);
  });

  test('node row has docker path config button', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('button[data-tab="machines"]').click();
    await expect(page.locator('#node-table tbody tr')).toHaveCount(1, { timeout: 10000 });

    // Should have a config button (⚙) in the last column
    await expect(page.locator('.btn-edit-docker-path')).toBeVisible();
  });

  test('docker path modal opens and closes', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    await page.locator('button[data-tab="machines"]').click();
    await expect(page.locator('#node-table tbody tr')).toHaveCount(1, { timeout: 10000 });
    await page.locator('.btn-edit-docker-path').first().click();

    await expect(page.locator('#modal-docker-path')).toBeVisible();
    await expect(page.locator('#docker-path-node-id')).toContainText('node-a');

    await page.locator('#btn-docker-path-cancel').click();
    await expect(page.locator('#modal-docker-path')).toBeHidden();
  });

  test('/api/preflight endpoint responds', async ({ page }) => {
    const resp = await page.request.get(`${procs.webURL}/api/preflight`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    // Should be 200 (preflight may fail but endpoint works) or 502 if ctl unavailable
    expect([200, 502]).toContain(resp.status());
    const body = await resp.json();
    expect(typeof body).toBe('object');
  });

  test('/api/nodes-info endpoint responds', async ({ page }) => {
    const resp = await page.request.get(`${procs.webURL}/api/nodes-info`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('/api/images endpoint responds with items array', async ({ page }) => {
    const resp = await page.request.get(`${procs.webURL}/api/images`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('preflight banner is present in DOM', async ({ page }) => {
    await gotoAuthenticated(page, procs.webURL, procs.webToken);
    // Banner element must exist (may be hidden if preflight passes)
    await expect(page.locator('#preflight-banner')).toBeAttached();
  });
});
