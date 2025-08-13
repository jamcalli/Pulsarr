import React from 'react'
import BrowserOnly from '@docusaurus/BrowserOnly'

interface DocFeatureProps {
  title: string
  children: React.ReactNode
  className?: string
  titleClassName?: string
}

/**
 * DocFeature is a component for displaying feature information in the docs
 * using the same visual style as the main app's windowed layout.
 */
export default function DocFeature({
  title,
  children,
  className = '',
  titleClassName = '',
}: DocFeatureProps) {
  return (
    <BrowserOnly
      fallback={
        <div className="border border-gray-300 grid w-full max-w-6xl grid-cols-1 rounded-lg shadow-lg">
          <header className="border-b border-gray-300 relative flex items-center justify-center bg-gray-100 dark:bg-gray-800 h-[60px] w-full docfeature-header">
            <h2 className="whitespace-nowrap font-bold text-2xl tracking-wider text-black dark:text-white">
              {title}
            </h2>
          </header>
          <main className="flex flex-col font-semibold p-6 bg-white dark:bg-gray-900 min-h-[200px]">
            <div className="flex-1 docfeature-content">{children}</div>
          </main>
        </div>
      }
    >
      {() => {
        const { ScrollArea: _ } = require('@/client/components/ui/scroll-area')
        const { useMediaQuery } = require('@/client/hooks/use-media-query')

        const ClientDocFeature = () => {
          const _isMobile = useMediaQuery('(max-width: 640px)')

          return (
            <div
              className={`outline-border dark:outline-darkBorder w-full max-w-6xl h-full flex flex-col
                rounded-base shadow-[10px_10px_0_0_#000] outline outline-4 ${className}`}
            >
              {/* Simple header like other cards */}
              <header
                className="border-b-border dark:border-b-darkBorder relative flex items-center justify-center bg-main
                  rounded-t-base border-b-4 h-[60px] w-full docfeature-header"
              >
                <h2
                  className={`whitespace-nowrap font-bold text-[24px] tracking-[2px] ${titleClassName}`}
                >
                  <span className="inline-block text-black dark:text-white">
                    {title}
                  </span>
                </h2>
              </header>

              {/* Main content area */}
              <main className="flex flex-col font-semibold p-6 bg-background rounded-b-base flex-1">
                <div className="flex-1 docfeature-content">{children}</div>
              </main>
            </div>
          )
        }

        return <ClientDocFeature />
      }}
    </BrowserOnly>
  )
}
