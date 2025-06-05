import type { ReactNode } from 'react'
import Nav from '@/components/nav'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Menu, FileText } from 'lucide-react'
import { SettingsButton } from '@/components/ui/settings-button'
import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'

interface WindowedLayoutProps {
  children: ReactNode
}

export default function WindowedLayout({ children }: WindowedLayoutProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [sheetOpen, setSheetOpen] = useState(false)

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="grid grid-cols-1 w-full h-screen max-h-screen rounded-none shadow-none outline-0 fixed inset-0 z-40">
        {/* Header - always visible */}
        <header className="rounded-none border-r-0 border-b-4 h-[50px] border-b-border dark:border-b-darkBorder fixed top-0 left-0 w-full z-50 bg-main flex items-center justify-center">
          {/* Mobile Menu Button */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2"
              >
                <Menu className="stroke-black h-6 w-6" />
                <span className="sr-only">Menu</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <Nav isMobile={true} onNavItemClick={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Title */}
          <h1 className="whitespace-nowrap font-bold rotate-0 text-[30px] tracking-[2px]">
            <span className="text-black inline-block">Pulsarr</span>
          </h1>

          {/* Mobile Settings and Docs Buttons */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3">
            <a
              href="https://jamcalli.github.io/Pulsarr/docs/intro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-black"
              aria-label="Documentation"
            >
              <FileText className="stroke-current h-6 w-6" />
            </a>
            <SettingsButton isMobile={true} />
          </div>
        </header>

        {/* Main content area */}
        <main className="dark:bg-darkBg relative flex flex-col bg-bg font-semibold h-screen pt-[50px]">
          <ScrollArea className="flex-1">
            <div className="pb-32">{children}</div>
          </ScrollArea>
        </main>
      </div>
    )
  }

  // Desktop Windowed Layout
  return (
    <div className="outline-border dark:outline-darkBorder grid grid-cols-[100px_auto] h-[90vh] w-[95vw] max-w-[1400px] rounded-base shadow-[10px_10px_0_0_#000] outline outline-4">
      {/* Header - Desktop windowed mode */}
      <header className="border-r-border dark:border-r-darkBorder relative flex items-center justify-center bg-main rounded-l-base border-r-4">
        {/* Title */}
        <h1 className="whitespace-nowrap font-bold -rotate-90 text-[40px] tracking-[4px]">
          <span className="text-black inline-block">Pulsarr</span>
        </h1>
      </header>

      {/* Main content area */}
      <main className="dark:bg-darkBg relative flex flex-col bg-bg font-semibold h-[90vh] rounded-br-base rounded-tr-base">
        <Nav isMobile={false} />
        <ScrollArea className="flex-1">{children}</ScrollArea>
      </main>
    </div>
  )
}
