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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-backup-e2e-'));
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

  const webPort = 18300 + Math.floor(Math.random() * 100);
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

test.describe('CA Backup Status on Security Page', () => {
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

  test('Security page shows CA backup box element', async ({ page }) => {
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const caBox = page.locator('#ca-backup-box');
    await expect(caBox).toBeVisible({ timeout: 10000 });
    await expect(caBox).toContainText('CA 备份');
  });

  test('CA backup shows red never-exported warning when Doc.Security.CABackup is nil', async ({ page }) => {
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const caBox = page.locator('#ca-backup-box');
    await expect(caBox).toBeVisible({ timeout: 10000 });
    await expect(caBox.locator('.ca-backup.error')).toBeVisible({ timeout: 10000 });
    await expect(caBox).toContainText('无备份');
    await expect(caBox).toContainText('clustermgr ca export');
  });

  test('CA backup signing-nodes list shows the cluster node', async ({ page }) => {
    await gotoSecurityTab(page, procs!.webURL, procs!.webToken);

    const caBox = page.locator('#ca-backup-box');
    await expect(caBox).toBeVisible({ timeout: 10000 });
    await expect(caBox).toContainText('node-a', { timeout: 10000 });
  });
});
