import {
  ChevronsUpDown,
  LogOut,
  Moon,
  Rocket,
  Sun,
  UserCog,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOutDialog } from '@/components/sidebar/log-out-dialog'
import {
  DropdownMenu,
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
import { UserAvatar, UserAvatarSkeleton } from '@/components/user-avatar'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useTheme } from '@/hooks/useTheme'
import { useSetupStore } from '@/stores/setupStore'

function UserSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <UserAvatarSkeleton />
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
  const { setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const [logOutOpen, setLogOutOpen] = useState(false)
  const requestSetup = useSetupStore((state) => state.request)

  if (isLoading) return <UserSkeleton />

  const user = data?.user
  const name = user?.username ?? 'Unknown user'
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              className="text-foreground aria-expanded:bg-accent"
            />
          }
        >
          <UserAvatar name={name} avatar={user?.avatar} />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{name}</span>
            {user?.email && (
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            )}
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
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
          <DropdownMenuItem
            onClick={() => {
              setOpenMobile(false)
              requestSetup()
            }}
          >
            <Rocket />
            Run setup
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
