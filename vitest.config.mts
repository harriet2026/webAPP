import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
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
