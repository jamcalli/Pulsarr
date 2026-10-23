#!/usr/bin/env bun
/// <reference types="bun-types" />
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE_DIR = resolve(ROOT, 'src/client')
const TARGET_DIR = resolve(ROOT, 'docs')

/** Paths relative to src/client, mirrored at the same relative path under docs/ unless overridden below. */
export const DOCS_SHARED_FILES = [
  'styles/globals.css',
  'styles/fonts.css',
  'assets/fonts/ChakraPetch-Bold.woff2',
  'assets/fonts/ChakraPetch-Medium.woff2',
  'assets/fonts/ChakraPetch-MediumItalic.woff2',
  'assets/fonts/ChakraPetch-SemiBold.woff2',
  'assets/fonts/ChakraPetch-OFL.txt',
  'assets/images/pulsarr.svg',
  'components/ui/alert.tsx',
  'components/ui/button.tsx',
  'components/ui/collapsible.tsx',
  'components/ui/popover.tsx',
  'components/ui/separator.tsx',
  'public/favicon.ico',
  'public/favicon.svg',
] as const

type SharedFile = (typeof DOCS_SHARED_FILES)[number]

/** Next's app/ icon convention applies basePath, which a static export never adds to public/ file links. */
const DOCS_TARGET_OVERRIDES: Partial<Record<SharedFile, string>> = {
  'public/favicon.ico': 'app/favicon.ico',
  'public/favicon.svg': 'app/icon.svg',
}

function targetPath(path: SharedFile): string {
  return resolve(TARGET_DIR, DOCS_TARGET_OVERRIDES[path] ?? path)
}

async function isInSync(path: SharedFile): Promise<boolean> {
  const source = await readFile(resolve(SOURCE_DIR, path))
  const target = await readFile(targetPath(path)).catch(() => null)
  return target !== null && source.equals(target)
}

const check = process.argv.includes('--check')
const stale: SharedFile[] = []

for (const path of DOCS_SHARED_FILES) {
  if (await isInSync(path)) continue
  stale.push(path)
  if (check) continue
  const target = targetPath(path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, await readFile(resolve(SOURCE_DIR, path)))
}

if (check && stale.length > 0) {
  console.error('Docs shared files out of sync, run `bun run docs:sync`:')
  for (const path of stale)
    console.error(`  ${relative(ROOT, targetPath(path))}`)
  process.exit(1)
}

console.log(
  check
    ? 'Docs shared files are in sync'
    : `Synced ${stale.length} docs shared file(s)`,
)
