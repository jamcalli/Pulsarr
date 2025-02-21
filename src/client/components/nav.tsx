import { Link, useLocation } from 'react-router-dom'
import { SettingsButton } from '@/components/ui/settings-button'

export default function Nav() {
  const location = useLocation()
  return (
    <nav className="border-b-border dark:border-b-darkBorder flex flex-col h-[100px] rounded-tr-base border-b-4 bg-black text-xl w600:text-lg w400:h-20 w400:text-base portrait:rounded-none portrait:mt-[50px]">
      <div className="grid h-[50px] grid-cols-[1fr_1fr_50px] border-b-4 border-b-border dark:border-b-darkBorder">
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
            location.pathname === '/app/dashboard/notifications'
              ? 'bg-black text-white flex h-full items-center justify-center uppercase'
              : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
          }
          to="/app/dashboard/notifications"
        >
          Notifications
        </Link>
        <SettingsButton />
      </div>
      <div className="grid h-[50px] grid-cols-3">
        <Link
          className={
            location.pathname === '/app/dashboard/plex'
              ? 'bg-black text-white flex h-full items-center justify-center uppercase'
              : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
          }
          to="/app/dashboard/plex"
        >
          Plex
        </Link>
        <Link
          className={
            location.pathname === '/app/dashboard/sonarr'
              ? 'bg-black text-white flex h-full items-center justify-center uppercase'
              : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-4 border-r-border dark:border-r-darkBorder'
          }
          to="/app/dashboard/sonarr"
        >
          Sonarr
        </Link>
        <Link
          className={
            location.pathname === '/app/dashboard/radarr'
              ? 'bg-black text-white flex h-full items-center justify-center uppercase'
              : 'text-text bg-main flex h-full items-center justify-center uppercase border-r-0 border-r-border dark:border-r-darkBorder'
          }
          to="/app/dashboard/radarr"
        >
          Radarr
        </Link>
      </div>
    </nav>
  )
}