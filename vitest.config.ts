import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/client/**', '**/*.test.ts', '**/*.spec.ts'],
    },
    // The bun-writable-ended shim has to install before every other setup file
    sequence: {
      setupFiles: 'list',
    },
    fsModuleCache: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          pool: 'forks',
          exclude: ['**/node_modules/**', '**/tmp/**', 'test/client/**'],
          globalSetup: './test/setup/global-setup.ts',
          setupFiles: [
            './test/setup/bun-writable-ended.ts',
            './test/setup/msw-setup.ts',
          ],
          testTimeout: 10000,
          // full-app build() in beforeAll can be slow under CI contention
          hookTimeout: 30000,
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: ['test/client/**/*.test.{ts,tsx}'],
          setupFiles: ['./test/client/setup.ts'],
        },
      },
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
})
