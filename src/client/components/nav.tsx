import { FileText } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { SettingsButton } from '@/components/ui/settings-button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DOCUMENTATION_URL } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface NavProps {
  isMobile: boolean
  className?: string
  onNavItemClick?: () => void
}

/**
 * Renders a responsive navigation menu with layouts tailored for mobile and desktop screens.
 *
 * Displays navigation links for Dashboard, Notifications, Utilities, Plex, Sonarr, and Radarr, highlighting the active route. In mobile view, links are arranged vertically and can trigger an optional callback when clicked. In desktop view, links are arranged in a grid with a documentation link and a settings button in a dedicated column.
 *
 * @param isMobile - If true, renders the mobile navigation layout; otherwise, renders the desktop layout.
 * @param className - Optional additional CSS classes for the navigation container.
 * @param onNavItemClick - Optional callback invoked when a navigation link is clicked in mobile view.
 */
export default function Nav({ isMobile, className, onNavItemClick }: NavProps) {
  const location = useLocation()

  // Mobile navigation - list of links with outline selection
  if (isMobile) {
    return (
      <nav className={cn('flex flex-col h-full w-full', className)}>
        <div className="p-4 text-2xl font-bold text-foreground">Navigation</div>
        {/* Added overflow-y-auto to enable scrolling when content exceeds height */}
        <div className="flex flex-col overflow-y-auto">
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/dashboard'
                ? 'text-black font-bold border-2 border-border bg-main'
                : 'text-foreground',
            )}
            to="/dashboard"
            onClick={onNavItemClick}
          >
            Dashboard
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/notifications'
                ? 'text-black font-bold border-2 border-border bg-main'
                : 'text-foreground',
            )}
            to="/notifications"
            onClick={onNavItemClick}
          >
            Notifications
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/utilities'
                ? 'text-black font-bold border-2 border-border bg-main'
                : 'text-foreground',
            )}
            to="/utilities"
            onClick={onNavItemClick}
          >
            Utilities
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/plex'
                ? 'text-black font-bold border-2 border-border bg-main'
                : 'text-foreground',
            )}
            to="/plex"
            onClick={onNavItemClick}
          >
            Plex
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/sonarr'
                ? 'text-black font-bold border-2 border-border bg-main'
                : 'text-foreground',
            )}
            to="/sonarr"
            onClick={onNavItemClick}
          >
            Sonarr
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/radarr'
                ? 'text-black font-bold border-2 border-border bg-main'
                : 'text-foreground',
            )}
            to="/radarr"
            onClick={onNavItemClick}
          >
            Radarr
          </Link>
        </div>
      </nav>
    )
  }

  // Desktop navigation - grid layout (unchanged)
  return (
    <nav
      className={cn(
        'flex flex-col h-[100px] rounded-tr-base bg-black text-lg',
        className,
      )}
    >
      {/* Grid container with settings button taking up right column */}
      <div className="grid h-full grid-cols-[1fr_1fr_1fr_50px]">
        {/* Left content container - takes up all but the settings column */}
        <div className="col-span-3 flex flex-col">
          {/* Top row */}
          <div className="grid h-[50px] grid-cols-3 border-b-4 border-b-border dark:border-b-darkBorder">
            <Link
              className={
                location.pathname === '/dashboard'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-black bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border'
              }
              to="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className={
                location.pathname === '/notifications'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-black bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border'
              }
              to="/notifications"
            >
              Notifications
            </Link>
            <Link
              className={
                location.pathname === '/utilities'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-black bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border'
              }
              to="/utilities"
            >
              Utilities
            </Link>
          </div>

          {/* Bottom row */}
          <div className="grid h-[50px] grid-cols-3 border-b-4 border-b-border dark:border-b-darkBorder">
            <Link
              className={
                location.pathname === '/plex'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-black bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border'
              }
              to="/plex"
            >
              Plex
            </Link>
            <Link
              className={
                location.pathname === '/sonarr'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-black bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border'
              }
              to="/sonarr"
            >
              Sonarr
            </Link>
            <Link
              className={
                location.pathname === '/radarr'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-black bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border'
              }
              to="/radarr"
            >
              Radarr
            </Link>
          </div>
        </div>

        {/* Settings and docs column spans both rows */}
        <div className="row-span-2 h-full flex flex-col">
          {/* Documentation link - top half */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={DOCUMENTATION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-[50px] w-full items-center justify-center bg-main text-black cursor-pointer border-b-4 border-b-border dark:border-b-darkBorder rounded-tr-base"
                  aria-label="Documentation"
                >
                  <FileText className="stroke-current h-6 w-6" />
                  <span className="sr-only">Documentation</span>
                </a>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Documentation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {/* Settings button - bottom half */}
          <div className="h-[50px] border-b-4 border-b-border dark:border-b-darkBorder">
            <SettingsButton />
          </div>
        </div>
      </div>
    </nav>
  )
}
