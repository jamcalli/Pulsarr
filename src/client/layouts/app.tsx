import { cn } from 'cn'
import { Outlet } from 'react-router-dom'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useApprovalToasts } from '@/hooks/useApprovalToasts'
import { useProgressConnection } from '@/hooks/useProgressConnection'
import { useSettings } from '@/hooks/useSettings'

export default function AppLayout() {
  useProgressConnection()
  useApprovalToasts()
  const { fullscreenEnabled } = useSettings()

  return (
    <div
      className={cn(
        'w-full',
        !fullscreenEnabled &&
          'md:h-svh md:px-[clamp(16px,2.5vw,48px)] md:py-[clamp(16px,4vh,48px)]',
      )}
    >
      <SidebarProvider
        className={cn(
          'bg-inset',
          !fullscreenEnabled &&
            'md:mx-auto md:h-full md:min-h-0 md:max-w-400 md:overflow-hidden md:rounded-lg md:border-2 md:border-border md:shadow-shadow',
        )}
      >
        <AppSidebar />
        <SidebarInset
          className={cn(
            'min-w-0 overflow-x-clip bg-inset',
            !fullscreenEnabled && 'md:min-h-0 md:overflow-y-auto',
          )}
        >
          <AppHeader />
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
