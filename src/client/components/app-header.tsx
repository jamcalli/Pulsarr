import { BookOpen, Maximize2, Minimize2 } from 'lucide-react'
import { Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button, buttonVariants } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useSettings } from '@/hooks/useSettings'
import { breadcrumbFor, DOCS_URL } from '@/lib/navigation'

export function AppHeader() {
  const location = useLocation()
  const crumbs = breadcrumbFor(location.pathname, location.hash)
  const { fullscreenEnabled, setFullscreenEnabled } = useSettings()
  const frameLabel = fullscreenEnabled ? 'Windowed' : 'Full screen'

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b-2 border-border bg-card px-4 md:pr-6 md:pl-8">
      <SidebarTrigger className="md:hidden" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="text-base">
          {crumbs.map((crumb, index) => (
            <Fragment key={crumb}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem
                className={
                  index === 0 ? 'font-medium text-foreground' : undefined
                }
              >
                {index === crumbs.length - 1 ? (
                  <BreadcrumbPage
                    className={
                      index === 0 ? 'font-medium' : 'text-muted-foreground'
                    }
                  >
                    {crumb}
                  </BreadcrumbPage>
                ) : (
                  crumb
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <ThemeToggle />
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={() => setFullscreenEnabled(!fullscreenEnabled)}
      >
        {fullscreenEnabled ? (
          <Minimize2 aria-hidden="true" />
        ) : (
          <Maximize2 aria-hidden="true" />
        )}
        <span className="sr-only">{frameLabel}</span>
      </Button>
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <BookOpen aria-hidden="true" />
        <span className="sr-only">Documentation</span>
      </a>
    </header>
  )
}
