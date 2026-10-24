import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from '@fumadocs/base-ui/layouts/spacious/page'
import { createRelativeLink } from '@fumadocs/base-ui/mdx'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { OpenAPIPage } from '@/components/api-page'
import { getMDXComponents } from '@/components/mdx'
import { Separator } from '@/components/ui/separator'
import { openapi } from '@/lib/openapi'
import {
  getPageCanonicalPath,
  getPageImageUrl,
  siteOpenGraph,
} from '@/lib/shared'
import { source } from '@/lib/source'

interface PageProps {
  params: Promise<{ slug?: string[] }>
}

export default async function Page(props: PageProps) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  const MDX = page.data.body
  const isLanding = page.slugs.length === 0

  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      footer={{ enabled: !isLanding }}
    >
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">
        {page.data.description}
      </DocsDescription>
      <Separator />
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
            OpenAPIPage: async (apiProps) => (
              <OpenAPIPage
                {...(await openapi.preloadOpenAPIPage(page))}
                {...apiProps}
              />
            ),
          })}
        />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  const canonical = getPageCanonicalPath(page.url)
  return {
    title:
      page.slugs.length === 0 ? { absolute: page.data.title } : page.data.title,
    description: page.data.description,
    alternates: { canonical },
    openGraph: {
      ...siteOpenGraph,
      url: canonical,
      images: getPageImageUrl(page).url,
    },
  }
}
