import type { ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useSettings } from '@/components/settings-provider'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'

interface WindowedLayoutProps {
  children: ReactNode
}

/**
 * Renders a responsive layout that switches between mobile and desktop designs, adapting navigation and content areas based on screen size and fullscreen settings.
 *
 * On mobile devices (≤768px), displays a fixed full-screen layout with a top header and slide-out sidebar navigation. On desktop, presents either a windowed or fullscreen two-column layout with a vertical sidebar, persistent navigation, and a scrollable main content area, depending on the fullscreen setting.
 *
 * @param children - The main content to display within the layout.
 */
export default function WindowedLayout({ children }: WindowedLayoutProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { fullscreenEnabled } = useSettings()

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="grid grid-cols-1 w-full h-screen max-h-screen rounded-none shadow-none outline-0 fixed inset-0 z-40">
        <SidebarProvider>
          <AppSidebar />
          {/* Header - always visible */}
          <header className="rounded-none border-r-0 border-b-4 h-[50px] border-b-border dark:border-b-darkBorder fixed top-0 left-0 w-full z-50 bg-main flex items-center justify-center">
            {/* Mobile Menu Button */}
            <SidebarTrigger className="absolute left-3 top-1/2 -translate-y-1/2" />

            {/* Title */}
            <h1 className="whitespace-nowrap font-bold rotate-0 text-[30px] tracking-[2px]">
              <span className="text-black inline-block">Pulsarr</span>
            </h1>
          </header>

          {/* Main content area */}
          <main className="bg-background relative flex flex-col h-screen pt-[50px] w-full">
            <ScrollArea className="flex-1 w-full">
              <div className="pb-32 w-full">{children}</div>
            </ScrollArea>
          </main>
        </SidebarProvider>
      </div>
    )
  }

  // Desktop Layout - Windowed or Fullscreen
  const containerClass = fullscreenEnabled
    ? 'grid grid-cols-[auto] h-screen w-screen'
    : 'outline-border grid grid-cols-[80px_auto] h-[90vh] w-[98vw] max-w-[1600px] rounded-base shadow-[10px_10px_0_0_#000] outline-4'

  const headerClass =
    'border-r-border relative flex items-center justify-center bg-main rounded-l-base border-r-4'

  const mainClass = fullscreenEnabled
    ? 'bg-background relative flex h-screen overflow-hidden min-h-0'
    : 'bg-background relative flex h-[90vh] rounded-br-base rounded-tr-base overflow-hidden min-h-0'

  return (
    <div className={containerClass}>
      {/* Header - Desktop mode - only show when not in fullscreen */}
      {!fullscreenEnabled && (
        <header className={headerClass}>
          {/* Title */}
          <h1 className="whitespace-nowrap font-bold -rotate-90 text-[40px] tracking-[4px]">
            <span className="text-black inline-block">Pulsarr</span>
          </h1>
        </header>
      )}

      {/* Main content area with sidebar */}
      <main className={mainClass}>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="bg-background">
            <header className="flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 bg-main border-b-4 border-b-border">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
              </div>
            </header>
            <div className="flex flex-1 flex-col min-h-0">
              <ScrollArea className="flex-1">{children}</ScrollArea>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </main>
    </div>
  )
}
