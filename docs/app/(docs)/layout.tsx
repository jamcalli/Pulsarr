import type { LayoutTab } from '@fumadocs/base-ui/layouts/shared'
import { DocsLayout } from '@fumadocs/base-ui/layouts/spacious'
import type { ReactNode } from 'react'
import { baseOptions } from '@/lib/layout.shared'
import { source } from '@/lib/source'

const apiRoute = '/api'

const tabs: LayoutTab[] = [
  {
    title: 'Guide',
    url: '/',
    urls: new Set(
      source
        .getPages()
        .map((page) => page.url)
        .filter((url) => !url.startsWith(apiRoute)),
    ),
  },
  { title: 'API reference', url: apiRoute },
]

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} tabs={tabs} {...baseOptions()}>
      {children}
    </DocsLayout>
  )
}
