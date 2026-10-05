import { cn } from 'cn'
import { SidebarHelp } from '@/components/sidebar/sidebar-help'
import { SidebarLogo } from '@/components/sidebar/sidebar-logo'
import { SidebarNav } from '@/components/sidebar/sidebar-nav'
import { SidebarSyncStatus } from '@/components/sidebar/sidebar-sync-status'
import { SidebarUser } from '@/components/sidebar/sidebar-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar'
import { useSettings } from '@/hooks/useSettings'

export function AppSidebar() {
  const { isMobile } = useSidebar()
  const { fullscreenEnabled } = useSettings()

  return (
    <Sidebar
      collapsible={isMobile ? 'offcanvas' : 'none'}
      className={
        isMobile
          ? undefined
          : cn(
              'sticky top-0 w-58 shrink-0 border-r-2 border-border',
              fullscreenEnabled ? 'h-svh' : 'h-full',
            )
      }
    >
      <SidebarLogo />
      <SidebarContent className="gap-0">
        <SidebarNav />
        <SidebarHelp />
      </SidebarContent>
      <SidebarFooter className="gap-2.5 border-t-2 border-border p-3">
        <SidebarMenu className="gap-2.5">
          <SidebarSyncStatus />
          <SidebarUser />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
