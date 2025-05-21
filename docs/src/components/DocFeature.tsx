import React from 'react'
import { ScrollArea } from '@/client/components/ui/scroll-area'
import { useMediaQuery } from '@/client/hooks/use-media-query'

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
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div
      className={`outline-border dark:outline-darkBorder grid w-full max-w-6xl mb-10
        ${
          isMobile
            ? 'grid-cols-1 rounded-none shadow-none outline-0'
            : 'grid-cols-[100px_auto] rounded-base shadow-[10px_10px_0_0_#000] outline outline-4'
        } ${className}`}
      style={{ minHeight: isMobile ? 'auto' : '300px', height: 'auto' }}
    >
      {/* Side title - always visible */}
      <header
        className={`border-r-border dark:border-r-darkBorder relative flex items-center justify-center bg-main
          ${
            isMobile
              ? 'rounded-none border-r-0 border-b-4 h-[50px] border-b-border dark:border-b-darkBorder w-full'
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
              ? 'min-h-[200px]'
              : 'min-h-[300px] rounded-br-base rounded-tr-base'
          }`}
      >
        <ScrollArea className="flex-1">{children}</ScrollArea>
      </main>
    </div>
  )
}
