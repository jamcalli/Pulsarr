import type { MetadataRoute } from 'next'
import { getPageCanonicalPath, isPreview, siteOrigin } from '@/lib/shared'
import { source } from '@/lib/source'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  if (isPreview) return []
  return source
    .getPages()
    .map((page) => ({ url: `${siteOrigin}${getPageCanonicalPath(page.url)}` }))
}
