import { Settings, LogOut, Moon, Sun, Sparkles } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { useSettings } from '@/components/settings-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useState } from 'react'
import { LogoutAlert } from '@/components/ui/logout-alert'

interface SettingsButtonProps {
  isMobile?: boolean
}

export function SettingsButton({ isMobile = false }: SettingsButtonProps) {
  const { theme, setTheme } = useTheme()
  const { asteroidsEnabled, setAsteroidsEnabled } = useSettings()
  const [showLogoutAlert, setShowLogoutAlert] = useState(false)

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <DropdownMenu>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                {isMobile ? (
                  <div className="cursor-pointer">
                    <Settings className="stroke-black h-6 w-6" />
                    <span className="sr-only">Settings</span>
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-main text-black cursor-pointer">
                    <Settings className="stroke-current h-6 w-6" />
                    <span className="sr-only">Settings</span>
                  </div>
                )}
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side={isMobile ? "bottom" : "left"}>
              <p>Settings</p>
            </TooltipContent>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? (
                  <Sun className="mr-2 h-4 w-4" />
                ) : (
                  <Moon className="mr-2 h-4 w-4" />
                )}
                <span>Switch theme</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAsteroidsEnabled(!asteroidsEnabled)}>
                <Sparkles className="mr-2 h-4 w-4" />
                <span>{asteroidsEnabled ? 'Disable' : 'Enable'} asteroids</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowLogoutAlert(true)}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </TooltipProvider>

      <LogoutAlert 
        open={showLogoutAlert}
        onOpenChange={setShowLogoutAlert}
      />
    </>
  )
}