import { ArrowUpRight, CircleHelp } from 'lucide-react'
import { Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { breadcrumbFor, HELP_LINKS } from '@/lib/navigation'
import { useBreadcrumbStore } from '@/stores/breadcrumbStore'

export function AppHeader() {
  const location = useLocation()
  const tail = useBreadcrumbStore((state) => state.tail)
  const sectionCrumbs = breadcrumbFor(location.pathname, location.hash)
  const crumbs = tail ? [...sectionCrumbs, { label: tail }] : sectionCrumbs

  return (
    <header
      data-slot="app-header"
      className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b-2 border-border bg-card px-4 md:pr-6 md:pl-8"
    >
      <SidebarTrigger className="md:hidden" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="text-base">
          {crumbs.map((crumb, index) => (
            <Fragment key={crumb.label}>
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
                    {crumb.label}
                  </BreadcrumbPage>
                ) : crumb.to ? (
                  <BreadcrumbLink render={<Link to={crumb.to} />}>
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  crumb.label
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
          <CircleHelp aria-hidden="true" />
          <span className="sr-only">Help</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-52 max-w-(--available-width)"
        >
          {HELP_LINKS.map(({ label, href, icon: Icon }) => (
            <DropdownMenuItem
              key={href}
              render={
                <a href={href} target="_blank" rel="noopener noreferrer" />
              }
            >
              <Icon />
              {label}
              <ArrowUpRight
                className="ml-auto text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">(opens in a new tab)</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
