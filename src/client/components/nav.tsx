import { Link, useLocation } from 'react-router-dom'
import { SettingsButton } from '@/components/ui/settings-button'
import { cn } from '@/lib/utils'

interface NavProps {
  isMobile: boolean
  className?: string
  onNavItemClick?: () => void
}

export default function Nav({ isMobile, className, onNavItemClick }: NavProps) {
  const location = useLocation()

  // Mobile navigation - list of links with outline selection
  if (isMobile) {
    return (
      <nav className={cn('flex flex-col h-full w-full', className)}>
        <div className="p-4 text-2xl font-bold text-text">Navigation</div>
        <div className="flex flex-col">
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/app/dashboard'
                ? 'text-text font-bold border-2 border-border bg-main'
                : 'text-text',
            )}
            to="/app/dashboard"
            onClick={onNavItemClick}
          >
            Dashboard
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/app/notifications'
                ? 'text-text font-bold border-2 border-border bg-main'
                : 'text-text',
            )}
            to="/app/notifications"
            onClick={onNavItemClick}
          >
            Notifications
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/app/utilities'
                ? 'text-text font-bold border-2 border-border bg-main'
                : 'text-text',
            )}
            to="/app/utilities"
            onClick={onNavItemClick}
          >
            Utilities
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/app/plex'
                ? 'text-text font-bold border-2 border-border bg-main'
                : 'text-text',
            )}
            to="/app/plex"
            onClick={onNavItemClick}
          >
            Plex
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/app/sonarr'
                ? 'text-text font-bold border-2 border-border bg-main'
                : 'text-text',
            )}
            to="/app/sonarr"
            onClick={onNavItemClick}
          >
            Sonarr
          </Link>
          <Link
            className={cn(
              'p-4 flex items-center text-lg m-2 rounded-base',
              location.pathname === '/app/radarr'
                ? 'text-text font-bold border-2 border-border bg-main'
                : 'text-text',
            )}
            to="/app/radarr"
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
                location.pathname === '/app/dashboard'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
              }
              to="/app/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className={
                location.pathname === '/app/notifications'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
              }
              to="/app/notifications"
            >
              Notifications
            </Link>
            <Link
              className={
                location.pathname === '/app/utilities'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
              }
              to="/app/utilities"
            >
              Utilities
            </Link>
          </div>

          {/* Bottom row */}
          <div className="grid h-[50px] grid-cols-3 border-b-4 border-b-border dark:border-b-darkBorder">
            <Link
              className={
                location.pathname === '/app/plex'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
              }
              to="/app/plex"
            >
              Plex
            </Link>
            <Link
              className={
                location.pathname === '/app/sonarr'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
              }
              to="/app/sonarr"
            >
              Sonarr
            </Link>
            <Link
              className={
                location.pathname === '/app/radarr'
                  ? 'bg-black text-white flex h-full items-center justify-center uppercase'
                  : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
              }
              to="/app/radarr"
            >
              Radarr
            </Link>
          </div>
        </div>

        {/* Settings button column spans both rows */}
        <div className="row-span-2 h-full border-b-4 border-b-border dark:border-b-darkBorder">
          <SettingsButton />
        </div>
      </div>
    </nav>
  )
}
