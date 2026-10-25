import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'
import { OgCard, ogImageOptions } from '@/lib/og-card'
import { getPageImageUrl, siteOrigin } from '@/lib/shared'
import { source } from '@/lib/source'

export const revalidate = false

const siteLabel = `${siteOrigin.replace('https://', '')}/Pulsarr`

function sectionLabel(slugs: string[]) {
  if (slugs.length === 0) return 'Docs'
  if (slugs[0] === 'api') return 'API reference'
  const section = source.getPage([slugs[0]])
  if (!section || section.slugs.length === slugs.length) return 'Docs'
  return section.data.title
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  const page = source.getPage(slug.slice(0, -1))
  if (!page) notFound()

  return new ImageResponse(
    await OgCard({
      eyebrow: sectionLabel(page.slugs),
      title: page.data.title,
      description: page.data.description,
      site: siteLabel,
    }),
    await ogImageOptions(),
  )
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }))
}
