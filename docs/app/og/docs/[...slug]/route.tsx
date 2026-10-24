import { generateOGImage } from '@fumadocs/base-ui/og'
import { notFound } from 'next/navigation'
import { appName, getPageImageUrl } from '@/lib/shared'
import { source } from '@/lib/source'

export const revalidate = false

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  const page = source.getPage(slug.slice(0, -1))
  if (!page) notFound()

  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: appName,
  })
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }))
}
