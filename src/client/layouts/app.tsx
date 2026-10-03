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
      className={cn(
        'flex size-full',
        !fullscreenEnabled &&
          'md:px-[clamp(16px,2.5vw,48px)] md:py-[clamp(16px,4vh,48px)]',
      )}
    >
      <SidebarProvider
        className={cn(
          'min-h-0 flex-1 overflow-hidden bg-inset',
          !fullscreenEnabled &&
            'md:mx-auto md:max-w-400 md:rounded-lg md:border-2 md:border-border md:shadow-shadow',
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
