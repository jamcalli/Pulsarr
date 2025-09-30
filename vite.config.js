import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { viteFastify } from '@fastify/vite/plugin'
import viteReact from '@vitejs/plugin-react'

// Read package.json to expose version for client
const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
)

/** @type {import('vite').UserConfig} */
export default {
  base: '/',
  root: resolve(import.meta.dirname, 'src/client'),
  plugins: [viteReact(), viteFastify({ spa: true })],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/client'),
    emptyOutDir: false,
    assetsInclude: ['**/*.woff2', '**/*.woff'],
    experimental: {
      renderBuiltUrl(filename, { hostType }) {
        // For JS and CSS, use runtime base path resolution
        if (hostType === 'js' || hostType === 'css') {
          return {
            runtime: `window.__assetBase(${JSON.stringify(filename)})`,
          }
        }
        // For other assets (images, fonts), use relative paths
        return { relative: true }
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
