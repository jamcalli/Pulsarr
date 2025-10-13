import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--import', 'tsx'],
      },
    },
    coverage: {
      provider: 'v8',
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
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: [
      // Map .js imports to .ts files for path aliases
      {
        find: /^@root\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/$1.ts'),
      },
      {
        find: /^@services\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/services/$1.ts'),
      },
      {
        find: /^@plugins\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/plugins/$1.ts'),
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
        find: /^@types\/(.*)\.js$/,
        replacement: path.resolve(__dirname, './src/types/$1.ts'),
      },
      // Regular aliases without .js extension
      { find: '@root', replacement: path.resolve(__dirname, './src') },
      {
        find: '@services',
        replacement: path.resolve(__dirname, './src/services'),
      },
      {
        find: '@plugins',
        replacement: path.resolve(__dirname, './src/plugins'),
      },
      { find: '@utils', replacement: path.resolve(__dirname, './src/utils') },
      {
        find: '@schemas',
        replacement: path.resolve(__dirname, './src/schemas'),
      },
      { find: '@types', replacement: path.resolve(__dirname, './src/types') },
    ],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
})
