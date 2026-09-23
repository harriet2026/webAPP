/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS Playwright entrypoint, outside the Next.js app. */
const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');
const baseURL = process.env.ASSESSMENT_FIXTURE_WEB_URL;
if (!baseURL) throw new Error('Set ASSESSMENT_FIXTURE_WEB_URL to an isolated frontend. See tests/browser/README.md.');
const output = path.resolve(process.env.ASSESSMENT_FIXTURE_OUTPUT_DIR || '/tmp/osgateway-assessment-browser');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'assessment-details.spec.cjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  globalTimeout: 600000,
  expect: { timeout: 10000 },
  outputDir: path.join(output, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: path.join(output, 'results.json') }]],
  use: {
    ...devices['Desktop Chrome'], baseURL, locale: 'en-US',
    serviceWorkers: 'block', acceptDownloads: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off',
    launchOptions: process.env.ASSESSMENT_FIXTURE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.ASSESSMENT_FIXTURE_CHROMIUM_EXECUTABLE } : {},
  },
});
