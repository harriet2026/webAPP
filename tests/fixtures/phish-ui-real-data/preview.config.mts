import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/postcss';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
});
