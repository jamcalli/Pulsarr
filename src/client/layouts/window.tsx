import type { ReactNode } from 'react'
import Nav from '@/components/nav'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Menu } from 'lucide-react'
import { SettingsButton } from '@/components/ui/settings-button'
import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

interface WindowedLayoutProps {
  children: ReactNode
}

export default function WindowedLayout({ children }: WindowedLayoutProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div
      className={`outline-border dark:outline-darkBorder grid h-[800px] max-h-[100dvh] w-[95%] max-w-6xl 
      ${
        isMobile
          ? 'grid-cols-1 w-full h-screen max-h-screen rounded-none shadow-none outline-0'
          : 'grid-cols-[100px_auto] rounded-base shadow-[10px_10px_0_0_#000] outline outline-4'
      }`}
    >
      {/* Header - always visible */}
      <header
        className={`border-r-border dark:border-r-darkBorder relative flex items-center justify-center bg-main
        ${
          isMobile
            ? 'rounded-none border-r-0 border-b-4 h-[50px] border-b-border dark:border-b-darkBorder fixed top-0 left-0 w-full z-50'
            : 'rounded-l-base border-r-4'
        }`}
      >
        {/* Mobile Menu Button */}
        {isMobile && (
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2"
              >
                <Menu className="stroke-text h-6 w-6" />
                <span className="sr-only">Menu</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left">
              <Nav isMobile={true} onNavItemClick={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>
        )}

        {/* Title */}
        <h1
          className={`whitespace-nowrap font-bold
          ${isMobile ? 'rotate-0 text-[30px] tracking-[2px]' : '-rotate-90 text-[40px] tracking-[4px]'}`}
        >
          <span className="text-text inline-block">Pulsarr</span>
        </h1>

        {/* Mobile Settings Button */}
        {isMobile && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <SettingsButton isMobile={true} />
          </div>
        )}
      </header>

      {/* Main content area */}
      <main
        className={`dark:bg-darkBg relative flex flex-col bg-bg font-semibold
        ${isMobile ? 'h-screen' : 'h-[800px] max-h-[100dvh] rounded-br-base rounded-tr-base'}`}
      >
        {/* Only show Nav in desktop mode */}
        {!isMobile && <Nav isMobile={false} />}

        <ScrollArea className="flex-1">{children}</ScrollArea>
      </main>
    </div>
  )
}
