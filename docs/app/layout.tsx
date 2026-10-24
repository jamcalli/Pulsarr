import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Provider } from '@/components/provider'
import { appName, isPreview, siteOpenGraph, siteOrigin } from '@/lib/shared'
import '@/styles/docs.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { template: `%s | ${appName}`, default: appName },
  openGraph: siteOpenGraph,
  robots: isPreview ? { index: false, follow: false } : undefined,
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
