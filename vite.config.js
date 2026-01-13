import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { viteFastify } from '@fastify/vite/plugin'
import viteReact from '@vitejs/plugin-react'

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
)

const renderBuiltUrl = (filename, { hostType }) => {
  if (hostType === 'js') {
    return { runtime: `window.__assetBase(${JSON.stringify(filename)})` }
  }
  return { relative: true }
}

/** @type {import('vite').UserConfig} */
export default {
  base: '/',
  root: resolve(import.meta.dirname, 'src/client'),
  plugins: [viteReact(), viteFastify({ spa: true })],
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    assetsInclude: ['**/*.woff2', '**/*.woff'],
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['lucide-react'],
          'query': ['@tanstack/react-query'],
          'table': ['@tanstack/react-table'],
          'charts': ['recharts'],
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
      },
    },
  },
  experimental: {
    renderBuiltUrl,
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
