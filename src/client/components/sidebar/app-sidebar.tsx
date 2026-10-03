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

export function AppSidebar() {
  const { isMobile } = useSidebar()

  return (
    <Sidebar
      collapsible={isMobile ? 'offcanvas' : 'none'}
      className={
        isMobile ? undefined : 'w-58 shrink-0 border-r-2 border-border'
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
