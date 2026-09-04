import path from 'node:path'
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
    // Vitest v4: poolOptions removed, options moved to top level
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/test/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/src/client/**', // Exclude client-side code
        '**/migrations/**',
        '**/scripts/**',
      ],
      include: ['src/**/*.ts'],
    },
    globalSetup: './test/setup/global-setup.ts',
    // Run setup files in array order so the bun-writable-ended shim installs
    // before anything else. Sequential is the current default, this pins it
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
    experimental: {
      // Caches transformed modules to disk for faster subsequent runs
      // Clear with: npx vitest --clearCache
      fsModuleCache: true,
    },
    // Zod 4's `import * as z; export { z }` index resolves the named `z`
    // export to undefined under Vitest's SSR fast-path; inlining runs the
    // full Vite transform.
    server: {
      deps: {
        inline: ['zod'],
      },
    },
  },
  resolve: {
    // Must stay in lockstep with the `paths` in tsconfig.json
    alias: [
      {
        find: /^@root\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/$1.ts'),
      },
      {
        find: /^@utils\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/utils/$1.ts'),
      },
      {
        find: /^@schemas\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/schemas/$1.ts'),
      },
      {
        find: /^@services\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/services/$1.ts'),
      },
      { find: '@root', replacement: path.resolve(__dirname, './src') },
      { find: '@utils', replacement: path.resolve(__dirname, './src/utils') },
      {
        find: '@schemas',
        replacement: path.resolve(__dirname, './src/schemas'),
      },
      {
        find: '@services',
        replacement: path.resolve(__dirname, './src/services'),
      },
    ],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
})
