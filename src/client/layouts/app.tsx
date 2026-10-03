import { cn } from 'cn'
import { Outlet } from 'react-router-dom'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useApprovalToasts } from '@/hooks/useApprovalToasts'
import { useProgressConnection } from '@/hooks/useProgressConnection'
import { useSettings } from '@/hooks/useSettings'

export default function AppLayout() {
  useProgressConnection()
  useApprovalToasts()
  const { fullscreenEnabled } = useSettings()

  return (
    <div
      className={cn('flex size-full', !fullscreenEnabled && 'md:px-10 md:py-7')}
    >
      <SidebarProvider
        className={cn(
          'min-h-0 flex-1 overflow-hidden bg-inset',
          !fullscreenEnabled &&
            'md:rounded-lg md:border-2 md:border-border md:shadow-shadow',
        )}
      >
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <Outlet />
          </div>
        </div>
      </SidebarProvider>
    </div>
  )
}
