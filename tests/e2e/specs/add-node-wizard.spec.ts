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
    const backend = process.env.DB_BACKEND || 'opengauss';
    const tagged = ['opengauss', 'kingbase', 'dameng', 'oceanbase', 'gbase8s'].includes(backend);
    const cmd = tagged
      ? `go build -tags=${backend} -o ${binary} ${pkg}`
      : `go build -o ${binary} ${pkg}`;
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'pipe' });
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
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'add-node-wizard-e2e-'));
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

  // Isolate the cluster_token into tmpDir. The agent's default
  // -cluster-token-file is /var/lib/osgateway/cluster_token; on a host with a
  // real osg-agent install that file exists as mode-0600/osg-agent-owned, so
  // the test user gets EACCES reading it. inBootstrapMode() treats an
  // unreadable/empty token (with the node cert present) as "secrets not yet
  // received" and drops the agent into bootstrap mode after the mTLS
  // switchover — where it dies polling a nonexistent peer ("CSR fingerprint is
  // empty"). A non-empty, test-owned token file keeps inBootstrapMode false so
  // the agent serves in mTLS mode, which is what this single-node harness wants.
  const tokenPath = path.join(tmpDir, 'cluster_token');
  fs.writeFileSync(tokenPath, 'test-cluster-token');

  const agent = spawn(agentBin, [
    '-state', statePath,
    '-socket', sockPath,
    '-id', 'node-a',
    '-compose-dir', os.devNull,
    '-ca-dir', caDir,
    '-cluster-token-file', tokenPath,
  ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, OSG_ENV: 'dev' } });

  // Accumulate agent stdout+stderr so we can detect the cert-watcher self-restart
  // (below) and wait it out before any test mutates cluster state.
  let agentOut = '';
  agent.stdout!.on('data', (d: Buffer) => { agentOut += d.toString(); });
  agent.stderr!.on('data', (d: Buffer) => { agentOut += d.toString(); });

  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      if (fs.existsSync(sockPath)) return resolve();
      if (Date.now() > deadline) return reject(new Error('agent did not start'));
      setTimeout(check, 100);
    };
    check();
  });

  // Write a valid CA cert plus a REAL (self-signed) node cert/key. All three
  // present → the cluster reads as "initialized" (bootstrap works) and the
  // cert-watcher fires its one-time mTLS switchover. The node cert must be a
  // parseable PEM: the previous "dummy" strings made the post-switchover
  // ensureNodeCert fatal ("no PEM block found"), killing the agent mid-test and
  // dropping the just-added node. A self-signed node cert need not be CA-signed —
  // ensureNodeCert sees it isn't, finds no local ca.key, and skips re-issue
  // ("joined node"), leaving the agent serving in mTLS mode. No real TLS
  // handshakes happen in this single-node harness, so an unsigned cert is fine.
  // Generate a REAL, parseable CA certificate. The agent's cert-pool loader
  // (clusterauth.CertPoolFromPEM -> x509 AppendCertsFromPEM) rejects an
  // unparseable ca.crt; post-switchover the agent then fatally refuses to serve
  // ("ca.crt is readable but not a valid certificate; refusing plain-HTTP
  // downgrade", cmd/osg-agent/main.go) so "peer: serving" never reappears. Keep
  // the CA *key* out of caDir so the post-switchover ensureNodeCert still sees
  // "no local ca.key" and skips re-issue (joined node).
  const caKeyTmp = path.join(tmpDir, 'ca.key');
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=testCA" ` +
      `-keyout "${caKeyTmp}" -out "${path.join(caDir, 'ca.crt')}"`,
    { stdio: 'pipe' },
  );
  fs.rmSync(caKeyTmp, { force: true });
  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=node-a" ` +
      `-keyout "${path.join(caDir, 'node.key')}" -out "${path.join(caDir, 'node.crt')}"`,
    { stdio: 'pipe' },
  );

  // The agent's cert-watcher polls every 5s; once all three cert files exist it
  // syscall.Exec-restarts to switch the peer server to mTLS. That restart reloads
  // cluster state from disk and, if it races with the test's plan/admit ops,
  // intermittently drops the just-added node (apply → 404, Nodes tab missing
  // node-b). Wait for the restart to fire AND the agent to come back up here, so
  // every subsequent test mutates only the stable post-restart agent. After the
  // restart certs already exist at boot, so the watcher is not re-armed.
  const waitForLog = async (pred: (s: string) => boolean, timeoutMs: number, msg: string) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (pred(agentOut)) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`${msg}\n--- agent log ---\n${agentOut}`);
  };
  await waitForLog((s) => s.includes('self-restarting'), 15000, 'cert-watcher self-restart did not fire');
  const restartIdx = agentOut.indexOf('self-restarting');
  await waitForLog((s) => s.indexOf('peer: serving', restartIdx + 1) !== -1, 15000, 'agent did not come back up after the cert switchover');
  // Socket is removed+recreated across the re-exec; ensure it is back.
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const check = () => {
      if (fs.existsSync(sockPath)) return resolve();
      if (Date.now() > deadline) return reject(new Error('ctl socket did not reappear after restart'));
      setTimeout(check, 100);
    };
    check();
  });

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
      // Resolve only when both the "serving on" line AND the web token are present.
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

async function gotoNodesTab(page: Page, webURL: string, webToken: string) {
  await gotoAuthenticated(page, webURL, webToken);
  await page.locator('button[data-tab="nodes"]').click();
  await expect(page.locator('#tab-nodes')).toBeVisible();
}

test.describe('Add Node Wizard', () => {
  // These tests share one spawned clustermgr (beforeAll) and mutate cluster state
  // across tests (one test creates node-b, later tests admit/apply it). They MUST
  // run serially: under default parallel workers each worker starts its own
  // clustermgr, so node-b created in one worker is invisible to the others.
  test.describe.configure({ mode: 'serial' });
  let procs: Procs;

  test.beforeAll(async () => {
    procs = await startCluster();
  });

  test.afterAll(async () => {
    await stopCluster(procs);
  });

  test('add-node plan API creates node with desired labels', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/plan`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: {
        node_id: 'node-b',
        // gateway-only: a db-labeled node cannot be applied until its standby db
        // setup reaches "done", which is impossible in this no-real-DB harness.
        // The db-node apply gating is covered by the Python integration tests
        // (test_apply_db_setup_done_succeeds / _rejects_db_setup_in_progress).
        desired_labels: ['gateway'],
        advertise_ip: '10.0.0.5',
        agent_addr: '10.0.0.5:7700',
      },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe('ok');

    const nodesResp = await request.get(`${procs.webURL}/api/nodes`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    const nodes = await nodesResp.json();
    const nodeB = nodes.find((n: any) => n.id === 'node-b');
    expect(nodeB).toBeDefined();
    expect(nodeB.desired_labels).toEqual(['gateway']);
    expect(nodeB.status).toBe('pending');
  });

  test('add-node plan requires node_id', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/plan`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { desired_labels: ['db'] },
    });
    expect(resp.status()).toBe(400);
  });

  test('generates bootstrap join token', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/bootstrap`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'node-b', ttl_sec: 1800 },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.bootstrap_token).toBeTruthy();
    expect(body.node_id).toBe('node-b');
    expect(body.bootstrap_token.length).toBeGreaterThan(10);
  });

  test('bootstrap token for nonexistent node returns 404', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/bootstrap`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'nonexistent' },
    });
    expect(resp.status()).toBe(404);
  });

  test('lists pending nodes', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/add-node/pending`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    const ids = body.items.map((n: any) => n.id);
    expect(ids).toContain('node-b');
    for (const n of body.items) {
      expect(n.status).toBe('pending');
    }
  });

  test('admit pending node changes status', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/admit`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'node-b' },
    });
    expect(resp.status()).toBe(200);

    const nodesResp = await request.get(`${procs.webURL}/api/nodes`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    const nodes = await nodesResp.json();
    const nodeB = nodes.find((n: any) => n.id === 'node-b');
    expect(nodeB.status).toBe('admitted');
  });

  test('shows missing images for node', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/images-missing`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'node-b' },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.missing).toBeDefined();
    expect(body.desired_labels).toEqual(['gateway']);
    expect(body.expected_images).toBeDefined();
    expect(body.expected_images.length).toBeGreaterThan(0);
  });

  test('missing images for nonexistent node returns 404', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/images-missing`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'nonexistent' },
    });
    expect(resp.status()).toBe(404);
  });

  test('final apply promotes to active member', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/apply`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'node-b' },
    });
    expect(resp.status()).toBe(200);

    const nodesResp = await request.get(`${procs.webURL}/api/nodes`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    const nodes = await nodesResp.json();
    const nodeB = nodes.find((n: any) => n.id === 'node-b');
    expect(nodeB.labels).toEqual(['gateway']);
    expect(nodeB.desired_labels).toBeUndefined();
  });

  test('apply for nonexistent node returns 404', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/apply`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'nonexistent' },
    });
    expect(resp.status()).toBe(404);
  });

  test('apply requires node_id', async ({ request }) => {
    const resp = await request.post(`${procs.webURL}/api/add-node/apply`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: {},
    });
    expect(resp.status()).toBe(400);
  });

  test('Nodes tab shows pending and admitted nodes', async ({ page }) => {
    await gotoNodesTab(page, procs.webURL, procs.webToken);

    const detail = page.locator('#nodes-tab-table');
    await expect(detail).toBeVisible({ timeout: 10000 });
    await expect(detail).toContainText('node-a');
    await expect(detail).toContainText('node-b');
  });

  test('API /api/nodes/pending returns pending nodes', async ({ request }) => {
    const resp = await request.get(`${procs.webURL}/api/nodes/pending`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('API /api/nodes/:id/admit via node action endpoint', async ({ request }) => {
    const planResp = await request.post(`${procs.webURL}/api/add-node/plan`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'node-c', desired_labels: ['db'] },
    });
    expect(planResp.status()).toBe(200);

    const resp = await request.post(`${procs.webURL}/api/nodes/node-c/admit`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
    });
    expect(resp.status()).toBe(200);
  });

  test('clear-stuck-op refuses fresh heartbeat', async ({ request }) => {
    const planResp = await request.post(`${procs.webURL}/api/add-node/plan`, {
      headers: { 'X-Web-Token': procs.webToken, 'Content-Type': 'application/json' },
      data: { node_id: 'node-c', desired_labels: ['redis'] },
    });
    expect(planResp.status()).toBe(200);

    const resp = await request.delete(`${procs.webURL}/api/cluster/ongoing-op`, {
      headers: { 'X-Web-Token': procs.webToken },
    });
    expect(resp.status()).toBe(409);
  });
});
