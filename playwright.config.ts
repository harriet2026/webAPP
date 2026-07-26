import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const REPO_ROOT = path.resolve(__dirname, '..');
const DEV_CA = path.join(REPO_ROOT, 'certs', 'dev', 'ca.crt');
const DEV_CERT = path.join(REPO_ROOT, 'certs', 'dev', 'node.crt');
const DEV_KEY = path.join(REPO_ROOT, 'certs', 'dev', 'node.key');
const INTERNAL_BASE = process.env.INTERNAL_API_BASE_URL || 'https://localhost:18081';
// The apiserver internal listener (18081) is mTLS-only: specs that seed via
// /internal/mail-logs/ingest cannot even complete the TLS handshake without a
// client cert. Present the dev cert whenever it exists; PLAYWRIGHT_CLIENT_CERTS=0
// opts out (e.g. to assert the listener really does reject certless clients).
const ENABLE_CLIENT_CERTS = process.env.PLAYWRIGHT_CLIENT_CERTS !== '0';

const devCertsExist = fs.existsSync(DEV_CA) && fs.existsSync(DEV_CERT) && fs.existsSync(DEV_KEY);
const clientCertificates = ENABLE_CLIENT_CERTS && devCertsExist
  ? [{ origin: INTERNAL_BASE, certPath: DEV_CERT, keyPath: DEV_KEY }]
  : [];

export default defineConfig({
  testDir: './tests/e2e/specs',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    locale: 'zh-CN',
    // Pin the browser clock to the same zone the backend buckets in. Date-range
    // presets ("今天" / "近7天") are computed from the BROWSER's local date, while
    // the statistics endpoints bucket by the tenant's configured timezone
    // (storage.resolveTZLoc, default Asia/Shanghai — see the security_overview
    // dbtests). The services run TZ=Asia/Shanghai; when the host runs UTC, the two
    // disagree about what day it is for the 8h between 16:00 UTC and midnight, so
    // "today"'s traffic is stamped tomorrow in the tenant's zone and every
    // range-scoped page renders 暂无数据. Pinning the browser (which already runs
    // locale zh-CN) keeps the suite deterministic at any hour of the day.
    timezoneId: 'Asia/Shanghai',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    clientCertificates,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-proxy-server'],
        },
      },
    },
  ],
});
