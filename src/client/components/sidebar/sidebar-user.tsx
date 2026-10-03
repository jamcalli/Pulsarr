import {
  ChevronsUpDown,
  LogOut,
  Maximize2,
  Minimize2,
  Moon,
  Sparkles,
  Sun,
  UserCog,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOutDialog } from '@/components/sidebar/log-out-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useSettings } from '@/hooks/useSettings'
import { useTheme } from '@/hooks/useTheme'

function UserSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

export function SidebarUser() {
  const { data, isLoading } = useCurrentUser()
  const { theme, setTheme } = useTheme()
  const {
    asteroidsEnabled,
    setAsteroidsEnabled,
    fullscreenEnabled,
    setFullscreenEnabled,
  } = useSettings()
  const { isMobile, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const [logOutOpen, setLogOutOpen] = useState(false)

  if (isLoading) return <UserSkeleton />

  const user = data?.user
  const name = user?.username ?? 'Unknown user'
  const initial = name.charAt(0).toUpperCase()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              className="text-foreground aria-expanded:bg-chip"
            />
          }
        >
          <Avatar>
            {user?.avatar && <AvatarImage src={user.avatar} alt="" />}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{name}</span>
            {user?.email && (
              <span className="truncate text-xs text-muted">{user.email}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-70 max-w-(--available-width)"
        >
          <DropdownMenuItem
            onClick={() => {
              setOpenMobile(false)
              navigate('/account')
            }}
          >
            <UserCog />
            Account settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Display</DropdownMenuLabel>
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => setTheme(nextTheme)}
            >
              {nextTheme === 'light' ? <Sun /> : <Moon />}
              Switch to {nextTheme} theme
            </DropdownMenuItem>
            {!isMobile && !fullscreenEnabled && (
              <DropdownMenuCheckboxItem
                checked={asteroidsEnabled}
                onCheckedChange={setAsteroidsEnabled}
              >
                <Sparkles />
                Asteroids
              </DropdownMenuCheckboxItem>
            )}
            {!isMobile && (
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => setFullscreenEnabled(!fullscreenEnabled)}
              >
                {fullscreenEnabled ? <Minimize2 /> : <Maximize2 />}
                {fullscreenEnabled ? 'Windowed' : 'Full screen'}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLogOutOpen(true)}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LogOutDialog open={logOutOpen} onOpenChange={setLogOutOpen} />
    </SidebarMenuItem>
  )
}
