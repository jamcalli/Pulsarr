import { Link, useLocation } from 'react-router-dom'
import { SettingsButton } from '@/components/ui/settings-button'
import { cn } from '@/lib/utils'

interface NavProps {
  className?: string
}

export default function Nav({ className }: NavProps) {
  const location = useLocation()
  return (
    <nav
      className={cn(
        'flex flex-col h-[100px] rounded-tr-base bg-black text-lg w600:text-base w400:h-20 w400:text-sm portrait:rounded-none',
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
