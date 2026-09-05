import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    exclude: ['**/node_modules/**', '**/tmp/**'],
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/client/**', '**/*.test.ts', '**/*.spec.ts'],
    },
    globalSetup: './test/setup/global-setup.ts',
    // The bun-writable-ended shim has to install before every other setup file
    sequence: {
      setupFiles: 'list',
    },
    setupFiles: [
      './test/setup/bun-writable-ended.ts',
      './test/setup/msw-setup.ts',
    ],
    testTimeout: 10000,
    // full-app build() in beforeAll can be slow under CI contention
    hookTimeout: 30000,
    fsModuleCache: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
})
