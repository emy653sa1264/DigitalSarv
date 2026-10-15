import { defineConfig } from 'vitest/config'

/**
 * D37 browser regression (on demand, not CI): `pnpm --filter web e2e`. Needs `pnpm db:up`, `pnpm seed`, `pnpm --filter api build`
 * and `pnpm --filter web build` first; the global setup starts the built API and a static proxy and stops both afterwards.
 */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.e2e.ts'],
    globalSetup: ['./global-setup.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 120_000,
  },
})
