import { defineConfig } from 'vitest/config';

// `base: './'` keeps the build relocatable: it works from any GitHub Pages
// sub-path and from file:// inside Electron. Override with VITE_BASE if needed.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
