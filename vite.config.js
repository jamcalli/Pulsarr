import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { viteFastify } from '@fastify/vite/plugin'
import viteReact from '@vitejs/plugin-react'
import { compression } from 'vite-plugin-compression2'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
)

/** @type {import('vite').UserConfig} */
export default {
  base: './',
  root: resolve(import.meta.dirname, 'src/client'),
  plugins: [
    viteReact(),
    viteFastify({ spa: true }),
    compression({ algorithms: ['gzip', 'brotliCompress'], threshold: 1024 }),
  ],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    assetsInclude: ['**/*.woff2', '**/*.woff'],
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
              priority: 20,
            },
            {
              name: 'ui-vendor',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 15,
            },
            {
              name: 'query',
              test: /[\\/]node_modules[\\/]@tanstack[\\/]react-query[\\/]/,
              priority: 15,
            },
            {
              name: 'table',
              test: /[\\/]node_modules[\\/]@tanstack[\\/]react-table[\\/]/,
              priority: 15,
            },
            {
              name: 'charts',
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              priority: 15,
            },
            {
              name: 'forms',
              test: /[\\/]node_modules[\\/](react-hook-form|@hookform[\\/]resolvers|zod)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src/client'),
      '@root': resolve(import.meta.dirname, 'src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  cacheDir: process.env.NODE_ENV === 'production' ? false : undefined,
}
