import { createGetUrl } from 'fumadocs-core/source'

export const appName = 'Pulsarr'
export const siteOrigin = 'https://jamcalli.github.io'
// The develop preview deploys under /Pulsarr/next, set by the docs workflow.
export const basePath = process.env.NEXT_PUBLIC_DOCS_BASE_PATH || '/Pulsarr'
/** True for the develop preview build, which search engines must not index. */
export const isPreview = process.env.NEXT_PUBLIC_DOCS_PREVIEW === 'true'
export const docsRoute = '/'
export const docsImageRoute = '/og/docs'
export const docsContentRoute = '/llms.mdx/docs'

export const gitConfig = {
  user: 'jamcalli',
  repo: 'Pulsarr',
  branch: 'master',
}

const getContentUrl = createGetUrl(`${basePath}${docsContentRoute}`)

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md']

  return { segments, url: getContentUrl(segments, page.locale) }
}

const getImageUrl = createGetUrl(`${basePath}${docsImageRoute}`)

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'image.png']

  return { segments, url: getImageUrl(segments, page.locale) }
}

/** The page's full path on the site, with the base path and trailing slash the static export serves. */
export function getPageCanonicalPath(url: string) {
  return `${basePath}${url === '/' ? '' : url}/`
}

export const siteOpenGraph = { siteName: appName, type: 'website' as const }
