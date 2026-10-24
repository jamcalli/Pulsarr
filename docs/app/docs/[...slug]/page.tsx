import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { legacyDocSlugs, legacyDocTarget } from '@/lib/legacy-redirects'

interface PageProps {
  params: Promise<{ slug: string[] }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return legacyDocSlugs().map((slug) => ({ slug }))
}

export const metadata: Metadata = { robots: { index: false } }

export default async function Page(props: PageProps) {
  const { slug } = await props.params
  const target = legacyDocTarget(slug)
  if (!target) notFound()

  return (
    <main className="p-8">
      <meta httpEquiv="refresh" content={`0; url=${target}`} />
      <link rel="canonical" href={target} />
      <p>
        This page moved to <a href={target}>{target}</a>.
      </p>
    </main>
  )
}
