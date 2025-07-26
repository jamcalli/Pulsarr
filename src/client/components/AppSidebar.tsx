'use client'

import {
  AlertCircle,
  Bell,
  BookOpen,
  Bot,
  CheckCircle,
  ChevronRight,
  ChevronsUpDown,
  Film,
  LayoutDashboard,
  LogOut,
  Maximize,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Tv,
  Wrench,
} from 'lucide-react'

import * as React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import pulsarrLogo from '@/assets/images/pulsarr.svg'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useTheme } from '@/components/theme-provider'
import { useSettings } from '@/components/settings-provider'
import { LogoutAlert } from '@/components/ui/logout-alert'
import { UserAvatarSkeleton } from '@/components/ui/user-avatar-skeleton'
import { useConfigStore } from '@/stores/configStore'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

// Navigation data
const data = {
  navMain: [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      title: 'Plex',
      url: '#',
      icon: Monitor,
      items: [
        {
          title: 'Configuration',
          url: '/plex/configuration',
        },
        {
          title: 'Users',
          url: '/plex/users',
        },
      ],
    },
    {
      title: 'Notifications',
      url: '#',
      icon: Bell,
      items: [
        {
          title: 'Discord Notifications',
          url: '/notifications#discord-notifications',
        },
        {
          title: 'Apprise Notifications',
          url: '/notifications#apprise-notifications',
        },
        {
          title: 'Tautulli Notifications',
          url: '/notifications#tautulli-notifications',
        },
        {
          title: 'General Notifications',
          url: '/notifications#general-notifications',
        },
      ],
    },
    {
      title: 'Sonarr',
      url: '#',
      icon: Tv,
      items: [
        {
          title: 'Instances',
          url: '/sonarr/instances',
        },
        {
          title: 'Content Router',
          url: '/sonarr/content-router',
        },
      ],
    },
    {
      title: 'Radarr',
      url: '#',
      icon: Film,
      items: [
        {
          title: 'Instances',
          url: '/radarr/instances',
        },
        {
          title: 'Content Router',
          url: '/radarr/content-router',
        },
      ],
    },
    {
      title: 'Approvals',
      url: '#',
      icon: CheckCircle,
      items: [
        {
          title: 'Approvals',
          url: '/approvals',
        },
        {
          title: 'Approval Settings',
          url: '/approvals/settings',
        },
        {
          title: 'Quota Settings',
          url: '/approvals/quota-settings',
        },
      ],
    },
    {
      title: 'Utilities',
      url: '#',
      icon: Wrench,
      items: [
        {
          title: 'API Keys',
          url: '/utilities/api-keys',
        },
        {
          title: 'Delete Sync',
          url: '/utilities/delete-sync',
        },
        {
          title: 'New User Defaults',
          url: '/utilities/new-user-defaults',
        },
        {
          title: 'Plex Notifications',
          url: '/utilities/plex-notifications',
        },
        {
          title: 'Plex Session Monitoring',
          url: '/utilities/plex-session-monitoring',
        },
        {
          title: 'Public Content Notifications',
          url: '/utilities/public-content-notifications',
        },
        {
          title: 'User Tags',
          url: '/utilities/user-tags',
        },
      ],
    },
  ],
  helpResources: [
    {
      name: 'Documentation',
      url: 'https://jamcalli.github.io/Pulsarr/docs/intro',
      icon: BookOpen,
    },
    {
      name: 'GitHub Repository',
      url: 'https://github.com/jamcalli/Pulsarr',
      icon: Bot,
    },
    {
      name: 'GitHub Issues',
      url: 'https://github.com/jamcalli/Pulsarr/issues',
      icon: AlertCircle,
    },
  ],
}

// Helper function to create default sections state
const createDefaultSections = (
  navItems: typeof data.navMain,
): Record<string, boolean> => {
  const result: Record<string, boolean> = {}
  for (const item of navItems) {
    if (item.items) {
      result[item.title] = false
    }
  }
  return result
}

/**
 * Renders a responsive, collapsible sidebar navigation menu with integrated user controls for theme switching, fullscreen mode, visual effects, and logout.
 *
 * The sidebar features main navigation with optional collapsible sections, external help/resource links, and displays current user information. It highlights the active route or anchor section, persists the open state of collapsible sections, and adapts its layout for mobile and desktop devices. Users can toggle between light and dark themes, enable or disable a desktop-only "asteroids" visual effect, enter or exit fullscreen mode, and log out via a confirmation dialog.
 *
 * @returns The sidebar React component containing navigation, settings, and user controls.
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile, setOpenMobile } = useSidebar()
  const [activeSection, setActiveSection] = React.useState<string>('')
  const { theme, setTheme } = useTheme()
  const {
    asteroidsEnabled,
    setAsteroidsEnabled,
    fullscreenEnabled,
    setFullscreenEnabled,
  } = useSettings()
  const [showLogoutAlert, setShowLogoutAlert] = React.useState(false)
  const { currentUser, currentUserLoading, fetchCurrentUser } = useConfigStore()

  // Memoized default sections to avoid recalculation
  const defaultSections = React.useMemo(
    () => createDefaultSections(data.navMain),
    [],
  )

  // Persistent collapsible state
  const [openSections, setOpenSections] = React.useState<
    Record<string, boolean>
  >(() => {
    try {
      const saved = localStorage.getItem('sidebar-open-sections')
      if (saved) {
        return JSON.parse(saved)
      }
      return defaultSections
    } catch {
      return defaultSections
    }
  })

  // Save to localStorage whenever state changes
  React.useEffect(() => {
    localStorage.setItem('sidebar-open-sections', JSON.stringify(openSections))
  }, [openSections])

  const toggleSection = React.useCallback((title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }))
  }, [])

  const navigate = useNavigate()
  const location = useLocation()

  // Track clicked navigation items for highlighting
  React.useEffect(() => {
    // Clear active section when leaving notifications page
    if (location.pathname !== '/notifications') {
      setActiveSection('')
    }
  }, [location.pathname])

  // Fetch current user data on mount
  React.useEffect(() => {
    fetchCurrentUser()
  }, [fetchCurrentUser])

  // Memoized user avatar fallback to avoid string manipulation on every render
  const userAvatarFallback = React.useMemo(() => {
    return currentUser?.username?.charAt(0).toUpperCase() || '?'
  }, [currentUser?.username])

  // Check if a route is active
  const isActiveRoute = React.useCallback(
    (url: string) => {
      if (url === '#' || !url) return false

      // For anchor links, use tracked active section
      if (url.includes('#')) {
        const [pathname, hash] = url.split('#')

        // Must be on the correct page and have the section selected
        return location.pathname === pathname && activeSection === hash
      }

      // For regular routes, just match pathname
      return location.pathname === url
    },
    [location.pathname, activeSection],
  )

  // Handle navigation with anchor scrolling
  const handleNavigation = React.useCallback(
    (url: string, e: React.MouseEvent) => {
      // Skip empty/hash-only URLs
      if (url === '#' || !url) {
        e.preventDefault()
        return
      }

      // Check if it's an external URL
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // Let the browser handle external links normally (new tab)
        return
      }

      e.preventDefault()

      // Check if URL contains anchor
      const [pathname, hash] = url.split('#')

      if (hash) {
        // Set the active section immediately when clicked
        setActiveSection(hash)

        // If we're already on the target page, just scroll to anchor
        if (location.pathname === pathname) {
          const element = document.getElementById(hash)
          if (element) {
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            })
          }
        } else {
          // Navigate to page then scroll to anchor
          navigate(pathname)
          // Wait for navigation and loading to complete then scroll
          setTimeout(() => {
            const element = document.getElementById(hash)
            if (element) {
              element.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
              })
            }
          }, 600) // Wait for MIN_LOADING_DELAY (500ms) + buffer
        }
      } else {
        // Regular navigation without anchor
        navigate(url)
      }

      // Close mobile sidebar after navigation
      if (isMobile) {
        setOpenMobile(false)
      }
    },
    [navigate, location.pathname, isMobile, setOpenMobile],
  )

  // Memoized navigation items rendering
  const navigationItems = React.useMemo(() => {
    return data.navMain.map((item) =>
      item.items ? (
        <Collapsible
          key={item.title}
          asChild
          open={openSections[item.title]}
          onOpenChange={() => toggleSection(item.title)}
          className="group/collapsible"
        >
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-main data-[state=open]:outline-border data-[state=open]:text-main-foreground"
                tooltip={item.title}
              >
                {item.icon && <item.icon />}
                <span>{item.title}</span>
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {item.items?.map((subItem) => (
                  <SidebarMenuSubItem key={subItem.title}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={isActiveRoute(subItem.url)}
                    >
                      <a
                        href={subItem.url}
                        onClick={(e) => handleNavigation(subItem.url, e)}
                      >
                        <span>{subItem.title}</span>
                      </a>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      ) : (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            asChild
            tooltip={item.title}
            isActive={isActiveRoute(item.url)}
          >
            <a href={item.url} onClick={(e) => handleNavigation(item.url, e)}>
              {item.icon && <item.icon />}
              <span>{item.title}</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ),
    )
  }, [openSections, isActiveRoute, handleNavigation, toggleSection])

  // Memoized help resources rendering
  const helpResourceItems = React.useMemo(() => {
    return data.helpResources.map((item) => (
      <SidebarMenuItem key={item.name}>
        <SidebarMenuButton asChild>
          <a
            href={item.url}
            onClick={(e) => handleNavigation(item.url, e)}
            {...(item.url.startsWith('http') && {
              target: '_blank',
              rel: 'noopener noreferrer',
            })}
          >
            <item.icon />
            <span>{item.name}</span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ))
  }, [handleNavigation])

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader className="border-b-4 border-b-border h-12 flex items-center px-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="focus-visible:ring-0" asChild>
                  <SidebarMenuButton
                    className="data-[state=open]:bg-main data-[state=open]:text-main-foreground data-[state=open]:outline-border data-[state=open]:outline-2 group-data-[state=collapsed]:hover:outline-0 group-data-[state=collapsed]:hover:bg-transparent group-data-[collapsible=icon]:data-[state=open]:bg-transparent group-data-[collapsible=icon]:data-[state=open]:outline-0 overflow-visible"
                    size="sm"
                  >
                    <Avatar
                      className="h-8 w-8"
                      style={{ backgroundColor: '#212121' }}
                    >
                      <AvatarImage
                        src={pulsarrLogo}
                        alt="Pulsarr"
                        className="object-cover"
                      />
                      <AvatarFallback
                        style={{ backgroundColor: '#212121' }}
                        className="text-white"
                      >
                        P
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-base leading-tight">
                      <span className="truncate font-heading">Pulsarr</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-base"
                  align="start"
                  side={isMobile ? 'bottom' : 'right'}
                  sideOffset={4}
                >
                  <DropdownMenuLabel className="text-sm font-heading">
                    Settings
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() =>
                      setTheme(theme === 'dark' ? 'light' : 'dark')
                    }
                  >
                    {theme === 'dark' ? (
                      <Sun className="mr-2 h-4 w-4" />
                    ) : (
                      <Moon className="mr-2 h-4 w-4" />
                    )}
                    <span>Switch theme</span>
                  </DropdownMenuItem>
                  {!isMobile && (
                    <>
                      {!fullscreenEnabled && (
                        <DropdownMenuItem
                          onClick={() => setAsteroidsEnabled(!asteroidsEnabled)}
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          <span>
                            {asteroidsEnabled ? 'Disable' : 'Enable'} asteroids
                          </span>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setFullscreenEnabled(!fullscreenEnabled)}
                      >
                        <Maximize className="mr-2 h-4 w-4" />
                        <span>
                          {fullscreenEnabled ? 'Exit' : 'Enter'} fullscreen
                        </span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Application</SidebarGroupLabel>
            <SidebarMenu>{navigationItems}</SidebarMenu>
          </SidebarGroup>
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Help & Resources</SidebarGroupLabel>
            <SidebarMenu>{helpResourceItems}</SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              {currentUserLoading ? (
                <SidebarMenuButton size="lg" disabled>
                  <UserAvatarSkeleton size="lg" />
                  <ChevronsUpDown className="ml-auto size-4 opacity-50" />
                </SidebarMenuButton>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      className="group-data-[state=collapsed]:hover:outline-0 group-data-[state=collapsed]:hover:bg-transparent overflow-visible"
                      size="lg"
                    >
                      <Avatar
                        className="h-8 w-8"
                        style={{ backgroundColor: '#212121' }}
                      >
                        {currentUser?.avatar && (
                          <AvatarImage
                            src={currentUser.avatar}
                            alt={currentUser.username || 'User'}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback
                          style={{ backgroundColor: '#212121' }}
                          className="text-white"
                        >
                          {userAvatarFallback}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-heading">
                          {currentUser?.username || 'Unknown User'}
                        </span>
                        <span className="truncate text-xs">
                          {currentUser?.email || ''}
                        </span>
                      </div>
                      <ChevronsUpDown className="ml-auto size-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                    side={isMobile ? 'bottom' : 'right'}
                    align="end"
                    sideOffset={4}
                  >
                    <DropdownMenuLabel className="p-0 font-base">
                      <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                        <Avatar
                          className="h-8 w-8"
                          style={{ backgroundColor: '#212121' }}
                        >
                          {currentUser?.avatar && (
                            <AvatarImage
                              src={currentUser.avatar}
                              alt={currentUser.username || 'User'}
                              className="object-cover"
                            />
                          )}
                          <AvatarFallback
                            style={{ backgroundColor: '#212121' }}
                            className="text-white"
                          >
                            {userAvatarFallback}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-heading">
                            {currentUser?.username || 'Unknown User'}
                          </span>
                          <span className="truncate text-xs">
                            {currentUser?.email || ''}
                          </span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setShowLogoutAlert(true)}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <LogoutAlert open={showLogoutAlert} onOpenChange={setShowLogoutAlert} />
    </>
  )
}
