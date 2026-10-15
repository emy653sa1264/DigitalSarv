import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    env: { DISPATCH_SCHEDULER: '0' },
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // a cold AppModule start (Mongo indexes, seed) can exceed the 10 s default
    hookTimeout: 30000,
    // both files reuse the test providers and the demo customer's wallet: run them one after another
    fileParallelism: false,
  },
});
