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
        <div className="border border-gray-300 grid w-full max-w-6xl mb-10 grid-cols-1 rounded-lg shadow-lg">
          <header className="border-b border-gray-300 relative flex items-center justify-center bg-gray-100 dark:bg-gray-800 h-[60px] w-full">
            <h2 className="whitespace-nowrap font-bold text-2xl tracking-wider text-black dark:text-white">
              {title}
            </h2>
          </header>
          <main className="flex flex-col font-semibold p-6 bg-white dark:bg-gray-900 min-h-[200px]">
            <div className="flex-1">{children}</div>
          </main>
        </div>
      }
    >
      {() => {
        const { ScrollArea } = require('@/client/components/ui/scroll-area')
        const { useMediaQuery } = require('@/client/hooks/use-media-query')

        const ClientDocFeature = () => {
          const isMobile = useMediaQuery('(max-width: 768px)')

          return (
            <div
              className={`outline-border dark:outline-darkBorder grid w-full max-w-6xl mb-10
                ${isMobile ? 'grid-cols-1' : 'grid-cols-[100px_auto]'}
                rounded-base shadow-[10px_10px_0_0_#000] outline outline-4 ${className}`}
              style={{ minHeight: isMobile ? 'auto' : '300px', height: 'auto' }}
            >
              {/* Side title - always visible */}
              <header
                className={`border-r-border dark:border-r-darkBorder relative flex items-center justify-center bg-main
                  ${
                    isMobile
                      ? 'rounded-t-base border-r-0 border-b-4 h-[50px] border-b-border dark:border-b-darkBorder w-full'
                      : 'rounded-l-base border-r-4'
                  }`}
              >
                {/* Title - vertical in desktop, horizontal in mobile */}
                <h2
                  className={`whitespace-nowrap font-bold
                    ${
                      isMobile
                        ? 'rotate-0 text-[24px] tracking-[2px]'
                        : '-rotate-90 text-[28px] tracking-[3px]'
                    } ${titleClassName}`}
                >
                  <span className="inline-block text-black dark:text-white">
                    {title}
                  </span>
                </h2>
              </header>

              {/* Main content area */}
              <main
                className={`flex flex-col font-semibold p-6 bg-bg
                  ${
                    isMobile
                      ? 'min-h-[200px] rounded-b-base'
                      : 'min-h-[300px] rounded-br-base rounded-tr-base'
                  }`}
              >
                <ScrollArea className="flex-1">{children}</ScrollArea>
              </main>
            </div>
          )
        }

        return <ClientDocFeature />
      }}
    </BrowserOnly>
  )
}
