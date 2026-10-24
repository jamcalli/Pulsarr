import { dirname } from 'node:path'
import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'
import { basePath } from './lib/shared'

const withMDX = createMDX()

const config: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Repo root, because tsconfig.json extends ../tsconfig.base.json and Turbopack never resolves above its root.
  turbopack: { root: dirname(import.meta.dirname) },
  allowedDevOrigins: ['10.*.*.*', '192.168.*.*'],
}

export default withMDX(config)
