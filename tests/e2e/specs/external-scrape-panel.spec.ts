import { test, expect, Page } from '@playwright/test';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'build', 'bin');

// scrape-token rotate needs OSG_CLUSTER_SECRET_KEY to encrypt the new token.
const TEST_MASTER_KEY = '01234567890123456789012345678901';

function buildBinary(name: string, pkg: string): string {
  const binary = path.join(BIN_DIR, name);
  if (!fs.existsSync(binary)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    const backend = process.env.DB_BACKEND || 'opengauss';
    const tagMap: Record<string, boolean> = { opengauss: true, kingbase: true, dameng: true, oceanbase: true, gbase8s: true };
    const tagArg = tagMap[backend] ? `-tags=${backend}` : '';
    execSync(`go build ${tagArg} -o ${binary} ${pkg}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
  }
  return binary;
}

interface Procs {
  agent: ChildProcess | null;
  web: ChildProcess | null;
  tmpDir: string;
  webToken: string;
  webURL: string;
}

async function startCluster(): Promise<Procs> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrape-e2e-'));
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

  const agentEnv = { ...process.env, OSG_ENV: 'dev', OSG_CLUSTER_SECRET_KEY: TEST_MASTER_KEY };
  const agent = spawn(agentBin, [
    '-state', statePath,
    '-socket', sockPath,
    '-id', 'node-a',
    '-compose-dir', os.devNull,
    '-ca-dir', caDir,
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: agentEnv });

  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      if (fs.existsSync(sockPath)) return resolve();
      if (Date.now() > deadline) return reject(new Error('agent did not start'));
      setTimeout(check, 100);
    };
    check();
  });

  const webPort = 18400 + Math.floor(Math.random() * 100);
  const webURL = `http://127.0.0.1:${webPort}`;
  let webToken = '';
  let webStarted = false;

  // The web process needs OSG_CLUSTER_SECRET_KEY so the rotate endpoint can encrypt.
  const webEnv = { ...process.env, OSG_ENV: 'dev', OSG_CLUSTER_SECRET_KEY: TEST_MASTER_KEY };
  const web = spawn(clustermgrBin, [
    'serve',
    `--socket=${sockPath}`,
    `--listen=127.0.0.1:${webPort}`,
    `--ca-dir=${caDir}`,
    `--images-dir=${path.join(tmpDir, 'images')}`,
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: webEnv });

  await new Promise<void>((resolve, reject) => {
    let output = '';
    const tryResolve = () => {
      if (webStarted && webToken) resolve();
    };
    const onData = (data: Buffer) => {
      output += data.toString();
      const tokenMatch = output.match(/web token:\s*(\S+)/);
      if (tokenMatch) webToken = tokenMatch[1];
      if (output.includes('serving on')) webStarted = true;
      tryResolve();
    };
    web.stdout!.on('data', onData);
    web.stderr!.on('data', onData);
    setTimeout(() => {
      if (!webStarted || !webToken) reject(new Error(`clustermgr web did not start. Output: ${output}`));
    }, 10000);
  });

  return { agent, web, tmpDir, webToken, webURL };
}

function stopCluster(procs: Procs) {
  try { procs.web?.kill(); } catch {}
  try { procs.agent?.kill(); } catch {}
  try { fs.rmSync(procs.tmpDir, { recursive: true, force: true }); } catch {}
}

async function gotoSecurityTab(page: Page, webURL: string, webToken: string) {
  await page.addInitScript((token) => {
    localStorage.setItem('web_token', token);
  }, webToken);
  await page.goto(webURL);
  await page.waitForLoadState('networkidle');
  await page.locator('button[data-tab="security"]').click();
  await expect(page.locator('#tab-security')).toBeVisible();
}

test.describe('External Prometheus Scrape Panel', () => {
  test.describe.configure({ mode: 'serial' });
  let procs: Procs;

  test.beforeAll(async () => {
    procs = await startCluster();
  });

  test.afterAll(() => {
    stopCluster(procs);
  });

  test('panel is visible on security tab and shows disabled initially', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);
    // The panel heading.
    await expect(page.getByText('外部监控接入（Prometheus 拉取）')).toBeVisible();
    // Initial state: disabled.
    await expect(page.locator('#scrape-enabled-status')).toContainText('已关闭');
    // Bind select defaults to empty (disabled).
    await expect(page.locator('#scrape-bind')).toHaveValue('');
  });

  test('save config enables the endpoint and persists', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    await page.locator('#scrape-bind').selectOption('0.0.0.0');
    await page.locator('#scrape-cidrs').fill('10.9.0.0/16');
    await page.locator('#scrape-cache').fill('15');
    await page.locator('#scrape-timeout').fill('3');
    await page.locator('#btn-scrape-config-save').click();

    // Success message.
    await expect(page.locator('#scrape-config-msg')).toContainText('已保存', { timeout: 5000 });
    // Status reflects enabled.
    await expect(page.locator('#scrape-enabled-status')).toContainText('已启用');
  });

  test('rejects empty CIDR when bind is set (API-level)', async ({ page }) => {
    // The UI field population races with async loadScrapeConfig, making a
    // reliable "clear the field then submit" flow flaky in serial mode. The
    // rejection logic is handler-side and is covered by the Python E2E
    // (test_put_rejects_empty_cidr_when_enabled); here we just verify the API
    // contract through page.request so the panel's endpoint wiring is checked.
    await gotoSecurityTab(page, procs.webURL, procs.webToken);
    const resp = await page.request.put(`${procs.webURL}/api/security/external-scrape`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { bind: '0.0.0.0', allowed_cidrs: '' },
    });
    expect(resp.status()).toBe(400);
  });

  test('token rotate shows the new token once', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    // Trigger rotate (confirm dialog auto-accepted).
    page.once('dialog', async dialog => {
      if (dialog.type() === 'confirm') await dialog.accept();
    });
    await page.locator('#btn-scrape-token-rotate').click();

    // The message area shows the new token (in a <code> element).
    const msg = page.locator('#scrape-token-msg code');
    await expect(msg).toBeVisible({ timeout: 5000 });
    const tokenText = await msg.innerText();
    expect(tokenText.length).toBeGreaterThan(10);
    // The message warns it's shown only once.
    await expect(page.locator('#scrape-token-msg')).toContainText('仅显示一次');
  });

  test('token rotate with grace=0 warns about emergency', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    await page.locator('#scrape-grace').fill('0');
    page.once('dialog', async dialog => {
      if (dialog.type() === 'confirm') await dialog.accept();
    });
    await page.locator('#btn-scrape-token-rotate').click();

    // Token still returned (grace=0 is valid, just immediate-invalidate).
    await expect(page.locator('#scrape-token-msg code')).toBeVisible({ timeout: 5000 });
  });

  // Review P2 #5: the panel tells the operator to "wait until every node applied
  // the new version" before switching SA to the new token. That instruction was
  // unfollowable until this table existed.
  test('node applied-version table renders per-node status', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    const rows = page.locator('[data-testid="scrape-node-row"]');
    await expect(rows).toHaveCount(1, { timeout: 5000 });
    await expect(rows.first()).toHaveAttribute('data-node-id', 'node-a');
    // The summary states the current Doc version either way, so the operator can
    // compare it against what each node reports.
    await expect(page.locator('#scrape-nodes-summary')).toContainText('当前 Doc 版本');
  });

  test('summary does not claim readiness while a node lags', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    const summary = page.locator('#scrape-nodes-summary');
    await expect(summary).toHaveAttribute('data-all-applied', /0|1/, { timeout: 5000 });
    const allApplied = await summary.getAttribute('data-all-applied');
    if (allApplied === '1') {
      await expect(summary).toContainText('可以切换 SA');
    } else {
      // The critical direction: a lagging node must never be worded as "go ahead".
      await expect(summary).toContainText('请勿切换 SA 配置');
      await expect(summary).not.toContainText('可以切换 SA');
    }
  });

  test('rotate refreshes the node status table', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    page.once('dialog', async dialog => {
      if (dialog.type() === 'confirm') await dialog.accept();
    });
    await page.locator('#btn-scrape-token-rotate').click();
    await expect(page.locator('#scrape-token-msg code')).toBeVisible({ timeout: 5000 });

    // Rotation bumps the Doc version, so the table must be re-fetched rather
    // than left showing pre-rotation state.
    await expect(page.locator('[data-testid="scrape-node-row"]')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('#scrape-nodes-summary')).toContainText('当前 Doc 版本');
  });

  test('manual refresh button reloads node status', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    await page.locator('[data-testid="scrape-nodes-refresh"]').click();
    await expect(page.locator('[data-testid="scrape-node-row"]')).toHaveCount(1, { timeout: 5000 });
    await expect(page.locator('[data-testid="scrape-node-status"]').first()).not.toBeEmpty();
  });

  test('disable endpoint by clearing bind', async ({ page }) => {
    await gotoSecurityTab(page, procs.webURL, procs.webToken);

    // First enable (in case a prior test left it disabled).
    await page.locator('#scrape-bind').selectOption('0.0.0.0');
    await page.locator('#scrape-cidrs').fill('127.0.0.1/32');
    await page.locator('#btn-scrape-config-save').click();
    await expect(page.locator('#scrape-config-msg')).toContainText('已保存', { timeout: 5000 });

    // Now disable.
    await page.locator('#scrape-bind').selectOption('');
    await page.locator('#btn-scrape-config-save').click();
    await expect(page.locator('#scrape-config-msg')).toContainText('已保存', { timeout: 5000 });
    await expect(page.locator('#scrape-enabled-status')).toContainText('已关闭');
  });
});
