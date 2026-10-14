import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    env: { DISPATCH_SCHEDULER: '0' },
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
