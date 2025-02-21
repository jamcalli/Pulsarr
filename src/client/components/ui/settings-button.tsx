import { Settings, LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useState } from 'react'
import { LogoutAlert } from '@/components/ui/logout-alert'

export function SettingsButton() {
  const { theme, setTheme } = useTheme()
  const [showLogoutAlert, setShowLogoutAlert] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex h-full w-full items-center justify-center bg-main rounded-tr-base portrait:rounded-none cursor-pointer">
            <Settings className="stroke-text h-6 w-6 scale-130" />
            <span className="sr-only">Settings</span>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            <span>Switch theme</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShowLogoutAlert(true)}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LogoutAlert 
        open={showLogoutAlert}
        onOpenChange={setShowLogoutAlert}
      />
    </>
  )
}