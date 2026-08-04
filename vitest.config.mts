import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // The suite contains jsdom interaction tests backed by Base UI portals.
    // On CI they share CPU with hundreds of parallel files, so Vitest's 5s
    // default can expire even when the same interaction completes reliably.
    testTimeout: 10_000,
    // Pin the timezone to the product's market (UTC+8). Time-formatting tests
    // (format-time, send-receive-context-card, …) assert local-time output like
    // "09:40:10" for a UTC input, which only holds under UTC+8. Without this the
    // suite passes on a UTC+8 CI box but fails on a UTC host — a machine-TZ trap.
    env: { TZ: 'Asia/Shanghai' },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
