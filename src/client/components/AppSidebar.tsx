'use client'

import {
  AlertCircle,
  AudioWaveform,
  BadgeCheck,
  Bell,
  BookOpen,
  Bot,
  CheckCircle,
  ChevronRight,
  ChevronsUpDown,
  Command,
  CreditCard,
  Film,
  Folder,
  Forward,
  Frame,
  GalleryVerticalEnd,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Monitor,
  MoreHorizontal,
  PieChart,
  Plus,
  Settings,
  Settings2,
  Sparkles,
  SquareTerminal,
  Trash2,
  Tv,
  Users,
  Wrench,
} from 'lucide-react'

import * as React from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

// This is sample data.
const data = {
  user: {
    name: 'shadcn',
    email: 'm@example.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'Acme Inc',
      logo: GalleryVerticalEnd,
      plan: 'Enterprise',
    },
    {
      name: 'Acme Corp.',
      logo: AudioWaveform,
      plan: 'Startup',
    },
    {
      name: 'Evil Corp.',
      logo: Command,
      plan: 'Free',
    },
  ],
  navMain: [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: LayoutDashboard,
      isActive: true,
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar()
  const [activeTeam, setActiveTeam] = React.useState(data.teams[0])
  const [activeSection, setActiveSection] = React.useState<string>('')

  // Persistent collapsible state
  const [openSections, setOpenSections] = React.useState<
    Record<string, boolean>
  >(() => {
    try {
      const saved = localStorage.getItem('sidebar-open-sections')
      if (saved) {
        return JSON.parse(saved)
      }
      const result: Record<string, boolean> = {}
      for (const item of data.navMain) {
        result[item.title] = item.isActive || false
      }
      return result
    } catch {
      const result: Record<string, boolean> = {}
      for (const item of data.navMain) {
        result[item.title] = item.isActive || false
      }
      return result
    }
  })

  // Save to localStorage whenever state changes
  React.useEffect(() => {
    localStorage.setItem('sidebar-open-sections', JSON.stringify(openSections))
  }, [openSections])

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }))
  }

  const navigate = useNavigate()
  const location = useLocation()

  // Track clicked navigation items for highlighting
  React.useEffect(() => {
    // Clear active section when leaving notifications page
    if (location.pathname !== '/notifications') {
      setActiveSection('')
    }
  }, [location.pathname])

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
    },
    [navigate, location.pathname],
  )

  if (!activeTeam) {
    return null
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger className="focus-visible:ring-0" asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-main data-[state=open]:text-main-foreground data-[state=open]:outline-border data-[state=open]:outline-2"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-base">
                    <activeTeam.logo className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-heading">
                      {activeTeam.name}
                    </span>
                    <span className="truncate text-xs">{activeTeam.plan}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-base"
                align="start"
                side={isMobile ? 'bottom' : 'right'}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-sm font-heading">
                  Teams
                </DropdownMenuLabel>
                {data.teams.map((team, index) => (
                  <DropdownMenuItem
                    key={team.name}
                    onClick={() => setActiveTeam(team)}
                    className="gap-2 p-1.5"
                  >
                    <div className="flex size-6 items-center justify-center">
                      <team.logo className="size-4 shrink-0" />
                    </div>
                    {team.name}
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 p-1.5">
                  <div className="flex size-6 items-center justify-center">
                    <Plus className="size-4" />
                  </div>
                  <div className="font-base">Add team</div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarMenu>
            {data.navMain.map((item) =>
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
                                onClick={(e) =>
                                  handleNavigation(subItem.url, e)
                                }
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
                    <a
                      href={item.url}
                      onClick={(e) => handleNavigation(item.url, e)}
                    >
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Help & Resources</SidebarGroupLabel>
          <SidebarMenu>
            {data.helpResources.map((item) => (
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
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="group-data-[state=collapsed]:hover:outline-0 group-data-[state=collapsed]:hover:bg-transparent overflow-visible"
                  size="lg"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src="https://github.com/shadcn.png?size=40"
                      alt="CN"
                    />
                    <AvatarFallback>CN</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-heading">
                      {data.user.name}
                    </span>
                    <span className="truncate text-xs">{data.user.email}</span>
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
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src="https://github.com/shadcn.png?size=40"
                        alt="CN"
                      />
                      <AvatarFallback>CN</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-heading">
                        {data.user.name}
                      </span>
                      <span className="truncate text-xs">
                        {data.user.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Sparkles />
                    Upgrade to Pro
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <BadgeCheck />
                    Account
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <CreditCard />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Bell />
                    Notifications
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
