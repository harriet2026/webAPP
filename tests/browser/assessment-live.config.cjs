/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS Playwright entrypoint. */
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');

for (const name of ['ASSESSMENT_LIVE_WEB_URL', 'ASSESSMENT_LIVE_LOGIN_FILE', 'ASSESSMENT_LIVE_MANIFEST', 'ASSESSMENT_LIVE_OUTPUT_DIR']) {
  if (!process.env[name]) throw new Error(`Set ${name}; see tests/browser/README.md.`);
}
const output = path.resolve(process.env.ASSESSMENT_LIVE_OUTPUT_DIR);
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'assessment-live.spec.cjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  globalTimeout: 1800000,
  expect: { timeout: 15000 },
  outputDir: path.join(output, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: path.join(output, 'results.json') }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.ASSESSMENT_LIVE_WEB_URL,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    acceptDownloads: true,
    // Authentication enters private credentials. Do not retain traces or video.
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    launchOptions: process.env.ASSESSMENT_LIVE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.ASSESSMENT_LIVE_CHROMIUM_EXECUTABLE } : {},
  },
});
